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

  it('does not show generic outcome warnings on registered sends', () => {
    mockUseQuery.mockReturnValue({
      data: { getActionApprovalProposal: { state: 'CONSUMED' } },
    } as never);

    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatApprovalStatusRenderer
            toolPart={
              {
                output: {
                  result: {
                    status: 'consumed',
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

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(
      screen.queryByText(/tool may have made changes/),
    ).not.toBeInTheDocument();
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

  describe('generic approvals', () => {
    const reviewedAction = {
      version: 1,
      toolName: 'update_one_creator',
      toolLabel: 'Update Creator',
      argumentsDigest: 'a'.repeat(64),
      arguments: { id: 'alice-id', creatorStatus: 'QUALIFIED' },
      target: {
        kind: 'record_write',
        operation: 'update',
        objectNameSingular: 'creator',
        records: [
          {
            recordId: 'alice-id',
            label: 'Alice',
            changes: [
              { field: 'creatorStatus', current: 'NEW', proposed: 'QUALIFIED' },
            ],
            linkedRecords: [],
          },
        ],
        totalCount: 1,
        targetFingerprint: 'b'.repeat(64),
      },
    };
    const renderGeneric = (result: Record<string, unknown>) => {
      mockUseQuery.mockReturnValue({ data: undefined } as never);

      render(
        <I18nProvider i18n={i18n}>
          <ThemeProvider colorScheme="light">
            <AiChatApprovalStatusRenderer
              toolPart={{ output: { result } } as never}
              isStreaming={false}
            />
          </ThemeProvider>
        </I18nProvider>,
      );
    };

    it('shows an approved and run action with its reviewed change', () => {
      renderGeneric({
        status: 'consumed',
        decision: 'approved',
        executionOutcome: 'succeeded',
        reviewedAction,
      });

      expect(screen.getByText('Approved and run')).toBeInTheDocument();
      expect(
        screen.getByText('creatorStatus: NEW → QUALIFIED'),
      ).toBeInTheDocument();
    });

    it.each([
      [undefined, 'Approved, outcome unconfirmed'],
      ['failed', 'Approved, execution reported a failure'],
    ])(
      'does not claim a consumed approval ran without success (%s)',
      (executionOutcome, label) => {
        renderGeneric({
          status: 'consumed',
          decision: 'approved',
          executionOutcome,
          reviewedAction,
        });

        expect(screen.getByText(label)).toBeInTheDocument();
        expect(screen.queryByText('Approved and run')).not.toBeInTheDocument();
      },
    );

    it.each([
      ['ACTION_CHANGED', /tried a different action than the one approved/],
      ['TARGET_CHANGED', /records changed after review/],
      ['NOT_AUTHORIZED_OR_UNAVAILABLE', /Permission is missing/],
      ['APPROVAL_EXPIRED', /expired before it ran/],
    ])('explains an approved action that was not run (%s)', (reason, text) => {
      renderGeneric({
        status: 'invalidated',
        decision: 'approved',
        invalidReason: reason,
        reviewedAction,
      });

      expect(screen.getByText('Approved, but not run')).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });
});
