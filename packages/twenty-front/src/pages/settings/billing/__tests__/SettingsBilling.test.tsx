import {
  GET_MANAGED_EMAIL_SUBSCRIPTIONS,
  GET_MANAGED_PROVIDER_BILLING_STATUS,
} from '@/settings/billing/graphql/managedProviderCustomerFunding';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { messages } from '~/locales/generated/en';
import { SettingsBilling } from '~/pages/settings/billing/SettingsBilling';

const mockRequestFunding = jest.fn();
const mockUseMutation = jest.fn();
const mockUseQuery = jest.fn();

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
    mockUseQuery.mockImplementation((query) =>
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
