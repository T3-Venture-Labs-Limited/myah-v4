export type UnipileInstagramSourceStatus =
  | 'OK'
  | 'STOPPED'
  | 'ERROR'
  | 'CREDENTIALS'
  | 'PERMISSIONS'
  | 'CONNECTING';

export type UnipileInstagramAccount = {
  accountId: string;
  instagramUserId: string;
  username: string | null;
  sourceStatus: UnipileInstagramSourceStatus;
};

export type UnipileGetInstagramMessagingProfileInput = {
  accountId: string;
  // Must already be the canonical username from resolveInstagramRecipient.
  username: string;
};

export type UnipileInstagramMessagingProfile = {
  providerId: string;
  // GET profile provider_messaging_id, distinct from profile and attendee IDs.
  providerMessagingId: string;
  username: string;
};

type UnipileHostedAuthLinkBaseInput = {
  expiresOn: Date;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  notifyUrl: string;
  name: string;
};

export type UnipileCreateHostedAuthLinkInput =
  | (UnipileHostedAuthLinkBaseInput & {
      operation?: undefined;
    })
  | (UnipileHostedAuthLinkBaseInput & {
      operation: 'RECONNECT';
      reconnectAccountId: string;
    });

export type UnipileStartChatInput = {
  accountId: string;
  attendeeId: string;
  text: string;
};

export type UnipileStartChatOutcome =
  | {
      kind: 'ACCEPTED';
      value: { chatId: string; messageId: string };
    }
  | {
      kind: 'UNKNOWN';
      status: number | null;
      code: string;
    }
  | {
      kind: 'KNOWN_REJECTION';
      status: number;
      code: 'UNIPILE_CHAT_START_REJECTED';
    };

export type UnipileStartChatOptions = {
  beforeDispatch: () => Promise<void>;
};

export type UnipileDeleteAccountOutcome =
  | {
      kind: 'ACCEPTED';
      value: { deleted: true };
    }
  | {
      kind: 'UNKNOWN';
      status: number | null;
      code: string;
    }
  | {
      kind: 'KNOWN_REJECTION';
      status: number;
      code: 'UNIPILE_ACCOUNT_DELETE_REJECTED';
    };

export type UnipileDeleteAccountOptions = {
  beforeDispatch: () => Promise<void>;
};

export type UnipileSendMessageInput = {
  accountId: string;
  chatId: string;
  text: string;
};

export type UnipileSendMessageOutcome =
  | {
      kind: 'ACCEPTED';
      value: { messageId: string };
    }
  | {
      kind: 'UNKNOWN';
      status: number | null;
      code: string;
    }
  | {
      kind: 'KNOWN_REJECTION';
      status: number;
      code: 'UNIPILE_MESSAGE_SEND_REJECTED';
    };

export type UnipileSendMessageOptions = {
  beforeDispatch: () => Promise<void>;
};

export type UnipileInstagramChat = {
  chatId: string;
  accountId: string;
  accountType: 'INSTAGRAM';
  type: 'ONE_TO_ONE';
  attendeeProviderId: string;
  name: string | null;
  timestamp: string | null;
};

export type UnipileListChatsInput = {
  accountId: string;
  cursor: string | null;
  after: string | null;
  limit: number;
};

export type UnipileGetChatInput = {
  accountId: string;
  chatId: string;
  expectedAttendeeId: string;
};

export type UnipileListChatsOutput = {
  chats: UnipileInstagramChat[];
  nextCursor: string | null;
};

export type UnipileInstagramMessage = {
  messageId: string;
  accountId: string;
  chatId: string;
  senderId: string;
  // Provider-validated 0/1 self-sender evidence. Absent only for legacy reads.
  isSender?: 0 | 1;
  text: string | null;
  timestamp: string | null;
  seen: boolean;
  delivered: boolean;
  hidden: boolean;
  deleted: boolean;
  isEvent: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
};

export const hasContradictoryUnipileInstagramSenderEvidence = (
  message: Pick<UnipileInstagramMessage, 'isSender' | 'senderId'>,
  instagramUserId: string,
  attendeeProviderId: string,
): boolean =>
  (message.isSender === 1 && message.senderId === attendeeProviderId) ||
  (message.isSender === 0 && message.senderId === instagramUserId);

export const unipileInstagramMessageDirection = (
  message: Pick<UnipileInstagramMessage, 'isSender' | 'senderId'>,
  instagramUserId: string,
  attendeeProviderId: string,
): 'INBOUND' | 'OUTBOUND' | 'UNKNOWN' => {
  if (message.isSender === 1) {
    return 'OUTBOUND';
  }

  if (message.isSender === 0) {
    return message.senderId === attendeeProviderId ? 'INBOUND' : 'UNKNOWN';
  }

  if (message.senderId === attendeeProviderId) {
    return 'INBOUND';
  }

  return message.senderId === instagramUserId ? 'OUTBOUND' : 'UNKNOWN';
};

export type UnipileListMessagesInput = {
  accountId: string;
  chatId: string;
  cursor: string | null;
  after: string | null;
  limit: number;
};

export type UnipileGetMessageInput = {
  accountId: string;
  chatId: string;
  messageId: string;
};

export type UnipileListMessagesOutput = {
  messages: UnipileInstagramMessage[];
  nextCursor: string | null;
};
