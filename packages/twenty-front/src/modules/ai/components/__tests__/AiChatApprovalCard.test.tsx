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

const renderApprovalCard = () =>
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <AiChatApprovalCard pendingApproval={pendingApproval} />
      </ThemeProvider>
    </I18nProvider>,
  );

describe('AiChatApprovalCard', () => {
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
});
