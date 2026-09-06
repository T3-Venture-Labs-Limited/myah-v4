import {
  ManagedProviderCustomerFundingPaymentActionForm,
  ManagedProviderCustomerFundingPaymentForm,
} from '@/settings/billing/components/ManagedProviderCustomerFundingStripeForms';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { messages } from '~/locales/generated/en';

const mockUseStripePromise = jest.fn();

jest.mock('@/settings/billing/hooks/useStripePromise', () => ({
  useStripePromise: (publishableKey?: string | null) =>
    mockUseStripePromise(publishableKey),
}));

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const billingSummary = {
  address: {
    city: 'San Francisco',
    country: 'US',
    line1: '123 Market Street',
    line2: null,
    postalCode: '94105',
    state: 'CA',
  },
  card: null,
  name: 'Myah Test LLC',
  paymentMethodReady: false,
  taxId: null,
};

beforeEach(() => {
  mockUseStripePromise.mockReset();
  mockUseStripePromise.mockReturnValue(null);
});

const renderPaymentForm = () => {
  const onComplete = jest.fn().mockResolvedValue(undefined);

  render(
    <JotaiProvider>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <ManagedProviderCustomerFundingPaymentForm
            billingSummary={billingSummary}
            clientSecret={null}
            publishableKey="pk_test_managed"
            onCancel={jest.fn()}
            onComplete={onComplete}
            setupIntentId={null}
          />
        </ThemeProvider>
      </I18nProvider>
    </JotaiProvider>,
  );

  return { onComplete };
};

describe('ManagedProviderCustomerFunding Stripe client', () => {
  it('uses the managed publishable key for payment-method setup', () => {
    renderPaymentForm();

    expect(mockUseStripePromise).toHaveBeenCalledWith('pk_test_managed');
  });

  it('uses the managed publishable key for payment authentication', () => {
    render(
      <JotaiProvider>
        <I18nProvider i18n={i18n}>
          <ThemeProvider colorScheme="light">
            <ManagedProviderCustomerFundingPaymentActionForm
              clientSecret="pi_client_secret"
              onCancel={jest.fn()}
              onConfirmed={jest.fn().mockResolvedValue(undefined)}
              publishableKey="pk_test_managed"
            />
          </ThemeProvider>
        </I18nProvider>
      </JotaiProvider>,
    );

    expect(mockUseStripePromise).toHaveBeenCalledWith('pk_test_managed');
  });
});

describe('ManagedProviderCustomerFundingPaymentForm tax IDs', () => {
  it('normalizes and trims tax ID fields before submitting billing details', async () => {
    const { onComplete } = renderPaymentForm();

    fireEvent.change(screen.getByLabelText('Tax ID type (optional)'), {
      target: { value: '  US_EIN  ' },
    });
    fireEvent.change(screen.getByLabelText('Tax ID value (optional)'), {
      target: { value: '  12-3456789  ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save billing details' }),
    );

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          taxIdType: 'us_ein',
          taxIdValue: '12-3456789',
        }),
      ),
    );
  });

  it('selects a billing country by name and submits its ISO code', async () => {
    const { onComplete } = renderPaymentForm();

    fireEvent.click(screen.getByText('United States'));
    fireEvent.click(await screen.findByText('Netherlands'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save billing details' }),
    );

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ country: 'NL' }),
      ),
    );
    expect(screen.queryByLabelText('Country code')).not.toBeInTheDocument();
  });

  it('rejects whitespace-only tax ID fields paired with a value', () => {
    renderPaymentForm();

    fireEvent.change(screen.getByLabelText('Tax ID type (optional)'), {
      target: { value: '   ' },
    });
    fireEvent.change(screen.getByLabelText('Tax ID value (optional)'), {
      target: { value: '12-3456789' },
    });

    expect(
      screen.getByRole('button', { name: 'Save billing details' }),
    ).toBeDisabled();
  });
});
