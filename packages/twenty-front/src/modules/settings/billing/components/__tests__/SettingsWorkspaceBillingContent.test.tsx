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
