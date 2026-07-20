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
  amountCents: number;
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
        amountCents: String(input.amountCents),
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
      amountCents: String(input.amountCents),
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
    const applicableProductIdsEqual =
      JSON.stringify(existing.applicableProductIds ?? null) ===
      JSON.stringify(input.applicableProductIds ?? null);

    if (
      existing.actionType !== input.actionType ||
      existing.amountCents !== String(input.amountCents) ||
      existing.currency !== (input.currency ?? 'USD') ||
      existing.externalReference !== input.externalReference ||
      existing.operatorIdentity !== input.operatorIdentity ||
      existing.permissionUsed !== input.permissionUsed ||
      existing.reason !== input.reason ||
      existing.creditProductId !== (input.creditProductId ?? null) ||
      !applicableProductIdsEqual ||
      existing.correctedOperationId !== (input.correctedOperationId ?? null) ||
      existing.expiresAt?.toISOString() !== input.expiresAt?.toISOString() ||
      JSON.stringify(existing.applicability) !==
        JSON.stringify(input.applicability ?? null) ||
      JSON.stringify(existing.paymentEvidence) !==
        JSON.stringify(input.paymentEvidence ?? null)
    ) {
      throw new Error('Managed provider funding replay conflicts');
    }

    return existing;
  }
}
