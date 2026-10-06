import { render, screen } from '@testing-library/react';
import { AgentChatProviderContent } from '@/ai/components/AgentChatProviderContent';

let mockHasAccess = false;
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => ({ hasAccess: mockHasAccess }),
}));
jest.mock('@/ai/components/AgentChatThreadInitializationEffect', () => ({
  AgentChatThreadInitializationEffect: () => <div>Thread initialization</div>,
}));
jest.mock('@/ai/components/AgentChatRuntimeEffects', () => ({
  AgentChatRuntimeEffects: () => <div>Chat runtime</div>,
}));

it('keeps the app mounted but starts chat effects only with workspace access', () => {
  const content = (
    <AgentChatProviderContent>
      <div>Application</div>
    </AgentChatProviderContent>
  );
  const { rerender } = render(content);
  expect(screen.getByText('Application')).toBeInTheDocument();
  expect(screen.queryByText('Thread initialization')).not.toBeInTheDocument();
  expect(screen.queryByText('Chat runtime')).not.toBeInTheDocument();

  mockHasAccess = true;
  rerender(
    <AgentChatProviderContent>
      <div>Application</div>
    </AgentChatProviderContent>,
  );
  expect(screen.getByText('Thread initialization')).toBeInTheDocument();
  expect(screen.getByText('Chat runtime')).toBeInTheDocument();

  mockHasAccess = false;
  rerender(
    <AgentChatProviderContent>
      <div>Application</div>
    </AgentChatProviderContent>,
  );
  expect(screen.getByText('Application')).toBeInTheDocument();
  expect(screen.queryByText('Thread initialization')).not.toBeInTheDocument();
  expect(screen.queryByText('Chat runtime')).not.toBeInTheDocument();
});
