import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { type ManagedProviderFundingActionEntity } from '../entities/managed-provider-funding-action.entity';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { ManagedProviderStripeService } from '../stripe/managed-provider-stripe.service';
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

const customerFundingEvidenceSchema = z.object({
  fundingIdentity: z.string().min(1),
  paymentActionDeadlineAt: z.string().min(1),
  preset: z.enum(['AI_25_USD', 'AI_50_USD', 'AI_100_USD']),
  purchaseAt: z.string().min(1),
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

    const contractId = await this.workspaceCustomer.ensureWorkspaceContract(
      input.workspaceId,
    );
    const paymentMethod = await this.stripe.assertWorkspacePaymentMethodReady({
      metronomeBaseUrlEnvironment: environment,
      workspaceId: input.workspaceId,
    });
    const billingContext =
      await this.workspaceCustomer.ensureWorkspaceStripeBillingContext({
        contractId,
        environment,
        workspaceId: input.workspaceId,
      });

    if (
      paymentMethod.ready !== true ||
      paymentMethod.stripeCustomerId !== billingContext.stripeCustomerId ||
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
    const fundingIdentity = this.getFundingIdentity(input);
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

  private assertExistingReplay(
    existing: ManagedProviderFundingActionEntity,
    input: CreateCustomerFundingInput,
    principalCents: number,
  ): void {
    const evidence = customerFundingEvidenceSchema.safeParse(
      existing.paymentEvidence,
    );
    const expectedIdentity = this.getFundingIdentity(input);

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

  private getFundingIdentity(input: CreateCustomerFundingInput): string {
    return createHash('sha256')
      .update(`${input.workspaceId}:${input.preset}:${input.idempotencyKey}`)
      .digest('hex');
  }
}
