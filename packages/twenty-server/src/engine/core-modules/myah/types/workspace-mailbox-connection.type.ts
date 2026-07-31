import {
  type MessageChannelSyncStage,
  type MessageChannelSyncStatus,
} from 'twenty-shared/types';

import { type PlaintextImapSmtpCaldavParams } from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';

export type WorkspaceMailboxConnectionErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INSECURE_CONNECTION'
  | 'AUTHENTICATION_FAILED'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_UNAVAILABLE'
  | 'MAILBOX_ALREADY_CONNECTED'
  | 'MAILBOX_NOT_FOUND'
  | 'RECONNECT_REQUIRED'
  | 'UNKNOWN';

export type WorkspaceMailboxConnectionState =
  | 'CONNECTED'
  | 'RECONNECT_REQUIRED'
  | 'REVOKED';

export type WorkspaceMailboxLastSafeOperation =
  | 'CONNECTED'
  | 'ROTATED'
  | 'RECONNECTED'
  | 'REVOKED';

export type WorkspaceMailboxConnectionStatus = {
  connectedAccountId: string;
  messageChannelId: string;
  maskedHandle: string;
  state: WorkspaceMailboxConnectionState;
  lastSafeOperation: WorkspaceMailboxLastSafeOperation;
  syncStatus: MessageChannelSyncStatus;
  syncStage: MessageChannelSyncStage;
  updatedAt: Date;
  errorCode: WorkspaceMailboxConnectionErrorCode | null;
  errorMessage: string | null;
};

export type ConnectWorkspaceMailboxInput = {
  workspaceId: string;
  userWorkspaceId?: string;
  handle: string;
  accountType: 'IMAP_SMTP';
  connectionParameters: PlaintextImapSmtpCaldavParams;
};

export type ReplaceWorkspaceMailboxCredentialsInput = {
  workspaceId: string;
  connectedAccountId: string;
  connectionParameters: PlaintextImapSmtpCaldavParams;
};

export type ConnectWorkspaceMailboxResult = {
  connectedAccountId: string;
  messageChannelId: string;
  status: WorkspaceMailboxConnectionStatus;
};

export type RevokeWorkspaceMailboxResult = {
  connectedAccountId: string;
  revoked: true;
  state: 'REVOKED';
};
