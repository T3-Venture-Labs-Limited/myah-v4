import { type RequestApprovalToolInput } from 'twenty-shared/ai';

export type AgentChatPendingApproval = {
  messageId: string;
  toolCallId: string;
  request: RequestApprovalToolInput;
};
