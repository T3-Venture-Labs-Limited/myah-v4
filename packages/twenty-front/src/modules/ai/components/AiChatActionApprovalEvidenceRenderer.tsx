import { useQuery } from '@apollo/client/react';

import {
  AiChatActionApprovalEvidence,
  type ActionApprovalProposalEvidence,
  type ActionExecutionReceiptEvidence,
} from '@/ai/components/AiChatActionApprovalEvidence';
import { GET_ACTION_APPROVAL_PROPOSAL } from '@/ai/graphql/queries/getActionApprovalProposal';
import { GET_ACTION_EXECUTION_RECEIPT } from '@/ai/graphql/queries/getActionExecutionReceipt';

type GetActionApprovalProposalData = {
  getActionApprovalProposal: ActionApprovalProposalEvidence;
};

type GetActionExecutionReceiptData = {
  getActionExecutionReceipt: ActionExecutionReceiptEvidence | null;
};

type AiChatActionApprovalEvidenceRendererProps = {
  bindingId: string;
};

export const AiChatActionApprovalEvidenceRenderer = ({
  bindingId,
}: AiChatActionApprovalEvidenceRendererProps) => {
  const { data: proposalData } = useQuery<GetActionApprovalProposalData>(
    GET_ACTION_APPROVAL_PROPOSAL,
    { variables: { bindingId } },
  );
  const { data: receiptData } = useQuery<GetActionExecutionReceiptData>(
    GET_ACTION_EXECUTION_RECEIPT,
    { variables: { bindingId } },
  );

  if (!proposalData) {
    return null;
  }

  return (
    <AiChatActionApprovalEvidence
      proposal={proposalData.getActionApprovalProposal}
      receipt={receiptData?.getActionExecutionReceipt ?? null}
    />
  );
};
