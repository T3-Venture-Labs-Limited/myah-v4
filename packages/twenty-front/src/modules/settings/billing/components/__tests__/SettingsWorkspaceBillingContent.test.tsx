import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingViewModel,
} from '@/settings/billing/components/SettingsWorkspaceBillingContent';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { messages } from '~/locales/generated/en';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const readyViewModel = {
  availableBalanceCents: 10_000,
  customerFundingAvailable: true,
  customerFundingBillingSummary: {
    address: {
      city: 'San Francisco',
      country: 'US',
      line1: '123 Market Street',
      line2: null,
      postalCode: '94105',
      state: 'CA',
    },
    card: {
      brand: 'visa',
      expiryMonth: 2,
      expiryYear: 2030,
      last4: '4242',
    },
    name: 'Myah Test LLC',
    paymentMethodReady: true,
    taxId: { country: 'US', type: 'us_ein' },
  },
  customerFundingPaymentMethodReady: true,
  customerFundingPresets: [
    { id: 'AI_25_USD', principalCents: 2_500 },
    { id: 'AI_50_USD', principalCents: 5_000 },
    { id: 'AI_100_USD', principalCents: 10_000 },
  ],
  fundingHistory: [
    {
      actionRequired: true,
      collectedTotalCents: 5_500,
      createdAt: '2026-08-29T10:00:00.000Z',
      expiresAt: null,
      fundingType: 'PURCHASED',
      id: 'funding-action-id',
      invoiceUrl: 'https://invoice.example/in_1',
      presetId: 'AI_50_USD',
      principalCents: 5_000,
      state: 'AWAITING_PAYMENT',
      taxCents: 500,
      updatedAt: '2026-08-29T10:40:00.000Z',
    },
  ],
  isSubmitting: false,
  pendingOperationCount: 1,
  reconciliationRequiredOperationCount: 0,
  state: 'ready',
} satisfies WorkspaceBillingViewModel;

const renderFunding = (
  viewModel: WorkspaceBillingViewModel = readyViewModel,
  onManagePaymentDetails = jest.fn(),
) => {
  const onRequestTopUp = jest.fn();

  render(
    <JotaiProvider>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <SettingsWorkspaceBillingContent
            managedEmailSubscriptions={{ state: 'ready', subscriptions: [] }}
            onManagePaymentDetails={onManagePaymentDetails}
            onRequestTopUp={onRequestTopUp}
            viewModel={viewModel}
          />
        </ThemeProvider>
      </I18nProvider>
    </JotaiProvider>,
  );

  return { onManagePaymentDetails, onRequestTopUp };
};

describe('SettingsWorkspaceBillingContent customer funding', () => {
  it('renders the charged total separately from principal and tax, and formats card expiry as MM/YY', () => {
    renderFunding();

    expect(screen.getByText(/visa •••• 4242.*02\/30/i)).toBeInTheDocument();
    const historyRow = within(
      screen.getByRole('table', { name: 'AI funding history' }),
    ).getAllByRole('row')[1];

    expect(
      within(historyRow).getByText('Principal: $50.00'),
    ).toBeInTheDocument();
    expect(within(historyRow).getByText('Tax: $5.00')).toBeInTheDocument();
    expect(
      within(historyRow).getByText('Total collected: $55.00'),
    ).toBeInTheDocument();
  });

  it('uses fixed presets and requests the selected amount', () => {
    const { onRequestTopUp } = renderFunding();

    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add $50 credit' }));

    expect(onRequestTopUp).toHaveBeenCalledWith('AI_50_USD');
  });

  it('hides payment-detail management when customer funding is unavailable and explains why', () => {
    const unavailableFundingViewModel = {
      ...readyViewModel,
      customerFundingAvailable: false,
    } satisfies WorkspaceBillingViewModel;
    const onManagePaymentDetails = jest.fn();

    renderFunding(unavailableFundingViewModel, onManagePaymentDetails);

    expect(
      screen.getByText(
        'Payment details are unavailable because AI funding is not enabled for this workspace.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Update payment details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add $25 credit' }),
    ).toBeDisabled();
  });
});
