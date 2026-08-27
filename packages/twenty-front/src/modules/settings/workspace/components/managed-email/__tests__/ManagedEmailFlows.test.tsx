import { ManagedEmailAcquisitionChooser } from '@/settings/workspace/components/managed-email/ManagedEmailAcquisitionChooser';
import { ManagedEmailDashboard } from '@/settings/workspace/components/managed-email/ManagedEmailDashboard';
import { ManagedEmailCreateFlow } from '@/settings/workspace/components/managed-email/ManagedEmailCreateFlow';
import { ManagedEmailPrewarmedFlow } from '@/settings/workspace/components/managed-email/ManagedEmailPrewarmedFlow';
import { ManagedEmailProgress } from '@/settings/workspace/components/managed-email/ManagedEmailProgress';
import { ManagedEmailReview } from '@/settings/workspace/components/managed-email/ManagedEmailReview';
import { ManagedMailboxTable } from '@/settings/workspace/components/managed-email/ManagedMailboxTable';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';
import {
  type ManagedEmailBundle,
  type ManagedEmailDomain,
  type ManagedEmailOperation,
  type ManagedEmailOverview,
  type ManagedEmailProposal,
  type ManagedEmailQuote,
} from '~/generated-metadata/graphql';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

jest.mock('react-responsive', () => ({
  useMediaQuery: () => false,
}));

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
  isSandbox: true,
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

const customerOwnedRequiredNameservers = [
  'ns1.customer-owned.test',
  'ns2.customer-owned.test',
  'ns3.customer-owned.test',
  'ns4.customer-owned.test',
];

const customerOwnedDomain = {
  acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
  cancelAtPeriodEnd: false,
  dependentMailboxCount: 2,
  domain: 'creator-owned.test',
  id: 'customer-owned-domain-1',
  infrastructureState: 'DNS_PENDING',
  paidThrough: null,
  renewalEnabled: false,
  requiredNameservers: customerOwnedRequiredNameservers,
  safeFailureCode: null,
} as ManagedEmailDomain;

const customerOwnedOverview: ManagedEmailOverview = {
  acquisitionAvailable: true,
  actionRequiredCount: 0,
  domainCount: 1,
  mailboxCount: 2,
  readyCount: 0,
  status: 'WARMING',
  warmingCount: 2,
};

describe('managed email acquisition flow components', () => {
  it('offers four paths while keeping purchase paths unavailable to ordinary members', async () => {
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
        name: /^Buy domain/,
      }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Connect existing mailbox/ }),
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
        name: /^Buy domain/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'A workspace billing admin must purchase managed mailboxes.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Connect existing mailbox/ }),
    ).toBeEnabled();
  });

  it('distinguishes buying a domain, using an owned domain, and connecting an existing mailbox', () => {
    renderWithI18n(
      <ManagedEmailAcquisitionChooser
        acquisitionAvailable
        canPurchase
        onChoosePrewarmed={jest.fn()}
        onCreateManaged={jest.fn()}
        onConnectExisting={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Buy domain' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Use a domain I own' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Connect existing mailbox' }),
    ).toBeEnabled();
  });

  it('renders all customer-owned nameservers without a fixed desktop row height', () => {
    renderWithI18n(
      <ManagedEmailDashboard
        domains={[customerOwnedDomain]}
        mailboxes={[]}
        onBrowsePrewarmedInventory={jest.fn()}
        onConnectExistingMailbox={jest.fn()}
        onSetUpManagedEmail={jest.fn()}
        overview={customerOwnedOverview}
      />,
    );

    expect(screen.getByText('Customer-owned')).toBeVisible();
    expect(screen.getByText('DNS status')).toBeVisible();
    customerOwnedRequiredNameservers.forEach((nameserver) => {
      expect(screen.getByText(nameserver)).toBeVisible();
    });

    const customerOwnedRow = screen.getByRole('row', {
      name: /creator-owned\.test/,
    });
    const nameserversCell = within(customerOwnedRow).getAllByRole('cell')[3]!;
    expect(customerOwnedRow).toHaveAttribute('height', 'auto');
    expect(nameserversCell).toHaveAttribute('height', 'auto');
    expect(screen.queryByText('Renewal')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Ends after paid period'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add mailbox' })).toBeDisabled();
    expect(screen.getByText(/cannot add mailboxes later/i)).toBeVisible();
  });

  it('uses row-scoped setup labels and permanent mailbox guidance for a mixed owned and managed inventory', () => {
    const managedDomain: ManagedEmailDomain = {
      ...customerOwnedDomain,
      acquisitionMode: 'NEW_MANAGED',
      domain: 'managed-sending.test',
      id: 'managed-domain-1',
      infrastructureState: 'ACTIVE',
      paidThrough: '2027-08-06T12:00:00.000Z',
      renewalEnabled: true,
      requiredNameservers: [],
    };

    renderWithI18n(
      <ManagedEmailDashboard
        domains={[
          {
            ...customerOwnedDomain,
            infrastructureState: 'PROVISIONING_DOMAIN',
          },
          managedDomain,
        ]}
        mailboxes={[]}
        onBrowsePrewarmedInventory={jest.fn()}
        onConnectExistingMailbox={jest.fn()}
        onSetUpManagedEmail={jest.fn()}
        overview={{
          ...customerOwnedOverview,
          domainCount: 2,
          mailboxCount: 3,
        }}
      />,
    );

    const domainsTable = screen.getByRole('table', {
      name: 'Managed email domains',
    });
    const customerOwnedRow = within(domainsTable).getByRole('row', {
      name: /creator-owned\.test/,
    });
    const managedRow = within(domainsTable).getByRole('row', {
      name: /managed-sending\.test/,
    });

    expect(within(customerOwnedRow).getByText('Customer-owned')).toBeVisible();
    expect(
      within(customerOwnedRow).getByRole('heading', { name: 'Setting up' }),
    ).toBeVisible();
    const nameserversCell = within(customerOwnedRow).getByRole('cell', {
      name: /Nameservers/i,
    });
    customerOwnedRequiredNameservers.forEach((nameserver) => {
      expect(nameserversCell).toHaveTextContent(nameserver);
    });

    const renewalCell = within(managedRow).getByRole('cell', {
      name: /Renewal/i,
    });
    expect(renewalCell).toHaveTextContent('Renews automatically');
    expect(
      screen.getByText(
        'You cannot add mailboxes later; choose the complete initial mailbox set during setup.',
      ),
    ).toBeVisible();
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

  it('requires an integer initial mailbox count for a customer-owned domain', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    renderWithI18n(
      <ManagedEmailCreateFlow
        initialAcquisitionMode="CUSTOMER_OWNED_DOMAIN_IMPORT"
        onBack={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Customer-owned domain'), {
      target: { value: 'creator.co.uk' },
    });
    fireEvent.change(screen.getByLabelText('Mailbox count'), {
      target: { value: '1.5' },
    });

    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
    expect(screen.queryByLabelText('Display name 1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mailbox count'), {
      target: { value: '2' },
    });

    expect(screen.getByRole('button', { name: /^Continue/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^Continue/ }));

    expect(screen.getByLabelText('Display name 1')).toBeVisible();
    expect(screen.getByLabelText('Display name 2')).toBeVisible();

    await user.type(screen.getByLabelText('Display name 1'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Role title 1'), 'Engineer');
    await user.type(screen.getByLabelText('Preferred address 1'), 'ada');
    await user.type(screen.getByLabelText('Signature 1'), 'Thanks, Ada');
    await user.type(screen.getByLabelText('Display name 2'), 'Grace Hopper');
    await user.type(screen.getByLabelText('Role title 2'), 'Admiral');
    await user.type(screen.getByLabelText('Preferred address 2'), 'grace');
    await user.type(screen.getByLabelText('Signature 2'), 'Thanks, Grace');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^Review proposal/ }));

    expect(onSubmit).toHaveBeenCalledWith({
      acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
      customerOwnedDomain: 'creator.co.uk',
      mailboxCount: 2,
      personas: [
        {
          displayName: 'Ada Lovelace',
          localPartPreference: 'ada',
          roleTitle: 'Engineer',
          signature: 'Thanks, Ada',
        },
        {
          displayName: 'Grace Hopper',
          localPartPreference: 'grace',
          roleTitle: 'Admiral',
          signature: 'Thanks, Grace',
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
    expect(screen.getByText('1 × $100.00 = $100.00')).toBeVisible();
    expect(screen.getByText('1 × $23.45 = $23.45')).toBeVisible();
    expect(
      Array.from(document.querySelectorAll('time')).map((time) =>
        time.getAttribute('dateTime'),
      ),
    ).toEqual([
      '2026-08-06T12:00:00.000Z',
      '2027-08-06T12:00:00.000Z',
      '2026-08-06T12:00:00.000Z',
      '2026-09-06T12:00:00.000Z',
    ]);
    expect(
      screen.getByText(
        'Cancel renewal now; service continues through paid-through.',
      ),
    ).toBeVisible();
    expect(screen.getByText(/non-production|sandbox/i)).toBeVisible();
    expect(screen.getByText(/SetupIntent/i)).toBeVisible();
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

  it('does not show the sandbox banner for a production quote', () => {
    renderWithI18n(
      <ManagedEmailReview
        isConfirming={false}
        onBack={jest.fn()}
        onConfirm={jest.fn()}
        proposal={proposal}
        quote={{ ...quote, isSandbox: false }}
      />,
    );

    expect(
      screen.queryByText(/non-production|sandbox/i),
    ).not.toBeInTheDocument();
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
          onReturnToOverview={jest.fn()}
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

  it('offers a truthful return action for failed payment without claiming a retry', async () => {
    const user = userEvent.setup();
    const onReturnToOverview = jest.fn();

    renderWithI18n(
      <ManagedEmailProgress
        onReturnToOverview={onReturnToOverview}
        operation={operation('PAYMENT_FAILED')}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /^Retry payment/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Return to mailbox overview/ }),
    );
    expect(onReturnToOverview).toHaveBeenCalledTimes(1);
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
        onReturnToOverview={jest.fn()}
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
