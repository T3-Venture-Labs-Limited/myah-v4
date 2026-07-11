import { type ApprovalActionKind } from '@/ai/types/ApprovalActionKind';
import { type ApprovalRiskLevel } from '@/ai/types/ApprovalRiskLevel';
import { type RequestApprovalAffectedRecord } from '@/ai/types/RequestApprovalAffectedRecord';
import { type RequestApprovalPreview } from '@/ai/types/RequestApprovalPreview';

export type RequestApprovalToolInput = {
  title: string;
  summary: string;
  actionKind: ApprovalActionKind;
  riskLevel: ApprovalRiskLevel;
  toolName?: string;
  targetLabel?: string;
  affectedRecords?: RequestApprovalAffectedRecord[];
  preview?: RequestApprovalPreview;
  consequences: string[];
  options?: {
    allowRequestChanges?: boolean;
  };
};
