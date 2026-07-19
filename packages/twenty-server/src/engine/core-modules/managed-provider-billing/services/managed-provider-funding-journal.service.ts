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
  correctedOperationId?: string | null;
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

  /** Must be awaited before any remote Metronome call. */
  async createPending(
    input: CreateFundingIntent,
  ): Promise<ManagedProviderFundingActionEntity> {
    const existing = await this.findByIdempotency(
      input.workspaceId,
      input.idempotencyKey,
    );

    if (existing) {
      return this.getExactReplay(existing, input);
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
      commitmentId: null,
      correctedOperationId: input.correctedOperationId ?? null,
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
      return await this.repository.save(action);
    } catch (error) {
      const concurrent = await this.findByIdempotency(
        input.workspaceId,
        input.idempotencyKey,
      );

      if (concurrent) {
        return this.getExactReplay(concurrent, input);
      }

      throw error;
    }
  }

  async transition(
    id: string,
    state: ManagedProviderFundingActionState,
    externalResourceId?: string | null,
    failureCode?: string | null,
  ): Promise<ManagedProviderFundingActionEntity> {
    await this.repository.update(id, {
      state,
      externalResourceId: externalResourceId ?? null,
      failureCode: failureCode ?? null,
      safeErrorCode: failureCode ?? null,
      ...(state === 'SUCCEEDED' && externalResourceId
        ? { creditId: externalResourceId }
        : {}),
    });

    return this.repository.findOneByOrFail({ id });
  }
  private getExactReplay(
    existing: ManagedProviderFundingActionEntity,
    input: CreateFundingIntent,
  ): ManagedProviderFundingActionEntity {
    if (
      existing.actionType !== input.actionType ||
      existing.amountCents !== String(input.amountCents) ||
      existing.currency !== (input.currency ?? 'USD') ||
      existing.externalReference !== input.externalReference ||
      existing.operatorIdentity !== input.operatorIdentity ||
      existing.permissionUsed !== input.permissionUsed ||
      existing.reason !== input.reason ||
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
