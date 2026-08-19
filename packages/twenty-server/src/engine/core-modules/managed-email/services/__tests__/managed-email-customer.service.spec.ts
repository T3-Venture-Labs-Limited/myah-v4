import { ManagedEmailAcquisitionMode } from '../../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCustomerService } from '../managed-email-customer.service';
import { ManagedEmailCatalogService } from '../managed-email-catalog.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';
const proposalId = 'proposal-1';
const quoteId = 'quote-1';
const quoteFingerprint = 'quote-fingerprint-1';
const now = new Date('2026-08-06T12:00:00.000Z');
const bundleHandleId = '323e4567-e89b-42d3-a456-426614174099';

const proposal = {
  id: proposalId,
  workspaceId,
  actorWorkspaceMemberId,
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  mailboxCount: 2,
  policyVersion: 'sandbox-v1',
  domains: [
    {
      domain: 'creator-partners.test',
      mailboxes: [
        {
          address: 'maya@creator-partners.test',
          firstName: 'Maya',
          lastName: 'Chen',
        },
      ],
    },
  ],
  disclosures: {
    cancellation: 'Renewals can be stopped independently.',
    managedServiceOwnership: 'Managed sending domains are service assets.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
};

const quote = {
  id: quoteId,
  proposalId,
  workspaceId,
  actorWorkspaceMemberId,
  catalogVersion: 'quote-v1',
  quoteHash: quoteFingerprint,
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  currency: 'USD',
  dueTodayCents: 2_000,
  lines: [
    {
      productKey: 'managed_mailbox_month',
      quantity: 2,
      unitPriceCents: 1_000,
      amountCents: 2_000,
      billingFrequency: 'MONTHLY',
      startingAt: now,
      endingBefore: new Date('2026-09-06T12:00:00.000Z'),
    },
  ],
  disclosures: proposal.disclosures,
};

const createHarness = () => {
  const catalogService = {
    createQuote: jest.fn().mockResolvedValue(quote),
  } as unknown as jest.Mocked<Pick<ManagedEmailCatalogService, 'createQuote'>>;
  const offerService = {
    persistBundleSelection: jest.fn().mockResolvedValue({ id: bundleHandleId }),
    resolveBundleSelection: jest.fn().mockResolvedValue('inventory-1'),
    loadProposalForQuote: jest.fn().mockResolvedValue(proposal),
    persistQuote: jest.fn().mockResolvedValue(quote),
    reserveQuoteForPurchase: jest.fn().mockResolvedValue({
      operationId: 'operation-1',
      quote,
      replayed: false,
    }),
  };
  const acquisitionService = {
    admit: jest.fn().mockResolvedValue({ id: 'operation-1' }),
  };
  const proposalService = {
    listPrewarmedBundles: jest.fn().mockResolvedValue({
      observedAt: now,
      bundles: [
        {
          inventoryId: 'inventory-1',
          domain: 'creator-partners.test',
          domainPriceCents: 1_000,
          mailboxPriceCents: 500,
          mailboxCount: 2,
          mailboxes: [
            {
              address: 'maya@creator-partners.test',
              firstName: 'Maya',
              lastName: 'Chen',
              provider: 'ICEMAIL',
              master: true,
            },
          ],
        },
      ],
    }),
    createPrewarmedProposal: jest.fn().mockResolvedValue(proposal),
  };
  const readinessService = {
    assertApprovedPurchasePolicy: jest.fn(),
  };
  const domainRepository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
  const mailboxRepository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
  const operationRepository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS: [workspaceId],
          MANAGED_EMAIL_ENABLED: true,
          MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
          MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY: 'provider-config-sandbox',
          MANAGED_EMAIL_READINESS_POLICY_VERSION: 'sandbox-v1',
        })[key],
    ),
  };
  const service = new ManagedEmailCustomerService(
    domainRepository as never,
    mailboxRepository as never,
    operationRepository as never,
    {} as never,
    acquisitionService as never,
    proposalService as never,
    catalogService as never,
    offerService as never,
    config as never,
    readinessService as never,
  );
  return {
    service,
    catalogService,
    offerService,
    acquisitionService,
    readinessService,
    proposalService,
    config,
    domainRepository,
    mailboxRepository,
    operationRepository,
  };
};

const createMailboxSubscriptionProjectionFixture = ({
  correlatedSubscriptionLines,
  mailboxOverrides = {},
  operationOverrides = {},
}: {
  correlatedSubscriptionLines?: ReadonlyArray<Record<string, unknown>>;
  mailboxOverrides?: Record<string, unknown>;
  operationOverrides?: Record<string, unknown>;
} = {}) => {
  const paidThrough = new Date('2026-09-06T12:00:00.000Z');
  const expectedLine = {
    billingFrequency: 'MONTHLY',
    currency: 'USD',
    productKey: 'managed_mailbox_month',
    metronomeProductId: 'product-mailbox',
    quantity: 1,
    unitPriceCents: 650,
    totalCents: 650,
    periodEnd: paidThrough.toISOString(),
    periodStart: now.toISOString(),
  };
  const correlatedLine = {
    subscriptionId: 'subscription-mailbox',
    productId: 'product-mailbox',
    quantity: 1,
    unitPrice: 650,
    total: 650,
    startingAt: now.toISOString(),
    endingBefore: paidThrough.toISOString(),
    isProrated: false,
  };

  return {
    correlatedLine,
    expectedLine,
    mailbox: {
      id: 'mailbox-1',
      workspaceId,
      acquisitionOperationId: 'operation-1',
      normalizedAddress: 'maya@creator-partners.test',
      infrastructurePaidThrough: paidThrough,
      infrastructureCancelAtPeriodEnd: false,
      metronomeMailboxSubscriptionId: 'subscription-mailbox',
      infrastructureState: 'ACTIVE',
      pendingLifecycleAction: null,
      safeFailureCode: null,
      ...mailboxOverrides,
    },
    operation: {
      id: 'operation-1',
      workspaceId,
      paymentStatus: 'PAID',
      pendingRenewalProjection: null,
      safeFailureCode: null,
      state: 'PROVIDER_SUCCEEDED',
      expectedLineItems: [expectedLine],
      correlatedSubscriptionLines: correlatedSubscriptionLines ?? [
        correlatedLine,
      ],
      ...operationOverrides,
    },
    paidThrough,
  };
};

describe('ManagedEmailCustomerService customer checkout contracts', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('lists prewarmed bundles with actor-scoped opaque handles and no provider inventory IDs', async () => {
    const { service, proposalService, offerService } = createHarness();

    const result = await service.prewarmedBundles({
      actorId: actorWorkspaceMemberId,
      workspaceId,
    });

    expect(result).toEqual([
      {
        bundleId: bundleHandleId,
        domain: 'creator-partners.test',
        exclusiveWorkspaceUse: true,
        mailboxCount: 2,
        observedAt: now,
        providerType: 'ICEMAIL',
        mailboxes: [
          { address: 'maya@creator-partners.test', displayName: 'Maya Chen' },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('inventory-1');
    expect(offerService.persistBundleSelection).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      providerInventoryId: 'inventory-1',
      workspaceId,
    });
    expect(proposalService.listPrewarmedBundles).toHaveBeenCalledTimes(1);
  });

  it('resolves the selected opaque bundle handle before provider proposal creation', async () => {
    const { service, proposalService, offerService } = createHarness();

    await expect(
      service.prewarmedProposal({
        actorId: actorWorkspaceMemberId,
        bundleId: bundleHandleId,
        workspaceId,
      }),
    ).resolves.toMatchObject({ id: proposalId, mailboxCount: 2 });
    expect(offerService.resolveBundleSelection).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      bundleId: bundleHandleId,
      workspaceId,
    });
    expect(proposalService.createPrewarmedProposal).toHaveBeenCalledWith(
      { inventoryIds: ['inventory-1'] },
      {
        actorWorkspaceMemberId,
        workspaceId,
        workspaceSlug: workspaceId,
      },
    );
  });

  it('loads the persisted proposal, creates and persists a quote, and returns server-derived sandbox state', async () => {
    const { service, catalogService, offerService, config } = createHarness();

    await expect(
      service.quote({
        actorId: actorWorkspaceMemberId,
        proposalId,
        workspaceId,
      }),
    ).resolves.toMatchObject({
      isSandbox: true,
      quoteFingerprint,
      quoteVersion: quote.catalogVersion,
    });
    expect(offerService.loadProposalForQuote).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      proposalId,
      workspaceId,
    });
    expect(catalogService.createQuote).toHaveBeenCalledWith({ proposal });
    expect(offerService.persistQuote).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      proposalId,
      quote,
      workspaceId,
    });
    expect(config.get).toHaveBeenCalledWith('MANAGED_EMAIL_EXECUTION_MODE');
  });

  it('reserves the persisted quote before admission and supports durable replay recovery', async () => {
    const {
      service,
      offerService,
      acquisitionService,
      config,
      readinessService,
    } = createHarness();
    const input = {
      idempotencyKey: 'purchase-1',
      quoteFingerprint,
      quoteId,
      quoteVersion: quote.catalogVersion,
    };

    await expect(
      service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId: actorWorkspaceMemberId,
        input,
        workspaceId,
      }),
    ).resolves.toEqual({ accepted: true, operationId: 'operation-1' });
    expect(offerService.reserveQuoteForPurchase).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      idempotencyKey: input.idempotencyKey,
      operationId: expect.any(String),
      quoteFingerprint,
      quoteId,
      quoteVersion: input.quoteVersion,
      workspaceId,
    });
    expect(acquisitionService.admit).toHaveBeenCalledWith({
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorWorkspaceMemberId,
      idempotencyKey: input.idempotencyKey,
      operationId: 'operation-1',
      providerConfigurationKey: 'provider-config-sandbox',
      quote,
      readinessPolicyVersion: 'sandbox-v1',
      workspaceId,
    });
    expect(
      offerService.reserveQuoteForPurchase.mock.invocationCallOrder[0],
    ).toBeLessThan(acquisitionService.admit.mock.invocationCallOrder[0]);
    expect(readinessService.assertApprovedPurchasePolicy).toHaveBeenCalledWith({
      policyVersion: 'sandbox-v1',
      providerConfigurationKey: 'provider-config-sandbox',
    });
    expect(
      readinessService.assertApprovedPurchasePolicy.mock.invocationCallOrder[0],
    ).toBeLessThan(
      offerService.reserveQuoteForPurchase.mock.invocationCallOrder[0],
    );
    expect(config.get).toHaveBeenCalledWith(
      'MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY',
    );
    expect(config.get).toHaveBeenCalledWith(
      'MANAGED_EMAIL_READINESS_POLICY_VERSION',
    );

    offerService.reserveQuoteForPurchase.mockResolvedValueOnce({
      operationId: 'operation-1',
      quote,
      replayed: true,
    });
    await expect(
      service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId: actorWorkspaceMemberId,
        input,
        workspaceId,
      }),
    ).resolves.toEqual({ accepted: true, operationId: 'operation-1' });
    expect(acquisitionService.admit).toHaveBeenLastCalledWith(
      expect.objectContaining({ operationId: 'operation-1' }),
    );
  });
  it('rejects purchase before quote reservation when readiness policy approval is unavailable', async () => {
    const { service, readinessService, offerService, acquisitionService } =
      createHarness();
    readinessService.assertApprovedPurchasePolicy.mockImplementationOnce(() => {
      throw new Error('Managed email readiness policy is unavailable');
    });

    await expect(
      service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId: actorWorkspaceMemberId,
        input: {
          idempotencyKey: 'purchase-1',
          quoteFingerprint,
          quoteId,
          quoteVersion: quote.catalogVersion,
        },
        workspaceId,
      }),
    ).rejects.toThrow('Managed email readiness policy is unavailable');
    expect(offerService.reserveQuoteForPurchase).not.toHaveBeenCalled();
    expect(acquisitionService.admit).not.toHaveBeenCalled();
  });
  it('projects exact recurring lines and withholds unavailable domain cancellation', async () => {
    const {
      service,
      domainRepository,
      mailboxRepository,
      operationRepository,
    } = createHarness();
    const monthlyPaidThrough = new Date('2026-09-06T12:00:00.000Z');
    const annualPaidThrough = new Date('2027-08-06T12:00:00.000Z');

    operationRepository.find.mockResolvedValue([
      {
        id: 'operation-1',
        workspaceId,
        paymentStatus: 'PAID',
        pendingRenewalProjection: null,
        safeFailureCode: null,
        state: 'PROVIDER_SUCCEEDED',
        expectedLineItems: [
          {
            billingFrequency: 'ANNUAL',
            currency: 'USD',
            productKey: 'managed_sending_domain_year',
            metronomeProductId: 'product-domain',
            quantity: 1,
            unitPriceCents: 1_500,
            totalCents: 1_500,
            periodEnd: annualPaidThrough.toISOString(),
            periodStart: now.toISOString(),
          },
          {
            billingFrequency: 'MONTHLY',
            currency: 'USD',
            productKey: 'managed_mailbox_month',
            metronomeProductId: 'product-mailbox',
            quantity: 2,
            unitPriceCents: 650,
            totalCents: 1_300,
            periodEnd: monthlyPaidThrough.toISOString(),
            periodStart: now.toISOString(),
          },
          {
            billingFrequency: 'MONTHLY',
            currency: 'USD',
            productKey: 'managed_warmup_month',
            metronomeProductId: 'product-warmup',
            quantity: 2,
            unitPriceCents: 1_000,
            totalCents: 2_000,
            periodEnd: monthlyPaidThrough.toISOString(),
            periodStart: now.toISOString(),
          },
        ],
        correlatedSubscriptionLines: [
          {
            subscriptionId: 'subscription-domain',
            productId: 'product-domain',
            quantity: 1,
            unitPrice: 1_500,
            total: 1_500,
            isProrated: false,
            startingAt: now.toISOString(),
            endingBefore: annualPaidThrough.toISOString(),
          },
          {
            subscriptionId: 'subscription-mailbox',
            productId: 'product-mailbox',
            quantity: 2,
            unitPrice: 650,
            total: 1_300,
            isProrated: false,
            startingAt: now.toISOString(),
            endingBefore: monthlyPaidThrough.toISOString(),
          },
          {
            subscriptionId: 'subscription-warmup',
            productId: 'product-warmup',
            quantity: 2,
            unitPrice: 1_000,
            total: 2_000,
            isProrated: false,
            startingAt: now.toISOString(),
            endingBefore: monthlyPaidThrough.toISOString(),
          },
        ],
      },
    ]);
    domainRepository.find.mockResolvedValue([
      {
        id: 'domain-1',
        workspaceId,
        acquisitionOperationId: 'operation-1',
        normalizedDomain: 'creator-partners.test',
        paidThrough: annualPaidThrough,
        cancelAtPeriodEnd: false,
        metronomeSubscriptionId: 'subscription-domain',
        infrastructureState: 'ACTIVE',
        pendingLifecycleAction: null,
        safeFailureCode: null,
      },
    ]);
    mailboxRepository.find.mockResolvedValue([
      {
        id: 'mailbox-1',
        workspaceId,
        acquisitionOperationId: 'operation-1',
        managedEmailDomainId: 'domain-1',
        normalizedAddress: 'maya@creator-partners.test',
        infrastructurePaidThrough: monthlyPaidThrough,
        infrastructureCancelAtPeriodEnd: false,
        metronomeMailboxSubscriptionId: 'subscription-mailbox',
        infrastructureState: 'ACTIVE',
        pendingLifecycleAction: null,
        safeFailureCode: null,
        warmupPaidThrough: monthlyPaidThrough,
        warmupCancelAtPeriodEnd: false,
        metronomeWarmupSubscriptionId: 'subscription-warmup',
        warmupState: 'MAINTENANCE',
      },
      {
        id: 'mailbox-2',
        workspaceId,
        acquisitionOperationId: 'operation-1',
        managedEmailDomainId: 'domain-1',
        normalizedAddress: 'lin@creator-partners.test',
        infrastructurePaidThrough: monthlyPaidThrough,
        infrastructureCancelAtPeriodEnd: false,
        metronomeMailboxSubscriptionId: 'subscription-mailbox',
        infrastructureState: 'ACTIVE',
        pendingLifecycleAction: null,
        safeFailureCode: null,
        warmupPaidThrough: monthlyPaidThrough,
        warmupCancelAtPeriodEnd: false,
        metronomeWarmupSubscriptionId: 'subscription-warmup',
        warmupState: 'MAINTENANCE',
      },
    ]);

    await expect(service.subscriptions({ workspaceId })).resolves.toEqual([
      {
        service: 'MANAGED_EMAIL',
        productKey: 'managed_sending_domain_year',
        resourceType: 'DOMAIN',
        resourceIds: ['domain-1'],
        resourceLabels: ['creator-partners.test'],
        quantity: 1,
        currency: 'USD',
        unitPriceCents: 1_500,
        recurringAmountCents: 1_500,
        billingInterval: 'ANNUAL',
        paidThrough: annualPaidThrough,
        status: 'ACTIVE',
        action: null,
      },
      {
        service: 'MANAGED_EMAIL',
        productKey: 'managed_mailbox_month',
        resourceType: 'MAILBOX',
        resourceIds: ['mailbox-1', 'mailbox-2'],
        resourceLabels: [
          'maya@creator-partners.test',
          'lin@creator-partners.test',
        ],
        quantity: 2,
        currency: 'USD',
        unitPriceCents: 650,
        recurringAmountCents: 1_300,
        billingInterval: 'MONTHLY',
        paidThrough: monthlyPaidThrough,
        status: 'ACTIVE',
        action: 'STOP_SERVICE',
      },
      {
        service: 'MANAGED_EMAIL',
        productKey: 'managed_warmup_month',
        resourceType: 'MAILBOX',
        resourceIds: ['mailbox-1', 'mailbox-2'],
        resourceLabels: [
          'maya@creator-partners.test',
          'lin@creator-partners.test',
        ],
        quantity: 2,
        currency: 'USD',
        unitPriceCents: 1_000,
        recurringAmountCents: 2_000,
        billingInterval: 'MONTHLY',
        paidThrough: monthlyPaidThrough,
        status: 'ACTIVE',
        action: 'CANCEL_RENEWAL',
      },
    ]);
    expect(operationRepository.find).toHaveBeenCalledWith(workspaceId);
    expect(domainRepository.find).toHaveBeenCalledWith(workspaceId);
    expect(mailboxRepository.find).toHaveBeenCalledWith(workspaceId);
  });
  it('fails closed when subscription resources do not match the paid line', async () => {
    const {
      service,
      domainRepository,
      mailboxRepository,
      operationRepository,
    } = createHarness();
    const paidThrough = new Date('2026-09-06T12:00:00.000Z');

    operationRepository.find.mockResolvedValue([
      {
        id: 'operation-1',
        workspaceId,
        paymentStatus: 'PAID',
        pendingRenewalProjection: null,
        safeFailureCode: null,
        state: 'PROVIDER_SUCCEEDED',
        expectedLineItems: [
          {
            billingFrequency: 'MONTHLY',
            currency: 'USD',
            productKey: 'managed_mailbox_month',
            metronomeProductId: 'product-mailbox',
            quantity: 2,
            unitPriceCents: 650,
            totalCents: 1_300,
            periodEnd: paidThrough.toISOString(),
            periodStart: now.toISOString(),
          },
        ],
        correlatedSubscriptionLines: [
          {
            subscriptionId: 'subscription-mailbox',
            productId: 'product-mailbox',
            quantity: 2,
            unitPrice: 650,
            total: 1_300,
            isProrated: false,
            startingAt: now.toISOString(),
            endingBefore: paidThrough.toISOString(),
          },
        ],
      },
    ]);
    domainRepository.find.mockResolvedValue([]);
    mailboxRepository.find.mockResolvedValue([
      {
        id: 'mailbox-1',
        workspaceId,
        acquisitionOperationId: 'operation-1',
        normalizedAddress: 'maya@creator-partners.test',
        infrastructurePaidThrough: paidThrough,
        infrastructureCancelAtPeriodEnd: false,
        metronomeMailboxSubscriptionId: 'subscription-mailbox',
        infrastructureState: 'ACTIVE',
        pendingLifecycleAction: null,
        safeFailureCode: null,
      },
      {
        id: 'foreign-mailbox',
        workspaceId: '423e4567-e89b-42d3-a456-426614174099',
        acquisitionOperationId: 'operation-1',
        normalizedAddress: 'foreign@creator-partners.test',
        infrastructurePaidThrough: paidThrough,
        infrastructureCancelAtPeriodEnd: false,
        metronomeMailboxSubscriptionId: 'subscription-mailbox',
        infrastructureState: 'ACTIVE',
        pendingLifecycleAction: null,
        safeFailureCode: null,
      },
    ]);

    await expect(service.subscriptions({ workspaceId })).resolves.toEqual([
      {
        action: null,
        billingInterval: 'MONTHLY',
        currency: 'USD',
        paidThrough: null,
        productKey: 'managed_mailbox_month',
        quantity: 2,
        recurringAmountCents: 1_300,
        resourceIds: ['mailbox-1'],
        resourceLabels: ['maya@creator-partners.test'],
        resourceType: 'MAILBOX',
        service: 'MANAGED_EMAIL',
        status: 'ACTION_REQUIRED',
        unitPriceCents: 650,
      },
    ]);
  });
  it('uses the durable resource paid-through boundary after a paid renewal', async () => {
    const {
      service,
      domainRepository,
      mailboxRepository,
      operationRepository,
    } = createHarness();
    const renewedPaidThrough = new Date('2026-10-06T12:00:00.000Z');
    const fixture = createMailboxSubscriptionProjectionFixture({
      mailboxOverrides: { infrastructurePaidThrough: renewedPaidThrough },
    });

    operationRepository.find.mockResolvedValue([fixture.operation]);
    domainRepository.find.mockResolvedValue([]);
    mailboxRepository.find.mockResolvedValue([fixture.mailbox]);

    await expect(service.subscriptions({ workspaceId })).resolves.toMatchObject(
      [
        {
          action: 'STOP_SERVICE',
          paidThrough: renewedPaidThrough,
          status: 'ACTIVE',
        },
      ],
    );
  });

  it('fails closed for failed, inactive, and expired subscription lifecycles', async () => {
    const scenarios = [
      createMailboxSubscriptionProjectionFixture({
        mailboxOverrides: {
          infrastructureState: 'PAYMENT_REQUIRED',
          safeFailureCode: 'PAYMENT_FAILED',
        },
        operationOverrides: { paymentStatus: 'PAYMENT_FAILED' },
      }),
      createMailboxSubscriptionProjectionFixture({
        mailboxOverrides: {
          infrastructureCancelAtPeriodEnd: true,
          infrastructureState: 'INACTIVE',
          pendingLifecycleAction: 'STOP_MAILBOX_AT_PERIOD_END',
        },
      }),
      createMailboxSubscriptionProjectionFixture({
        mailboxOverrides: { infrastructurePaidThrough: now },
      }),
    ];

    for (const fixture of scenarios) {
      const {
        service,
        domainRepository,
        mailboxRepository,
        operationRepository,
      } = createHarness();

      operationRepository.find.mockResolvedValue([fixture.operation]);
      domainRepository.find.mockResolvedValue([]);
      mailboxRepository.find.mockResolvedValue([fixture.mailbox]);

      await expect(
        service.subscriptions({ workspaceId }),
      ).resolves.toMatchObject([
        { action: null, paidThrough: null, status: 'ACTION_REQUIRED' },
      ]);
    }
  });

  it('fails closed for duplicate, prorated, and extra correlated lines', async () => {
    const baseline = createMailboxSubscriptionProjectionFixture();
    const variants = [
      [baseline.correlatedLine, { ...baseline.correlatedLine }],
      [{ ...baseline.correlatedLine, isProrated: true }],
      [
        baseline.correlatedLine,
        {
          ...baseline.correlatedLine,
          productId: 'unexpected-product',
          subscriptionId: 'unexpected-subscription',
        },
      ],
    ];

    for (const correlatedSubscriptionLines of variants) {
      const {
        service,
        domainRepository,
        mailboxRepository,
        operationRepository,
      } = createHarness();
      const fixture = createMailboxSubscriptionProjectionFixture({
        correlatedSubscriptionLines,
      });

      operationRepository.find.mockResolvedValue([fixture.operation]);
      domainRepository.find.mockResolvedValue([]);
      mailboxRepository.find.mockResolvedValue([fixture.mailbox]);

      await expect(
        service.subscriptions({ workspaceId }),
      ).resolves.toMatchObject([
        { action: null, paidThrough: null, status: 'ACTION_REQUIRED' },
      ]);
    }
  });

  it('fails every row closed when an equal-size line set replaces one product', async () => {
    const {
      service,
      domainRepository,
      mailboxRepository,
      operationRepository,
    } = createHarness();
    const fixture = createMailboxSubscriptionProjectionFixture();
    const warmupExpectedLine = {
      ...fixture.expectedLine,
      metronomeProductId: 'product-warmup',
      productKey: 'managed_warmup_month',
    };
    const unexpectedLine = {
      ...fixture.correlatedLine,
      productId: 'unexpected-product',
      subscriptionId: 'unexpected-subscription',
    };

    operationRepository.find.mockResolvedValue([
      {
        ...fixture.operation,
        correlatedSubscriptionLines: [fixture.correlatedLine, unexpectedLine],
        expectedLineItems: [fixture.expectedLine, warmupExpectedLine],
      },
    ]);
    domainRepository.find.mockResolvedValue([]);
    mailboxRepository.find.mockResolvedValue([fixture.mailbox]);

    const result = await service.subscriptions({ workspaceId });

    expect(
      result.map(({ action, paidThrough, status }) => ({
        action,
        paidThrough,
        status,
      })),
    ).toEqual([
      { action: null, paidThrough: null, status: 'ACTION_REQUIRED' },
      { action: null, paidThrough: null, status: 'ACTION_REQUIRED' },
    ]);
  });

  it('preserves warmup cancellation during the combined mailbox stop flow', async () => {
    const {
      service,
      domainRepository,
      mailboxRepository,
      operationRepository,
    } = createHarness();
    const fixture = createMailboxSubscriptionProjectionFixture();
    const expectedLine = {
      ...fixture.expectedLine,
      metronomeProductId: 'product-warmup',
      productKey: 'managed_warmup_month',
      unitPriceCents: 1_000,
      totalCents: 1_000,
    };
    const correlatedLine = {
      ...fixture.correlatedLine,
      productId: 'product-warmup',
      subscriptionId: 'subscription-warmup',
      unitPrice: 1_000,
      total: 1_000,
    };

    operationRepository.find.mockResolvedValue([
      {
        ...fixture.operation,
        correlatedSubscriptionLines: [correlatedLine],
        expectedLineItems: [expectedLine],
      },
    ]);
    domainRepository.find.mockResolvedValue([]);
    mailboxRepository.find.mockResolvedValue([
      {
        ...fixture.mailbox,
        infrastructureCancelAtPeriodEnd: true,
        pendingLifecycleAction: 'STOP_MAILBOX_AT_PERIOD_END',
        warmupCancelAtPeriodEnd: true,
        warmupPaidThrough: fixture.paidThrough,
        warmupState: 'MAINTENANCE',
        metronomeWarmupSubscriptionId: 'subscription-warmup',
      },
    ]);

    await expect(service.subscriptions({ workspaceId })).resolves.toMatchObject(
      [
        {
          action: null,
          paidThrough: fixture.paidThrough,
          status: 'CANCELS_AT_PERIOD_END',
        },
      ],
    );
  });

  it('keeps paid mailbox and warmup subscriptions active during normal warmup', async () => {
    const {
      service,
      domainRepository,
      mailboxRepository,
      operationRepository,
    } = createHarness();
    const fixture = createMailboxSubscriptionProjectionFixture();
    const warmupExpectedLine = {
      ...fixture.expectedLine,
      metronomeProductId: 'product-warmup',
      productKey: 'managed_warmup_month',
      unitPriceCents: 1_000,
      totalCents: 1_000,
    };
    const warmupCorrelatedLine = {
      ...fixture.correlatedLine,
      productId: 'product-warmup',
      subscriptionId: 'subscription-warmup',
      unitPrice: 1_000,
      total: 1_000,
    };

    operationRepository.find.mockResolvedValue([
      {
        ...fixture.operation,
        correlatedSubscriptionLines: [
          fixture.correlatedLine,
          warmupCorrelatedLine,
        ],
        expectedLineItems: [fixture.expectedLine, warmupExpectedLine],
      },
    ]);
    domainRepository.find.mockResolvedValue([]);
    mailboxRepository.find.mockResolvedValue([
      {
        ...fixture.mailbox,
        metronomeWarmupSubscriptionId: 'subscription-warmup',
        safeFailureCode: 'WARMUP_INCOMPLETE',
        warmupCancelAtPeriodEnd: false,
        warmupPaidThrough: fixture.paidThrough,
        warmupState: 'WARMING',
      },
    ]);

    await expect(service.subscriptions({ workspaceId })).resolves.toMatchObject(
      [
        {
          action: 'STOP_SERVICE',
          paidThrough: fixture.paidThrough,
          status: 'ACTIVE',
        },
        {
          action: 'CANCEL_RENEWAL',
          paidThrough: fixture.paidThrough,
          status: 'ACTIVE',
        },
      ],
    );
  });
});
