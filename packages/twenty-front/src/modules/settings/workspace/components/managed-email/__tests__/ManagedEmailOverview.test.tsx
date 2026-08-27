import { ManagedEmailOverview } from '@/settings/workspace/components/managed-email/ManagedEmailOverview';
import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import {
  COMPLETE_MANAGED_EMAIL_PAYMENT_METHOD,
  CONFIRM_MANAGED_EMAIL_CUSTOMER_OWNED_DOMAIN_IMPORT_PURCHASE,
  CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE,
  CONFIRM_MANAGED_EMAIL_PREWARMED_PURCHASE,
  PAUSE_MANAGED_EMAIL_WARMUP,
  PREPARE_MANAGED_EMAIL_PAYMENT_METHOD,
} from '@/settings/workspace/graphql/managed-email/managedEmailMutations';
import {
  GET_MANAGED_EMAIL_OPERATION,
  GET_MANAGED_EMAIL_OVERVIEW,
  GET_MANAGED_EMAIL_PREWARMED_BUNDLES,
  GET_MANAGED_EMAIL_PREWARMED_PROPOSAL,
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
import { Provider as JotaiProvider, createStore } from 'jotai';
import { StrictMode, type ReactNode } from 'react';
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
const mockEnqueueErrorSnackBar = jest.fn();

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
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
  workspaceId = 'workspace-a',
}: {
  children: ReactNode;
  mocks?: MockedResponse[];
  workspaceId?: string;
}) => {
  const store = createStore();

  store.set(currentWorkspaceState.atom, {
    id: workspaceId,
    installedApplications: [],
    workspaceCustomApplication: null,
  } as unknown as CurrentWorkspace);

  return (
    <JotaiProvider store={store}>
      <MockedProvider mocks={mocks}>
        <MemoryRouter>
          <I18nProvider i18n={i18n}>{children}</I18nProvider>
        </MemoryRouter>
      </MockedProvider>
    </JotaiProvider>
  );
};

const renderOverview = (mocks?: MockedResponse[], workspaceId?: string) =>
  render(
    <Wrapper mocks={mocks} workspaceId={workspaceId}>
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

  it('renders the resource dashboard from customer-safe overview data', async () => {
    renderOverview();

    expect(
      await screen.findByRole('heading', { name: 'Email infrastructure' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('heading', { name: 'Domains' })[0],
    ).toBeVisible();
    expect(
      screen.getAllByRole('heading', { name: 'Mailboxes' })[0],
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Managed warmup' }),
    ).toBeVisible();
    expect(screen.getByText('maya@creator-network.com')).toBeVisible();
    expect(screen.getByText('Maya Chen')).toBeVisible();
    expect(
      screen.queryByText('INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER'),
    ).not.toBeInTheDocument();
  });

  it('disables composable actions that do not have production APIs', async () => {
    renderOverview();

    expect(
      await screen.findByRole('button', { name: 'Add domain' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add mailbox' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Start managed warmup' }),
    ).toBeDisabled();
  });
  it('renders warming overview state as warming instead of ready', async () => {
    renderOverview([
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            ...overviewResult,
            managedEmailOverview: {
              ...overviewResult.managedEmailOverview,
              actionRequiredCount: 0,
              readyCount: 0,
              status: 'WARMING',
              warmingCount: 0,
            },
            managedEmailMailboxes: [
              {
                ...overviewResult.managedEmailMailboxes[0],
                warmupState: 'CONNECTING',
              },
            ],
          },
        },
      },
    ]);

    expect(
      (await screen.findAllByRole('heading', { name: 'Warming' }))[0],
    ).toBeVisible();
    expect(screen.getByText('1 mailbox warming')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: '0 ready' }),
    ).not.toBeInTheDocument();
  });

  it('preserves action-required precedence over locally ready warmup state', async () => {
    renderOverview([
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            ...overviewResult,
            managedEmailMailboxes: [
              {
                ...overviewResult.managedEmailMailboxes[0],
                warmupState: 'MAINTENANCE',
              },
            ],
          },
        },
      },
    ]);

    expect(
      (
        await screen.findAllByRole('heading', {
          name: 'Action required',
        })
      )[0],
    ).toBeVisible();
  });

  it('does not treat a blocked ordinary NOT_APPLICABLE mailbox as ready', async () => {
    renderOverview([
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            ...overviewResult,
            managedEmailOverview: {
              ...overviewResult.managedEmailOverview,
              actionRequiredCount: 0,
              status: 'WARMING',
            },
            managedEmailMailboxes: [
              {
                ...overviewResult.managedEmailMailboxes[0],
                campaignEligibility: 'BLOCKED',
                safeFailureCode: null,
                warmupState: 'NOT_APPLICABLE',
              },
            ],
          },
        },
      },
    ]);

    expect(
      (await screen.findAllByRole('heading', { name: 'Warming' }))[0],
    ).toBeVisible();
  });

  it('renders shutdown states as neutral lifecycle progress', async () => {
    renderOverview([
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            managedEmailOverview: {
              ...overviewResult.managedEmailOverview,
              actionRequiredCount: 0,
              readyCount: 0,
              status: 'WARMING',
              warmingCount: 0,
            },
            managedEmailDomains: [
              {
                ...overviewResult.managedEmailDomains[0],
                infrastructureState: 'INACTIVE',
              },
            ],
            managedEmailMailboxes: [
              {
                ...overviewResult.managedEmailMailboxes[0],
                id: 'mailbox-deactivating',
                infrastructureState: 'DEACTIVATING',
                safeFailureCode: null,
                warmupState: 'DELETED',
              },
              {
                ...overviewResult.managedEmailMailboxes[0],
                address: 'retired@creator-network.com',
                id: 'mailbox-inactive',
                infrastructureState: 'INACTIVE',
                safeFailureCode: null,
                warmupState: 'DELETED',
              },
            ],
          },
        },
      },
    ]);

    expect(
      (await screen.findAllByRole('heading', { name: 'Stopping' }))[0],
    ).toBeVisible();
    expect(
      (await screen.findAllByRole('heading', { name: 'Inactive' }))[0],
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Warming' }),
    ).not.toBeInTheDocument();
  });

  it('clears a stale saved purchase intent and returns to the overview', async () => {
    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-a',
      JSON.stringify({
        acquisitionMode: 'NEW_MANAGED',
        idempotencyKey: 'stale-confirmation-key',
        operationId: 'missing-operation',
        quoteFingerprint: 'stale-fingerprint',
        quoteId: 'stale-quote',
        quoteVersion: 'stale-version',
      }),
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

    expect(
      await screen.findByRole('heading', { name: 'Email infrastructure' }),
    ).toBeVisible();
    expect(
      window.localStorage.getItem('managed-email-purchase-intent:workspace-a'),
    ).toBeNull();
  });

  it("keeps another workspace's pending purchase intent while recovering the current workspace", async () => {
    const workspaceAIntent = JSON.stringify({
      acquisitionMode: 'NEW_MANAGED',
      idempotencyKey: 'workspace-a-confirmation-key',
      operationId: 'workspace-a-operation',
      quoteFingerprint: 'workspace-a-fingerprint',
      quoteId: 'workspace-a-quote',
      quoteVersion: 'workspace-a-version',
    });

    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-a',
      workspaceAIntent,
    );
    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-b',
      JSON.stringify({
        acquisitionMode: 'NEW_MANAGED',
        idempotencyKey: 'workspace-b-confirmation-key',
        operationId: 'workspace-b-missing-operation',
        quoteFingerprint: 'workspace-b-fingerprint',
        quoteId: 'workspace-b-quote',
        quoteVersion: 'workspace-b-version',
      }),
    );

    renderOverview(
      [
        overviewMock,
        {
          request: {
            query: GET_MANAGED_EMAIL_OPERATION,
            variables: {
              input: { operationId: 'workspace-b-missing-operation' },
            },
          },
          result: { data: { managedEmailOperation: null } },
        },
      ],
      'workspace-b',
    );

    expect(
      await screen.findByRole('heading', { name: 'Email infrastructure' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        window.localStorage.getItem(
          'managed-email-purchase-intent:workspace-b',
        ),
      ).toBeNull(),
    );
    expect(
      window.localStorage.getItem('managed-email-purchase-intent:workspace-a'),
    ).toBe(workspaceAIntent);
  });

  it('replays a pending purchase intent with the original identity after reload', async () => {
    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-a',
      JSON.stringify({
        acquisitionMode: 'NEW_MANAGED',
        idempotencyKey: 'original-confirmation-key',
        operationId: null,
        quoteFingerprint: 'original-fingerprint',
        quoteId: 'original-quote',
        quoteVersion: 'original-version',
      }),
    );

    const confirmationResult = jest.fn(() => ({
      data: {
        confirmManagedEmailOrdinaryPurchase: {
          accepted: true,
          operationId: 'recovered-operation',
        },
      },
    }));
    const confirmationMock = {
      request: {
        query: CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE,
        variables: {
          input: {
            idempotencyKey: 'original-confirmation-key',
            quoteFingerprint: 'original-fingerprint',
            quoteId: 'original-quote',
            quoteVersion: 'original-version',
          },
        },
      },
      result: confirmationResult,
    };
    const operationMock = {
      request: {
        query: GET_MANAGED_EMAIL_OPERATION,
        variables: { input: { operationId: 'recovered-operation' } },
      },
      result: {
        data: {
          managedEmailOperation: {
            acquisitionMode: 'NEW_MANAGED',
            amountCents: '12345',
            createdAt: '2026-08-06T12:00:00.000Z',
            currency: 'USD',
            id: 'recovered-operation',
            paymentStatus: 'PENDING',
            safeFailureCode: null,
            state: 'PAYMENT_PENDING',
            updatedAt: '2026-08-06T12:00:00.000Z',
          },
        },
      },
    };

    render(
      <StrictMode>
        <Wrapper
          mocks={[
            overviewMock,
            overviewMock,
            confirmationMock,
            confirmationMock,
            operationMock,
            operationMock,
          ]}
        >
          <ManagedEmailOverview />
        </Wrapper>
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Payment pending' }),
    ).toBeVisible();
    expect(confirmationResult).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(
        window.localStorage.getItem(
          'managed-email-purchase-intent:workspace-a',
        ) ?? '',
      ),
    ).toMatchObject({
      idempotencyKey: 'original-confirmation-key',
      operationId: 'recovered-operation',
    });
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
      screen.getByRole('button', { name: /^Connect existing mailbox/ }),
    ).toBeEnabled();
  });

  it('keeps Connect existing available when managed acquisition is disabled', async () => {
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

    expect(
      await screen.findByRole('button', { name: 'Set up managed email' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Browse prewarmed inventory' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Connect existing mailbox' }),
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
            managedEmailDomains: [],
            managedEmailMailboxes: [],
          },
        },
      },
    ]);

    expect(await screen.findByText('No managed mailboxes yet.')).toBeVisible();
    expect(
      screen.getAllByRole('heading', { name: 'No managed mailboxes' })[0],
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Action required' }),
    ).not.toBeInTheDocument();
  });

  it('lets a failed operation return to the mailbox overview without claiming a payment retry', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-a',
      JSON.stringify({
        acquisitionMode: 'NEW_MANAGED',
        idempotencyKey: 'original-confirmation-key',
        operationId: 'operation-1',
        quoteFingerprint: 'original-fingerprint',
        quoteId: 'original-quote',
        quoteVersion: 'original-version',
      }),
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
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Payment failed' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Retry payment/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Return to mailbox overview/ }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Email infrastructure' }),
    ).toBeVisible();
    expect(
      window.localStorage.getItem('managed-email-purchase-intent:workspace-a'),
    ).toBeNull();
  });

  it('returns to the refreshed mailbox overview after provider setup succeeds', async () => {
    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-a',
      JSON.stringify({
        acquisitionMode: 'NEW_MANAGED',
        idempotencyKey: 'successful-confirmation-key',
        operationId: 'successful-operation',
        quoteFingerprint: 'successful-fingerprint',
        quoteId: 'successful-quote',
        quoteVersion: 'successful-version',
      }),
    );

    renderOverview([
      overviewMock,
      {
        request: {
          query: GET_MANAGED_EMAIL_OPERATION,
          variables: { input: { operationId: 'successful-operation' } },
        },
        result: {
          data: {
            managedEmailOperation: {
              acquisitionMode: 'NEW_MANAGED',
              amountCents: '12345',
              createdAt: '2026-08-06T12:00:00.000Z',
              currency: 'USD',
              id: 'successful-operation',
              paymentStatus: 'PAID',
              safeFailureCode: null,
              state: 'PROVIDER_SUCCEEDED',
              updatedAt: '2026-08-06T12:05:00.000Z',
            },
          },
        },
      },
      overviewMock,
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Email infrastructure' }),
    ).toBeVisible();
    expect(
      window.localStorage.getItem('managed-email-purchase-intent:workspace-a'),
    ).toBeNull();
  });

  it('recovers a customer-owned import and refetches server-provided nameserver instructions', async () => {
    const requiredNameservers = [
      'ns1.customer-owned.test',
      'ns2.customer-owned.test',
    ];

    window.localStorage.setItem(
      'managed-email-purchase-intent:workspace-a',
      JSON.stringify({
        acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
        idempotencyKey: 'owned-domain-confirmation-key',
        operationId: null,
        quoteFingerprint: 'owned-domain-fingerprint',
        quoteId: 'owned-domain-quote',
        quoteVersion: 'owned-domain-version',
      }),
    );

    renderOverview([
      overviewMock,
      {
        request: {
          query: CONFIRM_MANAGED_EMAIL_CUSTOMER_OWNED_DOMAIN_IMPORT_PURCHASE,
          variables: {
            input: {
              idempotencyKey: 'owned-domain-confirmation-key',
              quoteFingerprint: 'owned-domain-fingerprint',
              quoteId: 'owned-domain-quote',
              quoteVersion: 'owned-domain-version',
            },
          },
        },
        result: {
          data: {
            confirmManagedEmailCustomerOwnedDomainImportPurchase: {
              accepted: true,
              operationId: 'owned-domain-operation',
            },
          },
        },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_OPERATION,
          variables: { input: { operationId: 'owned-domain-operation' } },
        },
        result: {
          data: {
            managedEmailOperation: {
              acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
              amountCents: '29380',
              createdAt: '2026-08-06T12:00:00.000Z',
              currency: 'USD',
              id: 'owned-domain-operation',
              paymentStatus: 'PAID',
              safeFailureCode: null,
              state: 'PROVIDER_SUCCEEDED',
              updatedAt: '2026-08-06T12:05:00.000Z',
            },
          },
        },
      },
      {
        request: { query: GET_MANAGED_EMAIL_OVERVIEW },
        result: {
          data: {
            ...overviewResult,
            managedEmailDomains: [
              {
                ...overviewResult.managedEmailDomains[0],
                acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
                domain: 'creator-owned.test',
                id: 'customer-owned-domain-1',
                infrastructureState: 'DNS_PENDING',
                paidThrough: null,
                renewalEnabled: false,
                requiredNameservers,
              },
            ],
            managedEmailMailboxes: [
              {
                ...overviewResult.managedEmailMailboxes[0],
                domain: 'creator-owned.test',
                domainId: 'customer-owned-domain-1',
              },
            ],
          },
        },
      },
    ]);

    expect(await screen.findByText('Customer-owned')).toBeVisible();
    requiredNameservers.forEach((nameserver) => {
      expect(screen.getByText(nameserver)).toBeVisible();
    });
    expect(
      window.localStorage.getItem('managed-email-purchase-intent:workspace-a'),
    ).toBeNull();
  });

  it('confirms an immediate warmup pause before sending the lifecycle mutation', async () => {
    const user = userEvent.setup();
    renderOverview([
      overviewMock,
      {
        request: {
          query: PAUSE_MANAGED_EMAIL_WARMUP,
          variables: (variables) =>
            variables.input.mailboxId === 'mailbox-1' &&
            typeof variables.input.idempotencyKey === 'string',
        },
        result: {
          data: { pauseManagedEmailWarmup: { accepted: true } },
        },
      },
      overviewMock,
    ]);

    await user.click(
      await screen.findByRole('button', {
        name: /Maya Chen — maya@creator-network.com/,
      }),
    );
    await user.click(screen.getByRole('button', { name: /^Pause warmup/ }));

    expect(
      screen.getByText(
        'This pauses warmup now. It does not cancel your warmup renewal.',
      ),
    ).toBeVisible();
    await user.click(screen.getByTestId('confirmation-modal-confirm-button'));
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
      await screen.findByRole('button', {
        name: 'Browse prewarmed inventory',
      }),
    );

    expect(
      await screen.findByText('No prewarmed bundles are available right now.'),
    ).toBeVisible();
    expect(screen.getByText('Recommended')).toBeVisible();
  });

  it('surfaces bounded customer-safe feedback when prewarmed inventory fails', async () => {
    const user = userEvent.setup();
    mockEnqueueErrorSnackBar.mockClear();

    renderOverview([
      overviewMock,
      {
        request: { query: GET_MANAGED_EMAIL_PREWARMED_BUNDLES },
        error: new Error('INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER'),
      },
    ]);

    await user.click(
      await screen.findByRole('button', {
        name: 'Browse prewarmed inventory',
      }),
    );

    expect(
      await screen.findByText('No prewarmed bundles are available right now.'),
    ).toBeVisible();
    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Prewarmed inventory is unavailable right now.',
    });
    expect(
      screen.queryByText('INTERNAL_PROVIDER_DETAIL_MUST_NOT_RENDER'),
    ).not.toBeInTheDocument();
  });

  it('takes a selected prewarmed bundle through proposal, quote, purchase, and progress', async () => {
    const user = userEvent.setup();
    const prewarmedBundle = {
      bundleId: 'bundle-creator-network-20260806',
      domain: 'creator-network.com',
      exclusiveWorkspaceUse: true,
      mailboxCount: 2,
      mailboxes: [
        { address: 'maya@creator-network.com', displayName: 'Maya Chen' },
        { address: 'alex@creator-network.com', displayName: 'Alex Smith' },
      ],
      observedAt: '2026-08-06T12:00:00.000Z',
    };
    const prewarmedProposal = {
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
            {
              address: 'alex@creator-network.com',
              displayName: 'Alex Smith',
              roleTitle: 'Partnerships',
            },
          ],
        },
      ],
      expiresAt: '2026-08-06T13:00:00.000Z',
      id: 'prewarmed-proposal-1',
      mailboxCount: 2,
      policyVersion: 'policy-1',
    };
    const prewarmedQuote = {
      currency: 'USD',
      disclosures: prewarmedProposal.disclosures,
      dueTodayCents: 24690,
      isSandbox: true,
      expiresAt: '2026-08-06T13:00:00.000Z',
      id: 'prewarmed-quote-1',
      lines: [
        {
          amountCents: 24690,
          billingFrequency: 'MONTHLY',
          endingBefore: '2026-09-06T12:00:00.000Z',
          productKey: 'managed_mailbox_month',
          quantity: 2,
          startingAt: '2026-08-06T12:00:00.000Z',
          unitPriceCents: 12345,
        },
      ],
      quoteFingerprint: 'prewarmed-fingerprint-1',
      quoteVersion: 'quote-v1',
    };

    renderOverview([
      overviewMock,
      {
        request: { query: GET_MANAGED_EMAIL_PREWARMED_BUNDLES },
        result: { data: { managedEmailPrewarmedBundles: [prewarmedBundle] } },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_PREWARMED_PROPOSAL,
          variables: (variables) =>
            variables.input.bundleId === 'bundle-creator-network-20260806',
        },
        result: { data: { managedEmailPrewarmedProposal: prewarmedProposal } },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_QUOTE,
          variables: { input: { proposalId: 'prewarmed-proposal-1' } },
        },
        result: { data: { managedEmailQuote: prewarmedQuote } },
      },
      {
        request: { query: PREPARE_MANAGED_EMAIL_PAYMENT_METHOD },
        result: {
          data: {
            prepareManagedEmailPaymentMethod: {
              clientSecret: 'seti_prewarmed_secret',
              publishableKey: 'pk_test_prewarmed',
              ready: true,
              setupIntentId: 'seti_prewarmed',
            },
          },
        },
      },
      {
        request: {
          query: COMPLETE_MANAGED_EMAIL_PAYMENT_METHOD,
          variables: (variables) =>
            variables.input.setupIntentId === 'seti_prewarmed',
        },
        result: {
          data: { completeManagedEmailPaymentMethod: { ready: true } },
        },
      },
      {
        request: {
          query: CONFIRM_MANAGED_EMAIL_PREWARMED_PURCHASE,
          variables: (variables) =>
            variables.input.quoteId === 'prewarmed-quote-1' &&
            variables.input.quoteVersion === 'quote-v1' &&
            variables.input.quoteFingerprint === 'prewarmed-fingerprint-1' &&
            typeof variables.input.idempotencyKey === 'string',
        },
        result: {
          data: {
            confirmManagedEmailPrewarmedPurchase: {
              accepted: true,
              operationId: 'prewarmed-operation-1',
            },
          },
        },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_OPERATION,
          variables: { input: { operationId: 'prewarmed-operation-1' } },
        },
        result: {
          data: {
            managedEmailOperation: {
              acquisitionMode: 'PREWARMED',
              amountCents: '24690',
              createdAt: '2026-08-06T12:00:00.000Z',
              currency: 'USD',
              id: 'prewarmed-operation-1',
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
      await screen.findByRole('button', {
        name: 'Browse prewarmed inventory',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: /^Select whole bundle/ }),
    );

    expect(
      await screen.findByRole('button', { name: /^Confirm and pay \$246\.90/ }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: /^Confirm and pay \$246\.90/ }),
    );
    await user.click(screen.getByRole('button', { name: /^Confirm purchase/ }));
    expect(
      await screen.findByRole('heading', { name: 'Payment pending' }),
    ).toBeVisible();
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
      isSandbox: false,
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
        request: { query: PREPARE_MANAGED_EMAIL_PAYMENT_METHOD },
        result: {
          data: {
            prepareManagedEmailPaymentMethod: {
              clientSecret: 'seti_ordinary_secret',
              publishableKey: 'pk_test_ordinary',
              ready: true,
              setupIntentId: 'seti_ordinary',
            },
          },
        },
      },
      {
        request: {
          query: COMPLETE_MANAGED_EMAIL_PAYMENT_METHOD,
          variables: (variables) =>
            variables.input.setupIntentId === 'seti_ordinary',
        },
        result: {
          data: { completeManagedEmailPaymentMethod: { ready: true } },
        },
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
        delay: 100,
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
      await screen.findByRole('button', { name: 'Set up managed email' }),
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

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(
            'managed-email-purchase-intent:workspace-a',
          ) ?? '',
        ),
      ).toMatchObject({
        acquisitionMode: 'NEW_MANAGED',
        operationId: null,
        quoteFingerprint: 'fingerprint-1',
        quoteId: 'quote-1',
        quoteVersion: 'quote-v1',
      });
    });
    expect(
      await screen.findByRole('heading', { name: 'Payment pending' }),
    ).toBeVisible();
    expect(
      JSON.parse(
        window.localStorage.getItem(
          'managed-email-purchase-intent:workspace-a',
        ) ?? '',
      ),
    ).toMatchObject({
      acquisitionMode: 'NEW_MANAGED',
      operationId: 'operation-1',
      quoteFingerprint: 'fingerprint-1',
      quoteId: 'quote-1',
      quoteVersion: 'quote-v1',
    });
  });
  it('starts a customer-owned import directly, renders its quote, and preserves its selected mode on return', async () => {
    const user = userEvent.setup();
    const customerOwnedProposalInput = {
      acquisitionMode: 'CUSTOMER_OWNED_DOMAIN_IMPORT',
      customerOwnedDomain: 'creator-owned.test',
      mailboxCount: 2,
      personas: [
        {
          displayName: 'Maya Chen',
          localPartPreference: 'maya',
          roleTitle: 'Partnerships',
          signature: 'Thanks, Maya',
        },
        {
          displayName: 'Alex Smith',
          localPartPreference: 'alex',
          roleTitle: 'Growth',
          signature: 'Thanks, Alex',
        },
      ],
    };
    const customerOwnedProposal = {
      disclosures: {
        cancellation:
          'No annual domain charge. Customer-owned domains do not renew through Myah.',
        managedServiceOwnership:
          'You retain ownership of this domain and must update its registrar nameservers.',
        prepaidBalance: 'Email services do not use your AI balance.',
      },
      domains: [
        {
          domain: 'creator-owned.test',
          mailboxes: [
            {
              address: 'maya@creator-owned.test',
              displayName: 'Maya Chen',
              roleTitle: 'Partnerships',
            },
            {
              address: 'alex@creator-owned.test',
              displayName: 'Alex Smith',
              roleTitle: 'Growth',
            },
          ],
        },
      ],
      expiresAt: '2026-08-06T13:00:00.000Z',
      id: 'customer-owned-proposal-1',
      mailboxCount: 2,
      policyVersion: 'policy-1',
    };
    const customerOwnedQuote = {
      currency: 'USD',
      disclosures: customerOwnedProposal.disclosures,
      dueTodayCents: 29380,
      isSandbox: false,
      expiresAt: '2026-08-06T13:00:00.000Z',
      id: 'customer-owned-quote-1',
      lines: [
        {
          amountCents: 24690,
          billingFrequency: 'MONTHLY',
          endingBefore: '2026-09-06T12:00:00.000Z',
          productKey: 'managed_mailbox_month',
          quantity: 2,
          startingAt: '2026-08-06T12:00:00.000Z',
          unitPriceCents: 12345,
        },
        {
          amountCents: 4690,
          billingFrequency: 'MONTHLY',
          endingBefore: '2026-09-06T12:00:00.000Z',
          productKey: 'managed_warmup_month',
          quantity: 2,
          startingAt: '2026-08-06T12:00:00.000Z',
          unitPriceCents: 2345,
        },
      ],
      quoteFingerprint: 'customer-owned-fingerprint-1',
      quoteVersion: 'quote-v1',
    };

    renderOverview([
      overviewMock,
      {
        request: {
          query: GET_MANAGED_EMAIL_PROPOSAL,
          variables: { input: customerOwnedProposalInput },
        },
        result: { data: { managedEmailProposal: customerOwnedProposal } },
      },
      {
        request: {
          query: GET_MANAGED_EMAIL_QUOTE,
          variables: { input: { proposalId: 'customer-owned-proposal-1' } },
        },
        result: { data: { managedEmailQuote: customerOwnedQuote } },
      },
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Set up managed email' }),
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(
      screen.getByRole('button', { name: 'Use a domain I own' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Use a domain I own' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Customer-owned domain')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Use a domain I own' }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Customer-owned domain'),
      'creator-owned.test',
    );
    fireEvent.change(screen.getByLabelText('Mailbox count'), {
      target: { value: '2' },
    });
    await user.click(screen.getByRole('button', { name: /^Continue/ }));

    expect(screen.getByText(/complete initial mailbox set/i)).toBeVisible();
    expect(screen.getByText(/registrar/i)).toBeVisible();
    expect(screen.getByText(/nameserver/i)).toBeVisible();
    expect(screen.getByText(/cannot add mailboxes later/i)).toBeVisible();

    await user.type(screen.getByLabelText('Display name 1'), 'Maya Chen');
    await user.type(screen.getByLabelText('Role title 1'), 'Partnerships');
    await user.type(screen.getByLabelText('Preferred address 1'), 'maya');
    await user.type(screen.getByLabelText('Signature 1'), 'Thanks, Maya');
    await user.type(screen.getByLabelText('Display name 2'), 'Alex Smith');
    await user.type(screen.getByLabelText('Role title 2'), 'Growth');
    await user.type(screen.getByLabelText('Preferred address 2'), 'alex');
    await user.type(screen.getByLabelText('Signature 2'), 'Thanks, Alex');

    const reviewProposalButton = screen.getByRole('button', {
      name: /^Review proposal/,
    });
    expect(reviewProposalButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(reviewProposalButton).toBeEnabled();
    await user.click(reviewProposalButton);

    expect(
      await screen.findByText(
        'No annual domain charge. Customer-owned domains do not renew through Myah.',
      ),
    ).toBeVisible();
    expect(screen.getByText(/Managed mailbox/)).toBeVisible();
    expect(screen.getByText(/Managed warmup/)).toBeVisible();
    expect(screen.getAllByText('Monthly')).toHaveLength(2);
    expect(screen.queryByText('Annual')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Managed sending domain'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Use a domain I own' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Customer-owned domain')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Use a domain I own' }),
    ).not.toBeInTheDocument();
  });
});
