import { ManagedEmailOverview } from '@/settings/workspace/components/managed-email/ManagedEmailOverview';
import {
  CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE,
  RETRY_MANAGED_EMAIL_PAYMENT,
} from '@/settings/workspace/graphql/managed-email/managedEmailMutations';
import {
  GET_MANAGED_EMAIL_OPERATION,
  GET_MANAGED_EMAIL_OVERVIEW,
  GET_MANAGED_EMAIL_PREWARMED_BUNDLES,
  GET_MANAGED_EMAIL_PROPOSAL,
  GET_MANAGED_EMAIL_QUOTE,
} from '@/settings/workspace/graphql/managed-email/managedEmailQueries';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';
import { PermissionFlagType } from '~/generated-metadata/graphql';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

jest.mock('@/settings/roles/hooks/usePermissionFlagMap', () => ({
  usePermissionFlagMap: jest.fn(),
}));

jest.mock('@/apollo/hooks/useSnackBarOnQueryError', () => ({
  useSnackBarOnQueryError: jest.fn(),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
  }),
}));

const overviewResult = {
  managedEmailOverview: {
    acquisitionAvailable: true,
    actionRequiredCount: 1,
    domainCount: 1,
    mailboxCount: 1,
    readyCount: 0,
    status: 'ACTION_REQUIRED',
    warmingCount: 1,
  },
  managedEmailDomains: [
    {
      cancelAtPeriodEnd: false,
      dependentMailboxCount: 1,
      domain: 'creator-network.com',
      id: 'domain-1',
      infrastructureState: 'ACTIVE',
      paidThrough: '2027-08-06T12:00:00.000Z',
      renewalEnabled: true,
      safeFailureCode: null,
    },
  ],
  managedEmailMailboxes: [
    {
      address: 'maya@creator-network.com',
      adminDailyCap: null,
      campaignEligibility: 'NEW_THREADS_BLOCKED',
      domain: 'creator-network.com',
      domainId: 'domain-1',
      id: 'mailbox-1',
      infrastructureState: 'ACTIVE',
      lastHealthEvaluatedAt: '2026-08-06T12:00:00.000Z',
      personaDisplayName: 'Maya Chen',
      personaRole: 'Partnerships',
      policySafeDailyCapacity: 0,
      safeFailureCode: 'INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER',
      servicePaidThrough: '2026-09-06T12:00:00.000Z',
      warmupPaidThrough: '2026-09-06T12:00:00.000Z',
      warmupState: 'WARMING',
    },
  ],
};

const overviewMock: MockedResponse = {
  request: { query: GET_MANAGED_EMAIL_OVERVIEW },
  result: { data: overviewResult },
};

const Wrapper = ({
  children,
  mocks = [overviewMock],
}: {
  children: ReactNode;
  mocks?: MockedResponse[];
}) => (
  <MockedProvider mocks={mocks}>
    <MemoryRouter>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </MemoryRouter>
  </MockedProvider>
);

const renderOverview = (mocks?: MockedResponse[]) =>
  render(
    <Wrapper mocks={mocks}>
      <ManagedEmailOverview />
    </Wrapper>,
  );

describe('ManagedEmailOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (usePermissionFlagMap as jest.Mock).mockReturnValue({
      [PermissionFlagType.BILLING]: true,
    });
  });

  it('loads customer-safe counts and mailbox inventory without leaking failure details', async () => {
    renderOverview();

    expect(await screen.findByText('Managed mailboxes')).toBeVisible();
    expect(screen.getByText('1 mailbox')).toBeVisible();
    expect(screen.getByText('1 warming')).toBeVisible();
    expect(screen.getByText('1 action required')).toBeVisible();
    expect(screen.getByText('maya@creator-network.com')).toBeVisible();
    expect(screen.getByText('Maya Chen')).toBeVisible();
    expect(
      screen.queryByText('INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER'),
    ).not.toBeInTheDocument();
  });

  it('clears a stale saved operation pointer and returns to the overview', async () => {
    window.localStorage.setItem(
      'managed-email-operation-id',
      'missing-operation',
    );
    window.localStorage.setItem(
      'managed-email-operation-idempotency-key',
      'stale-confirmation-key',
    );
    renderOverview([
      overviewMock,
      {
        request: {
          query: GET_MANAGED_EMAIL_OPERATION,
          variables: { input: { operationId: 'missing-operation' } },
        },
        result: { data: { managedEmailOperation: null } },
      },
    ]);

    expect(await screen.findByText('Managed mailboxes')).toBeVisible();
    expect(
      window.localStorage.getItem('managed-email-operation-id'),
    ).toBeNull();
    expect(
      window.localStorage.getItem('managed-email-operation-idempotency-key'),
    ).toBeNull();
  });

  it('keeps Connect existing available without querying billing-protected managed data', async () => {
    (usePermissionFlagMap as jest.Mock).mockReturnValue({
      [PermissionFlagType.BILLING]: false,
    });
    renderOverview([]);

    expect(
      await screen.findByText(
        'A workspace billing admin must purchase managed mailboxes.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /^Create and warm new mailboxes/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Connect existing mailboxes/ }),
    ).toBeEnabled();
  });

  it('keeps Connect existing available when managed acquisition is disabled', async () => {
    const user = userEvent.setup();
    renderOverview([
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            ...overviewResult,
            managedEmailOverview: {
              ...overviewResult.managedEmailOverview,
              acquisitionAvailable: false,
            },
          },
        },
      },
    ]);

    await user.click(
      await screen.findByRole('button', { name: /^Add mailboxes/ }),
    );

    expect(
      screen.getByText(
        'Managed mailbox acquisition is not available right now.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /^Create and warm new mailboxes/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Connect existing mailboxes/ }),
    ).toBeEnabled();
  });

  it('renders an empty managed mailbox overview as neutral', async () => {
    renderOverview([
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            ...overviewResult,
            managedEmailOverview: {
              acquisitionAvailable: true,
              actionRequiredCount: 0,
              domainCount: 0,
              mailboxCount: 0,
              readyCount: 0,
              status: 'EMPTY',
              warmingCount: 0,
            },
            managedEmailMailboxes: [],
          },
        },
      },
    ]);

    expect(await screen.findByText('No managed mailboxes yet.')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'No managed mailboxes' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Action required' }),
    ).not.toBeInTheDocument();
  });

  it('reuses the recovered confirmation key when retrying payment', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('managed-email-operation-id', 'operation-1');
    window.localStorage.setItem(
      'managed-email-operation-idempotency-key',
      'original-confirmation-key',
    );

    renderOverview([
      overviewMock,
      {
        request: {
          query: GET_MANAGED_EMAIL_OPERATION,
          variables: { input: { operationId: 'operation-1' } },
        },
        result: {
          data: {
            managedEmailOperation: {
              acquisitionMode: 'NEW_MANAGED',
              amountCents: '12345',
              createdAt: '2026-08-06T12:00:00.000Z',
              currency: 'USD',
              id: 'operation-1',
              paymentStatus: 'PAYMENT_FAILED',
              safeFailureCode: 'PAYMENT_FAILED',
              state: 'PAYMENT_PENDING',
              updatedAt: '2026-08-06T12:05:00.000Z',
            },
          },
        },
      },
      {
        request: {
          query: RETRY_MANAGED_EMAIL_PAYMENT,
          variables: {
            input: {
              idempotencyKey: 'original-confirmation-key',
              operationId: 'operation-1',
            },
          },
        },
        result: {
          data: {
            retryManagedEmailPayment: {
              accepted: true,
              operationId: 'operation-1',
            },
          },
        },
      },
    ]);

    await user.click(
      await screen.findByRole('button', { name: /^Retry payment/ }),
    );
    expect(
      window.localStorage.getItem('managed-email-operation-idempotency-key'),
    ).toBe('original-confirmation-key');
  });

  it('shows the ordinary fallback when live prewarmed stock is empty', async () => {
    const user = userEvent.setup();
    renderOverview([
      overviewMock,
      {
        request: { query: GET_MANAGED_EMAIL_PREWARMED_BUNDLES },
        result: { data: { managedEmailPrewarmedBundles: [] } },
      },
    ]);

    await user.click(
      await screen.findByRole('button', { name: /^Add mailboxes/ }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Get prewarmed mailboxes/ }),
    );

    expect(
      await screen.findByText('No prewarmed bundles are available right now.'),
    ).toBeVisible();
    expect(screen.getByText('Recommended')).toBeVisible();
  });

  it('continues an ordinary purchase from proposal through durable payment progress', async () => {
    const user = userEvent.setup();
    const proposalInput = {
      mailboxCount: 1,
      personas: [
        {
          displayName: 'Maya Chen',
          localPartPreference: 'maya',
          roleTitle: 'Partnerships',
          signature: 'Thanks, Maya',
        },
      ],
    };
    const proposal = {
      disclosures: {
        cancellation: 'Cancel renewal; service continues through paid-through.',
        managedServiceOwnership: 'Myah manages these resources as a service.',
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
    const quote = {
      currency: 'USD',
      disclosures: proposal.disclosures,
      dueTodayCents: 12345,
      expiresAt: '2026-08-06T13:00:00.000Z',
      id: 'quote-1',
      lines: [
        {
          amountCents: 12345,
          billingFrequency: 'MONTHLY',
          endingBefore: '2026-09-06T12:00:00.000Z',
          productKey: 'managed_mailbox_month',
          quantity: 1,
          startingAt: '2026-08-06T12:00:00.000Z',
          unitPriceCents: 12345,
        },
      ],
      quoteFingerprint: 'fingerprint-1',
      quoteVersion: 'quote-v1',
    };

    renderOverview([
      overviewMock,
      {
        request: {
          query: GET_MANAGED_EMAIL_PROPOSAL,
          variables: { input: proposalInput },
        },
        result: { data: { managedEmailProposal: proposal } },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_QUOTE,
          variables: { input: { proposalId: 'proposal-1' } },
        },
        result: { data: { managedEmailQuote: quote } },
      },
      {
        request: {
          query: CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE,
          variables: (variables) =>
            variables.input.quoteId === 'quote-1' &&
            variables.input.quoteVersion === 'quote-v1' &&
            variables.input.quoteFingerprint === 'fingerprint-1' &&
            typeof variables.input.idempotencyKey === 'string',
        },
        result: {
          data: {
            confirmManagedEmailOrdinaryPurchase: {
              accepted: true,
              operationId: 'operation-1',
            },
          },
        },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_OPERATION,
          variables: { input: { operationId: 'operation-1' } },
        },
        result: {
          data: {
            managedEmailOperation: {
              acquisitionMode: 'NEW_MANAGED',
              amountCents: '12345',
              createdAt: '2026-08-06T12:00:00.000Z',
              currency: 'USD',
              id: 'operation-1',
              paymentStatus: 'PENDING',
              safeFailureCode: null,
              state: 'PAYMENT_PENDING',
              updatedAt: '2026-08-06T12:00:00.000Z',
            },
          },
        },
      },
    ]);

    await user.click(
      await screen.findByRole('button', { name: /^Add mailboxes/ }),
    );
    await user.click(
      screen.getByRole('button', {
        name: /^Create and warm new mailboxes/,
      }),
    );
    fireEvent.change(screen.getByLabelText('Mailbox count'), {
      target: { value: '1' },
    });
    await user.click(screen.getByRole('button', { name: /^Continue/ }));
    await user.type(screen.getByLabelText('Display name 1'), 'Maya Chen');
    await user.type(screen.getByLabelText('Role title 1'), 'Partnerships');
    await user.type(screen.getByLabelText('Preferred address 1'), 'maya');
    await user.type(screen.getByLabelText('Signature 1'), 'Thanks, Maya');
    await user.click(screen.getByRole('button', { name: /^Review proposal/ }));

    expect(
      await screen.findByRole('button', { name: /^Confirm and pay \$123\.45/ }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: /^Confirm and pay \$123\.45/ }),
    );
    await user.click(screen.getByRole('button', { name: /^Confirm purchase/ }));

    expect(
      await screen.findByRole('heading', { name: 'Payment pending' }),
    ).toBeVisible();
    await waitFor(() => {
      expect(window.localStorage.getItem('managed-email-operation-id')).toBe(
        'operation-1',
      );
    });
  });
});
