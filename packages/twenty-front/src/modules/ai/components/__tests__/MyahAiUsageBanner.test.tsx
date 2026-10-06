import { AiChatErrorRenderer } from '@/ai/components/AiChatErrorRenderer';
import { myahSubscriptionRefreshRequestedState } from '@/settings/billing/states/myahSubscriptionRefreshRequestedState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { ThemeProvider } from 'twenty-ui/theme-constants';

let mockUsage = {
  exhausted: true,
  paymentRetrying: false,
  resetAt: '2026-11-05T00:00:00.000Z',
};
let mockCanManage = true;
const mockRefetch = jest.fn();
const mockNavigateApp = jest.fn();
const mockNavigateSettings = jest.fn();
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => ({
    usage: mockUsage,
    hasAccess: true,
    refetch: mockRefetch,
  }),
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockCanManage,
}));
jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigateApp,
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateSettings,
}));

const mount = (code: string, onRetry?: () => void, graphql = false) =>
  render(
    <Provider store={jotaiStore}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <AiChatErrorRenderer
            error={
              graphql
                ? new CombinedGraphQLErrors({
                    errors: [
                      {
                        message: 'Provider refusal',
                        extensions: { code: 'FORBIDDEN', subCode: code },
                      },
                    ],
                  })
                : Object.assign(new Error('Provider refusal'), { code })
            }
            onRetry={onRetry}
          />
        </ThemeProvider>
      </I18nProvider>
    </Provider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  resetJotaiStore();
  mockCanManage = true;
  mockUsage = {
    exhausted: true,
    paymentRetrying: false,
    resetAt: '2026-11-05T00:00:00.000Z',
  };
  mockRefetch.mockResolvedValue({});
});

it.each([false, true])(
  'maps included-usage refusals to the reset date and Billing, graphql=%s',
  async (graphql) => {
    mount('INCLUDED_USAGE_EXHAUSTED', undefined, graphql);
    expect(
      await screen.findByText(/This month's AI usage is used up. It resets on/),
    ).toHaveTextContent('2026');
    fireEvent.click(screen.getByRole('button', { name: 'Go to Billing' }));
    expect(mockNavigateSettings).toHaveBeenCalledWith(SettingsPath.Billing);
    expect(screen.queryByText('Provider refusal')).not.toBeInTheDocument();
  },
);

it('uses payment-dependent reset wording while retrying', async () => {
  mockUsage.paymentRetrying = true;
  mount('INCLUDED_USAGE_EXHAUSTED');
  expect(
    await screen.findByText(
      "This month's AI usage is used up. It resets when your renewal payment goes through.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
});

it('requests server onboarding refresh for a streamed subscription refusal and offers Subscribe', async () => {
  const retry = jest.fn();
  mount('SUBSCRIPTION_REQUIRED', retry);
  expect(
    await screen.findByText(/This workspace has no active subscription/),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(jotaiStore.get(myahSubscriptionRefreshRequestedState.atom)).toBe(
      true,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  expect(mockNavigateApp).toHaveBeenCalledWith(AppPath.PlanRequired);
  expect(retry).not.toHaveBeenCalled();
});

it('asks a member without Billing permission to contact an admin', async () => {
  mockCanManage = false;
  mount('SUBSCRIPTION_REQUIRED');
  expect(
    await screen.findByText(/Ask a workspace admin to subscribe/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Subscribe' }),
  ).not.toBeInTheDocument();
});

it('does not send an ordinary member to inaccessible Billing settings', async () => {
  mockCanManage = false;
  mount('INCLUDED_USAGE_EXHAUSTED');
  expect(
    await screen.findByText(/This month's AI usage is used up/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Go to Billing' }),
  ).not.toBeInTheDocument();
});

it('offers an explicit retry after refreshing a new period, never resending automatically', async () => {
  mockUsage.exhausted = false;
  const retry = jest.fn();
  mount('INCLUDED_USAGE_EXHAUSTED', retry);
  expect(
    await screen.findByText(
      'AI usage is available again. You can try your message again.',
    ),
  ).toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps the refusal visible if access refresh fails', async () => {
  mockRefetch.mockRejectedValue(new Error('Offline'));
  mount('INCLUDED_USAGE_EXHAUSTED');
  expect(
    await screen.findByText(/This month's AI usage is used up/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/AI usage is available again/),
  ).not.toBeInTheDocument();
});

it('leaves the legacy billing-code handling unchanged', () => {
  const { container } = mount('BILLING_CREDITS_EXHAUSTED');
  expect(container).toBeEmptyDOMElement();
  expect(mockRefetch).not.toHaveBeenCalled();
});
