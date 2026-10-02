import { Injectable } from '@nestjs/common';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { type MessageOutboundDriver } from 'src/modules/messaging/message-outbound-manager/interfaces/message-outbound-driver.interface';
import { type CreateDraftResult } from 'src/modules/messaging/message-outbound-manager/types/create-draft-result.type';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';

const fixtureOutboundRejection = (): Error & { responseCode: number } => {
  // The dispatcher's trap-safe classifier accepts direct Error instances,
  // but intentionally treats subclass instances as potentially ambiguous.
  const error = new Error(
    'E2E fixtures never contact outbound email providers',
  ) as Error & { responseCode: number };
  error.responseCode = 403;

  return error;
};

@Injectable()
export class E2eFixtureRejectingMessageOutboundService implements MessageOutboundDriver {
  readonly providerRequestTimeoutMs =
    OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS;

  async assertSendable(_: ConnectedAccountEntity): Promise<void> {
    throw fixtureOutboundRejection();
  }

  async sendMessage(
    _: SendMessageInput,
    __: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    throw fixtureOutboundRejection();
  }

  async createDraft(
    _: SendMessageInput,
    __: ConnectedAccountEntity,
  ): Promise<CreateDraftResult> {
    throw fixtureOutboundRejection();
  }

  async sendDraft(
    _: string,
    __: SendMessageInput,
    ___: ConnectedAccountEntity,
  ): Promise<SendMessageResult> {
    throw fixtureOutboundRejection();
  }

  async deleteDraft(_: string, __: ConnectedAccountEntity): Promise<void> {
    throw fixtureOutboundRejection();
  }
}
