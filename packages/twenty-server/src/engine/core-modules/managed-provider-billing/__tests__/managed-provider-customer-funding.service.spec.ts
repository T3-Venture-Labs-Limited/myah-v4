import { createHash } from 'node:crypto';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import {
  AI_TOP_UP_POLICY,
  ManagedProviderCustomerFundingService,
} from '../services/managed-provider-customer-funding.service';
import { type ManagedProviderFundingActionEntity } from '../entities/managed-provider-funding-action.entity';

describe('ManagedProviderCustomerFundingService', () => {
  const workspaceId = 'workspace-id';
  const actorId = 'actor-id';
  const idempotencyKey = 'browser-idempotency-key';
  const chargeProductId = 'charge-product-id';
  const creditProductId = 'credit-product-id';
  const contractId = 'contract-id';
  const customerId = 'customer-id';
  const stripeCustomerId = 'cus_workspace';
  const now = new Date('2026-08-29T10:37:42.123Z');
  const purchaseAt = '2026-08-29T10:00:00.000Z';
  const defaultPrincipalCents = 2_500;
  const fundingIdentity = createHash('sha256')
    .update(
      `${workspaceId}:${defaultPrincipalCents}:${idempotencyKey}:fiat-credit-type-id:USD (cents)`,
    )
    .digest('hex');
  const legacyFundingIdentity = createHash('sha256')
    .update(
      `${workspaceId}:AI_25_USD:${idempotencyKey}:fiat-credit-type-id:USD (cents)`,
    )
    .digest('hex');
  const billingDetails = {
    city: 'San Francisco',
    country: 'US',
    line1: '123 Market Street',
    line2: null,
    name: 'Myah Test LLC',
    postalCode: '94105',
    state: 'CA',
    taxIdType: 'us_ein' as const,
    taxIdValue: '12-3456789',
  };
  const billingSummary = {
    address: {
      city: billingDetails.city,
      country: billingDetails.country,
      line1: billingDetails.line1,
      line2: null,
      postalCode: billingDetails.postalCode,
      state: billingDetails.state,
    },
    card: {
      brand: 'visa',
      expiryMonth: 12,
      expiryYear: 2030,
      last4: '4242',
    },
    name: billingDetails.name,
    paymentMethodReady: true,
    taxId: { country: 'US', type: 'us_ein' },
  };

  const createAction = (
    overrides: Partial<ManagedProviderFundingActionEntity> = {},
  ) =>
    ({
      actionType: 'PREPAID_COMMIT',
      amountCents: String(defaultPrincipalCents),
      applicableProductIds: [chargeProductId],
      commitmentId: null,
      creditProductId,
      currency: 'USD',
      externalReference: `customer-ai-top-up:${workspaceId}:${idempotencyKey}`,
      id: 'funding-action-id',
      idempotencyKey,
      metronomeUniquenessKey: 'metronome-uniqueness-key',
      operatorIdentity: actorId,
      paymentEvidence: {
        evidenceVersion: 'principal-cents-v1',
        fiatCreditTypeId: 'fiat-credit-type-id',
        fiatCreditTypeName: 'USD (cents)',
        fundingIdentity,
        paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
        principalCents: defaultPrincipalCents,
        purchaseAt,
      },
      permissionUsed: 'workspace_billing',
      prepaidPrincipalCents: String(defaultPrincipalCents),
      reason: `Customer AI top-up ${defaultPrincipalCents} cents`,
      state: 'PENDING',
      workspaceId,
      ...overrides,
    }) as unknown as ManagedProviderFundingActionEntity;

  const createFundingInput = (principalCents = defaultPrincipalCents) => ({
    actorId,
    idempotencyKey,
    principalCents,
    workspaceId,
  });

  const legacyPaymentEvidence = {
    fiatCreditTypeId: 'fiat-credit-type-id',
    fiatCreditTypeName: 'USD (cents)',
    fundingIdentity: legacyFundingIdentity,
    paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
    preset: 'AI_25_USD',
    purchaseAt,
  };
  const createLegacyAction = (
    overrides: Partial<ManagedProviderFundingActionEntity> = {},
  ) =>
    createAction({
      paymentEvidence: legacyPaymentEvidence,
      reason: 'Customer AI top-up AI_25_USD',
      ...overrides,
    });

  const createHarness = ({
    customerFundingEnabled = true,
    allowedWorkspaceIds = [workspaceId],
    existing = null,
    createCommitError,
  }: {
    customerFundingEnabled?: boolean;
    allowedWorkspaceIds?: string[];
    existing?: ManagedProviderFundingActionEntity | null;
    createCommitError?: unknown;
  } = {}) => {
    const config = {
      BILLING_STRIPE_API_KEY: 'sk_test',
      MANAGED_OPENROUTER_CHARGE_PRODUCT_ID: chargeProductId,
      MANAGED_OPENROUTER_CREDIT_PRODUCT_ID: creditProductId,
      MANAGED_OPENROUTER_ENABLED: true,
      MANAGED_PROVIDER_CUSTOMER_FUNDING_ENABLED: customerFundingEnabled,
      MANAGED_PROVIDER_CUSTOMER_FUNDING_WORKSPACE_IDS: allowedWorkspaceIds,
      METRONOME_BASE_URL_ENVIRONMENT: 'SANDBOX',
      METRONOME_ENABLED: true,
    } as const;
    const action = createAction();
    const recorded = createAction({
      commitmentId: 'commitment-id',
      metronomeEditId: 'edit-id',
      state: 'METRONOME_EDIT_RECORDED',
    });
    const reconciliating = createAction({
      safeErrorCode: 'METRONOME_CREATE_OUTCOME_UNCERTAIN',
      state: 'RECONCILIATION_REQUIRED',
    });
    const journal = {
      createPending: jest
        .fn()
        .mockResolvedValue(Object.assign(action, { createdByCaller: true })),
      findByIdempotency: jest.fn().mockResolvedValue(existing),
      findWorkspaceAction: jest.fn().mockResolvedValue(existing),
      listWorkspaceActions: jest
        .fn()
        .mockResolvedValue(existing === null ? [] : [existing]),
      transitionCompareAndSet: jest
        .fn()
        .mockResolvedValueOnce(recorded)
        .mockResolvedValueOnce(reconciliating),
    };
    const metronome = {
      createPaymentGatedPrepaidCommit: createCommitError
        ? jest.fn().mockRejectedValue(createCommitError)
        : jest.fn().mockResolvedValue({
            commitmentId: 'commitment-id',
            metronomeEditId: 'edit-id',
          }),
    };
    const billingContext = {
      billingConfigurationId: 'billing-config-id',
      deliveryMethodId: 'delivery-method-id',
      environment: 'SANDBOX',
      fiatCreditTypeId: 'fiat-credit-type-id',
      fiatCreditTypeName: 'USD (cents)',
      metronomeContractId: contractId,
      metronomeCustomerId: customerId,
      stripeCustomerId,
    };
    const workspaceCustomer = {
      ensureStripeBillingConfiguration: jest.fn().mockResolvedValue({
        billingProviderType: 'stripe',
        deliveryMethod: 'direct_to_billing_provider',
        deliveryMethodId: 'delivery-method-id',
        id: 'billing-config-id',
        stripeCollectionMethod: 'charge_automatically',
        stripeCustomerId,
      }),
      ensureWorkspaceContract: jest.fn().mockResolvedValue(contractId),
      ensureWorkspaceContractStripeBillingContext: jest
        .fn()
        .mockResolvedValue(billingContext),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue(customerId),
    };
    const stripe = {
      assertWorkspacePaymentMethodReady: jest.fn().mockResolvedValue({
        paymentMethodId: 'pm_default',
        ready: true,
        stripeCustomerId,
      }),
      assertWorkspaceBillingDetailsReady: jest
        .fn()
        .mockResolvedValue(billingSummary),
      completeWorkspacePaymentMethodSetup: jest.fn().mockResolvedValue({
        paymentMethodId: 'pm_default',
        stripeCustomerId,
      }),
      prepareWorkspacePaymentMethod: jest.fn().mockResolvedValue({
        clientSecret: 'seti_secret',
        publishableKey: 'pk_test',
        ready: false,
        setupIntentId: 'seti_id',
        stripeCustomerId,
      }),
      getWorkspaceBillingDetailsSummary: jest
        .fn()
        .mockResolvedValue(billingSummary),
      updateWorkspaceBillingDetails: jest
        .fn()
        .mockResolvedValue(billingSummary),
    };
    const twentyConfig = {
      get: jest.fn((key: keyof typeof config) => config[key]),
    };
    const service = new ManagedProviderCustomerFundingService(
      journal as never,
      metronome as never,
      workspaceCustomer as never,
      stripe as never,
      twentyConfig as never,
    );

    return {
      action,
      journal,
      metronome,
      recorded,
      service,
      stripe,
      workspaceCustomer,
    };
  };

  const createReconciliationHarness = ({
    actionOverrides = {},
    externalInvoice = {
      issuedAt: '2026-08-29T10:40:00.000Z',
      pdfUrl: 'https://invoice.example/in_metronome',
      status: 'PAID' as const,
      stripeInvoiceId: 'in_metronome',
      stripePaymentIntentId: 'pi_metronome',
      subtotalCents: 2_500,
      taxCents: 500,
      totalCents: 3_000,
    },
    invoiceStatus = 'FINALIZED',
    recoveryInvoiceId = 'metronome-invoice-id',
    expiryAlreadyApplied = false,
    stripeState = {
      invoiceUrl: 'https://invoice.example/in_metronome',
      paidAt: '2026-08-29T10:40:00.000Z',
      paymentIntentId: 'pi_metronome',
      principalCents: 2_500,
      status: 'PAID' as const,
      stripeInvoiceId: 'in_metronome',
      taxCents: 500,
      totalCents: 3_000,
    },
  }: {
    actionOverrides?: Partial<ManagedProviderFundingActionEntity>;
    externalInvoice?: null | {
      issuedAt: string | null;
      pdfUrl: string | null;
      status:
        | 'DRAFT'
        | 'FINALIZED'
        | 'PAID'
        | 'PARTIALLY_PAID'
        | 'UNCOLLECTIBLE'
        | 'VOID'
        | 'DELETED'
        | 'PAYMENT_FAILED'
        | 'INVALID_REQUEST_ERROR'
        | 'SKIPPED'
        | 'SENT'
        | 'QUEUED';
      stripeInvoiceId: string | null;
      stripePaymentIntentId: string | null;
      subtotalCents: number | null;
      taxCents: number | null;
      totalCents: number | null;
    };
    invoiceStatus?: 'DRAFT' | 'FINALIZED' | 'VOID';
    recoveryInvoiceId?: string | null;
    expiryAlreadyApplied?: boolean;
    stripeState?: Record<string, unknown>;
  } = {}) => {
    const harness = createHarness();
    const action = createAction({
      commitmentId: 'commitment-id',
      createdAt: new Date('2026-08-29T10:00:00.000Z'),
      metronomeContractId: contractId,
      metronomeCustomerId: customerId,
      metronomeEditId: 'edit-id',
      state: 'METRONOME_EDIT_RECORDED',
      stripeBillingConfigurationId: 'billing-config-id',
      stripeCustomerId,
      stripeDeliveryMethodId: 'delivery-method-id',
      ...actionOverrides,
    });
    const metronome = harness.metronome as typeof harness.metronome & {
      assertPaymentGatedPrepaidCommitExpiry: jest.Mock;
      readPaymentGatedPrepaidCommitInvoice: jest.Mock;
      recoverPaymentGatedPrepaidCommit: jest.Mock;
      updatePaymentGatedPrepaidCommitExpiry: jest.Mock;
    };
    Object.assign(metronome, {
      assertPaymentGatedPrepaidCommitExpiry: expiryAlreadyApplied
        ? jest.fn().mockResolvedValue({ expiresAt: '2027-08-29T10:40:00.000Z' })
        : jest
            .fn()
            .mockRejectedValueOnce(new Error('expiry not applied'))
            .mockResolvedValue({ expiresAt: '2027-08-29T10:40:00.000Z' }),
      readPaymentGatedPrepaidCommitInvoice: jest.fn().mockResolvedValue({
        externalInvoice,
        issuedAt: '2026-08-29T10:37:42.123Z',
        metronomeInvoiceId: 'metronome-invoice-id',
        principalCents: 2_500,
        status: invoiceStatus,
      }),
      recoverPaymentGatedPrepaidCommit: jest.fn().mockResolvedValue({
        accessScheduleItemId: 'access-schedule-item-id',
        archivedAt: null,
        commitmentId: 'commitment-id',
        invoiceId: recoveryInvoiceId,
        metronomeEditId: 'edit-id',
      }),
      updatePaymentGatedPrepaidCommitExpiry: jest
        .fn()
        .mockResolvedValue({ metronomeEditId: 'expiry-edit-id' }),
    });
    const stripe = harness.stripe as typeof harness.stripe & {
      readPaymentGatedInvoicePayment: jest.Mock;
    };
    Object.assign(stripe, {
      readPaymentGatedInvoicePayment: jest.fn().mockResolvedValue(stripeState),
    });
    harness.journal.transitionCompareAndSet.mockReset();
    harness.journal.transitionCompareAndSet.mockImplementation(
      async ({
        nextState,
        patch,
      }: {
        nextState: ManagedProviderFundingActionEntity['state'];
        patch?: Partial<ManagedProviderFundingActionEntity>;
      }) => createAction({ ...action, ...patch, state: nextState }),
    );

    return { ...harness, action, metronome, stripe };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports the bounded AI top-up cent policy', () => {
    expect(AI_TOP_UP_POLICY).toEqual({
      incrementCents: 100,
      maximumPrincipalCents: 50_000,
      minimumPrincipalCents: 500,
      suggestedPrincipalCents: [2_500, 5_000, 10_000],
    });
  });

  it.each([
    499,
    50_001,
    550,
    500.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ] as const)(
    'rejects invalid principal cents %p before journal or provider I/O',
    async (principalCents) => {
      const { journal, metronome, service, stripe, workspaceCustomer } =
        createHarness();

      await expect(
        service.createCustomerFunding(createFundingInput(principalCents)),
      ).rejects.toThrow('Customer AI funding request is invalid');
      expect(journal.findByIdempotency).not.toHaveBeenCalled();
      expect(journal.createPending).not.toHaveBeenCalled();
      expect(stripe.assertWorkspacePaymentMethodReady).not.toHaveBeenCalled();
      expect(stripe.assertWorkspaceBillingDetailsReady).not.toHaveBeenCalled();
      expect(workspaceCustomer.ensureWorkspaceCustomer).not.toHaveBeenCalled();
      expect(
        workspaceCustomer.ensureStripeBillingConfiguration,
      ).not.toHaveBeenCalled();
      expect(workspaceCustomer.ensureWorkspaceContract).not.toHaveBeenCalled();
      expect(
        workspaceCustomer.ensureWorkspaceContractStripeBillingContext,
      ).not.toHaveBeenCalled();
      expect(
        metronome.createPaymentGatedPrepaidCommit,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([500, 2_500, 5_000, 10_000, 50_000] as const)(
    'accepts the allowed %i-cent amount',
    async (principalCents) => {
      const { journal, metronome, recorded, service } = createHarness();

      await expect(
        service.createCustomerFunding(createFundingInput(principalCents)),
      ).resolves.toBe(recorded);
      expect(journal.createPending).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: principalCents,
          prepaidPrincipalCents: principalCents,
        }),
      );
      expect(metronome.createPaymentGatedPrepaidCommit).toHaveBeenCalledWith(
        expect.objectContaining({ principalCents }),
      );
    },
  );

  it.each([
    ['disabled', false, [workspaceId]],
    ['not allowlisted', true, ['other-workspace']],
  ])(
    'rejects new funding while %s before creating an intent',
    async (_, enabled, allowlist) => {
      const { journal, service, workspaceCustomer } = createHarness({
        customerFundingEnabled: enabled,
        allowedWorkspaceIds: allowlist,
      });

      await expect(
        service.createCustomerFunding(createFundingInput()),
      ).rejects.toThrow('Customer AI funding is unavailable');
      expect(journal.createPending).not.toHaveBeenCalled();
      expect(workspaceCustomer.ensureWorkspaceContract).not.toHaveBeenCalled();
    },
  );

  it('accepts a new funding request for an unlisted workspace on the wildcard allowlist', async () => {
    const wildcardWorkspaceId = 'wildcard-workspace-id';
    const { journal, recorded, service } = createHarness({
      allowedWorkspaceIds: ['*'],
    });

    await expect(
      service.createCustomerFunding({
        ...createFundingInput(),
        workspaceId: wildcardWorkspaceId,
      }),
    ).resolves.toBe(recorded);
    expect(journal.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: wildcardWorkspaceId }),
    );
  });

  it('returns an exact current replay without reopening remote admission or provider I/O', async () => {
    const existing = createAction();
    const { journal, metronome, service, stripe, workspaceCustomer } =
      createHarness({
        customerFundingEnabled: false,
        allowedWorkspaceIds: [],
        existing,
      });

    await expect(
      service.createCustomerFunding(createFundingInput()),
    ).resolves.toBe(existing);
    expect(journal.findByIdempotency).toHaveBeenCalledWith(
      workspaceId,
      idempotencyKey,
    );
    expect(journal.createPending).not.toHaveBeenCalled();
    expect(stripe.assertWorkspacePaymentMethodReady).not.toHaveBeenCalled();
    expect(stripe.assertWorkspaceBillingDetailsReady).not.toHaveBeenCalled();
    expect(workspaceCustomer.ensureWorkspaceCustomer).not.toHaveBeenCalled();
    expect(
      workspaceCustomer.ensureStripeBillingConfiguration,
    ).not.toHaveBeenCalled();
    expect(workspaceCustomer.ensureWorkspaceContract).not.toHaveBeenCalled();
    expect(
      workspaceCustomer.ensureWorkspaceContractStripeBillingContext,
    ).not.toHaveBeenCalled();
    expect(metronome.createPaymentGatedPrepaidCommit).not.toHaveBeenCalled();
  });

  it('rejects a current replay with the same key and a different amount', async () => {
    const existing = createAction();
    const { journal, metronome, service, stripe, workspaceCustomer } =
      createHarness({
        customerFundingEnabled: false,
        allowedWorkspaceIds: [],
        existing,
      });

    await expect(
      service.createCustomerFunding(createFundingInput(5_000)),
    ).rejects.toThrow('Customer AI funding replay conflicts');
    expect(journal.createPending).not.toHaveBeenCalled();
    expect(stripe.assertWorkspacePaymentMethodReady).not.toHaveBeenCalled();
    expect(stripe.assertWorkspaceBillingDetailsReady).not.toHaveBeenCalled();
    expect(workspaceCustomer.ensureWorkspaceCustomer).not.toHaveBeenCalled();
    expect(metronome.createPaymentGatedPrepaidCommit).not.toHaveBeenCalled();
  });

  it.each([
    ['actor', { operatorIdentity: 'other-actor' }],
    ['durable amount', { amountCents: '5000' }],
    [
      'evidence amount',
      {
        paymentEvidence: {
          evidenceVersion: 'principal-cents-v1',
          fiatCreditTypeId: 'fiat-credit-type-id',
          fiatCreditTypeName: 'USD (cents)',
          fundingIdentity,
          paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
          principalCents: 5_000,
          purchaseAt,
        },
      },
    ],
    [
      'fiat credit type',
      {
        paymentEvidence: {
          evidenceVersion: 'principal-cents-v1',
          fiatCreditTypeId: 'other-credit-type-id',
          fiatCreditTypeName: 'USD (cents)',
          fundingIdentity,
          paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
          principalCents: defaultPrincipalCents,
          purchaseAt,
        },
      },
    ],
  ])('rejects a conflicting current %s replay', async (_, overrides) => {
    const { service } = createHarness({ existing: createAction(overrides) });

    await expect(
      service.createCustomerFunding(createFundingInput()),
    ).rejects.toThrow('Customer AI funding replay conflicts');
  });

  it('returns an exact historical legacy preset replay before current rollout admission', async () => {
    const existing = createLegacyAction();
    const { journal, metronome, service, stripe, workspaceCustomer } =
      createHarness({
        customerFundingEnabled: false,
        allowedWorkspaceIds: [],
        existing,
      });

    await expect(
      service.createCustomerFunding(createFundingInput()),
    ).resolves.toBe(existing);
    expect(journal.createPending).not.toHaveBeenCalled();
    expect(stripe.assertWorkspacePaymentMethodReady).not.toHaveBeenCalled();
    expect(stripe.assertWorkspaceBillingDetailsReady).not.toHaveBeenCalled();
    expect(workspaceCustomer.ensureWorkspaceCustomer).not.toHaveBeenCalled();
    expect(metronome.createPaymentGatedPrepaidCommit).not.toHaveBeenCalled();
  });

  it.each([
    [
      'mapped amount',
      5_000,
      createLegacyAction({
        amountCents: '5000',
        prepaidPrincipalCents: '5000',
      }),
    ],
    [
      'stored amount',
      defaultPrincipalCents,
      createLegacyAction({ amountCents: '5000' }),
    ],
    [
      'stored principal',
      defaultPrincipalCents,
      createLegacyAction({ prepaidPrincipalCents: '5000' }),
    ],
    [
      'legacy identity',
      defaultPrincipalCents,
      createLegacyAction({
        paymentEvidence: {
          ...legacyPaymentEvidence,
          fundingIdentity: 'other-legacy-funding-identity',
        },
      }),
    ],
    [
      'purchase timestamp',
      defaultPrincipalCents,
      createLegacyAction({
        paymentEvidence: {
          ...legacyPaymentEvidence,
          purchaseAt: 'not-a-timestamp',
        },
      }),
    ],
    [
      'payment-action deadline timestamp',
      defaultPrincipalCents,
      createLegacyAction({
        paymentEvidence: {
          ...legacyPaymentEvidence,
          paymentActionDeadlineAt: 'not-a-timestamp',
        },
      }),
    ],
    [
      'immutable actor',
      defaultPrincipalCents,
      createLegacyAction({ operatorIdentity: 'other-actor' }),
    ],
  ])(
    'rejects a conflicting legacy %s replay',
    async (_, principalCents, existing) => {
      const { journal, metronome, service, stripe, workspaceCustomer } =
        createHarness({ existing });

      await expect(
        service.createCustomerFunding(createFundingInput(principalCents)),
      ).rejects.toThrow('Customer AI funding replay conflicts');
      expect(journal.createPending).not.toHaveBeenCalled();
      expect(stripe.assertWorkspacePaymentMethodReady).not.toHaveBeenCalled();
      expect(stripe.assertWorkspaceBillingDetailsReady).not.toHaveBeenCalled();
      expect(workspaceCustomer.ensureWorkspaceCustomer).not.toHaveBeenCalled();
      expect(
        metronome.createPaymentGatedPrepaidCommit,
      ).not.toHaveBeenCalled();
    },
  );

  it('records one exact amount-based intent before the payment-gated Metronome write', async () => {
    const { journal, metronome, recorded, service, stripe, workspaceCustomer } =
      createHarness();

    await expect(
      service.createCustomerFunding(createFundingInput()),
    ).resolves.toBe(recorded);

    expect(workspaceCustomer.ensureWorkspaceContract).toHaveBeenCalledWith(
      workspaceId,
    );
    expect(stripe.assertWorkspacePaymentMethodReady).toHaveBeenCalledWith({
      metronomeBaseUrlEnvironment: 'SANDBOX',
      workspaceId,
    });
    expect(workspaceCustomer.ensureWorkspaceCustomer).toHaveBeenCalledWith(
      workspaceId,
    );
    expect(
      workspaceCustomer.ensureStripeBillingConfiguration,
    ).toHaveBeenCalledWith(workspaceId, stripeCustomerId);
    expect(
      workspaceCustomer.ensureWorkspaceContractStripeBillingContext,
    ).toHaveBeenCalledWith({
      billingConfigurationId: 'billing-config-id',
      contractId,
      environment: 'SANDBOX',
      workspaceId,
    });
    expect(journal.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PREPAID_COMMIT',
        amountCents: defaultPrincipalCents,
        applicableProductIds: [chargeProductId],
        creditProductId,
        currency: 'USD',
        expiresAt: null,
        externalReference: `customer-ai-top-up:${workspaceId}:${idempotencyKey}`,
        idempotencyKey,
        metronomeContractId: contractId,
        metronomeCustomerId: customerId,
        operatorIdentity: actorId,
        permissionUsed: 'workspace_billing',
        prepaidPrincipalCents: defaultPrincipalCents,
        reason: `Customer AI top-up ${defaultPrincipalCents} cents`,
        stripeBillingConfigurationId: 'billing-config-id',
        stripeCustomerId,
        stripeDeliveryMethodId: 'delivery-method-id',
        workspaceId,
      }),
    );
    expect(journal.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentEvidence: {
          evidenceVersion: 'principal-cents-v1',
          fiatCreditTypeId: 'fiat-credit-type-id',
          fiatCreditTypeName: 'USD (cents)',
          fundingIdentity,
          paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
          principalCents: defaultPrincipalCents,
          purchaseAt,
        },
      }),
    );
    const pendingInput = journal.createPending.mock.calls[0][0];
    expect(metronome.createPaymentGatedPrepaidCommit).toHaveBeenCalledWith({
      chargeProductId,
      commitmentProductId: creditProductId,
      contractId,
      customerId,
      fundingActionId: 'funding-action-id',
      fundingIdentity: pendingInput.paymentEvidence.fundingIdentity,
      principalCents: defaultPrincipalCents,
      purchaseAt,
      uniquenessKey: 'metronome-uniqueness-key',
    });
    expect(journal.createPending.mock.invocationCallOrder[0]).toBeLessThan(
      metronome.createPaymentGatedPrepaidCommit.mock.invocationCallOrder[0],
    );
    expect(journal.transitionCompareAndSet).toHaveBeenCalledWith({
      expectedState: 'PENDING',
      id: 'funding-action-id',
      nextState: 'METRONOME_EDIT_RECORDED',
      patch: expect.objectContaining({
        commitmentId: 'commitment-id',
        metronomeEditId: 'edit-id',
        nextReconciliationAt: now,
      }),
      workspaceId,
    });
  });

  it('records reconciliation-required after an uncertain Metronome write', async () => {
    const { journal, service } = createHarness({
      createCommitError: new MetronomeClientException(
        MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      ),
    });

    await service.createCustomerFunding(createFundingInput());
    expect(journal.transitionCompareAndSet).toHaveBeenCalledWith({
      expectedState: 'PENDING',
      id: 'funding-action-id',
      nextState: 'RECONCILIATION_REQUIRED',
      patch: {
        nextReconciliationAt: now,
        safeErrorCode: 'METRONOME_CREATE_OUTCOME_UNCERTAIN',
      },
      workspaceId,
    });
  });

  it('reads funding actions only through workspace-scoped journal methods', async () => {
    const existing = createAction();
    const { journal, service } = createHarness({ existing });

    await expect(
      service.getCustomerFundingAction(workspaceId, existing.id),
    ).resolves.toBe(existing);
    await expect(
      service.listCustomerFundingHistory(workspaceId),
    ).resolves.toEqual([existing]);
    expect(journal.findWorkspaceAction).toHaveBeenCalledWith(
      workspaceId,
      existing.id,
    );
    expect(journal.listWorkspaceActions).toHaveBeenCalledWith(workspaceId, 50);
  });

  it('reads payment-method readiness without creating a SetupIntent', async () => {
    const { service, stripe } = createHarness();

    await expect(
      service.isCustomerFundingPaymentMethodReady(workspaceId),
    ).resolves.toBe(true);
    stripe.assertWorkspaceBillingDetailsReady.mockRejectedValue(
      new Error('billing details missing'),
    );
    await expect(
      service.isCustomerFundingPaymentMethodReady(workspaceId),
    ).resolves.toBe(false);
    expect(stripe.prepareWorkspacePaymentMethod).not.toHaveBeenCalled();
  });

  it('reuses a ready payment method without exposing Stripe identifiers', async () => {
    const { service, stripe } = createHarness();

    await expect(
      service.prepareCustomerFundingPaymentMethod(workspaceId),
    ).resolves.toEqual({
      billingSummary,
      clientSecret: null,
      publishableKey: null,
      ready: true,
      setupIntentId: null,
    });
    expect(stripe.prepareWorkspacePaymentMethod).not.toHaveBeenCalled();
  });

  it('returns only bounded SetupIntent fields when a payment method is missing', async () => {
    const { service, stripe } = createHarness();
    stripe.getWorkspaceBillingDetailsSummary.mockResolvedValue({
      ...billingSummary,
      card: null,
      paymentMethodReady: false,
    });
    stripe.assertWorkspaceBillingDetailsReady.mockRejectedValue(
      new Error('billing details missing'),
    );

    await expect(
      service.prepareCustomerFundingPaymentMethod(workspaceId),
    ).resolves.toEqual({
      billingSummary: {
        ...billingSummary,
        card: null,
        paymentMethodReady: false,
      },
      clientSecret: 'seti_secret',
      publishableKey: 'pk_test',
      ready: false,
      setupIntentId: 'seti_id',
    });
  });

  it('completes the exact SetupIntent without exposing Stripe customer or method IDs', async () => {
    const { service, stripe } = createHarness();

    await expect(
      service.completeCustomerFundingPaymentMethod(
        workspaceId,
        'seti_id',
        billingDetails,
      ),
    ).resolves.toEqual({
      billingSummary,
      clientSecret: null,
      publishableKey: null,
      ready: true,
      setupIntentId: null,
    });
    expect(stripe.completeWorkspacePaymentMethodSetup).toHaveBeenCalledWith({
      metronomeBaseUrlEnvironment: 'SANDBOX',
      setupIntentId: 'seti_id',
      workspaceId,
    });
    expect(stripe.updateWorkspaceBillingDetails).toHaveBeenCalledWith({
      billingDetails,
      metronomeBaseUrlEnvironment: 'SANDBOX',
      workspaceId,
    });
  });

  it('marks paid funding succeeded only after exact expiry correction and proof', async () => {
    const { action, journal, metronome, service } =
      createReconciliationHarness();

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'SUCCEEDED' });
    const expiryIntentTransition =
      journal.transitionCompareAndSet.mock.calls[0][0];
    expect(expiryIntentTransition).toEqual(
      expect.objectContaining({
        expectedState: 'METRONOME_EDIT_RECORDED',
        nextState: 'METRONOME_EDIT_RECORDED',
        patch: expect.objectContaining({
          paymentReceipt: expect.objectContaining({
            expiryUpdateIntent: {
              accessScheduleItemId: 'access-schedule-item-id',
              invoiceId: 'metronome-invoice-id',
              paidAt: '2026-08-29T10:40:00.000Z',
              recordedAt: now.toISOString(),
            },
          }),
        }),
      }),
    );
    expect(
      journal.transitionCompareAndSet.mock.invocationCallOrder[0],
    ).toBeLessThan(
      metronome.updatePaymentGatedPrepaidCommitExpiry.mock
        .invocationCallOrder[0],
    );
    expect(
      metronome.updatePaymentGatedPrepaidCommitExpiry,
    ).toHaveBeenCalledWith({
      accessScheduleItemId: 'access-schedule-item-id',
      commitmentId: 'commitment-id',
      contractId,
      customerId,
      paidAt: '2026-08-29T10:40:00.000Z',
      uniquenessKey: 'metronome-uniqueness-key:paid-expiry',
    });
    expect(
      metronome.assertPaymentGatedPrepaidCommitExpiry,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        accessScheduleItemId: 'access-schedule-item-id',
        commitmentId: 'commitment-id',
        invoiceId: 'metronome-invoice-id',
        paidAt: '2026-08-29T10:40:00.000Z',
        principalCents: 2_500,
      }),
    );
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith({
      expectedState: 'METRONOME_EDIT_RECORDED',
      id: 'funding-action-id',
      nextState: 'SUCCEEDED',
      patch: expect.objectContaining({
        collectedTotalCents: 3_000,
        expiresAt: new Date('2027-08-29T10:40:00.000Z'),
        metronomeInvoiceId: 'metronome-invoice-id',
        nextReconciliationAt: null,
        prepaidPrincipalCents: 2_500,
        stripeInvoiceId: 'in_metronome',
        stripePaymentIntentId: 'pi_metronome',
        taxCents: 500,
      }),
      workspaceId,
    });
    expect(
      JSON.stringify(
        journal.transitionCompareAndSet.mock.calls[
          journal.transitionCompareAndSet.mock.calls.length - 1
        ]?.[0].patch,
      ),
    ).not.toContain('clientSecret');
  });

  it('keeps an incomplete external invoice payment pending without expiry writes', async () => {
    const { action, journal, metronome, service, stripe } =
      createReconciliationHarness({
        actionOverrides: { reconciliationAttemptCount: 10 },
        externalInvoice: null,
      });

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'PAYMENT_PENDING' });
    expect(stripe.readPaymentGatedInvoicePayment).not.toHaveBeenCalled();
    expect(
      metronome.updatePaymentGatedPrepaidCommitExpiry,
    ).not.toHaveBeenCalled();
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextState: 'PAYMENT_PENDING',
        patch: expect.objectContaining({
          metronomeInvoiceId: 'metronome-invoice-id',
          reconciliationAttemptCount: 0,
        }),
      }),
    );
  });

  it('keeps a partially paid Metronome invoice pending despite contradictory Stripe payment evidence', async () => {
    const { action, journal, metronome, service, stripe } =
      createReconciliationHarness({
        externalInvoice: {
          issuedAt: '2026-08-29T10:40:00.000Z',
          pdfUrl: 'https://invoice.example/in_metronome',
          status: 'PARTIALLY_PAID',
          stripeInvoiceId: 'in_metronome',
          stripePaymentIntentId: 'pi_metronome',
          subtotalCents: 2_500,
          taxCents: 500,
          totalCents: 3_000,
        },
      });

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'PAYMENT_PENDING' });
    expect(stripe.readPaymentGatedInvoicePayment).not.toHaveBeenCalled();
    expect(
      metronome.assertPaymentGatedPrepaidCommitExpiry,
    ).not.toHaveBeenCalled();
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({ nextState: 'PAYMENT_PENDING' }),
    );
  });

  it.each([
    ['PAYMENT_FAILED', 'METRONOME_PAYMENT_FAILED'],
    ['UNCOLLECTIBLE', 'METRONOME_UNCOLLECTIBLE'],
  ] as const)(
    'keeps a terminal Metronome invoice status %s from reaching Stripe reconciliation',
    async (status, failureCode) => {
      const { action, journal, metronome, service, stripe } =
        createReconciliationHarness({
          externalInvoice: {
            issuedAt: '2026-08-29T10:40:00.000Z',
            pdfUrl: 'https://invoice.example/in_metronome',
            status,
            stripeInvoiceId: 'in_metronome',
            stripePaymentIntentId: 'pi_metronome',
            subtotalCents: 2_500,
            taxCents: 500,
            totalCents: 3_000,
          },
        });

      await expect(
        service.reconcileCustomerFunding(action),
      ).resolves.toMatchObject({ state: 'FAILED_DEFINITIVE' });
      expect(stripe.readPaymentGatedInvoicePayment).not.toHaveBeenCalled();
      expect(
        metronome.updatePaymentGatedPrepaidCommitExpiry,
      ).not.toHaveBeenCalled();
      expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          nextState: 'FAILED_DEFINITIVE',
          patch: expect.objectContaining({ failureCode }),
        }),
      );
    },
  );

  it('records action-required without persisting the client secret', async () => {
    const { action, journal, service } = createReconciliationHarness({
      stripeState: {
        clientSecret: 'pi_action_secret',
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: 'pi_metronome',
        principalCents: 2_500,
        status: 'ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3_000,
      },
    });

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'PAYMENT_ACTION_REQUIRED' });
    const transition =
      journal.transitionCompareAndSet.mock.calls[
        journal.transitionCompareAndSet.mock.calls.length - 1
      ]?.[0];
    expect(transition.nextState).toBe('PAYMENT_ACTION_REQUIRED');
    expect(JSON.stringify(transition.patch)).not.toContain('pi_action_secret');
  });

  it('moves an expired action-required payment to reconciliation-required', async () => {
    jest.setSystemTime(new Date('2026-09-06T10:00:00.000Z'));
    const { action, journal, service } = createReconciliationHarness({
      stripeState: {
        clientSecret: 'pi_action_secret',
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: 'pi_metronome',
        principalCents: 2_500,
        status: 'ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3_000,
      },
    });

    await service.reconcileCustomerFunding(action);
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextState: 'RECONCILIATION_REQUIRED',
        patch: expect.objectContaining({
          safeErrorCode: 'PAYMENT_ACTION_DEADLINE_EXPIRED',
        }),
      }),
    );
  });

  it('records an exact definitive payment failure with no balance expiry', async () => {
    const { action, journal, metronome, service } = createReconciliationHarness(
      {
        stripeState: {
          invoiceUrl: 'https://invoice.example/in_metronome',
          paymentIntentId: 'pi_metronome',
          principalCents: 2_500,
          reason: 'PAYMENT_METHOD_REQUIRED',
          status: 'FAILED_DEFINITIVE',
          stripeInvoiceId: 'in_metronome',
          taxCents: 500,
          totalCents: 3_000,
        },
      },
    );

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'FAILED_DEFINITIVE' });
    expect(
      metronome.updatePaymentGatedPrepaidCommitExpiry,
    ).not.toHaveBeenCalled();
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextState: 'FAILED_DEFINITIVE',
        patch: expect.objectContaining({
          failureCode: 'PAYMENT_METHOD_REQUIRED',
          expiresAt: null,
        }),
      }),
    );
  });

  it('persists recovered Metronome IDs after an uncertain create response', async () => {
    const { action, journal, service } = createReconciliationHarness({
      actionOverrides: {
        commitmentId: null,
        metronomeEditId: null,
        state: 'RECONCILIATION_REQUIRED',
      },
    });

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'SUCCEEDED' });
    expect(journal.transitionCompareAndSet.mock.calls[0][0]).toEqual({
      expectedState: 'RECONCILIATION_REQUIRED',
      id: 'funding-action-id',
      nextState: 'METRONOME_EDIT_RECORDED',
      patch: {
        commitmentId: 'commitment-id',
        metronomeEditId: 'edit-id',
        reconciliationAttemptCount: 0,
        nextReconciliationAt: now,
        reconciliationClaimedAt: null,
        safeErrorCode: null,
      },
      workspaceId,
    });
  });

  it('reconciles a pending customer funding action after a provider-write crash', async () => {
    const { action, journal, metronome, service } = createReconciliationHarness(
      {
        actionOverrides: {
          commitmentId: null,
          metronomeEditId: null,
          state: 'PENDING',
        },
      },
    );

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'SUCCEEDED' });
    expect(metronome.recoverPaymentGatedPrepaidCommit).toHaveBeenCalledWith(
      expect.objectContaining({ principalCents: 2_500 }),
    );
    expect(journal.transitionCompareAndSet.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        expectedState: 'PENDING',
        nextState: 'METRONOME_EDIT_RECORDED',
      }),
    );
  });
  it('uses the recorded phase when reconciliation fails after recovering IDs', async () => {
    const { action, journal, metronome, service } = createReconciliationHarness(
      {
        actionOverrides: {
          commitmentId: null,
          metronomeEditId: null,
          state: 'RECONCILIATION_REQUIRED',
        },
      },
    );
    metronome.readPaymentGatedPrepaidCommitInvoice.mockRejectedValue(
      new Error('temporary invoice read failure'),
    );

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'RECONCILIATION_REQUIRED' });
    expect(journal.transitionCompareAndSet.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        expectedState: 'METRONOME_EDIT_RECORDED',
        nextState: 'RECONCILIATION_REQUIRED',
      }),
    );
  });

  it('resumes paid expiry proof from durable intent without provisional recovery', async () => {
    const { action, metronome, service } = createReconciliationHarness({
      actionOverrides: {
        collectedTotalCents: '3000',
        metronomeInvoiceId: 'metronome-invoice-id',
        paymentReceipt: {
          expiryUpdateIntent: {
            accessScheduleItemId: 'access-schedule-item-id',
            invoiceId: 'metronome-invoice-id',
            paidAt: '2026-08-29T10:40:00.000Z',
            recordedAt: now.toISOString(),
          },
        },
        state: 'PAYMENT_PENDING',
        stripeInvoiceId: 'in_metronome',
        stripePaymentIntentId: 'pi_metronome',
        taxCents: '500',
      },
      expiryAlreadyApplied: true,
    });

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'SUCCEEDED' });
    expect(metronome.recoverPaymentGatedPrepaidCommit).not.toHaveBeenCalled();
    expect(
      metronome.updatePaymentGatedPrepaidCommitExpiry,
    ).not.toHaveBeenCalled();
  });

  it('keeps a recovered commitment pending while its invoice materializes', async () => {
    const { action, journal, metronome, service } = createReconciliationHarness(
      { recoveryInvoiceId: null },
    );

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'PAYMENT_PENDING' });
    expect(
      metronome.readPaymentGatedPrepaidCommitInvoice,
    ).not.toHaveBeenCalled();
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextState: 'PAYMENT_PENDING',
        patch: expect.objectContaining({
          commitmentId: 'commitment-id',
          metronomeEditId: 'edit-id',
        }),
      }),
    );
  });

  it('marks a void Metronome payment invoice definitively failed', async () => {
    const { action, journal, service } = createReconciliationHarness({
      externalInvoice: null,
      invoiceStatus: 'VOID',
    });

    await expect(
      service.reconcileCustomerFunding(action),
    ).resolves.toMatchObject({ state: 'FAILED_DEFINITIVE' });
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextState: 'FAILED_DEFINITIVE',
        patch: expect.objectContaining({
          expiresAt: null,
          failureCode: 'METRONOME_INVOICE_VOID',
          nextReconciliationAt: null,
        }),
      }),
    );
  });

  it('returns an exact action-required client secret only after re-verifying the workspace payment', async () => {
    const { action, journal, service } = createReconciliationHarness({
      actionOverrides: {
        collectedTotalCents: '3000',
        metronomeInvoiceId: 'metronome-invoice-id',
        state: 'PAYMENT_ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        stripePaymentIntentId: 'pi_metronome',
        taxCents: '500',
      },
      stripeState: {
        clientSecret: 'pi_action_secret',
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: 'pi_metronome',
        principalCents: 2_500,
        status: 'ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3_000,
      },
    });

    await expect(
      service.getCustomerFundingPaymentAction({ action, workspaceId }),
    ).resolves.toEqual({
      clientSecret: 'pi_action_secret',
      paymentIntentId: 'pi_metronome',
      stripeInvoiceId: 'in_metronome',
    });
    expect(journal.transitionCompareAndSet).not.toHaveBeenCalled();
  });

  it('never exposes an expired payment-action client secret', async () => {
    jest.setSystemTime(new Date('2026-09-06T10:00:00.000Z'));
    const { action, service, stripe } = createReconciliationHarness({
      actionOverrides: {
        collectedTotalCents: '3000',
        metronomeInvoiceId: 'metronome-invoice-id',
        state: 'PAYMENT_ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        stripePaymentIntentId: 'pi_metronome',
        taxCents: '500',
      },
      stripeState: {
        clientSecret: 'pi_action_secret',
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: 'pi_metronome',
        principalCents: 2_500,
        status: 'ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3_000,
      },
    });

    await expect(
      service.getCustomerFundingPaymentAction({ action, workspaceId }),
    ).rejects.toThrow('Customer AI payment action is unavailable');
    expect(stripe.readPaymentGatedInvoicePayment).not.toHaveBeenCalled();
  });

  it('rechecks the action deadline after authoritative remote reads', async () => {
    const { action, service, stripe } = createReconciliationHarness({
      actionOverrides: {
        collectedTotalCents: '3000',
        metronomeInvoiceId: 'metronome-invoice-id',
        state: 'PAYMENT_ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        stripePaymentIntentId: 'pi_metronome',
        taxCents: '500',
      },
      stripeState: {
        clientSecret: 'pi_action_secret',
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: 'pi_metronome',
        principalCents: 2_500,
        status: 'ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3_000,
      },
    });
    stripe.readPaymentGatedInvoicePayment.mockImplementation(async () => {
      jest.setSystemTime(new Date('2026-09-05T10:00:00.000Z'));
      return {
        clientSecret: 'pi_action_secret',
        invoiceUrl: 'https://invoice.example/in_metronome',
        paymentIntentId: 'pi_metronome',
        principalCents: 2_500,
        status: 'ACTION_REQUIRED',
        stripeInvoiceId: 'in_metronome',
        taxCents: 500,
        totalCents: 3_000,
      };
    });

    await expect(
      service.getCustomerFundingPaymentAction({ action, workspaceId }),
    ).rejects.toThrow('Customer AI payment action is unavailable');
  });
  it('acknowledges browser confirmation only by returning to payment pending', async () => {
    const { action, journal, service } = createReconciliationHarness({
      actionOverrides: { state: 'PAYMENT_ACTION_REQUIRED' },
    });

    await service.acknowledgeCustomerFundingPaymentAction({
      action,
      workspaceId,
    });
    expect(journal.transitionCompareAndSet).toHaveBeenCalledWith({
      expectedState: 'PAYMENT_ACTION_REQUIRED',
      id: 'funding-action-id',
      nextState: 'PAYMENT_PENDING',
      patch: {
        reconciliationAttemptCount: 0,
        nextReconciliationAt: now,
        reconciliationClaimedAt: null,
        safeErrorCode: null,
      },
      workspaceId,
    });
  });
});
