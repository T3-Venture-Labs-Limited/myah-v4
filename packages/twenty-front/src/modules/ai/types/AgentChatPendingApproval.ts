import {
  type RequestApprovalToolInput,
  type ReviewedGenericAction,
} from 'twenty-shared/ai';

type PendingApprovalBase = {
  messageId: string;
  toolCallId: string;
};

export type AgentChatPendingApproval =
  | (PendingApprovalBase & {
      request: RequestApprovalToolInput;
      // Server-derived exact action; absent only on legacy approvals, which
      // cannot be approved.
      reviewedAction?: ReviewedGenericAction;
    })
  | (PendingApprovalBase & { actionApprovalBindingId: string });
