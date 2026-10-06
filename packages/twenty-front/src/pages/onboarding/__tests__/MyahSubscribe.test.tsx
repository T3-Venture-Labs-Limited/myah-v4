import { MockedProvider } from '@apollo/client/testing/react';
import { type MockedResponse } from '@apollo/client/testing';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GraphQLError } from 'graphql';
import { Provider } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import {
  CreateMyahCheckoutSessionDocument,
  CreateMyahCustomerPortalSessionDocument,
  MyahCheckoutPriceDocument,
  MyahWorkspaceUsageDocument,
  PermissionFlagType,
} from '~/generated-metadata/graphql';
import { MyahSubscribe } from '~/pages/onboarding/MyahSubscribe';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';

const mockRedirect = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/domain-manager/hooks/useRedirect', () => ({
  useRedirect: () => ({ redirect: mockRedirect }),
}));
jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/auth/components/Logo', () => ({ Logo: () => <div /> }));
jest.mock(
  '@/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/components/WorkspacesForSignIn',
  () => ({ WorkspacesForSignIn: () => <div>Other workspaces</div> }),
);

const priceMock = (
  amountCents = 9900,
  code: string | null = null,
  earlyAccess = amountCents === 9900,
): MockedResponse => ({
  request: { query: MyahCheckoutPriceDocument, variables: { code } },
  result: {
    data: {
      myahCheckoutPrice: {
        amountCents,
        regularAmountCents: 32900,
        earlyAccess,
      },
    },
  },
});
const checkoutMock = (
  result: MockedResponse['result'],
  code: string | null = null,
  amount = 9900,
): MockedResponse => ({
  request: {
    query: CreateMyahCheckoutSessionDocument,
    variables: { code, expectedAmountCents: amount },
  },
  result,
});
const mount = ({
  member = false,
  state = 'NEEDS_SUBSCRIPTION',
  mocks = [priceMock()],
}: { member?: boolean; state?: string; mocks?: MockedResponse[] } = {}) => {
  jotaiStore.set(currentUserWorkspaceState.atom, {
    permissionFlags: member ? [] : [PermissionFlagType.BILLING],
    objectsPermissions: [],
    twoFactorAuthenticationMethodSummary: [],
  });
  return render(
    <Provider store={jotaiStore}>
      <I18nProvider i18n={i18n}>
        <MockedProvider
          mocks={[
            {
              request: { query: MyahWorkspaceUsageDocument },
              // Checkout refusals also refresh access.
              maxUsageCount: Number.POSITIVE_INFINITY,
              result: {
                data: {
                  myahWorkspaceUsage: {
                    instagramReconnectRequired: false,
                    state,
                    percentUsed: null,
                    periodStart: null,
                    resetAt: null,
                    paymentRetrying: false,
                    exhausted: false,
                  },
                },
              },
            },
            ...mocks,
          ]}
        >
          <MyahSubscribe />
        </MockedProvider>
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

it('quotes $99 to Billing members, submits exactly the displayed price, and keeps workspace switch and sign-out', async () => {
  const create = jest.fn(() => ({
    data: { createMyahCheckoutSession: 'https://checkout.stripe.com/test' },
  }));
  mount({ mocks: [priceMock(), checkoutMock(create)] });
  expect(await screen.findByText('$99')).toBeVisible();
  expect(screen.getByText('$329').tagName).toBe('S');
  expect(screen.getByText('Monthly included AI usage')).toBeVisible();
  expect(
    screen.getByText(
      'Instagram is included separately and does not use your AI allowance.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(await screen.findByText('Other workspaces')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  await waitFor(() =>
    expect(mockRedirect).toHaveBeenCalledWith(
      'https://checkout.stripe.com/test',
    ),
  );
  expect(create).toHaveBeenCalledTimes(1);
});

it.each(['NEEDS_SUBSCRIPTION', 'LAPSED'])(
  'asks a member without Billing permission to contact an admin (%s)',
  async (state) => {
    mount({
      member: true,
      state,
      mocks: [priceMock(state === 'LAPSED' ? 32900 : 9900)],
    });
    expect(await screen.findByText(/Only a workspace admin can/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^(Subscribe|Resubscribe)$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Have a promotion code?' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View past invoices' }),
    ).not.toBeInTheDocument();
  },
);

it('shows only $329 without a strike or early-access badge when the offer is unavailable', async () => {
  mount({ mocks: [priceMock(32900)] });
  expect(await screen.findByText('$329')).toBeVisible();
  expect(screen.getByText('$329').closest('s')).toBeNull();
  expect(screen.queryByText('Early-access price')).not.toBeInTheDocument();
});

it('retains the workspace and offers Resubscribe at full price after lapse', async () => {
  mount({ state: 'LAPSED', mocks: [priceMock(32900)] });
  expect(await screen.findByText('$329')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Your subscription has ended' }),
  ).toBeVisible();
  expect(screen.getByText(/Your subscription has ended/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Resubscribe' })).toBeEnabled();
});

it('opens past invoices through the Billing-only Portal on a lapsed workspace', async () => {
  const portal = jest.fn(() => ({
    data: {
      createMyahCustomerPortalSession: 'https://billing.stripe.com/test',
    },
  }));
  mount({
    state: 'LAPSED',
    mocks: [
      priceMock(32900),
      {
        request: { query: CreateMyahCustomerPortalSessionDocument },
        result: portal,
      },
    ],
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'View past invoices' }),
  );
  await waitFor(() =>
    expect(mockRedirect).toHaveBeenCalledWith(
      'https://billing.stripe.com/test',
    ),
  );
  expect(portal).toHaveBeenCalledTimes(1);
});

it('refuses an invalid code without opening Checkout, then permits a valid zero-dollar promotion', async () => {
  const create = jest.fn(() => ({
    data: { createMyahCheckoutSession: 'https://checkout.stripe.com/test' },
  }));
  mount({
    mocks: [
      priceMock(),
      {
        request: {
          query: MyahCheckoutPriceDocument,
          variables: { code: 'EXPIRED' },
        },
        result: { errors: [new GraphQLError('Invalid promotion code')] },
      },
      priceMock(0, 'TESTER100', false),
      checkoutMock(create, 'TESTER100', 0),
    ],
  });
  await screen.findByText('$99');
  fireEvent.click(
    screen.getByRole('button', { name: 'Have a promotion code?' }),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Promotion code' }), {
    target: { value: 'EXPIRED' },
  });
  expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "This code isn't valid or has expired",
  );
  expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  expect(create).not.toHaveBeenCalled();
  expect(mockRedirect).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Promotion code' }), {
    target: { value: 'TESTER100' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('$0')).toBeVisible();
  expect(screen.queryByText('Early-access price')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
});

it('refreshes a changed price after Checkout refusal without automatically retrying the mutation', async () => {
  const create = jest.fn(() => ({
    errors: [
      new GraphQLError('The price has changed', {
        extensions: { code: 'BAD_USER_INPUT', subCode: 'MYAH_PRICE_CHANGED' },
      }),
    ],
  }));
  mount({ mocks: [priceMock(), checkoutMock(create), priceMock(32900)] });
  await screen.findByText('$99');
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The price has changed. Please review the updated price and try again.',
  );
  await waitFor(() =>
    expect(screen.queryByText('$99')).not.toBeInTheDocument(),
  );
  expect(screen.getByText('$329')).toBeVisible();
  expect(create).toHaveBeenCalledTimes(1);
  expect(mockRedirect).not.toHaveBeenCalled();
});

it('does not blame the price when Checkout fails for another reason', async () => {
  const create = jest.fn(() => ({
    errors: [new GraphQLError('Stripe is unavailable')],
  }));
  mount({ mocks: [priceMock(), checkoutMock(create), priceMock()] });
  await screen.findByText('$99');
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Checkout could not open. Please try again.');
  expect(alert).not.toHaveTextContent('price');
  expect(create).toHaveBeenCalledTimes(1);
  expect(mockRedirect).not.toHaveBeenCalled();
});
