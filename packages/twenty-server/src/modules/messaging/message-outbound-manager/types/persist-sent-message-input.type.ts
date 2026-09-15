import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';

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
  expectedMessageId?: string;
  providerAcceptedAt?: Date;
  transactionManager?: WorkspaceEntityManager;
};
