export type ListInstagramConversationsInput = {
  connectedAccountId?: string;
  userId?: string;
  limit?: number;
  after?: string;
  igUserId?: string;
  graphApiVersion?: string;
};

export type ListInstagramMessagesInput = {
  connectedAccountId?: string;
  userId?: string;
  conversationId?: string;
  limit?: number;
  after?: string;
  graphApiVersion?: string;
};

export type SendInstagramTextMessageInput = {
  connectedAccountId?: string;
  userId?: string;
  recipientId?: string;
  text?: string;
  igUserId?: string;
  graphApiVersion?: string;
  replyToMessageId?: string;
  conversationId?: string;
  draftId?: string;
};
