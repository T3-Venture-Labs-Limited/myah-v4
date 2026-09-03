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
  customerFundingPolicy: {
    incrementCents: 100,
    maximumPrincipalCents: 50_000,
    minimumPrincipalCents: 500,
    suggestedPrincipalCents: [2_500, 5_000, 10_000],
  },
  fundingHistory: [
    {
      actionRequired: true,
      collectedTotalCents: 5_500,
      createdAt: '2026-08-29T10:00:00.000Z',
      expiresAt: null,
      fundingType: 'PURCHASED',
      id: 'funding-action-id',
      invoiceUrl: 'https://invoice.example/in_1',
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
  const onRequestFunding = jest.fn();

  render(
    <JotaiProvider>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <SettingsWorkspaceBillingContent
            managedEmailSubscriptions={{ state: 'ready', subscriptions: [] }}
            onManagePaymentDetails={onManagePaymentDetails}
            onRequestFunding={onRequestFunding}
            viewModel={viewModel}
          />
        </ThemeProvider>
      </I18nProvider>
    </JotaiProvider>,
  );

  return { onManagePaymentDetails, onRequestFunding };
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

  it('renders policy suggestions and sends each amount through one funding callback', () => {
    const { onRequestFunding } = renderFunding();

    for (const [label, principalCents] of [
      ['$25', 2_500],
      ['$50', 5_000],
      ['$100', 10_000],
    ] as const) {
      expect(screen.getByRole('button', { name: label })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: label }));
      fireEvent.click(
        screen.getByRole('button', { name: `Add ${label} credit` }),
      );
    }

    expect(onRequestFunding).toHaveBeenNthCalledWith(1, 2_500);
    expect(onRequestFunding).toHaveBeenNthCalledWith(2, 5_000);
    expect(onRequestFunding).toHaveBeenNthCalledWith(3, 10_000);
  });

  it('submits valid custom whole-dollar amounts as cents', () => {
    const { onRequestFunding } = renderFunding();
    const customAmountInput = screen.getByRole('textbox', {
      name: 'Custom amount',
    });

    for (const [dollars, principalCents] of [
      ['5', 500],
      ['37', 3_700],
      ['500', 50_000],
    ]) {
      fireEvent.change(customAmountInput, { target: { value: dollars } });
      fireEvent.click(
        screen.getByRole('button', { name: `Add $${dollars} credit` }),
      );
      expect(onRequestFunding).toHaveBeenLastCalledWith(principalCents);
    }
  });

  it.each(['', '5.5', '1e2', '+5', '4', '501'])(
    'rejects invalid custom dollar amount %p',
    (invalidAmount) => {
      const { onRequestFunding } = renderFunding();
      const customAmountInput = screen.getByRole('textbox', {
        name: 'Custom amount',
      });

      if (invalidAmount === '') {
        fireEvent.change(customAmountInput, { target: { value: '5' } });
      }
      fireEvent.change(customAmountInput, {
        target: { value: invalidAmount },
      });

      expect(customAmountInput).toHaveAttribute('aria-invalid', 'true');
      expect(
        screen.getByText(
          'Enter a whole-dollar amount from $5 to $500.',
        ),
      ).toBeInTheDocument();
      const chargeButton = screen.getByRole('button', {
        name: 'Add AI credit',
      });
      expect(chargeButton).toBeDisabled();
      fireEvent.click(chargeButton);
      expect(onRequestFunding).not.toHaveBeenCalled();
    },
  );

  it('locks a retry to its pending amount despite subsequent input changes', () => {
    const { onRequestFunding } = renderFunding({
      ...readyViewModel,
      retryPrincipalCents: 3_700,
    } satisfies WorkspaceBillingViewModel);
    const customAmountInput = screen.getByRole('textbox', {
      name: 'Custom amount',
    });

    expect(customAmountInput).toHaveValue('37');
    expect(customAmountInput).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: '$25' })).toBeDisabled();
    fireEvent.change(customAmountInput, { target: { value: '5' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry $37 credit' }),
    );

    expect(onRequestFunding).toHaveBeenCalledWith(3_700);
  });

  it('shows immediate-charge disclosures before the funding action', () => {
    renderFunding();

    const disclosure = screen.getByText(
      'Your saved payment method will be charged immediately. Applicable tax may be added. Purchased credit expires 12 months after payment. Purchases are non-refundable except where law requires.',
    );
    const chargeButton = screen.getByRole('button', {
      name: 'Add $25 credit',
    });

    expect(disclosure).toBeVisible();
    expect(
      disclosure.compareDocumentPosition(chargeButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
