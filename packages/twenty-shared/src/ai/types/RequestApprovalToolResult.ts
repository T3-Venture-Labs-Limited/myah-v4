import { type ApprovalDecision } from '@/ai/types/ApprovalDecision';
import { type RequestApprovalToolInput } from '@/ai/types/RequestApprovalToolInput';
import { type ReviewedGenericAction } from '@/ai/types/ReviewedGenericAction';

export type RequestApprovalInvalidReason =
  | 'ACTION_CHANGED'
  | 'TARGET_CHANGED'
  | 'NOT_AUTHORIZED_OR_UNAVAILABLE'
  | 'APPROVAL_EXPIRED';

export type RequestApprovalToolResult = {
  request: RequestApprovalToolInput;
  reviewedAction?: ReviewedGenericAction;
  approvalId?: string;
  // consumed: one execution attempt was authorized, not necessarily successful.
  // invalidated: refused before dispatch and needs a new approval.
  status: 'pending' | 'resolved' | 'consumed' | 'invalidated';
  executionOutcome?: 'succeeded' | 'failed';
  decision?: ApprovalDecision;
  comment?: string;
  decidedAt?: string;
  invalidReason?: RequestApprovalInvalidReason;
};
