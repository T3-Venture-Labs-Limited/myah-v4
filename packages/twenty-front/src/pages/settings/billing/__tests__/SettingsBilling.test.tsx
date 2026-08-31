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

const fundingStatus = {
  managedProviderBillingStatus: {
    available: true,
    prepaidBalanceCents: '10000',
    pendingOperationCount: 0,
    reconciliationRequiredOperationCount: 0,
    customerFundingAvailable: true,
    customerFundingPaymentMethodReady: true,
    customerFundingPresets: [
      { id: 'AI_25_USD', principalCents: '2500' },
      { id: 'AI_50_USD', principalCents: '5000' },
      { id: 'AI_100_USD', principalCents: '10000' },
    ],
    customerFundingBillingSummary: null,
    customerFundingHistory: [],
  },
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

  it('reuses the workspace-scoped idempotency key after a response-loss reload', async () => {
    mockRequestFunding.mockRejectedValueOnce(new Error('response lost'));

    const firstPage = render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <MemoryRouter>
            <SettingsBilling />
          </MemoryRouter>
        </ThemeProvider>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Add $25 credit' }));

    await waitFor(() => expect(mockRequestFunding).toHaveBeenCalledTimes(1));
    const firstKey = mockRequestFunding.mock.calls[0][0].variables
      .idempotencyKey as string;

    expect(
      localStorage.getItem('managed-provider-customer-funding:workspace-1'),
    ).toBe(JSON.stringify({ idempotencyKey: firstKey, presetCode: 'AI_25_USD' }));

    firstPage.unmount();
    mockRequestFunding.mockResolvedValueOnce({
      data: { requestManagedProviderCustomerFunding: { id: 'action-1' } },
    });

    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <MemoryRouter>
            <SettingsBilling />
          </MemoryRouter>
        </ThemeProvider>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Retry $25 credit' }));

    await waitFor(() => expect(mockRequestFunding).toHaveBeenCalledTimes(2));
    expect(mockRequestFunding.mock.calls[1][0].variables).toMatchObject({
      idempotencyKey: firstKey,
      preset: 'AI_25_USD',
    });
  });
});
