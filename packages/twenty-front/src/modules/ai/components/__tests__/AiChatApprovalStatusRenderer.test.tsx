import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { useQuery } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { AiChatApprovalStatusRenderer } from '@/ai/components/AiChatApprovalStatusRenderer';

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
}));

jest.mock('@/ai/components/AiChatActionApprovalEvidenceRenderer', () => ({
  AiChatActionApprovalEvidenceRenderer: ({
    lifecycleState,
  }: {
    lifecycleState: string;
  }) => <span data-testid="approval-evidence">{lifecycleState}</span>,
}));

const bindingId = 'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
const mockUseQuery = jest.mocked(useQuery);

describe('AiChatApprovalStatusRenderer', () => {
  it('derives a bound approval lifecycle from guarded binding state', () => {
    mockUseQuery.mockReturnValue({
      data: { getActionApprovalProposal: { state: 'EXPIRED' } },
    } as never);

    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatApprovalStatusRenderer
            toolPart={
              {
                output: {
                  result: {
                    status: 'resolved',
                    actionApprovalBindingId: bindingId,
                    decision: 'approved',
                    comment: 'untrusted',
                  },
                },
              } as never
            }
            isStreaming={false}
          />
        </ThemeProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(screen.queryByText('untrusted')).not.toBeInTheDocument();
  });

  it('refetches guarded state when opaque result status changes', () => {
    mockUseQuery.mockReturnValue({
      data: { getActionApprovalProposal: { state: 'PENDING' } },
    } as never);
    const { rerender } = render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatApprovalStatusRenderer
            toolPart={
              {
                output: {
                  result: {
                    status: 'pending',
                    actionApprovalBindingId: bindingId,
                  },
                },
              } as never
            }
            isStreaming={false}
          />
        </ThemeProvider>
      </I18nProvider>,
    );
    expect(screen.getByTestId('approval-evidence')).toHaveTextContent(
      'pending:PENDING:complete',
    );

    rerender(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatApprovalStatusRenderer
            toolPart={
              {
                output: {
                  result: {
                    status: 'resolved',
                    actionApprovalBindingId: bindingId,
                  },
                },
              } as never
            }
            isStreaming={false}
          />
        </ThemeProvider>
      </I18nProvider>,
    );
    expect(screen.getByTestId('approval-evidence')).toHaveTextContent(
      'resolved:PENDING:complete',
    );
  });
});
