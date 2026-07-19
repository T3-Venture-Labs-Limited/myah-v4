import { Injectable } from '@nestjs/common';

import { MetronomeClientService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-client.service';
import { MetronomeWorkspaceCustomerService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { ManagedProviderFundingJournalService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-funding-journal.service';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from 'src/engine/core-modules/managed-provider-billing/metronome-client.exception';

import { type GrantManagedProviderCreditInput } from '../dtos/grant-managed-provider-credit.input';
import { type ManagedProviderCreditReceiptDTO } from '../dtos/managed-provider-credit-receipt.dto';
import { type CorrectManagedProviderFundingInput } from '../dtos/correct-managed-provider-funding.input';
import { type RecordManagedProviderOfflineCommitmentInput } from '../dtos/record-managed-provider-offline-commitment.input';

const MAX_FUNDING_AMOUNT_CENTS = 1_000_000;
const MAX_FUNDING_REASON_LENGTH = 500;

@Injectable()
export class AdminPanelManagedProviderBillingService {
  constructor(
    private readonly metronomeClientService: MetronomeClientService,
    private readonly metronomeWorkspaceCustomerService: MetronomeWorkspaceCustomerService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly fundingJournalService: ManagedProviderFundingJournalService,
  ) {}

  async grantCredit(
    {
      amountCents,
      endingBefore,
      idempotencyKey,
      reason,
      workspaceId,
    }: GrantManagedProviderCreditInput,
    operatorIdentity: string,
  ): Promise<ManagedProviderCreditReceiptDTO> {
    this.assertAuthorizedOperator(
      operatorIdentity,
      'MANAGED_OPENROUTER_GRANT_OPERATOR_USER_IDS',
      'grant',
    );
    this.assertEligibleWorkspace(workspaceId);

    const configuredMaximum = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_MAX_GRANT_CENTS',
    );
    const maximumAmountCents =
      typeof configuredMaximum === 'number'
        ? configuredMaximum
        : MAX_FUNDING_AMOUNT_CENTS;

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > maximumAmountCents
    ) {
      throw new Error('Managed provider funding amount exceeds the maximum');
    }
    if (!reason?.trim() || reason.length > MAX_FUNDING_REASON_LENGTH) {
      throw new Error('Managed provider funding reason is required');
    }

    const now = new Date();

    if (endingBefore.getTime() <= now.getTime()) {
      throw new Error('Managed provider credit must end in the future');
    }

    const existing = await this.fundingJournalService.findByIdempotency(
      workspaceId,
      idempotencyKey,
    );

    if (!existing) {
      const dailyActionLimit = this.twentyConfigService.get(
        'MANAGED_OPENROUTER_GRANT_DAILY_ACTION_LIMIT',
      );
      const recentActionCount =
        await this.fundingJournalService.countRecentActions(operatorIdentity);

      if (
        typeof dailyActionLimit !== 'number' ||
        recentActionCount >= dailyActionLimit
      ) {
        throw new Error('Managed provider grant rate limit exceeded');
      }
    }

    const fundingAction = await this.fundingJournalService.createPending({
      actionType: 'SPONSORED_CREDIT',
      amountCents,
      applicability: { workspaceId },
      currency: 'USD',
      expiresAt: endingBefore,
      externalReference: idempotencyKey,
      idempotencyKey,
      operatorIdentity,
      permissionUsed: 'managed_provider_grant',
      reason: reason.trim(),
      workspaceId,
    });

    if (fundingAction.state === 'SUCCEEDED') {
      const customerId =
        await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
          workspaceId,
        );
      const contractId =
        await this.metronomeWorkspaceCustomerService.ensureWorkspaceContract(
          workspaceId,
        );

      if (!fundingAction.creditId) {
        throw new Error('Managed provider funding replay is incomplete');
      }

      return { contractId, creditId: fundingAction.creditId, customerId };
    }
    if (existing) {
      throw new Error(
        'Managed provider funding requires manual reconciliation',
      );
    }

    try {
      const customerId =
        await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
          workspaceId,
        );
      const contractId =
        await this.metronomeWorkspaceCustomerService.ensureWorkspaceContract(
          workspaceId,
        );
      const { id: creditId } =
        await this.metronomeClientService.createCustomerCredit({
          amountCents,
          contractId,
          customerId,
          customFields: { myah_managed_openrouter: 'sponsored' },
          endingBefore: endingBefore.toISOString(),
          name: `Myah managed OpenRouter sponsored credit: ${reason.trim()}`,
          productId: this.twentyConfigService.get(
            'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID',
          ),
          startingAt: fundingAction.createdAt.toISOString(),
          uniquenessKey: fundingAction.metronomeUniquenessKey,
        });

      await this.fundingJournalService.transition(
        fundingAction.id,
        'SUCCEEDED',
        creditId,
      );

      return { contractId, creditId, customerId };
    } catch (error) {
      const isUncertain =
        !(error instanceof MetronomeClientException) ||
        [
          MetronomeClientExceptionCode.CONFLICT,
          MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
          MetronomeClientExceptionCode.RATE_LIMITED,
        ].includes(error.code);
      const errorCode =
        error instanceof MetronomeClientException
          ? error.code
          : 'MANAGED_PROVIDER_FUNDING_OUTCOME_UNCERTAIN';

      await this.fundingJournalService.transition(
        fundingAction.id,
        isUncertain ? 'RECONCILIATION_REQUIRED' : 'FAILED_DEFINITIVE',
        null,
        errorCode,
      );
      throw error;
    }
  }

  async recordOfflineCommitment(
    input: RecordManagedProviderOfflineCommitmentInput,
    operatorIdentity: string,
  ): Promise<never> {
    return this.recordUnsupportedFinanceAction({
      actionType: 'PREPAID_COMMIT',
      amountCents: input.amountCents,
      applicability: input.applicability
        ? { reference: input.applicability }
        : null,
      correctedOperationId: null,
      currency: input.currency,
      errorCode: 'MANAGED_PROVIDER_OFFLINE_COMMITMENT_UNSUPPORTED',
      expiresAt: input.expiresAt ?? null,
      externalReference: input.externalReference,
      idempotencyKey: input.idempotencyKey,
      operatorIdentity,
      paymentEvidence: input.paymentEvidence
        ? { reference: input.paymentEvidence }
        : null,
      reason: input.reason,
      workspaceId: input.workspaceId,
    });
  }

  async correctFunding(
    input: CorrectManagedProviderFundingInput,
    operatorIdentity: string,
  ): Promise<never> {
    return this.recordUnsupportedFinanceAction({
      actionType: 'CORRECTION',
      amountCents: input.amountCents,
      applicability: null,
      correctedOperationId: input.correctedOperationId,
      currency: input.currency,
      errorCode: 'MANAGED_PROVIDER_FUNDING_CORRECTION_UNSUPPORTED',
      expiresAt: null,
      externalReference: input.externalReference,
      idempotencyKey: input.idempotencyKey,
      operatorIdentity,
      paymentEvidence: null,
      reason: input.reason,
      workspaceId: input.workspaceId,
    });
  }

  private async recordUnsupportedFinanceAction({
    errorCode,
    operatorIdentity,
    ...input
  }: {
    actionType: 'CORRECTION' | 'PREPAID_COMMIT';
    amountCents: number;
    applicability: Record<string, unknown> | null;
    correctedOperationId: string | null;
    currency: string;
    errorCode: string;
    expiresAt: Date | null;
    externalReference: string;
    idempotencyKey: string;
    operatorIdentity: string;
    paymentEvidence: Record<string, unknown> | null;
    reason: string;
    workspaceId: string;
  }): Promise<never> {
    this.assertAuthorizedOperator(
      operatorIdentity,
      'MANAGED_OPENROUTER_FINANCE_OPERATOR_USER_IDS',
      'finance',
    );
    this.assertEligibleWorkspace(input.workspaceId);
    const maximumAmountCents = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_MAX_GRANT_CENTS',
    );

    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > maximumAmountCents
    ) {
      throw new Error('Managed provider funding amount exceeds the maximum');
    }
    if (input.currency !== 'USD') {
      throw new Error('Managed provider funding currency must be USD');
    }
    if (
      !input.reason.trim() ||
      input.reason.length > MAX_FUNDING_REASON_LENGTH
    ) {
      throw new Error('Managed provider funding reason is required');
    }

    if (
      input.actionType === 'PREPAID_COMMIT' &&
      !input.paymentEvidence?.reference
    ) {
      throw new Error('Managed provider payment evidence is required');
    }

    const action = await this.fundingJournalService.createPending({
      ...input,
      operatorIdentity,
      permissionUsed: 'managed_provider_finance',
    });

    if (action.state === 'PENDING') {
      await this.fundingJournalService.transition(
        action.id,
        'FAILED_DEFINITIVE',
        null,
        errorCode,
      );
    }

    throw new Error(`${errorCode}: manual reconciliation required`);
  }

  private assertAuthorizedOperator(
    operatorIdentity: string,
    configKey:
      | 'MANAGED_OPENROUTER_FINANCE_OPERATOR_USER_IDS'
      | 'MANAGED_OPENROUTER_GRANT_OPERATOR_USER_IDS',
    permission: string,
  ): void {
    const authorizedOperators = this.twentyConfigService.get(configKey);

    if (
      !Array.isArray(authorizedOperators) ||
      !authorizedOperators.includes(operatorIdentity)
    ) {
      throw new Error(
        `Managed provider ${permission} operator is not authorized`,
      );
    }
  }

  private assertEligibleWorkspace(workspaceId: string): void {
    const allowedWorkspaceIds = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS',
    );

    if (!allowedWorkspaceIds.includes(workspaceId)) {
      throw new Error('Workspace is not eligible for managed provider funding');
    }
  }
}
