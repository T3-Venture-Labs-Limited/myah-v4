import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';
import { type ParticipantWithMessageId } from 'src/modules/messaging/message-import-manager/drivers/gmail/types/gmail-message.type';

export type PersistSentMessageInput = {
  sendResult: Omit<SendMessageResult, 'headerMessageId'> & {
    headerMessageId: string | null;
  };
  subject: string;
  body: string;
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  connectedAccount: ConnectedAccountEntity;
  messageChannelId: string;
  inReplyTo?: string;
  parentThreadExternalId?: string;
  workspaceId: string;
  // Internal accepted-receipt routing; provider thread IDs remain evidence only.
  deliveryTargetId?: string;
  expectedMessageId?: string;
  allowExpectedMessageIdAdoption?: boolean;
  providerAcceptedAt?: Date;
  transactionManager?: WorkspaceEntityManager;
  captureContactsToCreate?: (
    contactsToCreate: (ParticipantWithMessageId & {
      shouldCreateContact: boolean;
    })[],
  ) => void;
};
