import { type ObjectRecord } from 'twenty-shared/types';

import { type MyahInboxReplyExpectedActionBinding } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

export enum MyahInboxReplyUnavailableCode {
  THREAD_UNAVAILABLE = 'THREAD_UNAVAILABLE',
  SENDER_UNAVAILABLE = 'SENDER_UNAVAILABLE',
  RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  MAILBOX_INELIGIBLE = 'MAILBOX_INELIGIBLE',
}

export class MyahInboxReplyUnavailableError extends Error {
  constructor(readonly code: MyahInboxReplyUnavailableCode) {
    super(code);
  }
}

export type InboxMessageThreadRecord = ObjectRecord & {
  id: string;
  subject: string | null;
  myahReplyDraftBodyMarkdown: string | null;
  myahReplyDraftBodyBlocknote: string | null;
  myahReplyDraftRevision: number;
};

export type InboxParentMessageRecord = MessageWorkspaceEntity & {
  messageParticipants: MessageParticipantWorkspaceEntity[];
  messageChannelMessageAssociations: MessageChannelMessageAssociationWorkspaceEntity[];
};

export type MyahInboxReplyEvidenceObjectMetadataIds = {
  message: string;
  messageThread: string;
};


export type MyahInboxReplyReadableDraftSnapshot = {
  revision: number;
  body: { markdown: string; blocknote: string | null } | null;
  messageThreadMetadataId: string;
};
export type MyahInboxReplyExpectedActionBindingWithWorkspace =
  MyahInboxReplyExpectedActionBinding & { workspaceId: string };

export type CanonicalMyahInboxReplyGraph = {
  messageThreadId: string;
  draftRevision: number;
  draftBody: { markdown: string; blocknote: string | null };
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
  recipientEmail: string;
  recipientLabel: string;
  subject: string;
  inReplyTo: string;
  parentMessageId: string;
  providerMessageExternalId: string | null;
  providerThreadExternalId: string | null;
  managedMailboxId: string | null;
  connectedAccount: ConnectedAccountEntity;
};

export type MyahInboxReplyActionAuthority = {
  expectedActionBinding: MyahInboxReplyExpectedActionBindingWithWorkspace;
  canonicalGraph: CanonicalMyahInboxReplyGraph;
};
