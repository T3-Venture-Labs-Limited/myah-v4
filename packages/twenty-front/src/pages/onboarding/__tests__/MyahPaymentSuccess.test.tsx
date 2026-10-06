import { MockedProvider } from '@apollo/client/testing/react';
import { type MockedResponse } from '@apollo/client/testing';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { GraphQLError } from 'graphql';
import { Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import {
  MyahWorkspaceUsageDocument,
  PermissionFlagType,
  SyncMyahCheckoutSessionDocument,
} from '~/generated-metadata/graphql';
import { MyahPaymentSuccess } from '~/pages/onboarding/MyahPaymentSuccess';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';

const mockLoadCurrentUser = jest.fn();
jest.mock('@/users/hooks/useLoadCurrentUser', () => ({
  useLoadCurrentUser: () => ({ loadCurrentUser: mockLoadCurrentUser }),
}));
jest.mock('@/auth/components/Logo', () => ({ Logo: () => <div /> }));

const syncMock = (
  result: MockedResponse['result'] = {
    data: { syncMyahCheckoutSession: 'ACTIVE' },
  },
): MockedResponse => ({
  request: {
    query: SyncMyahCheckoutSessionDocument,
    variables: { sessionId: 'cs_fixture' },
  },
  result,
  delay: 0,
});
const usageMock = (state = 'ACTIVE'): MockedResponse => ({
  request: { query: MyahWorkspaceUsageDocument },
  delay: 0,
  result: {
    data: {
      myahWorkspaceUsage: {
        instagramReconnectRequired: false,
        state,
        percentUsed: 0,
        periodStart: null,
        resetAt: null,
        paymentRetrying: false,
        exhausted: false,
      },
    },
  },
});
const mount = ({
  member = false,
  session = true,
  mocks = [syncMock(), usageMock()],
}: { member?: boolean; session?: boolean; mocks?: MockedResponse[] } = {}) => {
  jotaiStore.set(currentUserWorkspaceState.atom, {
    permissionFlags: member ? [] : [PermissionFlagType.BILLING],
    objectsPermissions: [],
    twoFactorAuthenticationMethodSummary: [],
  });
  return render(
    <Provider store={jotaiStore}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          initialEntries={[
            `/plan-required/payment-success${session ? '?session_id=cs_fixture' : ''}`,
          ]}
        >
          <MockedProvider mocks={mocks}>
            <MyahPaymentSuccess />
          </MockedProvider>
        </MemoryRouter>
      </I18nProvider>
    </Provider>,
  );
};
beforeEach(() => {
  resetJotaiStore();
  jest.clearAllMocks();
  mockLoadCurrentUser.mockResolvedValue({});
  jotaiStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
});
afterEach(() => {
  jest.useRealTimers();
});

it('syncs Checkout and refreshes access before enabling Continue; then uses the server onboarding status', async () => {
  const sync = jest.fn(() => ({ data: { syncMyahCheckoutSession: 'ACTIVE' } }));
  mount({ mocks: [syncMock(sync), usageMock()] });
  expect(
    screen.queryByRole('button', { name: 'Continue' }),
  ).not.toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: "You're subscribed" }),
  ).toBeVisible();
  expect(sync).toHaveBeenCalledTimes(1);
  expect(mockLoadCurrentUser).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mockLoadCurrentUser).toHaveBeenCalledTimes(1));
});

it('lets a member observe paid access without invoking a Billing-only mutation', async () => {
  mount({ member: true, mocks: [usageMock()] });
  expect(
    await screen.findByRole('heading', { name: "You're subscribed" }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

it('does not treat the return URL itself as proof of payment', () => {
  mount({ session: false, mocks: [] });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'missing its Checkout session',
  );
  expect(
    screen.queryByRole('button', { name: 'Continue' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Back to subscription' }),
  ).toHaveAttribute('href', '/plan-required');
});

it('handles a refused or failed sync without continuing, and retries only confirmation', async () => {
  const sync = jest.fn(() => ({ data: { syncMyahCheckoutSession: 'ACTIVE' } }));
  mount({
    mocks: [
      syncMock({
        errors: [new GraphQLError('Checkout belongs to another workspace')],
      }),
      syncMock(sync),
      usageMock(),
    ],
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "won't start another payment",
  );
  expect(mockLoadCurrentUser).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry confirmation' }));
  expect(
    await screen.findByRole('heading', { name: "You're subscribed" }),
  ).toBeVisible();
  expect(sync).toHaveBeenCalledTimes(1);
});

it('waits for active access when the first sync is incomplete', async () => {
  jest.useFakeTimers();
  mount({
    mocks: [
      syncMock({ data: { syncMyahCheckoutSession: 'NEEDS_SUBSCRIPTION' } }),
      usageMock('NEEDS_SUBSCRIPTION'),
      syncMock(),
      usageMock(),
    ],
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(100);
  });
  expect(
    screen.getByRole('heading', { name: 'Confirming your payment' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Continue' }),
  ).not.toBeInTheDocument();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2100);
  });
  expect(
    screen.getByRole('heading', { name: "You're subscribed" }),
  ).toBeVisible();
});

it('stops automatic confirmation after 30 unsuccessful attempts', async () => {
  jest.useFakeTimers();
  const sync = jest.fn(() => ({
    data: { syncMyahCheckoutSession: 'NEEDS_SUBSCRIPTION' },
  }));
  mount({
    mocks: [
      { ...syncMock(sync), maxUsageCount: 30 },
      { ...usageMock('NEEDS_SUBSCRIPTION'), maxUsageCount: 30 },
    ],
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(61000);
  });
  expect(
    screen.getByRole('button', { name: 'Retry confirmation' }),
  ).toBeVisible();
  expect(sync).toHaveBeenCalledTimes(30);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10000);
  });
  expect(sync).toHaveBeenCalledTimes(30);
  expect(mockLoadCurrentUser).not.toHaveBeenCalled();
});

it('does not continue a confirmation loop after unmount', async () => {
  jest.useFakeTimers();
  const sync = jest.fn(() => ({
    data: { syncMyahCheckoutSession: 'NEEDS_SUBSCRIPTION' },
  }));
  const { unmount } = mount({
    mocks: [
      { ...syncMock(sync), maxUsageCount: 2 },
      usageMock('NEEDS_SUBSCRIPTION'),
    ],
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(100);
  });
  unmount();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
  expect(sync).toHaveBeenCalledTimes(1);
});

it('keeps confirmed access and offers Continue again if loading the current user fails', async () => {
  mockLoadCurrentUser.mockRejectedValueOnce(new Error('Offline'));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'try Continue again',
  );
  expect(
    screen.getByRole('heading', { name: "You're subscribed" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mockLoadCurrentUser).toHaveBeenCalledTimes(2));
});
