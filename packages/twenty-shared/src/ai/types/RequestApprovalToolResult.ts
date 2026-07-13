import { type ApprovalDecision } from '@/ai/types/ApprovalDecision';
import { type RequestApprovalToolInput } from '@/ai/types/RequestApprovalToolInput';

export type RequestApprovalToolResult = {
  request: RequestApprovalToolInput;
  approvalId?: string;
  status: 'pending' | 'resolved';
  decision?: ApprovalDecision;
  comment?: string;
  decidedAt?: string;
};
