import { createHash } from 'node:crypto';

import { MetronomeClientException } from '../metronome-client.exception';
import { MetronomeClientExceptionCode } from '../metronome-client.exception';
import {
  AI_TOP_UP_PRESETS,
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
  const fundingIdentity = createHash('sha256')
    .update(
      `${workspaceId}:AI_25_USD:${idempotencyKey}:fiat-credit-type-id:USD (cents)`,
    )
    .digest('hex');

  const createAction = (
    overrides: Partial<ManagedProviderFundingActionEntity> = {},
  ) =>
    ({
      actionType: 'PREPAID_COMMIT',
      amountCents: '2500',
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
        fundingIdentity,
        fiatCreditTypeId: 'fiat-credit-type-id',
        fiatCreditTypeName: 'USD (cents)',
        paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
        preset: 'AI_25_USD',
        purchaseAt,
      },
      permissionUsed: 'workspace_billing',
      prepaidPrincipalCents: '2500',
      reason: 'Customer AI top-up AI_25_USD',
      state: 'PENDING',
      workspaceId,
      ...overrides,
    }) as unknown as ManagedProviderFundingActionEntity;

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
    externalInvoice?:
      | null
      | {
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
    Object.assign(harness.metronome, {
      assertPaymentGatedPrepaidCommitExpiry: jest
        .fn()
        .mockResolvedValue({ expiresAt: '2027-08-29T10:40:00.000Z' }),
      readPaymentGatedPrepaidCommitInvoice: jest.fn().mockResolvedValue({
        externalInvoice,
        issuedAt: '2026-08-29T10:37:42.123Z',
        metronomeInvoiceId: 'metronome-invoice-id',
        principalCents: 2_500,
        status: 'FINALIZED',
      }),
      recoverPaymentGatedPrepaidCommit: jest.fn().mockResolvedValue({
        accessScheduleItemId: 'access-schedule-item-id',
        archivedAt: null,
        commitmentId: 'commitment-id',
        invoiceId: 'metronome-invoice-id',
        metronomeEditId: 'edit-id',
      }),
      updatePaymentGatedPrepaidCommitExpiry: jest
        .fn()
        .mockResolvedValue({ metronomeEditId: 'expiry-edit-id' }),
    });
    Object.assign(harness.stripe, {
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

    return { ...harness, action };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers only the three fixed tax-exclusive principal presets', () => {
    expect(AI_TOP_UP_PRESETS).toEqual({
      AI_25_USD: 2_500,
      AI_50_USD: 5_000,
      AI_100_USD: 10_000,
    });
  });

  it.each([
    ['disabled', false, [workspaceId]],
    ['not allowlisted', true, ['other-workspace']],
  ])('rejects new funding while %s before creating an intent', async (_, enabled, allowlist) => {
    const { journal, service, workspaceCustomer } = createHarness({
      customerFundingEnabled: enabled,
      allowedWorkspaceIds: allowlist,
    });

    await expect(
      service.createCustomerFunding({
        actorId,
        idempotencyKey,
        preset: 'AI_25_USD',
        workspaceId,
      }),
    ).rejects.toThrow('Customer AI funding is unavailable');
    expect(journal.createPending).not.toHaveBeenCalled();
    expect(workspaceCustomer.ensureWorkspaceContract).not.toHaveBeenCalled();
  });

  it('returns an exact existing replay without reopening remote admission', async () => {
    const existing = createAction();
    const { journal, metronome, service, workspaceCustomer } = createHarness({
      customerFundingEnabled: false,
      allowedWorkspaceIds: [],
      existing,
    });

    await expect(
      service.createCustomerFunding({
        actorId,
        idempotencyKey,
        preset: 'AI_25_USD',
        workspaceId,
      }),
    ).resolves.toBe(existing);
    expect(journal.createPending).not.toHaveBeenCalled();
    expect(workspaceCustomer.ensureWorkspaceContract).not.toHaveBeenCalled();
    expect(metronome.createPaymentGatedPrepaidCommit).not.toHaveBeenCalled();
  });

  it.each([
    ['actor', { operatorIdentity: 'other-actor' }],
    ['preset', { amountCents: '5000' }],
    [
      'fiat credit type',
      {
        paymentEvidence: {
          fiatCreditTypeId: 'other-credit-type-id',
          fiatCreditTypeName: 'USD (cents)',
          fundingIdentity,
          paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
          preset: 'AI_25_USD',
          purchaseAt,
        },
      },
    ],
  ])('rejects a conflicting existing %s replay', async (_, overrides) => {
    const { service } = createHarness({ existing: createAction(overrides) });

    await expect(
      service.createCustomerFunding({
        actorId,
        idempotencyKey,
        preset: 'AI_25_USD',
        workspaceId,
      }),
    ).rejects.toThrow('Customer AI funding replay conflicts');
  });

  it('records one exact intent before the payment-gated Metronome write', async () => {
    const { journal, metronome, recorded, service, stripe, workspaceCustomer } =
      createHarness();

    await expect(
      service.createCustomerFunding({
        actorId,
        idempotencyKey,
        preset: 'AI_25_USD',
        workspaceId,
      }),
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
        amountCents: 2_500,
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
        prepaidPrincipalCents: 2_500,
        reason: 'Customer AI top-up AI_25_USD',
        stripeBillingConfigurationId: 'billing-config-id',
        stripeCustomerId,
        stripeDeliveryMethodId: 'delivery-method-id',
        workspaceId,
      }),
    );
    expect(journal.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentEvidence: {
          fundingIdentity: expect.any(String),
          fiatCreditTypeId: 'fiat-credit-type-id',
          fiatCreditTypeName: 'USD (cents)',
          paymentActionDeadlineAt: '2026-09-05T10:00:00.000Z',
          preset: 'AI_25_USD',
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
      principalCents: 2_500,
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

  it('never accepts client-provided cents instead of the selected preset', async () => {
    const { metronome, service } = createHarness();

    await service.createCustomerFunding({
      actorId,
      amountCents: 1,
      idempotencyKey,
      preset: 'AI_50_USD',
      workspaceId,
    } as unknown as Parameters<
      ManagedProviderCustomerFundingService['createCustomerFunding']
    >[0]);

    expect(metronome.createPaymentGatedPrepaidCommit).toHaveBeenCalledWith(
      expect.objectContaining({ principalCents: 5_000 }),
    );
  });

  it('records reconciliation-required after an uncertain Metronome write', async () => {
    const { journal, service } = createHarness({
      createCommitError: new MetronomeClientException(
        MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      ),
    });

    await service.createCustomerFunding({
      actorId,
      idempotencyKey,
      preset: 'AI_25_USD',
      workspaceId,
    });

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

  it('marks paid funding succeeded only after exact expiry correction and proof', async () => {
    const { action, journal, metronome, service } =
      createReconciliationHarness();

    await expect(service.reconcileCustomerFunding(action)).resolves.toMatchObject(
      { state: 'SUCCEEDED' },
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
        journal.transitionCompareAndSet.mock.calls.at(-1)?.[0].patch,
      ),
    ).not.toContain('clientSecret');
  });

  it('keeps an incomplete external invoice payment pending without expiry writes', async () => {
    const { action, journal, metronome, service, stripe } =
      createReconciliationHarness({ externalInvoice: null });

    await expect(service.reconcileCustomerFunding(action)).resolves.toMatchObject(
      { state: 'PAYMENT_PENDING' },
    );
    expect(stripe.readPaymentGatedInvoicePayment).not.toHaveBeenCalled();
    expect(
      metronome.updatePaymentGatedPrepaidCommitExpiry,
    ).not.toHaveBeenCalled();
    expect(journal.transitionCompareAndSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextState: 'PAYMENT_PENDING',
        patch: expect.objectContaining({
          metronomeInvoiceId: 'metronome-invoice-id',
        }),
      }),
    );
  });

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

    await expect(service.reconcileCustomerFunding(action)).resolves.toMatchObject(
      { state: 'PAYMENT_ACTION_REQUIRED' },
    );
    const transition = journal.transitionCompareAndSet.mock.calls.at(-1)?.[0];
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
    const { action, journal, metronome, service } =
      createReconciliationHarness({
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
      });

    await expect(service.reconcileCustomerFunding(action)).resolves.toMatchObject(
      { state: 'FAILED_DEFINITIVE' },
    );
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
        nextReconciliationAt: now,
        reconciliationClaimedAt: null,
        safeErrorCode: null,
      },
      workspaceId,
    });
  });
});
