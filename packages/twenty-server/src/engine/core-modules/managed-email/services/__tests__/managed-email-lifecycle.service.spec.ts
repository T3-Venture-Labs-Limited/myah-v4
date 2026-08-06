import { PermissionFlagType } from 'twenty-shared/constants';
import { ManagedEmailAcquisitionOperationEntity } from '../../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../../entities/managed-email-mailbox.entity';
import { ManagedEmailCampaignEligibility } from '../../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailLifecycleAction } from '../../enums/managed-email-lifecycle-action.enum';
import { ManagedEmailWarmupState } from '../../enums/managed-email-warmup-state.enum';
import {
  WarmupInboxException,
  WarmupInboxExceptionCode,
} from '../../providers/warmup-inbox/warmup-inbox.exception';
import { ManagedEmailLifecycleService } from '../managed-email-lifecycle.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorId = '123e4567-e89b-42d3-a456-426614174001';
const operationId = '123e4567-e89b-42d3-a456-426614174002';
const domainId = '123e4567-e89b-42d3-a456-426614174003';
const mailboxId = '123e4567-e89b-42d3-a456-426614174004';
const rateCardId = '123e4567-e89b-42d3-a456-426614174005';
const customerId = '123e4567-e89b-42d3-a456-426614174006';
const contractId = '123e4567-e89b-42d3-a456-426614174007';
const domainSubscriptionId = '123e4567-e89b-42d3-a456-426614174008';
const mailboxSubscriptionId = '123e4567-e89b-42d3-a456-426614174009';
const warmupSubscriptionId = '123e4567-e89b-42d3-a456-426614174010';
const acquisitionStart = new Date('2026-08-01T00:00:00.000Z');
const monthlyBoundary = new Date('2026-09-01T00:00:00.000Z');
const nextMonthlyBoundary = new Date('2026-10-01T00:00:00.000Z');
const annualBoundary = new Date('2027-08-01T00:00:00.000Z');
const nextAnnualBoundary = new Date('2028-08-01T00:00:00.000Z');

const invoiceLine = ({
  endingBefore,
  productId,
  quantity = 1,
  startingAt,
  subscriptionId,
  total,
  unitPrice,
}: {
  endingBefore: Date;
  productId: string;
  quantity?: number;
  startingAt: Date;
  subscriptionId: string;
  total: number;
  unitPrice: number;
}) => ({
  endingBefore: endingBefore.toISOString(),
  hasAppliedCommitOrCredit: false,
  isProrated: false,
  productId,
  quantity,
  startingAt: startingAt.toISOString(),
  subscriptionId,
  total,
  type: 'subscription',
  unitPrice,
});

const monthlyInvoice = (externalStatus: string) => ({
  contractId,
  creditType: { id: 'usd-credit-type', name: 'USD' },
  customerId,
  endingBefore: nextMonthlyBoundary.toISOString(),
  externalInvoice: {
    billingProvider: 'stripe',
    externalPaymentId:
      externalStatus === 'PAID' ? 'pi_managed_email_monthly' : null,
    externalStatus,
    invoiceId: 'in_managed_email_monthly',
    invoicedTotal: 4500,
  },
  id: 'metronome-invoice-monthly',
  lines: [
    invoiceLine({
      endingBefore: nextMonthlyBoundary,
      productId: 'product-mailbox-month',
      startingAt: monthlyBoundary,
      subscriptionId: mailboxSubscriptionId,
      total: 500,
      unitPrice: 500,
    }),
    invoiceLine({
      endingBefore: nextMonthlyBoundary,
      productId: 'product-warmup-month',
      startingAt: monthlyBoundary,
      subscriptionId: warmupSubscriptionId,
      total: 4000,
      unitPrice: 4000,
    }),
  ],
  startingAt: monthlyBoundary.toISOString(),
  status: 'FINALIZED',
  total: 4500,
});

const annualInvoice = () => ({
  contractId,
  creditType: { id: 'usd-credit-type', name: 'USD' },
  customerId,
  endingBefore: nextAnnualBoundary.toISOString(),
  externalInvoice: {
    billingProvider: 'stripe',
    externalPaymentId: 'pi_managed_email_annual',
    externalStatus: 'PAID',
    invoiceId: 'in_managed_email_annual',
    invoicedTotal: 1000,
  },
  id: 'metronome-invoice-annual',
  lines: [
    invoiceLine({
      endingBefore: nextAnnualBoundary,
      productId: 'product-domain-year',
      startingAt: annualBoundary,
      subscriptionId: domainSubscriptionId,
      total: 1000,
      unitPrice: 1000,
    }),
  ],
  startingAt: annualBoundary.toISOString(),
  status: 'FINALIZED',
  total: 1000,
});

const expectedLineItems = [
  {
    currency: 'USD' as const,
    metronomeProductId: 'product-domain-year',
    periodEnd: annualBoundary.toISOString(),
    periodStart: acquisitionStart.toISOString(),
    productKey: 'managed_sending_domain_year' as const,
    productTag: 'myah-managed-sending-domain-year',
    quantity: 1,
    totalCents: 1000,
    unitPriceCents: 1000,
  },
  {
    currency: 'USD' as const,
    metronomeProductId: 'product-mailbox-month',
    periodEnd: monthlyBoundary.toISOString(),
    periodStart: acquisitionStart.toISOString(),
    productKey: 'managed_mailbox_month' as const,
    productTag: 'myah-managed-mailbox-month',
    quantity: 1,
    totalCents: 500,
    unitPriceCents: 500,
  },
  {
    currency: 'USD' as const,
    metronomeProductId: 'product-warmup-month',
    periodEnd: monthlyBoundary.toISOString(),
    periodStart: acquisitionStart.toISOString(),
    productKey: 'managed_warmup_month' as const,
    productTag: 'myah-managed-warmup-month',
    quantity: 1,
    totalCents: 4000,
    unitPriceCents: 4000,
  },
];

const makeOperation = () =>
  ({
    expectedLineItems,
    id: operationId,
    metronomeContractId: contractId,
    metronomeCustomerId: customerId,
    metronomeRateCardId: rateCardId,
    metronomeSubscriptionIds: [
      domainSubscriptionId,
      mailboxSubscriptionId,
      warmupSubscriptionId,
    ],
    nextSubscriptionReconciliationAt: monthlyBoundary,
    pendingRenewalProjection: null,
    workspaceId,
  }) as unknown as ManagedEmailAcquisitionOperationEntity;

const makeDomain = (overrides: Partial<ManagedEmailDomainEntity> = {}) =>
  ({
    acquisitionOperationId: operationId,
    cancelAtPeriodEnd: false,
    id: domainId,
    infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
    metronomeSubscriptionId: domainSubscriptionId,
    nextPeriodBoundaryAt: null,
    paidThrough: annualBoundary,
    pendingLifecycleAction: null,
    pendingLifecycleKey: null,
    providerDomainId: 'icemail-domain-1',
    renewalEnabled: true,
    safeFailureCode: null,
    workspaceId,
    ...overrides,
  }) as ManagedEmailDomainEntity;

const makeMailbox = (overrides: Partial<ManagedEmailMailboxEntity> = {}) =>
  ({
    acquisitionOperationId: operationId,
    campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
    connectedAccountId: 'connected-account-1',
    id: mailboxId,
    infrastructureCancelAtPeriodEnd: false,
    infrastructurePaidThrough: monthlyBoundary,
    infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
    managedEmailDomainId: domainId,
    messageChannelId: 'message-channel-1',
    metronomeMailboxSubscriptionId: mailboxSubscriptionId,
    metronomeWarmupSubscriptionId: warmupSubscriptionId,
    nextPeriodBoundaryAt: null,
    pendingLifecycleAction: null,
    pendingLifecycleKey: null,
    providerMailboxId: 'icemail-mailbox-1',
    safeFailureCode: null,
    warmupCancelAtPeriodEnd: false,
    warmupEnrollmentId: 'warmup-inbox-1',
    warmupPaidThrough: monthlyBoundary,
    warmupState: ManagedEmailWarmupState.MAINTENANCE,
    workspaceId,
    ...overrides,
  }) as ManagedEmailMailboxEntity;

const matches = <T extends object>(value: T, where: Partial<T>) =>
  Object.entries(where).every(
    ([key, expected]) => value[key as keyof T] === expected,
  );

const createWorkspaceRepository = <T extends { id: string }>(records: T[]) => {
  const repository = {
    find: jest.fn(
      async (_workspaceId: string, options?: { where?: Partial<T> }) =>
        options?.where === undefined
          ? records
          : records.filter((record) => matches(record, options.where ?? {})),
    ),
    findOne: jest.fn(
      async (
        _workspaceId: string,
        options: { where: Partial<T>; lock?: unknown },
      ) => records.find((record) => matches(record, options.where)) ?? null,
    ),
    findOneBy: jest.fn(
      async (_workspaceId: string, where: Partial<T>) =>
        records.find((record) => matches(record, where)) ?? null,
    ),
    update: jest.fn(
      async (_workspaceId: string, where: Partial<T>, patch: Partial<T>) => {
        const matching = records.filter((record) => matches(record, where));
        matching.forEach((record) => Object.assign(record, patch));
        return { affected: matching.length, generatedMaps: [], raw: [] };
      },
    ),
  };

  return {
    ...repository,
    withManager: jest.fn(() => repository),
  };
};

type HarnessOptions = {
  domain?: Partial<ManagedEmailDomainEntity>;
  mailbox?: Partial<ManagedEmailMailboxEntity>;
  now?: Date;
  permitted?: boolean;
};

const createHarness = (options: HarnessOptions = {}) => {
  const domains = [makeDomain(options.domain)];
  const mailboxes = [makeMailbox(options.mailbox)];
  const operations = [makeOperation()];
  const domainRepository = createWorkspaceRepository(domains);
  const mailboxRepository = createWorkspaceRepository(mailboxes);
  const operationRepository = createWorkspaceRepository(operations);
  const entityManager = {
    query: jest.fn().mockResolvedValue([]),
  };
  let transactionTail = Promise.resolve();
  const dataSource = {
    transaction: jest.fn(
      <T>(work: (manager: typeof entityManager) => Promise<T>): Promise<T> => {
        const result = transactionTail.then(() => work(entityManager));

        transactionTail = result.then(
          () => undefined,
          () => undefined,
        );

        return result;
      },
    ),
  };
  const metronomeClient = {
    getRateCard: jest.fn().mockResolvedValue({
      aliases: [],
      fiatCreditType: { id: 'usd-credit-type', name: 'USD' },
      id: rateCardId,
    }),
    listInvoicesFirstPage: jest.fn().mockResolvedValue({
      hasNextPage: false,
      invoices: [monthlyInvoice('PAID')],
    }),
    scheduleSubscriptionQuantity: jest.fn().mockResolvedValue({
      metronomeEditId: 'edit-1',
      subscriptionId: warmupSubscriptionId,
    }),
  };
  const warmupInboxClient = {
    getInbox: jest.fn().mockResolvedValue({
      id: 'warmup-inbox-1',
      status: 'paused',
    }),
    pause: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
  };
  const icemailClient = {
    deleteDomainMailboxes: jest.fn().mockResolvedValue({
      mode: 'immediate',
      results: [
        {
          domainId: 'icemail-domain-1',
          failed: false,
          mailboxIds: ['icemail-mailbox-1'],
          skipped: false,
        },
      ],
      summary: {
        domainsFailed: 0,
        domainsProcessed: 1,
        domainsRequested: 1,
        domainsSkipped: 0,
        mailboxesAffected: 1,
      },
    }),
    getDomain: jest.fn().mockResolvedValue({
      active: true,
      expiresAt: annualBoundary,
      id: 'icemail-domain-1',
    }),
    getMailbox: jest.fn().mockResolvedValue(null),
  };
  const now = options.now ?? new Date('2026-09-01T02:00:00.000Z');
  const permissionsService = {
    userHasWorkspaceSettingPermission: jest
      .fn()
      .mockResolvedValue(options.permitted ?? true),
  };
  const service = new ManagedEmailLifecycleService(
    mailboxRepository as never,
    domainRepository as never,
    operationRepository as never,
    dataSource as never,
    metronomeClient as never,
    warmupInboxClient as never,
    icemailClient as never,
    permissionsService as never,
    () => now,
  );

  return {
    dataSource,
    entityManager,
    domainRepository,
    domains,
    icemailClient,
    mailboxRepository,
    mailboxes,

    metronomeClient,
    operationRepository,
    operations,
    permissionsService,
    service,
    warmupInboxClient,
  };
};

const mailboxActionInput = {
  actorId,
  idempotencyKey: 'lifecycle-action-1',
  mailboxId,
  workspaceId,
};

describe('ManagedEmailLifecycleService', () => {
  it('extends exact paid monthly mailbox and warmup entitlements monotonically', async () => {
    const test = createHarness();

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.mailboxes[0].infrastructurePaidThrough).toEqual(
      nextMonthlyBoundary,
    );
    expect(test.mailboxes[0].warmupPaidThrough).toEqual(nextMonthlyBoundary);

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.mailboxes[0].infrastructurePaidThrough).toEqual(
      nextMonthlyBoundary,
    );
    expect(test.mailboxes[0].warmupPaidThrough).toEqual(nextMonthlyBoundary);
  });

  it('serializes paid renewal with cancellation boundary selection', async () => {
    const test = createHarness({
      now: new Date('2026-08-31T22:00:00.000Z'),
    });
    let signalInvoiceListStarted!: () => void;
    const invoiceListStarted = new Promise<void>((resolve) => {
      signalInvoiceListStarted = resolve;
    });
    let releaseInvoiceList!: () => void;
    const invoiceListGate = new Promise<void>((resolve) => {
      releaseInvoiceList = resolve;
    });
    test.metronomeClient.listInvoicesFirstPage.mockImplementationOnce(
      async () => {
        signalInvoiceListStarted();
        await invoiceListGate;
        return {
          hasNextPage: false,
          invoices: [monthlyInvoice('PAID')],
        };
      },
    );
    const transactionImplementation =
      test.dataSource.transaction.getMockImplementation();
    if (transactionImplementation === undefined) {
      throw new Error('Transaction test double is not configured');
    }
    let signalCancellationQueued!: () => void;
    const cancellationQueued = new Promise<void>((resolve) => {
      signalCancellationQueued = resolve;
    });
    test.dataSource.transaction.mockImplementation((work) => {
      const result = transactionImplementation(work);
      if (test.dataSource.transaction.mock.calls.length === 2) {
        signalCancellationQueued();
      }
      return result;
    });

    const reconciliation = test.service.reconcileSubscriptions({
      operationId,
      workspaceId,
    });
    await invoiceListStarted;
    const cancellation =
      test.service.cancelWarmupAtPeriodEnd(mailboxActionInput);
    await cancellationQueued;
    releaseInvoiceList();

    await Promise.all([reconciliation, cancellation]);

    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: nextMonthlyBoundary,
      warmupCancelAtPeriodEnd: true,
      warmupPaidThrough: nextMonthlyBoundary,
    });
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveAt: nextMonthlyBoundary.toISOString(),
        subscriptionId: warmupSubscriptionId,
      }),
    );
  });

  it('reconciles an already-paid renewal before cancellation wins the lock', async () => {
    const test = createHarness({
      now: new Date('2026-08-31T22:00:00.000Z'),
    });
    let signalCancellationEditStarted!: () => void;
    const cancellationEditStarted = new Promise<void>((resolve) => {
      signalCancellationEditStarted = resolve;
    });
    let releaseCancellationEdit!: () => void;
    const cancellationEditGate = new Promise<void>((resolve) => {
      releaseCancellationEdit = resolve;
    });
    test.metronomeClient.scheduleSubscriptionQuantity.mockImplementationOnce(
      async () => {
        signalCancellationEditStarted();
        await cancellationEditGate;
        return {
          metronomeEditId: 'edit-1',
          subscriptionId: warmupSubscriptionId,
        };
      },
    );
    const transactionImplementation =
      test.dataSource.transaction.getMockImplementation();
    if (transactionImplementation === undefined) {
      throw new Error('Transaction test double is not configured');
    }
    let signalReconciliationQueued!: () => void;
    const reconciliationQueued = new Promise<void>((resolve) => {
      signalReconciliationQueued = resolve;
    });
    let reconciliationRequested = false;
    test.dataSource.transaction.mockImplementation((work) => {
      const result = transactionImplementation(work);
      if (reconciliationRequested) {
        signalReconciliationQueued();
      }
      return result;
    });

    const cancellation =
      test.service.cancelWarmupAtPeriodEnd(mailboxActionInput);
    await cancellationEditStarted;
    reconciliationRequested = true;
    const reconciliation = test.service.reconcileSubscriptions({
      operationId,
      workspaceId,
    });
    await reconciliationQueued;
    releaseCancellationEdit();

    await Promise.all([cancellation, reconciliation]);

    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: nextMonthlyBoundary,
      warmupCancelAtPeriodEnd: true,
      warmupPaidThrough: nextMonthlyBoundary,
    });
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveAt: nextMonthlyBoundary.toISOString(),
        subscriptionId: warmupSubscriptionId,
      }),
    );
  });

  it('reconciles renewal invoices at the documented pre-boundary lead time', async () => {
    const test = createHarness({
      now: new Date('2026-08-31T22:00:00.000Z'),
    });

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.metronomeClient.listInvoicesFirstPage).toHaveBeenCalledTimes(1);
    expect(test.mailboxes[0].infrastructurePaidThrough).toEqual(
      nextMonthlyBoundary,
    );
    expect(test.mailboxes[0].warmupPaidThrough).toEqual(nextMonthlyBoundary);
  });

  it('extends an exact paid annual domain entitlement', async () => {
    const test = createHarness({
      mailbox: {
        infrastructurePaidThrough: new Date('2027-09-01T00:00:00.000Z'),
        warmupPaidThrough: new Date('2027-09-01T00:00:00.000Z'),
      },
      now: new Date('2027-08-01T02:00:00.000Z'),
    });
    test.metronomeClient.listInvoicesFirstPage.mockResolvedValueOnce({
      hasNextPage: false,
      invoices: [annualInvoice()],
    });

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.domains[0].paidThrough).toEqual(nextAnnualBoundary);
  });

  it.each(['OPEN', 'FINALIZED'])(
    'does not extend entitlement for an externally %s invoice',
    async (externalStatus) => {
      const test = createHarness();
      test.metronomeClient.listInvoicesFirstPage.mockResolvedValueOnce({
        hasNextPage: false,
        invoices: [monthlyInvoice(externalStatus)],
      });

      await test.service.reconcileSubscriptions({ operationId, workspaceId });

      expect(test.mailboxes[0].infrastructurePaidThrough).toEqual(
        monthlyBoundary,
      );
      expect(test.mailboxes[0].warmupPaidThrough).toEqual(monthlyBoundary);
    },
  );

  it('does not extend a paid invoice whose exact customer correlation differs', async () => {
    const test = createHarness();
    test.metronomeClient.listInvoicesFirstPage.mockResolvedValueOnce({
      hasNextPage: false,
      invoices: [{ ...monthlyInvoice('PAID'), customerId: 'wrong-customer' }],
    });

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.mailboxes[0].infrastructurePaidThrough).toEqual(
      monthlyBoundary,
    );
  });

  it('marks documented PAYMENT_FAILED resources action-required without AI prepaid', async () => {
    const test = createHarness();
    test.metronomeClient.listInvoicesFirstPage.mockResolvedValueOnce({
      hasNextPage: false,
      invoices: [monthlyInvoice('PAYMENT_FAILED')],
    });

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.mailboxes[0].infrastructureState).toBe(
      ManagedEmailInfrastructureState.PAYMENT_REQUIRED,
    );
    expect(test.mailboxes[0].warmupState).toBe(
      ManagedEmailWarmupState.ACTION_REQUIRED,
    );
    expect(test.mailboxes[0].campaignEligibility).toBe(
      ManagedEmailCampaignEligibility.BLOCKED,
    );

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });
    expect(test.warmupInboxClient.pause).toHaveBeenCalledWith('warmup-inbox-1');
    expect(test.icemailClient.deleteDomainMailboxes).toHaveBeenCalledWith({
      domainIds: ['icemail-domain-1'],
      mode: 'immediate',
    });
    expect(test.mailboxes[0].infrastructureState).toBe(
      ManagedEmailInfrastructureState.INACTIVE,
    );
  });

  it('records warmup cancellation before scheduling only its subscription quantity', async () => {
    const test = createHarness({
      now: new Date('2026-08-20T00:00:00.000Z'),
    });

    await test.service.cancelWarmupAtPeriodEnd(mailboxActionInput);

    expect(test.mailboxes[0]).toMatchObject({
      infrastructureCancelAtPeriodEnd: false,
      nextPeriodBoundaryAt: monthlyBoundary,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END,
      pendingLifecycleKey: mailboxActionInput.idempotencyKey,
      warmupCancelAtPeriodEnd: true,
      warmupState: ManagedEmailWarmupState.MAINTENANCE,
    });
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId,
        customerId,
        effectiveAt: monthlyBoundary.toISOString(),
        quantity: 0,
        subscriptionId: warmupSubscriptionId,
      }),
    );
    expect(
      test.mailboxRepository.update.mock.invocationCallOrder[0],
    ).toBeLessThan(
      test.metronomeClient.scheduleSubscriptionQuantity.mock
        .invocationCallOrder[0],
    );
  });

  it('preserves an immediate warmup pause when renewal is cancelled', async () => {
    const test = createHarness({
      mailbox: {
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
      now: new Date('2026-08-20T00:00:00.000Z'),
    });

    await test.service.cancelWarmupAtPeriodEnd(mailboxActionInput);

    expect(test.mailboxes[0]).toMatchObject({
      warmupCancelAtPeriodEnd: true,
      warmupState: ManagedEmailWarmupState.PAUSED,
    });
  });

  it('preserves the shared subscription quantity for an active sibling', async () => {
    const test = createHarness({
      now: new Date('2026-08-20T00:00:00.000Z'),
    });
    test.mailboxes.push(
      makeMailbox({
        id: '123e4567-e89b-42d3-a456-426614174099',
        providerMailboxId: 'icemail-mailbox-2',
        warmupEnrollmentId: 'warmup-inbox-2',
      }),
    );

    await test.service.cancelWarmupAtPeriodEnd(mailboxActionInput);

    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1,
        subscriptionId: warmupSubscriptionId,
      }),
    );
  });

  it('serializes sibling edits to one shared subscription', async () => {
    const test = createHarness({
      now: new Date('2026-08-20T00:00:00.000Z'),
    });
    const siblingId = '123e4567-e89b-42d3-a456-426614174099';
    test.mailboxes.push(
      makeMailbox({
        id: siblingId,
        providerMailboxId: 'icemail-mailbox-2',
        warmupEnrollmentId: 'warmup-inbox-2',
      }),
    );

    await Promise.all([
      test.service.cancelWarmupAtPeriodEnd(mailboxActionInput),
      test.service.cancelWarmupAtPeriodEnd({
        ...mailboxActionInput,
        idempotencyKey: 'lifecycle-action-2',
        mailboxId: siblingId,
      }),
    ]);

    const lockQuery = 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))';
    const expectedLockCalls = [
      domainSubscriptionId,
      mailboxSubscriptionId,
      warmupSubscriptionId,
      domainSubscriptionId,
      mailboxSubscriptionId,
      warmupSubscriptionId,
      warmupSubscriptionId,
      warmupSubscriptionId,
    ].map((subscriptionId) => [
      lockQuery,
      [`managed-email:${workspaceId}:${subscriptionId}`],
    ]);
    expect(test.entityManager.query.mock.calls).toEqual(expectedLockCalls);
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: 0 }));
  });

  it('atomically rejects a different concurrent action on the same mailbox', async () => {
    const test = createHarness({
      now: new Date('2026-08-20T00:00:00.000Z'),
    });

    const results = await Promise.allSettled([
      test.service.cancelWarmupAtPeriodEnd(mailboxActionInput),
      test.service.stopMailboxAtPeriodEnd({
        ...mailboxActionInput,
        idempotencyKey: 'lifecycle-action-2',
      }),
    ]);

    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(test.mailboxRepository.findOne).toHaveBeenCalledWith(workspaceId, {
      lock: { mode: 'pessimistic_write' },
      where: { id: mailboxId },
    });
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledTimes(1);
  });

  it('pauses warmup immediately without ending renewal or mailbox service', async () => {
    const test = createHarness();

    await test.service.pauseWarmupNow(mailboxActionInput);

    expect(test.warmupInboxClient.pause).toHaveBeenCalledWith('warmup-inbox-1');
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).not.toHaveBeenCalled();
    expect(test.mailboxes[0]).toMatchObject({
      infrastructureCancelAtPeriodEnd: false,
      warmupCancelAtPeriodEnd: false,
      warmupState: ManagedEmailWarmupState.PAUSED,
    });
  });

  it('reconciles an uncertain pause by reading provider state', async () => {
    const test = createHarness();
    test.warmupInboxClient.pause.mockRejectedValueOnce(
      new WarmupInboxException(
        WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
      ),
    );

    await test.service.pauseWarmupNow(mailboxActionInput);

    expect(test.warmupInboxClient.getInbox).toHaveBeenCalledWith(
      'warmup-inbox-1',
    );
    expect(test.mailboxes[0].warmupState).toBe(ManagedEmailWarmupState.PAUSED);
  });

  it('keeps an unconfirmed pause scheduled for reconciliation', async () => {
    const test = createHarness();
    test.warmupInboxClient.pause.mockRejectedValueOnce(
      new WarmupInboxException(
        WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
      ),
    );
    test.warmupInboxClient.getInbox.mockResolvedValueOnce({
      id: 'warmup-inbox-1',
      status: 'running',
    });

    await expect(
      test.service.pauseWarmupNow(mailboxActionInput),
    ).rejects.toThrow();

    expect(test.mailboxes[0]).toMatchObject({
      pendingLifecycleAction: ManagedEmailLifecycleAction.PAUSE_WARMUP_NOW,
      warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
    });
    expect(test.mailboxes[0].nextPeriodBoundaryAt).toBeInstanceOf(Date);
  });

  it('requires active paid warmup entitlement before resume', async () => {
    const expired = createHarness({
      mailbox: { warmupPaidThrough: new Date('2026-08-01T00:00:00.000Z') },
      now: new Date('2026-08-20T00:00:00.000Z'),
    });

    await expect(
      expired.service.resumeWarmup(mailboxActionInput),
    ).rejects.toThrow('Managed email warmup entitlement is inactive');
    expect(expired.warmupInboxClient.start).not.toHaveBeenCalled();

    const paid = createHarness({
      now: new Date('2026-08-20T00:00:00.000Z'),
    });
    await paid.service.resumeWarmup(mailboxActionInput);
    expect(paid.warmupInboxClient.start).toHaveBeenCalledWith('warmup-inbox-1');
  });

  it('stops mailbox separately without deleting warmup or synced history', async () => {
    const test = createHarness({
      now: new Date('2026-08-20T00:00:00.000Z'),
    });

    await test.service.stopMailboxAtPeriodEnd(mailboxActionInput);

    expect(test.mailboxes[0]).toMatchObject({
      connectedAccountId: 'connected-account-1',
      campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
      infrastructureCancelAtPeriodEnd: true,
      infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
      messageChannelId: 'message-channel-1',
      nextPeriodBoundaryAt: monthlyBoundary,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
      warmupCancelAtPeriodEnd: false,
    });
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 0,
        subscriptionId: mailboxSubscriptionId,
      }),
    );
    expect(test.warmupInboxClient.pause).not.toHaveBeenCalled();
    expect(test.icemailClient.deleteDomainMailboxes).not.toHaveBeenCalled();
  });

  it('blocks domain renewal disablement until every dependent mailbox is stopping', async () => {
    const test = createHarness();
    const input = {
      actorId,
      domainId,
      idempotencyKey: 'disable-domain-1',
      workspaceId,
    };

    await expect(test.service.disableDomainRenewal(input)).rejects.toThrow(
      'Managed email domain has active dependent mailboxes',
    );
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).not.toHaveBeenCalled();

    test.mailboxes[0].infrastructureCancelAtPeriodEnd = true;
    await test.service.disableDomainRenewal(input);

    expect(test.domains[0]).toMatchObject({
      cancelAtPeriodEnd: true,
      nextPeriodBoundaryAt: annualBoundary,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
      renewalEnabled: false,
    });
    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 0,
        subscriptionId: domainSubscriptionId,
      }),
    );
  });

  it('marks a domain inactive only after Icemail confirms it is absent', async () => {
    const test = createHarness({
      domain: {
        cancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: annualBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
        pendingLifecycleKey: 'disable-domain-1',
        renewalEnabled: false,
      },
      now: annualBoundary,
    });
    test.icemailClient.getDomain.mockResolvedValueOnce(null);

    await test.service.applyPeriodBoundary({
      resourceId: domainId,
      resourceType: 'domain',
      workspaceId,
    });

    expect(test.icemailClient.getDomain).toHaveBeenCalledWith(
      'icemail-domain-1',
    );
    expect(test.domains[0]).toMatchObject({
      infrastructureState: ManagedEmailInfrastructureState.INACTIVE,
      nextPeriodBoundaryAt: null,
      pendingLifecycleAction: null,
      safeFailureCode: null,
    });
  });

  it('fails closed when Icemail domain termination is unverified', async () => {
    const test = createHarness({
      domain: {
        cancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: annualBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
        pendingLifecycleKey: 'disable-domain-1',
        renewalEnabled: false,
      },
      now: annualBoundary,
    });

    await test.service.applyPeriodBoundary({
      resourceId: domainId,
      resourceType: 'domain',
      workspaceId,
    });

    expect(test.domains[0]).toMatchObject({
      infrastructureState:
        ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
      safeFailureCode: 'ICEMAIL_DOMAIN_TERMINATION_UNVERIFIED',
    });
    expect(test.domains[0].nextPeriodBoundaryAt).toBeInstanceOf(Date);
  });

  it('keeps domain termination pending when the Icemail read fails', async () => {
    const test = createHarness({
      domain: {
        cancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: annualBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
        pendingLifecycleKey: 'disable-domain-1',
        renewalEnabled: false,
      },
      now: annualBoundary,
    });
    test.icemailClient.getDomain.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    await expect(
      test.service.applyPeriodBoundary({
        resourceId: domainId,
        resourceType: 'domain',
        workspaceId,
      }),
    ).rejects.toThrow('provider unavailable');

    expect(test.domains[0]).toMatchObject({
      infrastructureState:
        ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
      safeFailureCode: 'ICEMAIL_DOMAIN_READ_FAILED',
    });
    expect(test.domains[0].nextPeriodBoundaryAt).toBeInstanceOf(Date);
  });

  it('applies a warmup period boundary idempotently', async () => {
    const test = createHarness({
      mailbox: {
        nextPeriodBoundaryAt: monthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END,
        pendingLifecycleKey: 'cancel-warmup-1',
        warmupCancelAtPeriodEnd: true,
        warmupState: ManagedEmailWarmupState.CANCEL_AT_PERIOD_END,
      },
    });
    const data = {
      resourceId: mailboxId,
      resourceType: 'mailbox' as const,
      workspaceId,
    };

    await test.service.applyPeriodBoundary(data);
    await test.service.applyPeriodBoundary(data);

    expect(test.warmupInboxClient.pause).toHaveBeenCalledTimes(1);
    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: null,
      pendingLifecycleAction: null,
      warmupState: ManagedEmailWarmupState.PAUSED,
    });
  });

  it('recovers a persisted immediate warmup pause after worker restart', async () => {
    const test = createHarness({
      mailbox: {
        nextPeriodBoundaryAt: new Date('2026-09-01T02:00:00.000Z'),
        pendingLifecycleAction: ManagedEmailLifecycleAction.PAUSE_WARMUP_NOW,
        pendingLifecycleKey: 'pause-warmup-1',
      },
    });

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(test.warmupInboxClient.pause).toHaveBeenCalledWith('warmup-inbox-1');
    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: null,
      pendingLifecycleAction: null,
      warmupState: ManagedEmailWarmupState.PAUSED,
    });
  });

  it('recovers a persisted paid warmup resume after worker restart', async () => {
    const test = createHarness({
      mailbox: {
        nextPeriodBoundaryAt: new Date('2026-08-20T00:00:00.000Z'),
        pendingLifecycleAction: ManagedEmailLifecycleAction.RESUME_WARMUP,
        pendingLifecycleKey: 'resume-warmup-1',
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
      now: new Date('2026-08-20T00:00:00.000Z'),
    });

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(test.warmupInboxClient.start).toHaveBeenCalledWith('warmup-inbox-1');
    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: null,
      pendingLifecycleAction: null,
      warmupState: ManagedEmailWarmupState.WARMING,
    });
  });

  it('never invokes domain-wide deletion while an unscheduled sibling remains', async () => {
    const test = createHarness({
      mailbox: {
        infrastructureCancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: monthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
        pendingLifecycleKey: 'stop-mailbox-1',
      },
    });
    test.mailboxes.push(
      makeMailbox({
        id: '123e4567-e89b-42d3-a456-426614174099',
        infrastructureCancelAtPeriodEnd: false,
        providerMailboxId: 'icemail-mailbox-2',
      }),
    );

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(test.icemailClient.deleteDomainMailboxes).not.toHaveBeenCalled();
    expect(test.mailboxes[0].infrastructureState).toBe(
      ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
    );
  });

  it('keeps local mailbox state recoverable for a skipped Icemail delete', async () => {
    const test = createHarness({
      mailbox: {
        infrastructureCancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: monthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
        pendingLifecycleKey: 'stop-mailbox-1',
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
    });
    test.icemailClient.deleteDomainMailboxes.mockResolvedValueOnce({
      mode: 'immediate',
      results: [
        {
          domainId: 'icemail-domain-1',
          failed: false,
          mailboxIds: [],
          skipped: true,
        },
      ],
      summary: {
        domainsFailed: 0,
        domainsProcessed: 0,
        domainsRequested: 1,
        domainsSkipped: 1,
        mailboxesAffected: 0,
      },
    });

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(test.mailboxes[0].infrastructureState).toBe(
      ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
    );
    expect(test.mailboxes[0].pendingLifecycleAction).toBe(
      ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
    );
  });

  it('verifies every sibling is absent before completing a domain-wide delete', async () => {
    const test = createHarness({
      mailbox: {
        infrastructureCancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: monthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
        pendingLifecycleKey: 'stop-mailbox-1',
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
    });
    const sibling = makeMailbox({
      id: '123e4567-e89b-42d3-a456-426614174099',
      infrastructureCancelAtPeriodEnd: true,
      nextPeriodBoundaryAt: monthlyBoundary,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
      pendingLifecycleKey: 'stop-mailbox-2',
      providerMailboxId: 'icemail-mailbox-2',
      warmupState: ManagedEmailWarmupState.PAUSED,
    });
    test.mailboxes.push(sibling);
    test.icemailClient.getMailbox
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        active: true,
        id: 'icemail-mailbox-2',
      });

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(test.icemailClient.getMailbox).toHaveBeenCalledWith(
      'icemail-mailbox-1',
    );
    expect(test.icemailClient.getMailbox).toHaveBeenCalledWith(
      'icemail-mailbox-2',
    );
    expect(test.mailboxes[0].infrastructureState).toBe(
      ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
    );
    expect(sibling.infrastructureState).toBe(
      ManagedEmailInfrastructureState.ACTIVE,
    );
  });

  it('reconciles uncertain Icemail deletion by read without blindly replaying it', async () => {
    const test = createHarness({
      mailbox: {
        infrastructureCancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: monthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
        pendingLifecycleKey: 'stop-mailbox-1',
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
    });
    test.icemailClient.deleteDomainMailboxes.mockRejectedValueOnce(
      new Error('write outcome uncertain'),
    );
    test.icemailClient.getMailbox
      .mockResolvedValueOnce({ active: true, id: 'icemail-mailbox-1' })
      .mockResolvedValueOnce(null);
    const data = {
      resourceId: mailboxId,
      resourceType: 'mailbox' as const,
      workspaceId,
    };

    await expect(test.service.applyPeriodBoundary(data)).rejects.toThrow();
    expect(test.mailboxes[0].infrastructureState).toBe(
      ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
    );

    await test.service.applyPeriodBoundary(data);

    expect(test.icemailClient.deleteDomainMailboxes).toHaveBeenCalledTimes(1);
    expect(test.icemailClient.getMailbox).toHaveBeenCalledWith(
      'icemail-mailbox-1',
    );
    expect(test.mailboxes[0]).toMatchObject({
      infrastructureState: ManagedEmailInfrastructureState.INACTIVE,
      nextPeriodBoundaryAt: null,
      pendingLifecycleAction: null,
    });
  });
  it('rejects lifecycle actions without workspace billing authority', async () => {
    const test = createHarness({ permitted: false });

    await expect(
      test.service.pauseWarmupNow(mailboxActionInput),
    ).rejects.toThrow();

    expect(
      test.permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      setting: PermissionFlagType.BILLING,
      userWorkspaceId: actorId,
      workspaceId,
    });
    expect(test.mailboxRepository.findOneBy).not.toHaveBeenCalled();
    expect(test.warmupInboxClient.pause).not.toHaveBeenCalled();
  });

  it('recovers a Metronome cancellation edit before arming provider offboarding', async () => {
    const now = new Date('2026-08-20T00:00:00.000Z');
    const test = createHarness({ now });

    const transactionImplementation =
      test.dataSource.transaction.getMockImplementation();
    if (transactionImplementation === undefined) {
      throw new Error('Transaction test double is not configured');
    }
    let committedTransactionCount = 0;
    test.dataSource.transaction.mockImplementation(async (work) => {
      const result = await transactionImplementation(work);
      committedTransactionCount += 1;
      return result;
    });
    test.metronomeClient.scheduleSubscriptionQuantity.mockImplementationOnce(
      async () => {
        expect(committedTransactionCount).toBe(1);
        throw new Error('Metronome unavailable');
      },
    );

    await expect(
      test.service.cancelWarmupAtPeriodEnd(mailboxActionInput),
    ).rejects.toThrow('Metronome unavailable');
    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: now,
      pendingLifecycleAction: 'CANCEL_WARMUP_SUBSCRIPTION_PENDING',
      pendingLifecycleKey: mailboxActionInput.idempotencyKey,
      warmupCancelAtPeriodEnd: true,
    });
    expect(test.warmupInboxClient.pause).not.toHaveBeenCalled();

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(
      test.metronomeClient.scheduleSubscriptionQuantity,
    ).toHaveBeenCalledTimes(2);
    expect(test.mailboxes[0]).toMatchObject({
      nextPeriodBoundaryAt: monthlyBoundary,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END,
    });
    expect(test.warmupInboxClient.pause).not.toHaveBeenCalled();
  });

  it('schedules provider offboarding at paid-through after renewal payment failure', async () => {
    const test = createHarness();

    test.metronomeClient.listInvoicesFirstPage.mockResolvedValueOnce({
      hasNextPage: false,
      invoices: [monthlyInvoice('PAYMENT_FAILED')],
    });

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.mailboxes[0]).toMatchObject({
      infrastructureCancelAtPeriodEnd: false,
      nextPeriodBoundaryAt: monthlyBoundary,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
      warmupCancelAtPeriodEnd: false,
    });
  });

  it('waits for every stopping sibling paid-through before domain-wide deletion', async () => {
    const test = createHarness({
      mailbox: {
        infrastructureCancelAtPeriodEnd: true,
        nextPeriodBoundaryAt: monthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
        pendingLifecycleKey: 'stop-mailbox-1',
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
    });
    test.mailboxes.push(
      makeMailbox({
        id: '123e4567-e89b-42d3-a456-426614174099',
        infrastructureCancelAtPeriodEnd: true,
        infrastructurePaidThrough: nextMonthlyBoundary,
        nextPeriodBoundaryAt: nextMonthlyBoundary,
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
        providerMailboxId: 'icemail-mailbox-2',
        warmupState: ManagedEmailWarmupState.PAUSED,
      }),
    );

    await test.service.applyPeriodBoundary({
      resourceId: mailboxId,
      resourceType: 'mailbox',
      workspaceId,
    });

    expect(test.icemailClient.deleteDomainMailboxes).not.toHaveBeenCalled();
    expect(test.mailboxes[1].infrastructureState).toBe(
      ManagedEmailInfrastructureState.ACTIVE,
    );
  });

  it('recovers a persisted paid renewal projection after a partial write', async () => {
    const test = createHarness();

    test.mailboxRepository.update.mockRejectedValueOnce(
      new Error('mailbox write failed'),
    );

    await expect(
      test.service.reconcileSubscriptions({ operationId, workspaceId }),
    ).rejects.toThrow('mailbox write failed');
    expect(
      (
        test.operations[0] as ManagedEmailAcquisitionOperationEntity & {
          pendingRenewalProjection: unknown;
        }
      ).pendingRenewalProjection,
    ).not.toBeNull();

    await test.service.reconcileSubscriptions({ operationId, workspaceId });

    expect(test.metronomeClient.listInvoicesFirstPage).toHaveBeenCalledTimes(1);
    expect(test.mailboxes[0].infrastructurePaidThrough).toEqual(
      nextMonthlyBoundary,
    );
    expect(test.mailboxes[0].warmupPaidThrough).toEqual(nextMonthlyBoundary);
    expect(
      (
        test.operations[0] as ManagedEmailAcquisitionOperationEntity & {
          pendingRenewalProjection: unknown;
        }
      ).pendingRenewalProjection,
    ).toBeNull();
  });
});
