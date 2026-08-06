import { ManagedEmailAcquisitionChooser } from '@/settings/workspace/components/managed-email/ManagedEmailAcquisitionChooser';
import { ManagedEmailCreateFlow } from '@/settings/workspace/components/managed-email/ManagedEmailCreateFlow';
import { ManagedEmailPrewarmedFlow } from '@/settings/workspace/components/managed-email/ManagedEmailPrewarmedFlow';
import { ManagedEmailProgress } from '@/settings/workspace/components/managed-email/ManagedEmailProgress';
import { ManagedEmailReview } from '@/settings/workspace/components/managed-email/ManagedEmailReview';
import { ManagedMailboxTable } from '@/settings/workspace/components/managed-email/ManagedMailboxTable';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';
import {
  type ManagedEmailBundle,
  type ManagedEmailOperation,
  type ManagedEmailProposal,
  type ManagedEmailQuote,
} from '~/generated-metadata/graphql';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const renderWithI18n = (children: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{children}</I18nProvider>);

const bundle: ManagedEmailBundle = {
  bundleId: 'bundle-1',
  domain: 'creator-network.com',
  exclusiveWorkspaceUse: true,
  mailboxCount: 2,
  mailboxes: [
    { address: 'maya@creator-network.com', displayName: 'Maya Chen' },
    { address: 'alex@creator-network.com', displayName: 'Alex Smith' },
  ],
  observedAt: '2026-08-06T12:00:00.000Z',
  providerType: 'must-not-render',
};

const proposal: ManagedEmailProposal = {
  disclosures: {
    cancellation: 'Cancel renewal now; service continues through paid-through.',
    managedServiceOwnership:
      'Myah manages the domains and mailboxes as a service.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
  domains: [
    {
      domain: 'creator-network.com',
      mailboxes: [
        {
          address: 'maya@creator-network.com',
          displayName: 'Maya Chen',
          roleTitle: 'Partnerships',
        },
      ],
    },
  ],
  expiresAt: '2026-08-06T13:00:00.000Z',
  id: 'proposal-1',
  mailboxCount: 1,
  policyVersion: 'policy-1',
};

const quote: ManagedEmailQuote = {
  currency: 'USD',
  disclosures: proposal.disclosures,
  dueTodayCents: 12345,
  expiresAt: '2026-08-06T13:00:00.000Z',
  id: 'quote-1',
  lines: [
    {
      amountCents: 10000,
      billingFrequency: 'ANNUAL',
      endingBefore: '2027-08-06T12:00:00.000Z',
      productKey: 'managed_sending_domain_year',
      quantity: 1,
      startingAt: '2026-08-06T12:00:00.000Z',
      unitPriceCents: 10000,
    },
    {
      amountCents: 2345,
      billingFrequency: 'MONTHLY',
      endingBefore: '2026-09-06T12:00:00.000Z',
      productKey: 'managed_mailbox_month',
      quantity: 1,
      startingAt: '2026-08-06T12:00:00.000Z',
      unitPriceCents: 2345,
    },
  ],
  quoteFingerprint: 'fingerprint-1',
  quoteVersion: 'quote-v1',
};

const operation = (
  paymentStatus: string,
  state = paymentStatus === 'PAID' ? 'PROVISIONING' : 'PAYMENT_PENDING',
): ManagedEmailOperation => ({
  acquisitionMode: 'NEW_MANAGED',
  amountCents: '12345',
  createdAt: '2026-08-06T12:00:00.000Z',
  currency: 'USD',
  id: 'operation-1',
  paymentStatus,
  safeFailureCode: paymentStatus === 'PAYMENT_FAILED' ? 'PAYMENT_FAILED' : null,
  state,
  updatedAt: '2026-08-06T12:05:00.000Z',
});

describe('managed email acquisition flow components', () => {
  it('offers three paths while keeping purchase paths unavailable to ordinary members', async () => {
    const user = userEvent.setup();
    const onPrewarmed = jest.fn();
    const onCreate = jest.fn();
    const onConnect = jest.fn();

    const { rerender } = renderWithI18n(
      <ManagedEmailAcquisitionChooser
        acquisitionAvailable
        canPurchase
        onChoosePrewarmed={onPrewarmed}
        onCreateManaged={onCreate}
        onConnectExisting={onConnect}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /^Get prewarmed mailboxes/ }),
    );
    await user.click(
      screen.getByRole('button', {
        name: /^Create and warm new mailboxes/,
      }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Connect existing mailboxes/ }),
    );

    expect(onPrewarmed).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider i18n={i18n}>
        <ManagedEmailAcquisitionChooser
          acquisitionAvailable
          canPurchase={false}
          onChoosePrewarmed={onPrewarmed}
          onCreateManaged={onCreate}
          onConnectExisting={onConnect}
        />
      </I18nProvider>,
    );

    expect(
      screen.queryByRole('button', { name: /^Get prewarmed mailboxes/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /^Create and warm new mailboxes/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'A workspace billing admin must purchase managed mailboxes.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Connect existing mailboxes/ }),
    ).toBeEnabled();
  });

  it('recommends the ordinary flow when prewarmed stock is empty', async () => {
    const user = userEvent.setup();
    const onUseOrdinary = jest.fn();

    renderWithI18n(
      <ManagedEmailPrewarmedFlow
        bundles={[]}
        onBack={jest.fn()}
        onChooseBundle={jest.fn()}
        onUseOrdinary={onUseOrdinary}
      />,
    );

    expect(
      screen.getByText('No prewarmed bundles are available right now.'),
    ).toBeVisible();
    expect(screen.getByText('Recommended')).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: /^Create and warm new mailboxes/,
      }),
    );
    expect(onUseOrdinary).toHaveBeenCalledTimes(1);
  });

  it('selects one whole prewarmed bundle with fixed customer-safe identities', async () => {
    const user = userEvent.setup();
    const onChooseBundle = jest.fn();

    renderWithI18n(
      <ManagedEmailPrewarmedFlow
        bundles={[bundle]}
        onBack={jest.fn()}
        onChooseBundle={onChooseBundle}
        onUseOrdinary={jest.fn()}
      />,
    );

    expect(screen.getByText('creator-network.com')).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' &&
          element.textContent?.includes('maya@creator-network.com') === true,
      ),
    ).toBeVisible();
    expect(screen.getByText('Exclusive to your workspace')).toBeVisible();
    expect(screen.queryByText('must-not-render')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /^Select whole bundle/ }),
    );
    expect(onChooseBundle).toHaveBeenCalledWith(bundle);
  });

  it('collects mailbox count before persona and address preferences', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    renderWithI18n(
      <ManagedEmailCreateFlow onBack={jest.fn()} onSubmit={onSubmit} />,
    );

    expect(screen.getByLabelText('Mailbox count')).toBeVisible();
    expect(screen.queryByLabelText('Display name 1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mailbox count'), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /^Continue/ }));

    await user.type(screen.getByLabelText('Display name 1'), 'Maya Chen');
    await user.type(screen.getByLabelText('Role title 1'), 'Partnerships');
    await user.type(screen.getByLabelText('Preferred address 1'), 'maya');
    await user.type(screen.getByLabelText('Signature 1'), 'Thanks, Maya');
    await user.click(screen.getByRole('button', { name: /^Review proposal/ }));

    expect(onSubmit).toHaveBeenCalledWith({
      mailboxCount: 1,
      personas: [
        {
          displayName: 'Maya Chen',
          localPartPreference: 'maya',
          roleTitle: 'Partnerships',
          signature: 'Thanks, Maya',
        },
      ],
    });
  });

  it('shows proposal identities, exact billing periods, due today, and disclosures', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();

    renderWithI18n(
      <ManagedEmailReview
        isConfirming={false}
        onBack={jest.fn()}
        onConfirm={onConfirm}
        proposal={proposal}
        quote={quote}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' &&
          element.textContent?.includes('maya@creator-network.com') === true,
      ),
    ).toBeVisible();
    expect(screen.getByText('$123.45')).toBeVisible();
    expect(screen.getByText('Annual')).toBeVisible();
    expect(screen.getByText('Monthly')).toBeVisible();
    expect(
      screen.getByText('Email services do not use your AI balance.'),
    ).toBeVisible();
    expect(
      screen.getByText('Myah manages the domains and mailboxes as a service.'),
    ).toBeVisible();
    expect(
      screen.queryByText(/provider|credential|SMTP|warmup setting/i),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /^Confirm and pay \$123\.45/ }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^Confirm purchase/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PENDING', 'Payment pending'],
    ['PAYMENT_FAILED', 'Payment failed'],
    ['PAID', 'Payment received'],
  ])(
    'renders %s payment status with a durable textual timeline',
    (paymentStatus, label) => {
      renderWithI18n(
        <ManagedEmailProgress
          onRetryPayment={jest.fn()}
          operation={operation(paymentStatus)}
        />,
      );

      expect(screen.getByRole('heading', { name: label })).toBeVisible();
      expect(screen.getByText('Order saved')).toBeVisible();
      expect(screen.getByText('Payment')).toBeVisible();
      expect(screen.getByText('Mailbox setup')).toBeVisible();
      expect(screen.getByText('Warmup')).toBeVisible();
    },
  );

  it('lets the customer retry the server-emitted failed payment state', async () => {
    const user = userEvent.setup();
    const onRetryPayment = jest.fn();

    renderWithI18n(
      <ManagedEmailProgress
        onRetryPayment={onRetryPayment}
        operation={operation('PAYMENT_FAILED')}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Retry payment/ }));
    expect(onRetryPayment).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PROVIDER_SUCCEEDED', 'Mailbox setup is complete.'],
    ['PROVIDER_FAILED', 'Mailbox setup needs attention.'],
    [
      'PROVIDER_PARTIAL',
      'Mailbox setup partially completed and needs attention.',
    ],
    ['RECONCILIATION_REQUIRED', 'Mailbox setup is being reconciled.'],
  ])('renders durable %s setup progress', (state, label) => {
    renderWithI18n(
      <ManagedEmailProgress
        onRetryPayment={jest.fn()}
        operation={operation('PAID', state)}
      />,
    );

    expect(screen.getByText(label)).toBeVisible();
  });

  it('maps healthy warmup and campaign states without false action warnings', () => {
    renderWithI18n(
      <ManagedMailboxTable
        mailboxes={[
          {
            id: 'maintenance-mailbox',
            address: 'warm@example.com',
            personaDisplayName: 'Warm Mailbox',
            domain: 'example.com',
            warmupState: 'MAINTENANCE',
            campaignEligibility: 'ELIGIBLE',
          },
          {
            id: 'prewarmed-mailbox',
            address: 'prewarmed@example.com',
            personaDisplayName: 'Prewarmed Mailbox',
            domain: 'example.com',
            warmupState: 'NOT_APPLICABLE',
            campaignEligibility: 'NEW_THREADS_BLOCKED',
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Ready')).toHaveLength(2);
    expect(screen.getByText('Prewarmed')).toBeVisible();
    expect(screen.getByText('New threads blocked')).toBeVisible();
    expect(screen.queryByText('Action required')).not.toBeInTheDocument();
  });
});
