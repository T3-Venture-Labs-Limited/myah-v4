import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { type ReactNode } from 'react';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import {
  CreateMyahCustomerPortalSessionDocument,
  MyahSubscriptionDetailsDocument,
  MyahWorkspaceUsageDocument,
  PermissionFlagType,
} from '~/generated-metadata/graphql';
import { SettingsBilling } from '~/pages/settings/billing/SettingsBilling';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';

const mockRedirect = jest.fn();
jest.mock('@/domain-manager/hooks/useRedirect', () => ({
  useRedirect: () => ({ redirect: mockRedirect }),
}));
jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
}));

const end = '2026-11-05T00:00:00.000Z';
const defaultDetails = {
  amountCents: 9900,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: end,
};
const detailsMock = (details = defaultDetails): MockedResponse => ({
  request: { query: MyahSubscriptionDetailsDocument },
  result: { data: { myahSubscriptionDetails: details } },
});
const mount = ({
  state = 'ACTIVE',
  percent = 42,
  details = defaultDetails as {
    amountCents: number | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  },
  member = false,
  extraMocks = [] as MockedResponse[],
  detailsError = false,
} = {}) => {
  jotaiStore.set(currentUserWorkspaceState.atom, {
    permissionFlags: member ? [] : [PermissionFlagType.BILLING],
    objectsPermissions: [],
    twoFactorAuthenticationMethodSummary: [],
  });
  return render(
    <Provider store={jotaiStore}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <MockedProvider
            mocks={[
              {
                request: { query: MyahWorkspaceUsageDocument },
                maxUsageCount: 2,
                result: {
                  data: {
                    myahWorkspaceUsage: {
                      instagramReconnectRequired: false,
                      state,
                      percentUsed: state === 'COMPLIMENTARY' ? null : percent,
                      periodStart: '2026-10-05T00:00:00.000Z',
                      resetAt: end,
                      paymentRetrying: state === 'PAYMENT_RETRYING',
                      exhausted: percent >= 100,
                    },
                  },
                },
              },
              detailsError
                ? {
                    request: { query: MyahSubscriptionDetailsDocument },
                    error: new Error('Unavailable'),
                  }
                : {
                    request: { query: MyahSubscriptionDetailsDocument },
                    result: { data: { myahSubscriptionDetails: details } },
                  },
              ...extraMocks,
            ]}
          >
            <SettingsBilling />
          </MockedProvider>
        </ThemeProvider>
      </I18nProvider>
    </Provider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  resetJotaiStore();
  jotaiStore.set(isMyahSubscriptionRequiredState.atom, true);
  jotaiStore.set(currentWorkspaceState.atom, {
    ...mockCurrentWorkspace,
    displayName: 'Glow & Co',
  });
});

it('shows the active plan, real price, renewal and AI-only percentage without legacy funding', async () => {
  mount();
  expect(await screen.findByText('Early access')).toBeInTheDocument();
  expect(screen.getByText(/\$99/)).toHaveTextContent('/ month');
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText(/Renews on.*2026/)).toBeInTheDocument();
  expect(
    screen.getByRole('progressbar', { name: 'Included AI usage used' }),
  ).toHaveAttribute('aria-valuenow', '42');
  expect(
    screen.getByText(/Instagram account is included separately/),
  ).toBeInTheDocument();
  expect(screen.queryByText('Add funds')).not.toBeInTheDocument();
  expect(screen.queryByText('Managed email')).not.toBeInTheDocument();
});

it('shows the cancellation end date instead of renewal', async () => {
  mount({ details: { ...defaultDetails, cancelAtPeriodEnd: true } });
  expect(
    await screen.findByText(/Your subscription ends on/),
  ).toHaveTextContent('Myah stays available until then');
  expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manage billing' })).toBeEnabled();
});

it('shows retrying wording without promising a reset before payment, while Instagram and sending remain available', async () => {
  mount({ state: 'PAYMENT_RETRYING', percent: 100 });
  expect(await screen.findByText('Payment failed')).toBeInTheDocument();
  expect(
    screen.getByText(/Stripe will retry it up to 3 times/),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Resets when your renewal payment goes through'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Resets on/)).not.toBeInTheDocument();
  expect(
    screen.getByText(/Sending messages and connecting Instagram keep working/),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update card' })).toBeEnabled();
});

it('shows complimentary access without a limit, price or payment action', async () => {
  mount({
    state: 'COMPLIMENTARY',
    details: {
      amountCents: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
  });
  expect(await screen.findByText('Complimentary access')).toBeInTheDocument();
  expect(
    screen.getByText("AI usage isn't limited for this workspace."),
  ).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Manage billing' }),
  ).not.toBeInTheDocument();
});

it('keeps the normal allowance for a $0 promotion', async () => {
  mount({ details: { ...defaultDetails, amountCents: 0 } });
  expect(await screen.findByText(/\$0/)).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  expect(screen.queryByText('Complimentary access')).not.toBeInTheDocument();
});

it('shows an 80% warning', async () => {
  mount({ percent: 85 });
  expect(
    await screen.findByText(
      "You've used 85% of this month's included AI usage.",
    ),
  ).toBeInTheDocument();
});

it('opens the permission-guarded Stripe Portal', async () => {
  const create = jest.fn(() => ({
    data: {
      createMyahCustomerPortalSession: 'https://billing.stripe.com/fixture',
    },
  }));
  mount({
    extraMocks: [
      {
        request: { query: CreateMyahCustomerPortalSessionDocument },
        result: create,
      },
    ],
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Manage billing' }),
  );
  await waitFor(() =>
    expect(mockRedirect).toHaveBeenCalledWith(
      'https://billing.stripe.com/fixture',
    ),
  );
  expect(create).toHaveBeenCalledTimes(1);
});

it('reports Portal errors without redirecting or retrying automatically', async () => {
  mount({
    extraMocks: [
      {
        request: { query: CreateMyahCustomerPortalSessionDocument },
        error: new Error('Unavailable'),
      },
    ],
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Manage billing' }),
  );
  expect(
    await screen.findByText('Could not open billing. Please try again.'),
  ).toBeInTheDocument();
  expect(mockRedirect).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Manage billing' })).toBeEnabled();
});

it('offers a retry when details fail to load', async () => {
  mount({ detailsError: true, extraMocks: [detailsMock()] });
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Early access')).toBeInTheDocument();
});

it('does not offer billing actions to a member without Billing permission', async () => {
  mount({ member: true });
  expect(
    await screen.findByText('Only a workspace admin can manage billing.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Manage billing' }),
  ).not.toBeInTheDocument();
});
