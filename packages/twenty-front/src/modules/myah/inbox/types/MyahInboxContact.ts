export type MyahInboxChannel = 'EMAIL' | 'INSTAGRAM';

export type MyahInboxContactIdentityKind =
  | 'CREATOR'
  | 'EMAIL_THREAD'
  | 'INSTAGRAM_CONVERSATION';

export type MyahInboxInstagramChannelState =
  | 'UNAVAILABLE'
  | 'READY'
  | 'AMBIGUOUS';

export type MyahInboxContactInstagramConversation = {
  id: string;
  providerConversationId: string;
  recipientUsername: string | null;
  provider: 'COMPOSIO_HISTORY' | 'UNIPILE';
  lifecycle: 'ACTIVE' | 'HISTORICAL';
  recipientDisplayName: string | null;
  lastActivityAt: string;
  latestDirection: 'INBOUND' | 'OUTBOUND' | 'UNKNOWN' | null;
};

export type MyahInboxContactTriage = {
  isAvailable: boolean;
  inboxOwnerId: string | null;
  inboxState:
    | 'NEEDS_REPLY'
    | 'WAITING_ON_CREATOR'
    | 'SNOOZED'
    | 'CLOSED'
    | null;
  snoozedUntil: string | null;
  revision: number | null;
  identityGeneration: string | null;
};

export type MyahInboxContact = {
  id: string;
  identityKind: MyahInboxContactIdentityKind;
  displayName: string;
  instagramUsername: string | null;
  creator: { id: string; name: string | null } | null;
  lastActivityAt: string;
  latestChannel: MyahInboxChannel;
  initialSelection: {
    channel: MyahInboxChannel;
    emailThreadId: string | null;
    instagramConversationId: string | null;
  };
  preview: string | null;
  sender: string | null;
  needsAttention: boolean;
  triage: MyahInboxContactTriage;
  email: {
    isAvailable: boolean;
    threadCount: number;
    threadIds: string[];
    latestThreadId: string | null;
    needsAttention: boolean;
  };
  instagram: {
    isAvailable: boolean;
    state: MyahInboxInstagramChannelState;
    needsAttention: boolean;
    conversations: MyahInboxContactInstagramConversation[];
  };
};

export type MyahInboxContactEmailParticipant = {
  role: string;
  handle: string | null;
  displayName: string | null;
};

export type MyahInboxContactEmailMessage = {
  id: string;
  messageThreadId: string;
  subject: string | null;
  text: string | null;
  receivedAt: string;
  direction: 'INCOMING' | 'OUTGOING';
  visibility: 'FULL' | 'SUBJECT' | 'METADATA';
  participants: MyahInboxContactEmailParticipant[];
  attachmentFileIds: string[];
};

export type MyahInstagramConversationMessage = {
  id: string;
  text: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';
  sentVia: 'MANUAL' | 'COMPOSIO' | 'UNIPILE' | 'UNKNOWN';
  provider: 'COMPOSIO_HISTORY' | 'UNIPILE';
  deliveryState: 'UNKNOWN' | 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ';
  providerCreatedAt: string | null;
  createdAt: string;
  hasAttachments: boolean;
  attachmentCount: number;
};
