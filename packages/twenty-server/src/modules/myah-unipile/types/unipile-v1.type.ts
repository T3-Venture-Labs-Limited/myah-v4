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
  text: string | null;
  timestamp: string | null;
  hasAttachments: boolean;
  attachmentCount: number;
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
