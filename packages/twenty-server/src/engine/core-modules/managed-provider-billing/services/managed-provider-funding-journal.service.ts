import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ManagedProviderFundingActionEntity,
  type ManagedProviderFundingActionState,
  type ManagedProviderFundingActionType,
} from '../entities/managed-provider-funding-action.entity';

export type CreateFundingIntent = {
  actionType: ManagedProviderFundingActionType;
  amountCents: number | string;
  applicability?: Record<string, unknown> | null;
  applicableProductIds?: string[] | null;
  correctedOperationId?: string | null;
  creditProductId?: string | null;
  currency?: string;
  expiresAt?: Date | null;
  externalReference: string;
  idempotencyKey: string;
  operatorIdentity: string;
  paymentEvidence?: Record<string, unknown> | null;
  permissionUsed: 'managed_provider_finance' | 'managed_provider_grant';
  reason: string;
  workspaceId: string;
  metronomeCustomerId?: string | null;
  metronomeContractId?: string | null;
  stripeBillingConfigurationId?: string | null;
  stripeDeliveryMethodId?: string | null;
  stripeCustomerId?: string | null;
  prepaidPrincipalCents?: number | string | null;
  taxCents?: number | string | null;
  collectedTotalCents?: number | string | null;
  paymentReceipt?: Record<string, unknown> | null;
};

type FundingActionPatch = Partial<
  Pick<
    ManagedProviderFundingActionEntity,
    | 'metronomeCustomerId'
    | 'metronomeContractId'
    | 'metronomeEditId'
    | 'commitmentId'
    | 'metronomeInvoiceId'
    | 'stripeBillingConfigurationId'
    | 'stripeDeliveryMethodId'
    | 'stripeCustomerId'
    | 'stripeInvoiceId'
    | 'stripePaymentIntentId'
    | 'stripeCreditNoteId'
    | 'stripeRefundId'
    | 'prepaidPrincipalCents'
    | 'taxCents'
    | 'collectedTotalCents'
    | 'paymentReceipt'
    | 'refundReceipt'
    | 'expiresAt'
    | 'nextReconciliationAt'
    | 'reconciliationClaimedAt'
    | 'reconciliationAttemptCount'
    | 'creditId'
    | 'externalResourceId'
    | 'safeErrorCode'
    | 'failureCode'
  >
>;

export type CompareAndSetFundingActionInput = {
  id: string;
  workspaceId: string;
  expectedState: ManagedProviderFundingActionState;
  nextState: ManagedProviderFundingActionState;
  patch?: FundingActionPatch;
};

const RECONCILIATION_LOCK_KEY = 'myah:managed-provider-funding-reconciliation';
const MAX_RECONCILIATION_ATTEMPTS = 10;
const RECONCILIATION_BACKOFF_MS = 5 * 60 * 1000;
const RECONCILIATION_CLAIM_LEASE_MS = 15 * 60 * 1000;

const toNonNegativeSafeIntegerCents = (
  value: number | string | null | undefined,
  fieldName: string,
  required = false,
): string | null => {
  if (value === null || value === undefined) {
    if (required) {
      throw new Error(`${fieldName} must be a non-negative safe integer`);
    }

    return null;
  }

  const numericValue =
    typeof value === 'number'
      ? value
      : /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < 0 ||
    (typeof value === 'string' && !/^\d+$/.test(value))
  ) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }

  return String(value);
};

const stableSerialize = (value: unknown): string => {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
};

@Injectable()
export class ManagedProviderFundingJournalService {
  constructor(
    // Finance control-plane operations enforce workspaceId explicitly and rate-limit operators across workspaces.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedProviderFundingActionEntity)
    private readonly repository: Repository<ManagedProviderFundingActionEntity>,
  ) {}

  async findByIdempotency(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<ManagedProviderFundingActionEntity | null> {
    return this.repository.findOne({ where: { workspaceId, idempotencyKey } });
  }

  async countRecentActions(operatorIdentity: string): Promise<number> {
    return this.repository
      .createQueryBuilder('action')
      .where('action.operatorIdentity = :operatorIdentity', {
        operatorIdentity,
      })
      .andWhere('action.createdAt >= :since', {
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .getCount();
  }

  /**
   * Reserves a sponsored-grant intent while holding an operator-scoped
   * transaction lock. The count and insert therefore observe one serialized
   * view of the rolling daily limit.
   */
  async createPendingRateLimited(
    input: CreateFundingIntent,
    dailyActionLimit: number,
  ): Promise<
    ManagedProviderFundingActionEntity & { createdByCaller?: boolean }
  > {
    const amountCents = toNonNegativeSafeIntegerCents(
      input.amountCents,
      'amountCents',
      true,
    ) as string;
    const prepaidPrincipalCents = toNonNegativeSafeIntegerCents(
      input.prepaidPrincipalCents,
      'prepaidPrincipalCents',
    );
    const taxCents = toNonNegativeSafeIntegerCents(input.taxCents, 'taxCents');
    const collectedTotalCents = toNonNegativeSafeIntegerCents(
      input.collectedTotalCents,
      'collectedTotalCents',
    );
    return this.repository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `myah:sponsored-grant-rate:${input.operatorIdentity}`,
      ]);
      const repository = manager.getRepository(
        ManagedProviderFundingActionEntity,
      );
      const existing = await repository.findOne({
        where: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (existing) {
        return Object.assign(this.getExactReplay(existing, input), {
          createdByCaller: false,
        });
      }

      const recentActionCount = await repository
        .createQueryBuilder('action')
        .where('action.operatorIdentity = :operatorIdentity', {
          operatorIdentity: input.operatorIdentity,
        })
        .andWhere('action.createdAt >= :since', {
          since: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        .getCount();

      if (recentActionCount >= dailyActionLimit) {
        throw new Error('Managed provider grant rate limit exceeded');
      }

      const metronomeUniquenessKey = `myah:${createHash('sha256')
        .update(
          [
            input.workspaceId,
            input.actionType,
            input.idempotencyKey,
            input.externalReference,
          ].join(':'),
        )
        .digest('hex')}`;
      const action = repository.create({
        actionType: input.actionType,
        amountCents,
        applicability: input.applicability ?? null,
        commitmentId: null,
        correctedOperationId: input.correctedOperationId ?? null,
        applicableProductIds: input.applicableProductIds ?? null,
        creditId: null,
        creditProductId: input.creditProductId ?? null,
        currency: input.currency ?? 'USD',
        expiresAt: input.expiresAt ?? null,
        externalReference: input.externalReference,
        externalResourceId: null,
        failureCode: null,
        fundingType: input.actionType,
        idempotencyKey: input.idempotencyKey,
        metronomeEditId: null,
        metronomeUniquenessKey,
        operatorIdentity: input.operatorIdentity,
        paymentEvidence: input.paymentEvidence ?? null,
        permissionUsed: input.permissionUsed,
        reason: input.reason,
        safeErrorCode: null,
        state: 'PENDING',
        workspaceId: input.workspaceId,
        metronomeCustomerId: input.metronomeCustomerId ?? null,
        metronomeContractId: input.metronomeContractId ?? null,
        stripeBillingConfigurationId:
          input.stripeBillingConfigurationId ?? null,
        stripeDeliveryMethodId: input.stripeDeliveryMethodId ?? null,
        stripeCustomerId: input.stripeCustomerId ?? null,
        prepaidPrincipalCents,
        taxCents,
        collectedTotalCents,
        paymentReceipt: input.paymentReceipt ?? null,
        refundReceipt: null,
        metronomeInvoiceId: null,
        stripeInvoiceId: null,
        stripePaymentIntentId: null,
        stripeCreditNoteId: null,
        stripeRefundId: null,
        nextReconciliationAt: null,
        reconciliationClaimedAt: null,
        reconciliationAttemptCount: 0,
      });

      const saved = await repository.save(action);
      return Object.assign(saved, { createdByCaller: true });
    });
  }
  /** Must be awaited before any remote Metronome call. */
  async createPending(
    input: CreateFundingIntent,
  ): Promise<
    ManagedProviderFundingActionEntity & { createdByCaller?: boolean }
  > {
    const amountCents = toNonNegativeSafeIntegerCents(
      input.amountCents,
      'amountCents',
      true,
    ) as string;
    const prepaidPrincipalCents = toNonNegativeSafeIntegerCents(
      input.prepaidPrincipalCents,
      'prepaidPrincipalCents',
    );
    const taxCents = toNonNegativeSafeIntegerCents(input.taxCents, 'taxCents');
    const collectedTotalCents = toNonNegativeSafeIntegerCents(
      input.collectedTotalCents,
      'collectedTotalCents',
    );
    const existing = await this.findByIdempotency(
      input.workspaceId,
      input.idempotencyKey,
    );

    if (existing) {
      return Object.assign(this.getExactReplay(existing, input), {
        createdByCaller: false,
      });
    }

    const metronomeUniquenessKey = `myah:${createHash('sha256')
      .update(
        [
          input.workspaceId,
          input.actionType,
          input.idempotencyKey,
          input.externalReference,
        ].join(':'),
      )
      .digest('hex')}`;
    const action = this.repository.create({
      actionType: input.actionType,
      amountCents,
      applicability: input.applicability ?? null,
      applicableProductIds: input.applicableProductIds ?? null,
      commitmentId: null,
      correctedOperationId: input.correctedOperationId ?? null,
      creditProductId: input.creditProductId ?? null,
      creditId: null,
      currency: input.currency ?? 'USD',
      expiresAt: input.expiresAt ?? null,
      externalReference: input.externalReference,
      externalResourceId: null,
      failureCode: null,
      fundingType: input.actionType,
      idempotencyKey: input.idempotencyKey,
      metronomeEditId: null,
      metronomeUniquenessKey,
      operatorIdentity: input.operatorIdentity,
      paymentEvidence: input.paymentEvidence ?? null,
      permissionUsed: input.permissionUsed,
      reason: input.reason,
      safeErrorCode: null,
      state: 'PENDING',
      workspaceId: input.workspaceId,
      metronomeCustomerId: input.metronomeCustomerId ?? null,
      metronomeContractId: input.metronomeContractId ?? null,
      stripeBillingConfigurationId:
        input.stripeBillingConfigurationId ?? null,
      stripeDeliveryMethodId: input.stripeDeliveryMethodId ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      prepaidPrincipalCents,
      taxCents,
      collectedTotalCents,
      paymentReceipt: input.paymentReceipt ?? null,
      refundReceipt: null,
      metronomeInvoiceId: null,
      stripeInvoiceId: null,
      stripePaymentIntentId: null,
      stripeCreditNoteId: null,
      stripeRefundId: null,
      nextReconciliationAt: null,
      reconciliationClaimedAt: null,
      reconciliationAttemptCount: 0,
    });

    try {
      const saved = await this.repository.save(action);
      return Object.assign(saved, { createdByCaller: true });
    } catch (error) {
      const concurrent = await this.findByIdempotency(
        input.workspaceId,
        input.idempotencyKey,
      );

      if (concurrent) {
        return Object.assign(this.getExactReplay(concurrent, input), {
          createdByCaller: false,
        });
      }

      throw error;
    }
  }

  async transitionCompareAndSet(
    input: CompareAndSetFundingActionInput,
  ): Promise<ManagedProviderFundingActionEntity> {
    const patch = input.patch ?? {};
    const result = await this.repository.update(
      {
        id: input.id,
        workspaceId: input.workspaceId,
        state: input.expectedState,
      },
      { ...patch, state: input.nextState },
    );

    if (!result.affected) {
      const current = await this.repository.findOne({
        where: { id: input.id, workspaceId: input.workspaceId },
      });

      if (
        current &&
        current.state === input.nextState &&
        Object.entries(patch).every(
          ([key, value]) =>
            stableSerialize(
              current[key as keyof ManagedProviderFundingActionEntity],
            ) === stableSerialize(value),
        )
      ) {
        return current;
      }

      throw new Error('Managed provider funding transition conflict');
    }

    return this.repository.findOneByOrFail({
      id: input.id,
      workspaceId: input.workspaceId,
    });
  }

  async claimDueReconciliationActions(
    limit = 50,
    now = new Date(),
  ): Promise<ManagedProviderFundingActionEntity[]> {
    return this.repository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        RECONCILIATION_LOCK_KEY,
      ]);
      const dueActions = (await manager.query(
        `SELECT "id", "state", "reconciliationAttemptCount"
         FROM "core"."managedProviderFundingAction"
         WHERE "state" IN ('RECONCILIATION_REQUIRED', 'PAYMENT_PENDING',
           'PAYMENT_ACTION_REQUIRED', 'METRONOME_EDIT_RECORDED',
           'REFUND_INTENT_RECORDED', 'REFUND_RECONCILIATION_REQUIRED')
           AND ("nextReconciliationAt" IS NULL OR "nextReconciliationAt" <= $1)
           AND "reconciliationAttemptCount" < $3
           AND ("reconciliationClaimedAt" IS NULL OR
             "reconciliationClaimedAt" <= $2)
         ORDER BY "nextReconciliationAt" NULLS FIRST, "createdAt"
         LIMIT $4
         FOR UPDATE SKIP LOCKED`,
        [
          now,
          new Date(now.getTime() - RECONCILIATION_CLAIM_LEASE_MS),
          MAX_RECONCILIATION_ATTEMPTS,
          limit,
        ],
      )) as Array<{
        id: string;
        state: ManagedProviderFundingActionState;
        reconciliationAttemptCount: number | string | null;
      }>;
      const repository = manager.getRepository(
        ManagedProviderFundingActionEntity,
      );
      const claimed: ManagedProviderFundingActionEntity[] = [];

      for (const action of dueActions) {
        const attemptCount = Math.min(
          Number(action.reconciliationAttemptCount ?? 0) + 1,
          MAX_RECONCILIATION_ATTEMPTS,
        );
        const updateResult = await repository.update(
          {
            id: action.id,
            state: action.state,
          },
          {
            reconciliationClaimedAt: now,
            reconciliationAttemptCount: attemptCount,
            nextReconciliationAt: new Date(
              now.getTime() +
                Math.min(
                  RECONCILIATION_BACKOFF_MS * 2 ** (attemptCount - 1),
                  60 * 60 * 1000,
                ),
            ),
          },
        );

        if (updateResult.affected) {
          const persisted = await repository.findOneBy({ id: action.id });
          if (persisted) {
            claimed.push(persisted);
          }
        }
      }

      return claimed;
    });
  }

  async transition(
    id: string,
    state: ManagedProviderFundingActionState,
    externalResourceId?: string | null,
    failureCode?: string | null,
    metronomeEditId?: string | null,
  ): Promise<ManagedProviderFundingActionEntity> {
    await this.repository.update(
      { id, state: 'PENDING' },
      {
        state,
        externalResourceId: externalResourceId ?? null,
        failureCode: failureCode ?? null,
        safeErrorCode: failureCode ?? null,
        ...(metronomeEditId === undefined ? {} : { metronomeEditId }),
        ...(state === 'SUCCEEDED' && externalResourceId
          ? { creditId: externalResourceId }
          : {}),
      },
    );
    return this.repository.findOneByOrFail({ id });
  }
  private getExactReplay(
    existing: ManagedProviderFundingActionEntity,
    input: CreateFundingIntent,
  ): ManagedProviderFundingActionEntity {
    const amountCents = toNonNegativeSafeIntegerCents(
      input.amountCents,
      'amountCents',
      true,
    );
    const prepaidPrincipalCents = toNonNegativeSafeIntegerCents(
      input.prepaidPrincipalCents,
      'prepaidPrincipalCents',
    );
    const taxCents = toNonNegativeSafeIntegerCents(input.taxCents, 'taxCents');
    const collectedTotalCents = toNonNegativeSafeIntegerCents(
      input.collectedTotalCents,
      'collectedTotalCents',
    );
    const applicableProductIdsEqual =
      stableSerialize(existing.applicableProductIds ?? null) ===
      stableSerialize(input.applicableProductIds ?? null);

    if (
      existing.actionType !== input.actionType ||
      existing.amountCents !== amountCents ||
      existing.currency !== (input.currency ?? 'USD') ||
      existing.externalReference !== input.externalReference ||
      existing.operatorIdentity !== input.operatorIdentity ||
      existing.permissionUsed !== input.permissionUsed ||
      existing.reason !== input.reason ||
      existing.creditProductId !== (input.creditProductId ?? null) ||
      !applicableProductIdsEqual ||
      existing.correctedOperationId !== (input.correctedOperationId ?? null) ||
      stableSerialize(existing.expiresAt ?? null) !==
        stableSerialize(input.expiresAt ?? null) ||
      (existing.metronomeCustomerId ?? null) !==
        (input.metronomeCustomerId ?? null) ||
      (existing.metronomeContractId ?? null) !==
        (input.metronomeContractId ?? null) ||
      (existing.stripeBillingConfigurationId ?? null) !==
        (input.stripeBillingConfigurationId ?? null) ||
      (existing.stripeDeliveryMethodId ?? null) !==
        (input.stripeDeliveryMethodId ?? null) ||
      (existing.stripeCustomerId ?? null) !==
        (input.stripeCustomerId ?? null) ||
      (existing.prepaidPrincipalCents ?? null) !== prepaidPrincipalCents ||
      (existing.taxCents ?? null) !== taxCents ||
      (existing.collectedTotalCents ?? null) !== collectedTotalCents ||
      stableSerialize(existing.applicability ?? null) !==
        stableSerialize(input.applicability ?? null) ||
      stableSerialize(existing.paymentEvidence ?? null) !==
        stableSerialize(input.paymentEvidence ?? null) ||
      stableSerialize(existing.paymentReceipt ?? null) !==
        stableSerialize(input.paymentReceipt ?? null)
    ) {
      throw new Error('Managed provider funding replay conflicts');
    }

    return existing;
  }
}
