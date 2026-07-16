import { type RequestApprovalToolInput } from 'twenty-shared/ai';

type PendingApprovalBase = {
  messageId: string;
  toolCallId: string;
};

export type AgentChatPendingApproval =
  | (PendingApprovalBase & { request: RequestApprovalToolInput })
  | (PendingApprovalBase & { actionApprovalBindingId: string });
