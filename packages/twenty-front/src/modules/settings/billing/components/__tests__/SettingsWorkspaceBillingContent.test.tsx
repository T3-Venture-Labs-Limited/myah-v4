import {
  SettingsWorkspaceBillingContent,
  type WorkspaceManagedEmailSubscriptionsViewModel,
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

const managedEmailSubscriptions: WorkspaceManagedEmailSubscriptionsViewModel = {
  state: 'ready',
  subscriptions: [
    {
      action: 'CANCEL_RENEWAL',
      billingInterval: 'ANNUAL',
      currency: 'USD',
      paidThrough: '2027-08-06T12:00:00.000Z',
      productKey: 'managed_sending_domain_year',
      quantity: 1,
      recurringAmountCents: 1_500,
      resourceIds: ['domain-1'],
      resourceLabels: ['creator-partners.test'],
      resourceType: 'DOMAIN',
      service: 'MANAGED_EMAIL',
      status: 'ACTIVE',
      unitPriceCents: 1_500,
    },
    {
      action: 'STOP_SERVICE',
      billingInterval: 'MONTHLY',
      currency: 'USD',
      paidThrough: '2026-09-06T12:00:00.000Z',
      productKey: 'managed_mailbox_month',
      quantity: 2,
      recurringAmountCents: 1_300,
      resourceIds: ['mailbox-1', 'mailbox-2'],
      resourceLabels: [
        'maya@creator-partners.test',
        'lin@creator-partners.test',
      ],
      resourceType: 'MAILBOX',
      service: 'MANAGED_EMAIL',
      status: 'ACTIVE',
      unitPriceCents: 650,
    },
    {
      action: null,
      billingInterval: 'MONTHLY',
      currency: 'USD',
      paidThrough: '2026-09-06T12:00:00.000Z',
      productKey: 'managed_warmup_month',
      quantity: 2,
      recurringAmountCents: 2_000,
      resourceIds: ['mailbox-1', 'mailbox-2'],
      resourceLabels: [
        'maya@creator-partners.test',
        'lin@creator-partners.test',
      ],
      resourceType: 'MAILBOX',
      service: 'MANAGED_EMAIL',
      status: 'CANCELS_AT_PERIOD_END',
      unitPriceCents: 1_000,
    },
  ],
};

const renderContent = (onManageManagedEmail = jest.fn()) => {
  render(
    <JotaiProvider>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <SettingsWorkspaceBillingContent
            viewModel={{ state: 'unavailable', reason: 'notConnected' }}
            managedEmailSubscriptions={managedEmailSubscriptions}
            onManageManagedEmail={onManageManagedEmail}
          />
        </ThemeProvider>
      </I18nProvider>
    </JotaiProvider>,
  );

  return { onManageManagedEmail };
};

describe('SettingsWorkspaceBillingContent managed email subscriptions', () => {
  it('renders recurring managed email separately when AI billing is unavailable', () => {
    renderContent();

    expect(
      screen.getByRole('heading', { name: 'Managed email subscriptions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Managed email subscriptions renew separately and do not use your AI balance.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Sending domain')).toBeInTheDocument();
    expect(screen.getByText('Mailbox')).toBeInTheDocument();
    expect(screen.getByText('Warmup')).toBeInTheDocument();
    const subscriptionRows = within(
      screen.getByRole('table', { name: 'Managed email subscriptions' }),
    ).getAllByRole('row');
    expect(within(subscriptionRows[1]).getAllByText('$15.00')).toHaveLength(2);
    expect(within(subscriptionRows[2]).getByText('$6.50')).toBeInTheDocument();
    expect(within(subscriptionRows[2]).getByText('$13.00')).toBeInTheDocument();
    expect(within(subscriptionRows[3]).getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('Cancels at period end')).toBeInTheDocument();
    expect(
      screen.getByText(
        'AI usage and balance are tracked separately from managed email.',
      ),
    ).toBeInTheDocument();
  });

  it('routes subscription actions to the existing managed email controls', () => {
    const { onManageManagedEmail } = renderContent();

    fireEvent.click(screen.getAllByRole('button', { name: 'Manage' })[0]);

    expect(onManageManagedEmail).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsWorkspaceBillingContent fixed AI top-ups', () => {
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
        expiryMonth: 12,
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
    state: 'ready' as const,
  };

  const renderFunding = ({
    onCompletePayment = jest.fn(),
    onManagePaymentDetails = jest.fn(),
    onRequestTopUp = jest.fn(),
  } = {}) => {
    render(
      <JotaiProvider>
        <I18nProvider i18n={i18n}>
          <ThemeProvider colorScheme="light">
            <SettingsWorkspaceBillingContent
              managedEmailSubscriptions={{ state: 'ready', subscriptions: [] }}
              onCompletePayment={onCompletePayment}
              onManagePaymentDetails={onManagePaymentDetails}
              onRequestTopUp={onRequestTopUp}
              viewModel={readyViewModel as never}
            />
          </ThemeProvider>
        </I18nProvider>
      </JotaiProvider>,
    );

    return {
      onCompletePayment,
      onManagePaymentDetails,
      onRequestTopUp,
    };
  };

  it('offers only fixed presets with tax and expiration disclosure', () => {
    renderFunding();

    expect(screen.getByRole('button', { name: '$25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$50' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$100' })).toBeInTheDocument();
    expect(screen.getByText(/plus applicable tax/i)).toBeInTheDocument();
    expect(screen.getByText(/expires 12 months/i)).toBeInTheDocument();
    expect(screen.queryByText(/automatic top-up/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/online top-ups coming soon/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('uses one selected preset and one primary top-up action', () => {
    const { onRequestTopUp } = renderFunding();

    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    expect(screen.getByRole('button', { name: '$50' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add $50 credit' }));

    expect(onRequestTopUp).toHaveBeenCalledWith('AI_50_USD');
  });

  it('shows only safe payment details and routes payment actions', () => {
    const { onCompletePayment, onManagePaymentDetails } = renderFunding();

    expect(screen.getByText(/visa •••• 4242/i)).toBeInTheDocument();
    expect(screen.getByText('Myah Test LLC')).toBeInTheDocument();
    expect(screen.getByText(/123 Market Street/i)).toBeInTheDocument();
    expect(screen.queryByText('12-3456789')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Update payment details' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete payment' }));

    expect(onManagePaymentDetails).toHaveBeenCalledTimes(1);
    expect(onCompletePayment).toHaveBeenCalledWith('funding-action-id');
  });
});
