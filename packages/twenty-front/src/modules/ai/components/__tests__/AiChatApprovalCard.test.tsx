import { useQuery } from '@apollo/client/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { AiChatApprovalCard } from '@/ai/components/AiChatApprovalCard';
import { type AgentChatPendingApproval } from '@/ai/types/AgentChatPendingApproval';

jest.mock('@linaria/react', () => {
  const React = jest.requireActual('react');
  const styled = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        () =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    },
  );

  return { styled };
});

jest.mock('@/ai/hooks/useSubmitApprovalDecision', () => ({
  useSubmitApprovalDecision: () => ({
    submitDecision: jest.fn(),
  }),
}));

jest.mock('@/ai/components/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: ({ text }: { text: string }) => (
    <div data-testid="approval-preview-markdown">
      <strong>Company:</strong>
      {text.replace('**Company:**', '')}
    </div>
  ),
}));

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
}));

const pendingApproval: AgentChatPendingApproval = {
  messageId: 'message-id',
  toolCallId: 'tool-call-id',
  request: {
    title: 'Update Anthropic company card with placeholder task',
    summary:
      'Update the Anthropic company record to indicate a placeholder task on their card.',
    actionKind: 'internal_record_write',
    riskLevel: 'low',
    targetLabel: 'Anthropic',
    preview: {
      format: 'markdown',
      content:
        '**Company:** Anthropic\n\n**Proposed update:** Add a placeholder task.',
    },
    consequences: ['The Anthropic company record will be modified.'],
  },
};

const renderApprovalCard = (
  approval: AgentChatPendingApproval = pendingApproval,
) =>
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <AiChatApprovalCard pendingApproval={approval} />
      </ThemeProvider>
    </I18nProvider>,
  );

const actionApprovalBindingId = '00000000-0000-4000-8000-000000000001';
const boundApproval: AgentChatPendingApproval = {
  messageId: 'message-id',
  toolCallId: 'tool-call-id',
  actionApprovalBindingId,
};

const serverDerivedProposal = {
  action: 'send_instagram_reply',
  actionVersion: 1,
  body: 'Thanks for getting in touch.',
  recipientLabel: '@recipient',
  sendingAccountLabel: '@myah_business',
  state: 'PENDING',
  expiresAt: '2099-07-17T10:30:00.000Z',
};

const mockUseQuery = useQuery as unknown as jest.Mock;

describe('AiChatApprovalCard', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    });
  });

  it('renders markdown previews with the markdown renderer', () => {
    renderApprovalCard();

    expect(screen.getByTestId('approval-preview-markdown')).toHaveTextContent(
      'Company: Anthropic',
    );
    expect(screen.queryByText(/\*\*Company:\*\*/)).not.toBeInTheDocument();
  });

  it('renders user-friendly approval metadata labels', () => {
    renderApprovalCard();

    expect(screen.getByText(/Risk:/)).toHaveTextContent('Risk: Low');
    expect(screen.getByText(/Action:/)).toHaveTextContent(
      'Action: Write to record',
    );
    expect(screen.queryByText('internal_record_write')).not.toBeInTheDocument();
  });

  it('renders the exact guarded server proposal instead of a generic fallback', () => {
    mockUseQuery.mockReturnValue({
      data: { getActionApprovalProposal: serverDerivedProposal },
      loading: false,
      error: undefined,
    });

    renderApprovalCard(boundApproval);

    expect(useQuery).toHaveBeenCalledWith(expect.anything(), {
      variables: { bindingId: actionApprovalBindingId },
      fetchPolicy: 'cache-and-network',
      skip: false,
    });
    expect(screen.getByText('Projected message')).toBeVisible();
    expect(screen.getByText(serverDerivedProposal.body)).toBeVisible();
    expect(
      screen.getByText(`To: ${serverDerivedProposal.recipientLabel}`),
    ).toBeVisible();
    expect(
      screen.getByText(`From: ${serverDerivedProposal.sendingAccountLabel}`),
    ).toBeVisible();
  });

  it('renders a guarded send_instagram_message version-2 reply proposal', () => {
    mockUseQuery.mockReturnValue({
      data: {
        getActionApprovalProposal: {
          ...serverDerivedProposal,
          action: 'send_instagram_message',
          actionVersion: 2,
        },
      },
      loading: false,
      error: undefined,
    });

    renderApprovalCard(boundApproval);

    expect(screen.getByText(serverDerivedProposal.body)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('classifies a bound outreach proposal as a high-risk email send and shows every exact transport field', () => {
    const outreachProposal = {
      ...serverDerivedProposal,
      action: 'send_outreach_email',
      body: `${'Full approved email body. '.repeat(20)}\nFinal paragraph.`,
      recipientLabel: 'Creator <creator@example.test>',
      sendingAccountLabel: 'Campaign mailbox <campaign@example.test>',
      subject: 'Exact approved subject',
    };
    mockUseQuery.mockReturnValue({
      data: { getActionApprovalProposal: outreachProposal },
      loading: false,
      error: undefined,
    });

    renderApprovalCard(boundApproval);

    expect(screen.getByText('Review outreach email')).toBeVisible();
    expect(screen.getByText(/Risk:/)).toHaveTextContent('Risk: High');
    expect(screen.getByText(/Action:/)).toHaveTextContent('Action: Send email');
    expect(
      screen.getByText(`From: ${outreachProposal.sendingAccountLabel}`),
    ).toBeVisible();
    expect(
      screen.getByText(`To: ${outreachProposal.recipientLabel}`),
    ).toBeVisible();
    expect(
      screen.getByText(`Subject: ${outreachProposal.subject}`),
    ).toBeVisible();
    expect(
      screen.getByText(
        (_content, element) => element?.textContent === outreachProposal.body,
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeEnabled();
  });

  it('reuses the approval card to review the complete Inbox reply without editable transport fields', () => {
    const inboxProposal = {
      ...serverDerivedProposal,
      action: 'send_inbox_reply',
      body: `${'Complete reply body. '.repeat(20)}\nFinal paragraph.`,
      recipientLabel: 'creator@example.test',
      sendingAccountLabel: 'hello@myah.test',
      subject: 'Re: Partnership',
      draftRevision: 3,
    };
    mockUseQuery.mockReturnValue({
      data: { getActionApprovalProposal: inboxProposal },
      loading: false,
      error: undefined,
    });

    renderApprovalCard(boundApproval);

    expect(screen.getByText('Review Inbox reply')).toBeVisible();
    expect(
      screen.getByText(
        'Review the exact server-derived Inbox reply before it is sent.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        (_content, element) => element?.textContent === inboxProposal.body,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(`To: ${inboxProposal.recipientLabel}`),
    ).toBeVisible();
    expect(
      screen.getByText(`From: ${inboxProposal.sendingAccountLabel}`),
    ).toBeVisible();
    expect(screen.getByText(`Subject: ${inboxProposal.subject}`)).toBeVisible();
    expect(
      screen.getByText(`Revision: ${inboxProposal.draftRevision}`),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeEnabled();
  });

  it('disables approval decisions when the guarded proposal is unavailable', () => {
    renderApprovalCard(boundApproval);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeDisabled();
  });

  it.each([
    [
      'the proposal is loading',
      {
        data: { getActionApprovalProposal: serverDerivedProposal },
        loading: true,
      },
    ],
    [
      'the proposal query errors',
      {
        data: { getActionApprovalProposal: serverDerivedProposal },
        loading: false,
        error: new Error('unavailable'),
      },
    ],
    [
      'the proposal action is not the registered Instagram reply',
      {
        data: {
          getActionApprovalProposal: {
            ...serverDerivedProposal,
            action: 'other_action',
          },
        },
        loading: false,
      },
    ],
    [
      'the proposal version does not match',
      {
        data: {
          getActionApprovalProposal: {
            ...serverDerivedProposal,
            actionVersion: 2,
          },
        },
        loading: false,
      },
    ],
    [
      'the outreach proposal is malformed',
      {
        data: {
          getActionApprovalProposal: {
            ...serverDerivedProposal,
            action: 'send_outreach_email',
            subject: null,
          },
        },
        loading: false,
      },
    ],
    [
      'the proposal is terminal',
      {
        data: {
          getActionApprovalProposal: {
            ...serverDerivedProposal,
            state: 'CONSUMED',
          },
        },
        loading: false,
      },
    ],
    [
      'the proposal is expired',
      {
        data: {
          getActionApprovalProposal: {
            ...serverDerivedProposal,
            expiresAt: '2020-07-17T10:30:00.000Z',
          },
        },
        loading: false,
      },
    ],
  ])('disables every decision when %s', (_case, queryResult) => {
    mockUseQuery.mockReturnValue(queryResult);

    renderApprovalCard(boundApproval);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeDisabled();
  });

  describe('generic approval with a server-derived reviewed action', () => {
    const aliceUpdate: AgentChatPendingApproval = {
      messageId: 'message-id',
      toolCallId: 'tool-call-id',
      request: {
        title: 'Qualify Tim',
        summary: "Set Tim's status to Qualified.",
        actionKind: 'internal_record_write',
        riskLevel: 'low',
        targetLabel: 'Tim',
        consequences: ['A creator becomes Qualified.'],
      },
      reviewedAction: {
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
                {
                  field: 'creatorStatus',
                  current: 'NEW',
                  proposed: 'QUALIFIED',
                },
              ],
              linkedRecords: [],
            },
          ],
          totalCount: 1,
          targetFingerprint: 'b'.repeat(64),
        },
      },
    };

    it('shows the real target and change from the reviewed action', () => {
      renderApprovalCard(aliceUpdate);

      expect(screen.getByText('Review: Update Creator')).toBeInTheDocument();
      expect(screen.getByText('What will change')).toBeInTheDocument();
      expect(screen.getByText('Alice (creator)')).toBeInTheDocument();
      expect(
        screen.getByText('creatorStatus: NEW → QUALIFIED'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    });

    it('distinguishes clearing a field from setting it to null', () => {
      renderApprovalCard({
        ...aliceUpdate,
        reviewedAction: {
          ...aliceUpdate.reviewedAction!,
          target: {
            kind: 'record_write',
            operation: 'update',
            objectNameSingular: 'creator',
            records: [
              {
                recordId: 'alice-id',
                label: 'Alice',
                changes: [{ field: 'city', current: null, proposed: '' }],
                linkedRecords: [],
              },
            ],
            totalCount: 1,
            targetFingerprint: 'b'.repeat(64),
          },
        },
      });

      expect(screen.getByText('city: — → ""')).toBeInTheDocument();
    });

    it('keeps a disagreeing model summary secondary and never as the target', () => {
      renderApprovalCard(aliceUpdate);

      expect(screen.queryByText('Qualify Tim')).not.toBeInTheDocument();
      expect(screen.queryByText('Tim')).not.toBeInTheDocument();
      expect(screen.getByText("Assistant's description")).toBeInTheDocument();
      expect(
        screen.getByText("Set Tim's status to Qualified."),
      ).toBeInTheDocument();
    });

    it('marks contradictory risk, action, and consequences as assistant-authored rather than reviewed facts', () => {
      renderApprovalCard({
        ...aliceUpdate,
        request: {
          ...aliceUpdate.request!,
          actionKind: 'email_send',
          riskLevel: 'low',
          consequences: ['No records will change.'],
        },
      });

      expect(screen.getByText('Alice (creator)')).toBeInTheDocument();
      expect(
        screen.getByText('creatorStatus: NEW → QUALIFIED'),
      ).toBeInTheDocument();
      expect(screen.getByText("Assistant's risk estimate: Low")).toBeVisible();
      expect(
        screen.getByText("Assistant's action category: Send email"),
      ).toBeVisible();
      expect(screen.getByText("Assistant's stated consequences")).toBeVisible();
      expect(screen.getByText('No records will change.')).toBeVisible();
      expect(screen.queryByText('Risk: Low')).not.toBeInTheDocument();
      expect(screen.queryByText('Action: Send email')).not.toBeInTheDocument();
    });

    it('shows the exact arguments of a non-record tool', () => {
      renderApprovalCard({
        ...aliceUpdate,
        reviewedAction: {
          version: 1,
          toolName: 'update_myah_inbox_thread',
          toolLabel: 'Update Inbox thread',
          argumentsDigest: 'c'.repeat(64),
          arguments: { messageThreadId: 'thread-id', state: 'CLOSED' },
          target: { kind: 'arguments_only' },
        },
      });

      expect(screen.getByText('What will run')).toBeInTheDocument();
      expect(
        screen.getByText(/"messageThreadId": "thread-id"/),
      ).toBeInTheDocument();
    });

    it('labels a linked record next to its ID on a creation', () => {
      renderApprovalCard({
        ...aliceUpdate,
        reviewedAction: {
          ...aliceUpdate.reviewedAction!,
          toolName: 'create_one_task_target',
          target: {
            kind: 'record_write',
            operation: 'create',
            objectNameSingular: 'taskTarget',
            records: [
              {
                recordId: null,
                label: null,
                changes: [{ field: 'creatorId', proposed: 'alice-id' }],
                linkedRecords: [
                  { field: 'creatorId', recordId: 'alice-id', label: 'Alice' },
                ],
              },
            ],
            totalCount: 1,
            targetFingerprint: null,
          },
        },
      });

      expect(screen.getByText('What will be created')).toBeInTheDocument();
      expect(
        screen.getByText('creatorId: Alice (alice-id)'),
      ).toBeInTheDocument();
    });

    it('never offers approval for a legacy generic request without a reviewed action', () => {
      renderApprovalCard(pendingApproval);

      expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
      expect(
        screen.getByText(
          /The exact action is unavailable, so it cannot be approved/,
        ),
      ).toBeInTheDocument();
    });
  });
});
