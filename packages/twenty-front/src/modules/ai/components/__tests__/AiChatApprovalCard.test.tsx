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

const renderApprovalCard = (approval = pendingApproval) =>
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
  expiresAt: '2026-07-17T10:30:00.000Z',
};

describe('AiChatApprovalCard', () => {
  beforeEach(() => {
    (useQuery as jest.Mock).mockReturnValue({
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
    (useQuery as jest.Mock).mockReturnValue({
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
    expect(screen.getByText(`To: ${serverDerivedProposal.recipientLabel}`)).toBeVisible();
    expect(
      screen.getByText(`From: ${serverDerivedProposal.sendingAccountLabel}`),
    ).toBeVisible();
  });

  it('disables approval decisions when the guarded proposal is unavailable', () => {
    renderApprovalCard(boundApproval);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeDisabled();
  });
});
