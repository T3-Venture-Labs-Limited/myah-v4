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
