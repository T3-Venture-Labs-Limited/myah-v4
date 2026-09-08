import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type gmail_v1, google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer';
import { isDefined } from 'twenty-shared/utils';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { mimeEncode } from 'src/modules/messaging/message-import-manager/utils/mime-encode.util';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { type MessageOutboundDriver } from 'src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface';
import { type CreateDraftResult } from 'src/modules/messaging/message-outbound-manager/types/create-draft-result.type';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';
import { executeWithOutboundEmailProviderDeadline } from 'src/modules/messaging/message-outbound-manager/utils/execute-with-outbound-email-provider-deadline.util';
import { extractMessageIdFromBuffer } from 'src/modules/messaging/message-outbound-manager/utils/extract-message-id-from-buffer.util';
import { toMailComposerOptions } from 'src/modules/messaging/message-outbound-manager/utils/to-mail-composer-options.util';

@Injectable()
export class GmailMessageOutboundService implements MessageOutboundDriver {
  readonly providerRequestTimeoutMs =
    OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS;

  private readonly logger = new Logger(GmailMessageOutboundService.name);

  constructor(
    private readonly googleOAuth2ClientProvider: GoogleOAuth2ClientProvider,
  ) {}

  async assertSendable(
    connectedAccount: ConnectedAccountEntity,
  ): Promise<void> {
    return executeWithOutboundEmailProviderDeadline(async (abortSignal) => {
      const oAuth2Client = await this.googleOAuth2ClientProvider.getClient(
        connectedAccount.id,
        { abortSignal },
      );

      abortSignal.throwIfAborted();

      const gmailClient = google.gmail({ version: 'v1', auth: oAuth2Client });

      await gmailClient.users.getProfile(
        { userId: 'me' },
        this.getProviderRequestOptions(abortSignal),
      );
    });
  }

  async sendMessage(
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    return executeWithOutboundEmailProviderDeadline((abortSignal) =>
      this.sendMessageWithinDeadline(
        sendMessageInput,
        connectedAccount,
        abortSignal,
      ),
    );
  }

  private async sendMessageWithinDeadline(
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
    abortSignal: AbortSignal,
  ): Promise<SendMessageResult> {
    const { gmailClient, encodedMessage, messageBuffer } =
      await this.composeGmailMessage(
        connectedAccount,
        sendMessageInput,
        abortSignal,
      );

    const { data } = await gmailClient.users.messages.send(
      {
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          ...(isNonEmptyString(sendMessageInput.threadExternalId)
            ? { threadId: sendMessageInput.threadExternalId }
            : {}),
        },
      },
      this.getProviderRequestOptions(abortSignal),
    );

    return {
      headerMessageId: extractMessageIdFromBuffer(messageBuffer),
      messageExternalId: data.id ?? undefined,
      threadExternalId: data.threadId ?? undefined,
    };
  }

  async createDraft(
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<CreateDraftResult> {
    return executeWithOutboundEmailProviderDeadline((abortSignal) =>
      this.createDraftWithinDeadline(
        sendMessageInput,
        connectedAccount,
        abortSignal,
      ),
    );
  }

  private async createDraftWithinDeadline(
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
    abortSignal: AbortSignal,
  ): Promise<CreateDraftResult> {
    const { gmailClient, encodedMessage, messageBuffer } =
      await this.composeGmailMessage(
        connectedAccount,
        sendMessageInput,
        abortSignal,
      );

    const { data } = await gmailClient.users.drafts.create(
      {
        userId: 'me',
        requestBody: {
          message: {
            raw: encodedMessage,
            ...(isNonEmptyString(sendMessageInput.threadExternalId)
              ? { threadId: sendMessageInput.threadExternalId }
              : {}),
          },
        },
      },
      this.getProviderRequestOptions(abortSignal),
    );

    const draftExternalId = data.message?.id;

    if (!isNonEmptyString(draftExternalId)) {
      throw new Error('Gmail draft did not return a message id');
    }

    const headerMessageId = extractMessageIdFromBuffer(messageBuffer);

    if (!isNonEmptyString(headerMessageId)) {
      throw new Error('Gmail draft did not produce a header message id');
    }

    return {
      headerMessageId,
      draftExternalId,
      ...(isNonEmptyString(data.message?.threadId)
        ? { threadExternalId: data.message.threadId }
        : {}),
    };
  }

  async sendDraft(
    draftExternalId: string,
    sendMessageInput: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    return executeWithOutboundEmailProviderDeadline(async (abortSignal) => {
      const sendResult = await this.sendMessageWithinDeadline(
        sendMessageInput,
        connectedAccount,
        abortSignal,
      );

      try {
        await this.deleteDraftWithinDeadline(
          draftExternalId,
          connectedAccount,
          abortSignal,
        );
      } catch {
        this.logger.warn(
          `Failed to delete Gmail draft ${draftExternalId} after send`,
        );
      }

      return sendResult;
    });
  }

  async deleteDraft(
    draftExternalId: string,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<void> {
    return executeWithOutboundEmailProviderDeadline((abortSignal) =>
      this.deleteDraftWithinDeadline(
        draftExternalId,
        connectedAccount,
        abortSignal,
      ),
    );
  }

  private async deleteDraftWithinDeadline(
    draftExternalId: string,
    connectedAccount: ConnectedAccountEntity,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const oAuth2Client = await this.googleOAuth2ClientProvider.getClient(
      connectedAccount.id,
      { abortSignal },
    );

    abortSignal.throwIfAborted();

    const gmailClient = google.gmail({ version: 'v1', auth: oAuth2Client });
    const draftId = await this.findDraftIdByMessageId(
      gmailClient,
      draftExternalId,
      abortSignal,
    );

    if (isDefined(draftId)) {
      await gmailClient.users.drafts.delete(
        { userId: 'me', id: draftId },
        this.getProviderRequestOptions(abortSignal),
      );

      return;
    }

    this.logger.warn(
      `No Gmail draft found for message ${draftExternalId}; skipping delete`,
    );
  }

  private async findDraftIdByMessageId(
    gmailClient: gmail_v1.Gmail,
    messageId: string,
    abortSignal: AbortSignal,
  ): Promise<string | undefined> {
    let pageToken: string | undefined = undefined;

    do {
      const { data }: { data: gmail_v1.Schema$ListDraftsResponse } =
        await gmailClient.users.drafts.list(
          {
            userId: 'me',
            maxResults: 500,
            pageToken,
          },
          this.getProviderRequestOptions(abortSignal),
        );

      const draft = (data.drafts ?? []).find(
        (currentDraft) => currentDraft.message?.id === messageId,
      );

      if (isDefined(draft?.id)) {
        return draft.id;
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (isDefined(pageToken));

    return undefined;
  }

  private async composeGmailMessage(
    connectedAccount: ConnectedAccountEntity,
    sendMessageInput: SendMessageInput,
    abortSignal: AbortSignal,
  ): Promise<{
    gmailClient: gmail_v1.Gmail;
    encodedMessage: string;
    messageBuffer: Buffer;
  }> {
    const oAuth2Client = await this.googleOAuth2ClientProvider.getClient(
      connectedAccount.id,
      { abortSignal },
    );

    abortSignal.throwIfAborted();

    const gmailClient = google.gmail({ version: 'v1', auth: oAuth2Client });
    const peopleClient = google.people({ version: 'v1', auth: oAuth2Client });

    const { data: gmailData } = await gmailClient.users.getProfile(
      { userId: 'me' },
      this.getProviderRequestOptions(abortSignal),
    );
    const fromEmail = gmailData.emailAddress;

    const { data: peopleData } = await peopleClient.people.get(
      {
        resourceName: 'people/me',
        personFields: 'names',
      },
      this.getProviderRequestOptions(abortSignal),
    );
    const fromName = peopleData?.names?.[0]?.displayName;
    const from = isDefined(fromName)
      ? `"${mimeEncode(fromName)}" <${fromEmail}>`
      : `${fromEmail}`;
    const mail = new MailComposer(
      toMailComposerOptions(from, sendMessageInput),
    );
    const compiledMessage = mail.compile();

    compiledMessage.keepBcc = true;

    const messageBuffer = await compiledMessage.build();

    abortSignal.throwIfAborted();

    return {
      gmailClient,
      encodedMessage: Buffer.from(messageBuffer).toString('base64url'),
      messageBuffer,
    };
  }

  private getProviderRequestOptions(abortSignal: AbortSignal) {
    abortSignal.throwIfAborted();

    return {
      signal: abortSignal,
      timeout: this.providerRequestTimeoutMs,
      retry: false,
    };
  }
}
