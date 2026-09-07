import { Injectable, Logger } from '@nestjs/common';

import {
  type Client as MicrosoftGraphClient,
  type GraphRequest,
  RetryHandlerOptions,
} from '@microsoft/microsoft-graph-client';
import { isNonEmptyString } from '@sniptt/guards';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { type MessageOutboundDriver } from 'src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface';

import { MicrosoftOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/microsoft/microsoft-oauth2-client.provider';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { toMicrosoftRecipients } from 'src/modules/messaging/message-import-manager/utils/to-microsoft-recipients.util';
import { type CreateDraftResult } from 'src/modules/messaging/message-outbound-manager/types/create-draft-result.type';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';
import { isDefined } from 'twenty-shared/utils';

@Injectable()
export class MicrosoftMessageOutboundService implements MessageOutboundDriver {
  readonly providerRequestTimeoutMs =
    OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS;

  private readonly logger = new Logger(MicrosoftMessageOutboundService.name);

  constructor(
    private readonly microsoftOAuth2ClientProvider: MicrosoftOAuth2ClientProvider,
  ) {}

  async assertSendable(
    connectedAccount: ConnectedAccountEntity,
  ): Promise<void> {
    const microsoftClient = await this.microsoftOAuth2ClientProvider.getClient(
      connectedAccount.id,
    );

    await this.request(microsoftClient, '/me').get();
  }

  async sendMessage(
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    const microsoftClient = await this.microsoftOAuth2ClientProvider.getClient(
      connectedAccount.id,
    );

    const {
      id: messageId,
      internetMessageId,
      conversationId,
    } = await this.createDraftMessage(microsoftClient, sendMessageInput);

    await this.request(microsoftClient, `/me/messages/${messageId}/send`).post(
      {},
    );

    return {
      headerMessageId: internetMessageId ?? '',
      messageExternalId: messageId,
      threadExternalId: conversationId ?? undefined,
    };
  }

  async createDraft(
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<CreateDraftResult> {
    const microsoftClient = await this.microsoftOAuth2ClientProvider.getClient(
      connectedAccount.id,
    );

    const { id, internetMessageId, conversationId } =
      await this.createDraftMessage(microsoftClient, sendMessageInput);

    if (!isNonEmptyString(id)) {
      throw new Error('Microsoft draft did not return a message id');
    }

    if (!isNonEmptyString(internetMessageId)) {
      throw new Error('Microsoft draft did not return an internet message id');
    }

    return {
      headerMessageId: internetMessageId,
      draftExternalId: id,
      ...(isNonEmptyString(conversationId)
        ? { threadExternalId: conversationId }
        : {}),
    };
  }

  async sendDraft(
    draftExternalId: string,
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    const sendResult = await this.sendMessage(
      sendMessageInput,
      connectedAccount,
    );

    try {
      await this.deleteDraft(draftExternalId, connectedAccount);
    } catch {
      this.logger.warn(
        `Failed to delete Microsoft draft ${draftExternalId} after send`,
      );
    }

    return sendResult;
  }

  async deleteDraft(
    draftExternalId: string,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<void> {
    const microsoftClient = await this.microsoftOAuth2ClientProvider.getClient(
      connectedAccount.id,
    );

    await this.request(
      microsoftClient,
      `/me/messages/${draftExternalId}`,
    ).delete();
  }

  private async createDraftMessage(
    microsoftClient: MicrosoftGraphClient,
    sendMessageInput: SendMessageInput,
  ): Promise<{
    id: string;
    internetMessageId?: string;
    conversationId?: string;
  }> {
    const parentMessageGraphId = sendMessageInput.inReplyTo
      ? await this.findMessageByInternetMessageId(
          microsoftClient,
          sendMessageInput.inReplyTo,
        )
      : undefined;

    const message = this.composeMicrosoftMessage(sendMessageInput);

    if (isDefined(parentMessageGraphId)) {
      const reply = await this.request(
        microsoftClient,
        `/me/messages/${parentMessageGraphId}/createReply`,
      ).post({});

      const patched = await this.request(
        microsoftClient,
        `/me/messages/${reply.id}`,
      ).patch(message);

      return {
        id: reply.id,
        internetMessageId:
          patched?.internetMessageId ?? reply.internetMessageId,
        conversationId: patched?.conversationId ?? reply.conversationId,
      };
    }

    const response = await this.request(microsoftClient, '/me/messages').post(
      message,
    );

    return {
      id: response.id,
      internetMessageId: response.internetMessageId,
      conversationId: response.conversationId,
    };
  }

  private async findMessageByInternetMessageId(
    microsoftClient: MicrosoftGraphClient,
    internetMessageId: string,
  ): Promise<string | undefined> {
    const escapedInternetMessageId = internetMessageId.split("'").join("''");

    const response = await this.request(microsoftClient, '/me/messages')
      .filter(`internetMessageId eq '${escapedInternetMessageId}'`)
      .select('id')
      .top(1)
      .get();

    return response?.value?.[0]?.id;
  }

  private request(
    microsoftClient: MicrosoftGraphClient,
    path: string,
  ): GraphRequest {
    return microsoftClient
      .api(path)
      .options({
        signal: AbortSignal.timeout(this.providerRequestTimeoutMs),
      })
      .middlewareOptions([new RetryHandlerOptions(undefined, 0)]);
  }

  private composeMicrosoftMessage(
    sendMessageInput: SendMessageInput,
  ): Record<string, unknown> {
    return {
      subject: sendMessageInput.subject,
      body: {
        contentType: 'HTML',
        content: sendMessageInput.html,
      },
      toRecipients: toMicrosoftRecipients(sendMessageInput.to),
      ccRecipients: toMicrosoftRecipients(sendMessageInput.cc),
      bccRecipients: toMicrosoftRecipients(sendMessageInput.bcc),
      ...(sendMessageInput.attachments &&
      sendMessageInput.attachments.length > 0
        ? {
            attachments: sendMessageInput.attachments.map((attachment) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: attachment.filename,
              contentType: attachment.contentType,
              contentBytes: attachment.content.toString('base64'),
            })),
          }
        : {}),
    };
  }
}
