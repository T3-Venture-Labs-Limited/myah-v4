import {
  GET_MANAGED_EMAIL_SUBSCRIPTIONS,
  GET_MANAGED_PROVIDER_BILLING_STATUS,
  GET_MANAGED_PROVIDER_CUSTOMER_FUNDING_ACTION,
} from '@/settings/billing/graphql/managedProviderCustomerFunding';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { messages } from '~/locales/generated/en';
import { SettingsBilling } from '~/pages/settings/billing/SettingsBilling';

const mockRequestFunding = jest.fn();
const mockUseMutation = jest.fn();
const mockUseQuery = jest.fn();
let customerFundingActionError: Error | undefined;
let customerFundingActionState: string | undefined;
let customerFundingActionDetails: Record<string, unknown> | undefined;

jest.mock('@apollo/client/react', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => jest.fn(),
}));

jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: 'workspace-1' }),
}));

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const pendingFundingStorageKey =
  'managed-provider-customer-funding:workspace-1';
const fundingStatus = {
  managedProviderBillingStatus: {
    available: true,
    prepaidBalanceCents: '10000',
    pendingOperationCount: 0,
    reconciliationRequiredOperationCount: 0,
    customerFundingAvailable: true,
    customerFundingPaymentMethodReady: true,
    customerFundingPolicy: {
      incrementCents: 100,
      maximumPrincipalCents: 50_000,
      minimumPrincipalCents: 500,
      suggestedPrincipalCents: [2_500, 5_000, 10_000],
    },
    customerFundingBillingSummary: null,
    customerFundingHistory: [],
  },
};

const renderBilling = () =>
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <MemoryRouter>
          <SettingsBilling />
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>,
  );

const enterCustomAmount = async (amount: string) => {
  fireEvent.change(await screen.findByLabelText('Custom amount'), {
    target: { value: amount },
  });
};

const readPendingFundingRequest = () => {
  const serialized = localStorage.getItem(pendingFundingStorageKey);

  return serialized === null ? null : JSON.parse(serialized);
};

describe('SettingsBilling customer funding idempotency', () => {
  beforeEach(() => {
    localStorage.clear();
    mockRequestFunding.mockReset();
    mockUseMutation.mockReset();
    mockUseMutation.mockReturnValue([mockRequestFunding]);
    mockUseQuery.mockReset();
    customerFundingActionError = undefined;
    customerFundingActionState = 'AWAITING_PAYMENT';
    customerFundingActionDetails = undefined;
    mockUseQuery.mockImplementation((query, options) =>
      query === GET_MANAGED_EMAIL_SUBSCRIPTIONS
        ? {
            data: { managedEmailSubscriptions: [] },
            error: undefined,
            loading: false,
          }
        : query === GET_MANAGED_PROVIDER_BILLING_STATUS
          ? {
              data: fundingStatus,
              error: undefined,
              loading: false,
              refetch: jest.fn().mockResolvedValue(undefined),
            }
          : query === GET_MANAGED_PROVIDER_CUSTOMER_FUNDING_ACTION
            ? {
                data:
                  customerFundingActionState === undefined
                    ? undefined
                    : {
                        managedProviderCustomerFundingAction: {
                          actionRequired: false,
                          collectedTotalCents: null,
                          createdAt: '2026-08-29T10:00:00.000Z',
                          expiresAt: null,
                          fundingType: 'PURCHASED',
                          id:
                            (
                              options as
                                | { variables?: { actionId?: string } }
                                | undefined
                            )?.variables?.actionId ?? 'action-1',
                          invoiceUrl: null,
                          principalCents: '2500',
                          state: customerFundingActionState,
                          taxCents: null,
                          updatedAt: '2026-08-29T10:00:00.000Z',
                          ...customerFundingActionDetails,
                        },
                      },
                error: customerFundingActionError,
                loading: false,
              }
            : undefined,
    );
  });

  it('requests custom funding in cents and persists amount-only pending state', async () => {
    mockRequestFunding.mockResolvedValueOnce({
      data: { requestManagedProviderCustomerFunding: { id: 'action-1' } },
    });

    renderBilling();
    await enterCustomAmount('5');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add $5 credit' }),
    );

    await waitFor(() => expect(mockRequestFunding).toHaveBeenCalledTimes(1));
    const variables = mockRequestFunding.mock.calls[0][0].variables;
    const idempotencyKey = variables.idempotencyKey as string;

    expect(variables).toEqual({
      idempotencyKey: expect.any(String),
      principalCents: 500,
    });
    await waitFor(() =>
      expect(readPendingFundingRequest()).toEqual({
        actionId: 'action-1',
        idempotencyKey,
        principalCents: 500,
      }),
    );
    expect(readPendingFundingRequest()).not.toHaveProperty('presetCode');
  });

  it('reuses the workspace-scoped cents and idempotency key after a response-loss reload', async () => {
    mockRequestFunding.mockRejectedValueOnce(new Error('response lost'));

    const firstPage = renderBilling();
    await enterCustomAmount('37');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add $37 credit' }),
    );

    await waitFor(() => expect(mockRequestFunding).toHaveBeenCalledTimes(1));
    const firstKey = mockRequestFunding.mock.calls[0][0].variables
      .idempotencyKey as string;

    await waitFor(() =>
      expect(readPendingFundingRequest()).toEqual({
        actionId: null,
        idempotencyKey: firstKey,
        principalCents: 3_700,
      }),
    );

    firstPage.unmount();
    mockRequestFunding.mockResolvedValueOnce({
      data: { requestManagedProviderCustomerFunding: { id: 'action-1' } },
    });

    renderBilling();

    expect(await screen.findByLabelText('Custom amount')).toHaveValue('37');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry $37 credit' }),
    );

    await waitFor(() => expect(mockRequestFunding).toHaveBeenCalledTimes(2));
    expect(mockRequestFunding.mock.calls[1][0].variables).toEqual({
      idempotencyKey: firstKey,
      principalCents: 3_700,
    });
  });

  it('privately migrates a known legacy preset while recovering its pending request', async () => {
    localStorage.setItem(
      pendingFundingStorageKey,
      JSON.stringify({
        idempotencyKey: 'legacy-idempotency-key',
        presetCode: 'AI_25_USD',
      }),
    );
    mockRequestFunding.mockResolvedValueOnce({
      data: {
        requestManagedProviderCustomerFunding: { id: 'legacy-action-id' },
      },
    });

    renderBilling();

    expect(await screen.findByLabelText('Custom amount')).toHaveValue('25');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry $25 credit' }),
    );

    await waitFor(() => expect(mockRequestFunding).toHaveBeenCalledTimes(1));
    expect(mockRequestFunding.mock.calls[0][0].variables).toEqual({
      idempotencyKey: 'legacy-idempotency-key',
      principalCents: 2_500,
    });
    await waitFor(() =>
      expect(readPendingFundingRequest()).toEqual({
        actionId: 'legacy-action-id',
        idempotencyKey: 'legacy-idempotency-key',
        principalCents: 2_500,
      }),
    );
  });

  it('discards unknown legacy presets instead of submitting them', async () => {
    localStorage.setItem(
      pendingFundingStorageKey,
      JSON.stringify({
        idempotencyKey: 'unknown-idempotency-key',
        presetCode: 'AI_UNKNOWN_USD',
      }),
    );

    renderBilling();

    await waitFor(() =>
      expect(localStorage.getItem(pendingFundingStorageKey)).toBeNull(),
    );
    expect(mockRequestFunding).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Add $25 credit' }),
    ).toBeEnabled();
  });

  it('clears a terminal restored action when capped history omits it', async () => {
    localStorage.setItem(
      pendingFundingStorageKey,
      JSON.stringify({
        actionId: 'capped-action-id',
        idempotencyKey: 'capped-idempotency-key',
        principalCents: 2_500,
      }),
    );
    customerFundingActionState = 'BALANCE_ACTIVE';

    renderBilling();

    await waitFor(() =>
      expect(mockUseQuery).toHaveBeenCalledWith(
        GET_MANAGED_PROVIDER_CUSTOMER_FUNDING_ACTION,
        expect.objectContaining({
          variables: { actionId: 'capped-action-id' },
        }),
      ),
    );
    await waitFor(() =>
      expect(localStorage.getItem(pendingFundingStorageKey)).toBeNull(),
    );
    expect(mockRequestFunding).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Add $25 credit' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Retry/ }),
    ).not.toBeInTheDocument();
  });

  it('shows a capped action-required funding action in history', async () => {
    localStorage.setItem(
      pendingFundingStorageKey,
      JSON.stringify({
        actionId: 'capped-action-id',
        idempotencyKey: 'capped-idempotency-key',
        principalCents: 2_500,
      }),
    );
    customerFundingActionDetails = {
      actionRequired: true,
      collectedTotalCents: '2500',
      createdAt: '2026-08-29T10:00:00.000Z',
      expiresAt: null,
      fundingType: 'PURCHASED',
      id: 'capped-action-id',
      invoiceUrl: null,
      principalCents: '2500',
      state: 'AWAITING_PAYMENT',
      taxCents: null,
      updatedAt: '2026-08-29T10:00:00.000Z',
    };

    renderBilling();

    const historyTable = await screen.findByRole('table', {
      name: 'AI funding history',
    });
    const historyRow = within(historyTable).getAllByRole('row')[1];
    expect(
      within(historyRow).getByText('Awaiting payment'),
    ).toBeInTheDocument();
    expect(
      within(historyRow).getByText('Principal: $25.00'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(historyRow).getByRole('button', { name: 'Complete payment' }),
    );

    await waitFor(() =>
      expect(mockRequestFunding).toHaveBeenCalledWith({
        variables: { actionId: 'capped-action-id' },
      }),
    );
  });

  it.each([
    { error: new Error('action lookup failed'), label: 'errors' },
    { error: undefined, label: 'returns no action' },
  ])(
    'makes the restored amount retryable when the capped action query $label',
    async ({ error }) => {
      localStorage.setItem(
        pendingFundingStorageKey,
        JSON.stringify({
          actionId: 'capped-action-id',
          idempotencyKey: 'capped-idempotency-key',
          principalCents: 3_700,
        }),
      );
      customerFundingActionError = error;
      customerFundingActionState = undefined;
      mockRequestFunding.mockResolvedValueOnce({
        data: { requestManagedProviderCustomerFunding: { id: 'retried-id' } },
      });

      renderBilling();

      await waitFor(() =>
        expect(readPendingFundingRequest()).toEqual({
          actionId: null,
          idempotencyKey: 'capped-idempotency-key',
          principalCents: 3_700,
        }),
      );
      expect(await screen.findByLabelText('Custom amount')).toHaveValue('37');
      const retryButton = await screen.findByRole('button', {
        name: 'Retry $37 credit',
      });
      expect(retryButton).toBeEnabled();
      fireEvent.click(retryButton);

      await waitFor(() =>
        expect(mockRequestFunding).toHaveBeenCalledWith({
          variables: {
            idempotencyKey: 'capped-idempotency-key',
            principalCents: 3_700,
          },
        }),
      );
    },
  );

  it.each([1, 501, 50_001])(
    'discards a pending principal amount outside the current policy (%i cents)',
    async (principalCents) => {
      localStorage.setItem(
        pendingFundingStorageKey,
        JSON.stringify({
          actionId: null,
          idempotencyKey: `invalid-principal-${principalCents}`,
          principalCents,
        }),
      );

      renderBilling();

      await waitFor(() =>
        expect(localStorage.getItem(pendingFundingStorageKey)).toBeNull(),
      );
      expect(mockRequestFunding).not.toHaveBeenCalled();
      expect(
        await screen.findByRole('button', { name: 'Add $25 credit' }),
      ).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: /Retry/ }),
      ).not.toBeInTheDocument();
    },
  );
});
