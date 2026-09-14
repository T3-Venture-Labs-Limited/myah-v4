import { Injectable } from '@nestjs/common';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessageOutboundDriver } from 'src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface';
import { type CreateDraftResult } from 'src/modules/messaging/message-outbound-manager/types/create-draft-result.type';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';

@Injectable()
export class E2eFixtureGmailMessageOutboundService implements MessageOutboundDriver {
  private static readonly sendAttemptCountByConnectedAccountId = new Map<
    string,
    number
  >();
  private static readonly draftPreparationCountByConnectedAccountId = new Map<
    string,
    number
  >();

  static getSendAttemptCount(connectedAccountIds: string[]): number {
    return connectedAccountIds.reduce(
      (count, connectedAccountId) =>
        count +
        (this.sendAttemptCountByConnectedAccountId.get(connectedAccountId) ??
          0),
      0,
    );
  }

  static getDraftPreparationCount(connectedAccountIds: string[]): number {
    return connectedAccountIds.reduce(
      (count, connectedAccountId) =>
        count +
        (this.draftPreparationCountByConnectedAccountId.get(
          connectedAccountId,
        ) ?? 0),
      0,
    );
  }

  static releaseSendAttemptCounts(connectedAccountIds: string[]): void {
    for (const connectedAccountId of connectedAccountIds) {
      this.sendAttemptCountByConnectedAccountId.delete(connectedAccountId);
      this.draftPreparationCountByConnectedAccountId.delete(connectedAccountId);
    }
  }

  private recordSendAttempt(connectedAccount: ConnectedAccountEntity): void {
    const attempts =
      E2eFixtureGmailMessageOutboundService.sendAttemptCountByConnectedAccountId.get(
        connectedAccount.id,
      ) ?? 0;
    E2eFixtureGmailMessageOutboundService.sendAttemptCountByConnectedAccountId.set(
      connectedAccount.id,
      attempts + 1,
    );
  }
  async assertSendable(_: ConnectedAccountEntity): Promise<void> {
    // The isolated E2E fixture module needs canonical authority rebuilding, but
    // no fixture can make an external provider request or send a message.
  }

  async sendMessage(
    _: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    this.recordSendAttempt(connectedAccount);
    throw new Error('E2E fixtures never send Gmail messages');
  }

  async createDraft(
    _: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<CreateDraftResult> {
    const preparations =
      E2eFixtureGmailMessageOutboundService.draftPreparationCountByConnectedAccountId.get(
        connectedAccount.id,
      ) ?? 0;
    E2eFixtureGmailMessageOutboundService.draftPreparationCountByConnectedAccountId.set(
      connectedAccount.id,
      preparations + 1,
    );
    const identifier = connectedAccount.id;

    return {
      draftExternalId: `myah-e2e-local-draft-${identifier}`,
      headerMessageId: `myah-e2e-local-message-${identifier}`,
      threadExternalId: `myah-e2e-local-thread-${identifier}`,
    };
  }

  async sendDraft(
    _: string,
    __: SendMessageInput,
    connectedAccount: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    this.recordSendAttempt(connectedAccount);
    throw new Error('E2E fixtures never send Gmail messages');
  }

  async deleteDraft(_: string, __: ConnectedAccountEntity): Promise<void> {
    throw new Error('E2E fixtures never delete Gmail drafts');
  }
}
