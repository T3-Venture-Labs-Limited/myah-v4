import { useQuery } from '@apollo/client/react';
import { useEffect } from 'react';

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
  lifecycleState: string;
};

export const AiChatActionApprovalEvidenceRenderer = ({
  bindingId,
  lifecycleState,
}: AiChatActionApprovalEvidenceRendererProps) => {
  const { data: proposalData, refetch: proposalRefetch } =
    useQuery<GetActionApprovalProposalData>(GET_ACTION_APPROVAL_PROPOSAL, {
      variables: { bindingId },
      fetchPolicy: 'cache-and-network',
    });
  const { data: receiptData, refetch: receiptRefetch } =
    useQuery<GetActionExecutionReceiptData>(GET_ACTION_EXECUTION_RECEIPT, {
      variables: { bindingId },
      fetchPolicy: 'cache-and-network',
    });
  useEffect(() => {
    void proposalRefetch({ bindingId });
    void receiptRefetch({ bindingId });
  }, [bindingId, lifecycleState, proposalRefetch, receiptRefetch]);

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
