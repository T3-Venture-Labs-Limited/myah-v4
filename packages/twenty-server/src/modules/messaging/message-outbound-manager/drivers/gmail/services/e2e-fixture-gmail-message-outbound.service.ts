import { Injectable } from '@nestjs/common';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessageOutboundDriver } from 'src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface';
import { type CreateDraftResult } from 'src/modules/messaging/message-outbound-manager/types/create-draft-result.type';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';

@Injectable()
export class E2eFixtureGmailMessageOutboundService implements MessageOutboundDriver {
  async assertSendable(_: ConnectedAccountEntity): Promise<void> {
    // The isolated E2E fixture module needs canonical authority rebuilding, but
    // no fixture can make an external provider request or send a message.
  }

  async sendMessage(
    _: SendMessageInput,
    __: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    throw new Error('E2E fixtures never send Gmail messages');
  }

  async createDraft(
    _: SendMessageInput,
    __: ConnectedAccountEntity,
  ): Promise<CreateDraftResult> {
    throw new Error('E2E fixtures never create Gmail drafts');
  }

  async sendDraft(
    _: string,
    __: SendMessageInput,
    ___: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    throw new Error('E2E fixtures never send Gmail messages');
  }

  async deleteDraft(_: string, __: ConnectedAccountEntity): Promise<void> {
    throw new Error('E2E fixtures never delete Gmail drafts');
  }
}
