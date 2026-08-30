import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { type ManagedProviderFundingActionEntity } from '../entities/managed-provider-funding-action.entity';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import {
  ManagedProviderStripeService,
  type WorkspaceBillingDetailsInput,
  type WorkspaceBillingDetailsSummary,
} from '../stripe/managed-provider-stripe.service';
import { toMetronomeHourBoundary } from '../utils/to-metronome-hour-boundary.util';
import { ManagedProviderFundingJournalService } from './managed-provider-funding-journal.service';
import { MetronomeClientService } from './metronome-client.service';
import { MetronomeWorkspaceCustomerService } from './metronome-workspace-customer.service';

export const AI_TOP_UP_PRESETS = {
  AI_25_USD: 2_500,
  AI_50_USD: 5_000,
  AI_100_USD: 10_000,
} as const;

export type AiTopUpPreset = keyof typeof AI_TOP_UP_PRESETS;

export type CreateCustomerFundingInput = Readonly<{
  actorId: string;
  idempotencyKey: string;
  preset: AiTopUpPreset;
  workspaceId: string;
}>;

export type CustomerFundingPaymentMethodPreparation = Readonly<{
  billingSummary: WorkspaceBillingDetailsSummary | null;
  clientSecret: string | null;
  publishableKey: string | null;
  ready: boolean;
  setupIntentId: string | null;
}>;

const customerFundingEvidenceSchema = z.object({
  fiatCreditTypeId: z.string().min(1),
  fiatCreditTypeName: z.literal('USD (cents)'),
  fundingIdentity: z.string().min(1),
  paymentActionDeadlineAt: z.string().min(1),
  preset: z.enum(['AI_25_USD', 'AI_50_USD', 'AI_100_USD']),
  purchaseAt: z.string().min(1),
});
const customerFundingExpiryIntentReceiptSchema = z.object({
  expiryUpdateIntent: z.object({
    accessScheduleItemId: z.string().min(1),
    invoiceId: z.string().min(1),
    paidAt: z.string().min(1),
    recordedAt: z.string().min(1),
  }),
});

const isAiTopUpPreset = (value: unknown): value is AiTopUpPreset =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(AI_TOP_UP_PRESETS, value);

@Injectable()
export class ManagedProviderCustomerFundingService {
  constructor(
    private readonly fundingJournal: ManagedProviderFundingJournalService,
    private readonly metronomeClient: MetronomeClientService,
    private readonly workspaceCustomer: MetronomeWorkspaceCustomerService,
    private readonly stripe: ManagedProviderStripeService,
    private readonly twentyConfig: TwentyConfigService,
  ) {}

  isCustomerFundingAvailable(workspaceId: string): boolean {
    return (
      this.twentyConfig.get('MANAGED_PROVIDER_CUSTOMER_FUNDING_ENABLED') ===
        true &&
      this.twentyConfig
        .get('MANAGED_PROVIDER_CUSTOMER_FUNDING_WORKSPACE_IDS')
        .includes(workspaceId)
    );
  }

  async getCustomerFundingAction(
    workspaceId: string,
    actionId: string,
  ): Promise<ManagedProviderFundingActionEntity> {
    const action = await this.fundingJournal.findWorkspaceAction(
      workspaceId,
      actionId,
    );

    if (action === null) {
      throw new Error('Customer AI funding action was not found');
    }

    return action;
  }

  async listCustomerFundingHistory(
    workspaceId: string,
  ): Promise<ManagedProviderFundingActionEntity[]> {
    return await this.fundingJournal.listWorkspaceActions(workspaceId, 50);
  }

  async isCustomerFundingPaymentMethodReady(
    workspaceId: string,
  ): Promise<boolean> {
    if (!this.isCustomerFundingAvailable(workspaceId)) return false;

    try {
      await this.stripe.assertWorkspaceBillingDetailsReady({
        metronomeBaseUrlEnvironment: this.getCustomerFundingEnvironment(),
        workspaceId,
      });

      return true;
    } catch {
      return false;
    }
  }

  async getCustomerFundingBillingSummary(
    workspaceId: string,
  ): Promise<WorkspaceBillingDetailsSummary | null> {
    if (!this.isCustomerFundingAvailable(workspaceId)) return null;

    try {
      return await this.stripe.getWorkspaceBillingDetailsSummary({
        metronomeBaseUrlEnvironment: this.getCustomerFundingEnvironment(),
        workspaceId,
      });
    } catch {
      return null;
    }
  }

  async prepareCustomerFundingPaymentMethod(
    workspaceId: string,
  ): Promise<CustomerFundingPaymentMethodPreparation> {
    if (!this.isCustomerFundingAvailable(workspaceId)) {
      throw new Error('Customer AI funding is unavailable');
    }

    const environment = this.getCustomerFundingEnvironment();

    let billingSummary: WorkspaceBillingDetailsSummary | null = null;

    try {
      billingSummary = await this.stripe.getWorkspaceBillingDetailsSummary({
        metronomeBaseUrlEnvironment: environment,
        workspaceId,
      });
      await this.stripe.assertWorkspaceBillingDetailsReady({
        metronomeBaseUrlEnvironment: environment,
        workspaceId,
      });

      return {
        billingSummary,
        clientSecret: null,
        publishableKey: null,
        ready: true,
        setupIntentId: null,
      };
    } catch {
      if (billingSummary?.paymentMethodReady) {
        return {
          billingSummary,
          clientSecret: null,
          publishableKey: null,
          ready: false,
          setupIntentId: null,
        };
      }

      const preparation = await this.stripe.prepareWorkspacePaymentMethod({
        metronomeBaseUrlEnvironment: environment,
        workspaceId,
      });

      return {
        billingSummary,
        clientSecret: preparation.clientSecret,
        publishableKey: preparation.publishableKey,
        ready: false,
        setupIntentId: preparation.setupIntentId,
      };
    }
  }

  async completeCustomerFundingPaymentMethod(
    workspaceId: string,
    setupIntentId: string | null,
    billingDetails: WorkspaceBillingDetailsInput,
  ): Promise<CustomerFundingPaymentMethodPreparation> {
    if (!this.isCustomerFundingAvailable(workspaceId)) {
      throw new Error('Customer AI funding is unavailable');
    }

    const environment = this.getCustomerFundingEnvironment();

    if (setupIntentId !== null && setupIntentId.trim() !== '') {
      await this.stripe.completeWorkspacePaymentMethodSetup({
        metronomeBaseUrlEnvironment: environment,
        setupIntentId,
        workspaceId,
      });
    }

    const billingSummary = await this.stripe.updateWorkspaceBillingDetails({
      billingDetails,
      metronomeBaseUrlEnvironment: environment,
      workspaceId,
    });

    if (!billingSummary.paymentMethodReady) {
      throw new Error('Customer AI funding payment method is unavailable');
    }

    return {
      billingSummary,
      clientSecret: null,
      publishableKey: null,
      ready: true,
      setupIntentId: null,
    };
  }

  async createCustomerFunding(
    input: CreateCustomerFundingInput,
  ): Promise<ManagedProviderFundingActionEntity> {
    if (
      !isAiTopUpPreset(input.preset) ||
      input.actorId.trim() === '' ||
      input.idempotencyKey.trim() === '' ||
      input.workspaceId.trim() === ''
    ) {
      throw new Error('Customer AI funding request is invalid');
    }

    const principalCents = AI_TOP_UP_PRESETS[input.preset];
    const existing = await this.fundingJournal.findByIdempotency(
      input.workspaceId,
      input.idempotencyKey,
    );

    if (existing !== null) {
      this.assertExistingReplay(existing, input, principalCents);
      return existing;
    }

    if (
      !this.isCustomerFundingAvailable(input.workspaceId) ||
      this.twentyConfig.get('METRONOME_ENABLED') !== true ||
      this.twentyConfig.get('MANAGED_OPENROUTER_ENABLED') !== true
    ) {
      throw new Error('Customer AI funding is unavailable');
    }

    const environment = this.twentyConfig.get(
      'METRONOME_BASE_URL_ENVIRONMENT',
    );
    const chargeProductId = this.twentyConfig.get(
      'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID',
    );
    const creditProductId = this.twentyConfig.get(
      'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID',
    );

    if (
      (environment !== 'PRODUCTION' && environment !== 'SANDBOX') ||
      chargeProductId.trim() === '' ||
      creditProductId.trim() === ''
    ) {
      throw new Error('Customer AI funding is unavailable');
    }

    const paymentMethod = await this.stripe.assertWorkspacePaymentMethodReady({
      metronomeBaseUrlEnvironment: environment,
      workspaceId: input.workspaceId,
    });
    await this.stripe.assertWorkspaceBillingDetailsReady({
      metronomeBaseUrlEnvironment: environment,
      workspaceId: input.workspaceId,
    });
    await this.workspaceCustomer.ensureWorkspaceCustomer(input.workspaceId);
    const billingConfiguration =
      await this.workspaceCustomer.ensureStripeBillingConfiguration(
        input.workspaceId,
        paymentMethod.stripeCustomerId,
      );
    const contractId = await this.workspaceCustomer.ensureWorkspaceContract(
      input.workspaceId,
    );
    const billingContext =
      await this.workspaceCustomer.ensureWorkspaceContractStripeBillingContext({
        billingConfigurationId: billingConfiguration.id,
        contractId,
        environment,
        workspaceId: input.workspaceId,
      });

    if (
      paymentMethod.ready !== true ||
      paymentMethod.stripeCustomerId !== billingContext.stripeCustomerId ||
      billingConfiguration.id !== billingContext.billingConfigurationId ||
      billingConfiguration.stripeCustomerId !== billingContext.stripeCustomerId ||
      billingContext.metronomeContractId !== contractId ||
      billingContext.environment !== environment ||
      billingContext.fiatCreditTypeName !== 'USD (cents)'
    ) {
      throw new Error('Customer AI billing context is invalid');
    }

    const purchaseAt = toMetronomeHourBoundary(new Date()).toISOString();
    const paymentActionDeadlineAt = new Date(
      Date.parse(purchaseAt) + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const fundingIdentity = this.getFundingIdentity(
      input,
      billingContext.fiatCreditTypeId,
      billingContext.fiatCreditTypeName,
    );
    const externalReference = `customer-ai-top-up:${input.workspaceId}:${input.idempotencyKey}`;
    const action = await this.fundingJournal.createPending({
      actionType: 'PREPAID_COMMIT',
      amountCents: principalCents,
      applicableProductIds: [chargeProductId],
      applicability: { productIds: [chargeProductId] },
      creditProductId,
      currency: 'USD',
      expiresAt: null,
      externalReference,
      idempotencyKey: input.idempotencyKey,
      metronomeContractId: billingContext.metronomeContractId,
      metronomeCustomerId: billingContext.metronomeCustomerId,
      operatorIdentity: input.actorId,
      paymentEvidence: {
        fiatCreditTypeId: billingContext.fiatCreditTypeId,
        fiatCreditTypeName: billingContext.fiatCreditTypeName,
        fundingIdentity,
        paymentActionDeadlineAt,
        preset: input.preset,
        purchaseAt,
      },
      permissionUsed: 'workspace_billing',
      prepaidPrincipalCents: principalCents,
      reason: `Customer AI top-up ${input.preset}`,
      stripeBillingConfigurationId: billingContext.billingConfigurationId,
      stripeCustomerId: billingContext.stripeCustomerId,
      stripeDeliveryMethodId: billingContext.deliveryMethodId,
      workspaceId: input.workspaceId,
    });

    if (action.createdByCaller === false) {
      this.assertExistingReplay(action, input, principalCents);
      return action;
    }

    try {
      const receipt = await this.metronomeClient.createPaymentGatedPrepaidCommit({
        chargeProductId,
        commitmentProductId: creditProductId,
        contractId: billingContext.metronomeContractId,
        customerId: billingContext.metronomeCustomerId,
        fundingActionId: action.id,
        fundingIdentity,
        principalCents,
        purchaseAt,
        uniquenessKey: action.metronomeUniquenessKey,
      });

      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: 'PENDING',
        id: action.id,
        nextState: 'METRONOME_EDIT_RECORDED',
        patch: {
          commitmentId: receipt.commitmentId,
          metronomeEditId: receipt.metronomeEditId,
          nextReconciliationAt: new Date(),
        },
        workspaceId: input.workspaceId,
      });
    } catch (error) {
      const safeErrorCode =
        error instanceof MetronomeClientException
          ? error.code
          : MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN;

      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: 'PENDING',
        id: action.id,
        nextState: 'RECONCILIATION_REQUIRED',
        patch: {
          nextReconciliationAt: new Date(),
          safeErrorCode,
        },
        workspaceId: input.workspaceId,
      });
    }
  }

  async reconcileCustomerFunding(
    action: ManagedProviderFundingActionEntity,
  ): Promise<ManagedProviderFundingActionEntity> {
    if (
      action.state === 'SUCCEEDED' ||
      action.state === 'FAILED_DEFINITIVE' ||
      action.state === 'REFUND_INTENT_RECORDED' ||
      action.state === 'REFUND_RECONCILIATION_REQUIRED' ||
      action.state === 'REFUNDED'
    ) {
      return action;
    }

    try {
      return await this.reconcileCustomerFundingUnsafe(action);
    } catch {
      if (action.workspaceId === null) {
        throw new Error('Customer AI funding workspace is invalid');
      }

      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'RECONCILIATION_REQUIRED',
        patch: {
          nextReconciliationAt: new Date(Date.now() + 5 * 60 * 1000),
          reconciliationClaimedAt: null,
          safeErrorCode: 'CUSTOMER_FUNDING_RECONCILIATION_REQUIRED',
        },
        workspaceId: action.workspaceId,
      });
    }
  }

  async getCustomerFundingPaymentAction({
    action,
    workspaceId,
  }: {
    action: ManagedProviderFundingActionEntity;
    workspaceId: string;
  }): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    stripeInvoiceId: string;
  }> {
    const evidence = customerFundingEvidenceSchema.safeParse(
      action.paymentEvidence,
    );
    const principalCents = Number(action.prepaidPrincipalCents);
    const taxCents = Number(action.taxCents);
    const totalCents = Number(action.collectedTotalCents);
    const paymentActionDeadline = evidence.success
      ? Date.parse(evidence.data.paymentActionDeadlineAt)
      : Number.NaN;

    if (
      !evidence.success ||
      action.state !== 'PAYMENT_ACTION_REQUIRED' ||
      action.workspaceId !== workspaceId ||
      action.metronomeCustomerId === null ||
      action.metronomeContractId === null ||
      action.commitmentId === null ||
      action.metronomeInvoiceId === null ||
      action.stripeBillingConfigurationId === null ||
      action.stripeDeliveryMethodId === null ||
      action.stripeCustomerId === null ||
      action.stripeInvoiceId === null ||
      action.stripePaymentIntentId === null ||
      !Number.isSafeInteger(principalCents) ||
      principalCents <= 0 ||
      !Number.isSafeInteger(taxCents) ||
      taxCents < 0 ||
      !Number.isSafeInteger(totalCents) ||
      totalCents !== principalCents + taxCents ||
      !Number.isFinite(paymentActionDeadline) ||
      Date.now() >= paymentActionDeadline
    ) {
      throw new Error('Customer AI payment action is unavailable');
    }

    const environment = this.twentyConfig.get(
      'METRONOME_BASE_URL_ENVIRONMENT',
    );

    if (environment !== 'PRODUCTION' && environment !== 'SANDBOX') {
      throw new Error('Customer AI payment action is unavailable');
    }

    const billingContext =
      await this.workspaceCustomer.ensureWorkspaceContractStripeBillingContext({
        billingConfigurationId: action.stripeBillingConfigurationId,
        contractId: action.metronomeContractId,
        environment,
        workspaceId,
      });

    if (
      billingContext.deliveryMethodId !== action.stripeDeliveryMethodId ||
      billingContext.metronomeCustomerId !== action.metronomeCustomerId ||
      billingContext.stripeCustomerId !== action.stripeCustomerId ||
      billingContext.fiatCreditTypeId !== evidence.data.fiatCreditTypeId
    ) {
      throw new Error('Customer AI payment action is unavailable');
    }

    const invoice =
      await this.metronomeClient.readPaymentGatedPrepaidCommitInvoice({
        commitmentId: action.commitmentId,
        contractId: action.metronomeContractId,
        customerId: action.metronomeCustomerId,
        fiatCreditTypeId: evidence.data.fiatCreditTypeId,
        invoiceId: action.metronomeInvoiceId,
        principalCents,
      });
    const external = invoice.externalInvoice;

    if (
      invoice.status !== 'FINALIZED' ||
      external === null ||
      external.stripeInvoiceId !== action.stripeInvoiceId ||
      external.stripePaymentIntentId !== action.stripePaymentIntentId ||
      external.subtotalCents !== principalCents ||
      external.taxCents !== taxCents ||
      external.totalCents !== totalCents
    ) {
      throw new Error('Customer AI payment action is unavailable');
    }

    const stripeState = await this.stripe.readPaymentGatedInvoicePayment({
      expectedPaymentIntentId: action.stripePaymentIntentId,
      expectedPrincipalCents: principalCents,
      expectedTaxCents: taxCents,
      expectedTotalCents: totalCents,
      metronomeBaseUrlEnvironment: environment,
      metronomeInvoiceId: action.metronomeInvoiceId,
      stripeInvoiceId: action.stripeInvoiceId,
      workspaceId,
    });

    if (
      stripeState.status !== 'ACTION_REQUIRED' ||
      Date.now() >= paymentActionDeadline
    ) {
      throw new Error('Customer AI payment action is unavailable');
    }

    return {
      clientSecret: stripeState.clientSecret,
      paymentIntentId: stripeState.paymentIntentId,
      stripeInvoiceId: stripeState.stripeInvoiceId,
    };
  }

  async acknowledgeCustomerFundingPaymentAction({
    action,
    workspaceId,
  }: {
    action: ManagedProviderFundingActionEntity;
    workspaceId: string;
  }): Promise<ManagedProviderFundingActionEntity> {
    const evidence = customerFundingEvidenceSchema.safeParse(
      action.paymentEvidence,
    );

    if (
      !evidence.success ||
      action.state !== 'PAYMENT_ACTION_REQUIRED' ||
      action.workspaceId !== workspaceId ||
      Date.now() >= Date.parse(evidence.data.paymentActionDeadlineAt)
    ) {
      throw new Error('Customer AI payment action is unavailable');
    }

    return await this.fundingJournal.transitionCompareAndSet({
      expectedState: 'PAYMENT_ACTION_REQUIRED',
      id: action.id,
      nextState: 'PAYMENT_PENDING',
      patch: {
        reconciliationAttemptCount: 0,
        nextReconciliationAt: new Date(),
        reconciliationClaimedAt: null,
        safeErrorCode: null,
      },
      workspaceId,
    });
  }

  private async reconcileCustomerFundingUnsafe(
    action: ManagedProviderFundingActionEntity,
  ): Promise<ManagedProviderFundingActionEntity> {
    const evidence = customerFundingEvidenceSchema.safeParse(
      action.paymentEvidence,
    );
    const principalCents = Number(action.prepaidPrincipalCents);
    const chargeProductIds = action.applicableProductIds;

    if (
      !evidence.success ||
      action.actionType !== 'PREPAID_COMMIT' ||
      action.workspaceId === null ||
      action.metronomeCustomerId === null ||
      action.metronomeContractId === null ||
      action.stripeBillingConfigurationId === null ||
      action.stripeDeliveryMethodId === null ||
      action.stripeCustomerId === null ||
      action.creditProductId === null ||
      chargeProductIds?.length !== 1 ||
      !Number.isSafeInteger(principalCents) ||
      principalCents <= 0 ||
      !Number.isFinite(Date.parse(evidence.data.purchaseAt)) ||
      !Number.isFinite(Date.parse(evidence.data.paymentActionDeadlineAt))
    ) {
      throw new Error('Customer AI funding evidence is invalid');
    }

    const environment = this.twentyConfig.get(
      'METRONOME_BASE_URL_ENVIRONMENT',
    );

    if (environment !== 'PRODUCTION' && environment !== 'SANDBOX') {
      throw new Error('Customer AI funding environment is invalid');
    }

    const billingContext =
      await this.workspaceCustomer.ensureWorkspaceContractStripeBillingContext({
        billingConfigurationId: action.stripeBillingConfigurationId,
        contractId: action.metronomeContractId,
        environment,
        workspaceId: action.workspaceId,
      });

    if (
      billingContext.billingConfigurationId !==
        action.stripeBillingConfigurationId ||
      billingContext.deliveryMethodId !== action.stripeDeliveryMethodId ||
      billingContext.metronomeCustomerId !== action.metronomeCustomerId ||
      billingContext.metronomeContractId !== action.metronomeContractId ||
      billingContext.stripeCustomerId !== action.stripeCustomerId ||
      billingContext.fiatCreditTypeId !== evidence.data.fiatCreditTypeId ||
      billingContext.fiatCreditTypeName !== evidence.data.fiatCreditTypeName
    ) {
      throw new Error('Customer AI funding billing context is invalid');
    }

    const commitInput = {
      chargeProductId: chargeProductIds[0],
      commitmentProductId: action.creditProductId,
      contractId: action.metronomeContractId,
      customerId: action.metronomeCustomerId,
      fundingActionId: action.id,
      fundingIdentity: evidence.data.fundingIdentity,
      principalCents,
      purchaseAt: evidence.data.purchaseAt,
      uniquenessKey: action.metronomeUniquenessKey,
    };
    const parsedExpiryIntent =
      customerFundingExpiryIntentReceiptSchema.safeParse(action.paymentReceipt);
    const recovered = parsedExpiryIntent.success
      ? action.commitmentId !== null &&
        action.metronomeEditId !== null &&
        action.metronomeInvoiceId ===
          parsedExpiryIntent.data.expiryUpdateIntent.invoiceId &&
        Number.isFinite(
          Date.parse(parsedExpiryIntent.data.expiryUpdateIntent.paidAt),
        ) &&
        Number.isFinite(
          Date.parse(parsedExpiryIntent.data.expiryUpdateIntent.recordedAt),
        )
        ? {
            accessScheduleItemId:
              parsedExpiryIntent.data.expiryUpdateIntent.accessScheduleItemId,
            archivedAt: null,
            commitmentId: action.commitmentId,
            invoiceId: parsedExpiryIntent.data.expiryUpdateIntent.invoiceId,
            metronomeEditId: action.metronomeEditId,
          }
        : null
      : await this.metronomeClient.recoverPaymentGatedPrepaidCommit(commitInput);

    if (
      recovered === null ||
      (action.commitmentId !== null &&
        recovered.commitmentId !== action.commitmentId) ||
      (action.metronomeEditId !== null &&
        recovered.metronomeEditId !== action.metronomeEditId)
    ) {
      throw new Error('Customer AI funding commitment is invalid');
    }

    const recoveredPatch = {
      commitmentId: recovered.commitmentId,
      metronomeEditId: recovered.metronomeEditId,
      reconciliationAttemptCount: 0,
      nextReconciliationAt: new Date(),
      reconciliationClaimedAt: null,
      safeErrorCode: null,
    };

    if (recovered.invoiceId === null) {
      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'PAYMENT_PENDING',
        patch: {
          ...recoveredPatch,
          nextReconciliationAt: new Date(Date.now() + 5 * 60 * 1000),
        },
        workspaceId: action.workspaceId,
      });
    }

    if (action.commitmentId === null || action.metronomeEditId === null) {
      const recorded = await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'METRONOME_EDIT_RECORDED',
        patch: recoveredPatch,
        workspaceId: action.workspaceId,
      });

      return await this.reconcileCustomerFunding(recorded);
    }

    const invoice =
      await this.metronomeClient.readPaymentGatedPrepaidCommitInvoice({
        commitmentId: recovered.commitmentId,
        contractId: action.metronomeContractId,
        customerId: action.metronomeCustomerId,
        fiatCreditTypeId: evidence.data.fiatCreditTypeId,
        invoiceId: recovered.invoiceId,
        principalCents,
      });
    const pendingPatch = {
      commitmentId: recovered.commitmentId,
      metronomeEditId: recovered.metronomeEditId,
      metronomeInvoiceId: invoice.metronomeInvoiceId,
      reconciliationAttemptCount: 0,
      nextReconciliationAt: new Date(Date.now() + 5 * 60 * 1000),
      reconciliationClaimedAt: null,
    };
    const external = invoice.externalInvoice;

    if (invoice.status === 'VOID') {
      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'FAILED_DEFINITIVE',
        patch: {
          ...pendingPatch,
          expiresAt: null,
          failureCode: 'METRONOME_INVOICE_VOID',
          nextReconciliationAt: null,
        },
        workspaceId: action.workspaceId,
      });
    }

    if (external === null || invoice.status === 'DRAFT') {
      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'PAYMENT_PENDING',
        patch: pendingPatch,
        workspaceId: action.workspaceId,
      });
    }

    if (
      external.stripeInvoiceId === null ||
      external.stripePaymentIntentId === null ||
      external.subtotalCents === null ||
      external.taxCents === null ||
      external.totalCents === null
    ) {
      if (
        external.status === 'PAYMENT_FAILED' ||
        external.status === 'UNCOLLECTIBLE' ||
        external.status === 'VOID' ||
        external.status === 'DELETED' ||
        external.status === 'INVALID_REQUEST_ERROR' ||
        external.status === 'SKIPPED'
      ) {
        return await this.fundingJournal.transitionCompareAndSet({
          expectedState: action.state,
          id: action.id,
          nextState: 'FAILED_DEFINITIVE',
          patch: {
            ...pendingPatch,
            expiresAt: null,
            failureCode: `METRONOME_${external.status}`,
            nextReconciliationAt: null,
          },
          workspaceId: action.workspaceId,
        });
      }

      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'PAYMENT_PENDING',
        patch: pendingPatch,
        workspaceId: action.workspaceId,
      });
    }

    const stripeState = await this.stripe.readPaymentGatedInvoicePayment({
      expectedPaymentIntentId: external.stripePaymentIntentId,
      expectedPrincipalCents: external.subtotalCents,
      expectedTaxCents: external.taxCents,
      expectedTotalCents: external.totalCents,
      metronomeBaseUrlEnvironment: environment,
      metronomeInvoiceId: invoice.metronomeInvoiceId,
      stripeInvoiceId: external.stripeInvoiceId,
      workspaceId: action.workspaceId,
    });
    const paymentPatch = {
      collectedTotalCents: stripeState.totalCents,
      metronomeInvoiceId: invoice.metronomeInvoiceId,
      paymentReceipt: {
        invoiceUrl: stripeState.invoiceUrl,
        paymentIntentId: stripeState.paymentIntentId,
        principalCents: stripeState.principalCents,
        status: stripeState.status,
        stripeInvoiceId: stripeState.stripeInvoiceId,
        taxCents: stripeState.taxCents,
        totalCents: stripeState.totalCents,
      },
      prepaidPrincipalCents: stripeState.principalCents,
      reconciliationAttemptCount: 0,
      reconciliationClaimedAt: null,
      stripeInvoiceId: stripeState.stripeInvoiceId,
      stripePaymentIntentId: stripeState.paymentIntentId,
      taxCents: stripeState.taxCents,
    };

    if (stripeState.status === 'FAILED_DEFINITIVE') {
      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'FAILED_DEFINITIVE',
        patch: {
          ...paymentPatch,
          expiresAt: null,
          failureCode: stripeState.reason,
          nextReconciliationAt: null,
        },
        workspaceId: action.workspaceId,
      });
    }

    if (stripeState.status === 'ACTION_REQUIRED') {
      const deadline = Date.parse(evidence.data.paymentActionDeadlineAt);

      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState:
          Date.now() > deadline
            ? 'RECONCILIATION_REQUIRED'
            : 'PAYMENT_ACTION_REQUIRED',
        patch: {
          ...paymentPatch,
          nextReconciliationAt: new Date(
            Date.now() > deadline
              ? Date.now() + 24 * 60 * 60 * 1000
              : Math.min(deadline, Date.now() + 5 * 60 * 1000),
          ),
          ...(Date.now() > deadline
            ? { safeErrorCode: 'PAYMENT_ACTION_DEADLINE_EXPIRED' }
            : {}),
        },
        workspaceId: action.workspaceId,
      });
    }

    if (stripeState.status === 'PENDING') {
      return await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: 'PAYMENT_PENDING',
        patch: {
          ...paymentPatch,
          nextReconciliationAt: new Date(Date.now() + 5 * 60 * 1000),
        },
        workspaceId: action.workspaceId,
      });
    }

    const expectedExpiryIntent = {
      accessScheduleItemId: recovered.accessScheduleItemId,
      invoiceId: recovered.invoiceId,
      paidAt: stripeState.paidAt,
      recordedAt: new Date().toISOString(),
    };
    let expiryIntent = expectedExpiryIntent;
    let completionAction = action;

    if (parsedExpiryIntent.success) {
      expiryIntent = parsedExpiryIntent.data.expiryUpdateIntent;
      if (
        expiryIntent.accessScheduleItemId !==
          expectedExpiryIntent.accessScheduleItemId ||
        expiryIntent.invoiceId !== expectedExpiryIntent.invoiceId ||
        expiryIntent.paidAt !== expectedExpiryIntent.paidAt
      ) {
        throw new Error('Customer AI funding expiry intent is invalid');
      }
    } else {
      completionAction = await this.fundingJournal.transitionCompareAndSet({
        expectedState: action.state,
        id: action.id,
        nextState: action.state,
        patch: {
          ...paymentPatch,
          nextReconciliationAt: new Date(),
          paymentReceipt: {
            ...paymentPatch.paymentReceipt,
            expiryUpdateIntent: expectedExpiryIntent,
            paidAt: stripeState.paidAt,
            status: 'PAID',
          },
        },
        workspaceId: action.workspaceId,
      });
    }

    const proofInput = {
      ...commitInput,
      accessScheduleItemId: expiryIntent.accessScheduleItemId,
      commitmentId: recovered.commitmentId,
      invoiceId: expiryIntent.invoiceId,
      paidAt: expiryIntent.paidAt,
    };
    let expiryEditId: string | null = null;
    let expiryProof: { expiresAt: string };

    try {
      expiryProof =
        await this.metronomeClient.assertPaymentGatedPrepaidCommitExpiry(
          proofInput,
        );
    } catch {
      const recordedAt = Date.parse(expiryIntent.recordedAt);
      const elapsed = Date.now() - recordedAt;

      if (
        !Number.isFinite(recordedAt) ||
        elapsed < 0 ||
        elapsed >= 24 * 60 * 60 * 1000
      ) {
        throw new Error('Customer AI funding expiry proof is invalid');
      }

      const editReceipt =
        await this.metronomeClient.updatePaymentGatedPrepaidCommitExpiry({
          accessScheduleItemId: expiryIntent.accessScheduleItemId,
          commitmentId: recovered.commitmentId,
          contractId: action.metronomeContractId,
          customerId: action.metronomeCustomerId,
          paidAt: expiryIntent.paidAt,
          uniquenessKey: `${action.metronomeUniquenessKey}:paid-expiry`,
        });
      expiryEditId = editReceipt.metronomeEditId;
      expiryProof =
        await this.metronomeClient.assertPaymentGatedPrepaidCommitExpiry(
          proofInput,
        );
    }

    return await this.fundingJournal.transitionCompareAndSet({
      expectedState: completionAction.state,
      id: completionAction.id,
      nextState: 'SUCCEEDED',
      patch: {
        ...paymentPatch,
        expiresAt: new Date(expiryProof.expiresAt),
        failureCode: null,
        nextReconciliationAt: null,
        paymentReceipt: {
          ...paymentPatch.paymentReceipt,
          expiryEditId,
          expiryUpdateIntent: expiryIntent,
          paidAt: stripeState.paidAt,
          status: 'PAID',
        },
        safeErrorCode: null,
      },
      workspaceId: action.workspaceId,
    });
  }

  private assertExistingReplay(
    existing: ManagedProviderFundingActionEntity,
    input: CreateCustomerFundingInput,
    principalCents: number,
  ): void {
    const evidence = customerFundingEvidenceSchema.safeParse(
      existing.paymentEvidence,
    );
    const expectedIdentity = evidence.success
      ? this.getFundingIdentity(
          input,
          evidence.data.fiatCreditTypeId,
          evidence.data.fiatCreditTypeName,
        )
      : null;

    if (
      !evidence.success ||
      !Number.isFinite(Date.parse(evidence.data.purchaseAt)) ||
      !Number.isFinite(Date.parse(evidence.data.paymentActionDeadlineAt)) ||
      existing.workspaceId !== input.workspaceId ||
      existing.idempotencyKey !== input.idempotencyKey ||
      existing.actionType !== 'PREPAID_COMMIT' ||
      existing.operatorIdentity !== input.actorId ||
      existing.permissionUsed !== 'workspace_billing' ||
      existing.amountCents !== String(principalCents) ||
      existing.prepaidPrincipalCents !== String(principalCents) ||
      existing.currency !== 'USD' ||
      existing.externalReference !==
        `customer-ai-top-up:${input.workspaceId}:${input.idempotencyKey}` ||
      evidence.data.preset !== input.preset ||
      evidence.data.fundingIdentity !== expectedIdentity
    ) {
      throw new Error('Customer AI funding replay conflicts');
    }
  }

  private getCustomerFundingEnvironment(): 'PRODUCTION' | 'SANDBOX' {
    const environment = this.twentyConfig.get(
      'METRONOME_BASE_URL_ENVIRONMENT',
    );

    if (environment !== 'PRODUCTION' && environment !== 'SANDBOX') {
      throw new Error('Customer AI funding environment is invalid');
    }

    return environment;
  }

  private getFundingIdentity(
    input: CreateCustomerFundingInput,
    fiatCreditTypeId: string,
    fiatCreditTypeName: 'USD (cents)',
  ): string {
    return createHash('sha256')
      .update(
        `${input.workspaceId}:${input.preset}:${input.idempotencyKey}:${fiatCreditTypeId}:${fiatCreditTypeName}`,
      )
      .digest('hex');
  }
}
