import { useQuery } from '@apollo/client/react';
import { render } from '@testing-library/react';

import { AiChatActionApprovalEvidenceRenderer } from '@/ai/components/AiChatActionApprovalEvidenceRenderer';
import { GET_ACTION_APPROVAL_PROPOSAL } from '@/ai/graphql/queries/getActionApprovalProposal';

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
}));

jest.mock('@/ai/components/AiChatActionApprovalEvidence', () => ({
  AiChatActionApprovalEvidence: () => null,
}));

const bindingId = 'b24f28a7-64bd-4cb8-ac5f-837536ca11db';

const mockUseQuery = jest.mocked(useQuery);

describe('AiChatActionApprovalEvidenceRenderer', () => {
  it('refreshes this binding after stream completion', () => {
    const proposalRefetch = jest.fn();
    const receiptRefetch = jest.fn();

    mockUseQuery.mockImplementation((query) =>
      query === GET_ACTION_APPROVAL_PROPOSAL
        ? ({
            data: { getActionApprovalProposal: null },
            refetch: proposalRefetch,
          } as never)
        : ({
            data: { getActionExecutionReceipt: null },
            refetch: receiptRefetch,
          } as never),
    );

    const { rerender } = render(
      <AiChatActionApprovalEvidenceRenderer
        bindingId={bindingId}
        lifecycleState="streaming"
      />,
    );

    rerender(
      <AiChatActionApprovalEvidenceRenderer
        bindingId={bindingId}
        lifecycleState="complete"
      />,
    );

    expect(proposalRefetch).toHaveBeenCalledWith({ bindingId });
    expect(receiptRefetch).toHaveBeenCalledWith({ bindingId });
  });
});
