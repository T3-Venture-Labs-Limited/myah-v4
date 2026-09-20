import { createHash } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import {
  InstagramSendOutcomeResolutionEntity,
  type InstagramSendOutcomeResolution,
} from 'src/engine/core-modules/instagram-message/entities/instagram-send-outcome-resolution.entity';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';

export type ResolveInstagramSendOutcomeInput = {
  workspaceId: string;
  receiptId: string;
  resolvedByUserWorkspaceId: string;
  outcome: InstagramSendOutcomeResolution;
  senderUiReviewed?: boolean;
  recipientUiReviewed?: boolean;
  notes?: string | null;
};

@Injectable()
export class InstagramSendOutcomeResolutionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly reconciliationService: InstagramMessageReconciliationService,
    private readonly budgetService: InstagramActionBudgetService,
  ) {}

  async resolve(
    input: ResolveInstagramSendOutcomeInput,
  ): Promise<InstagramSendOutcomeResolutionEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    const lockKey = `instagram-send-resolution:${input.workspaceId}:${input.receiptId}`;

    await queryRunner.connect();
    try {
      await queryRunner.query('SELECT pg_advisory_lock(hashtext($1))', [
        lockKey,
      ]);
      const existing = await this.dataSource
        .getRepository(InstagramSendOutcomeResolutionEntity)
        .findOne({
          where: {
            workspaceId: input.workspaceId,
            actionExecutionReceiptId: input.receiptId,
          },
        });
      if (existing) {
        if (
          existing.outcome !== input.outcome ||
          existing.resolvedByUserWorkspaceId !== input.resolvedByUserWorkspaceId
        ) {
          throw new Error('Instagram send outcome was already resolved');
        }
        if (existing.outcome === 'CONFIRMED_SENT') {
          await this.completeConfirmedResolution(input);
        }
        await this.budgetService.releaseStartTargetForReceipt({
          workspaceId: input.workspaceId,
          actionExecutionReceiptId: input.receiptId,
          reason: 'RESOLVED',
        });

        return existing;
      }

      const inspection = await this.reconciliationService.inspectUnknown({
        workspaceId: input.workspaceId,
        receiptId: input.receiptId,
      });
      if (input.outcome === 'CONFIRMED_SENT' && inspection.kind !== 'MATCH') {
        throw new Error(
          'Confirmed sent resolution requires one verified provider message',
        );
      } else if (input.outcome === 'CLEARED_NOT_SENT') {
        if (
          inspection.kind !== 'NO_MATCH_COMPLETE' &&
          inspection.kind !== 'NOT_DISPATCHED'
        ) {
          throw new Error(
            'Cleared not sent resolution requires complete provider reconciliation',
          );
        }
        if (
          input.senderUiReviewed !== true ||
          input.recipientUiReviewed !== true
        ) {
          throw new Error(
            'Cleared not sent resolution requires explicit sender and recipient UI review',
          );
        }
      }
      const evidenceTypes =
        input.outcome === 'CONFIRMED_SENT'
          ? ['PROVIDER_MESSAGE']
          : [
              'PROVIDER_RECONCILIATION_COMPLETE',
              'SENDER_UI_REVIEW',
              'RECIPIENT_UI_REVIEW',
            ];
      const evidenceDigests = evidenceTypes.map((evidenceType) =>
        createHash('sha256')
          .update(
            JSON.stringify([
              input.workspaceId,
              input.receiptId,
              input.resolvedByUserWorkspaceId,
              input.outcome,
              evidenceType,
              input.senderUiReviewed === true,
              input.recipientUiReviewed === true,
            ]),
            'utf8',
          )
          .digest('hex'),
      );

      const resolution = await this.dataSource.transaction(async (manager) => {
        const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
          where: { id: input.receiptId, workspaceId: input.workspaceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!receipt) throw new Error('Instagram send receipt is unavailable');
        const prior = await manager.findOne(
          InstagramSendOutcomeResolutionEntity,
          {
            where: {
              workspaceId: input.workspaceId,
              actionExecutionReceiptId: input.receiptId,
            },
          },
        );
        if (prior) return prior;

        if (input.outcome === 'CONFIRMED_SENT') {
          if (
            ![
              ActionExecutionReceiptState.UNKNOWN,
              ActionExecutionReceiptState.PROVIDER_ACCEPTED,
              ActionExecutionReceiptState.SENT,
            ].includes(receipt.state)
          ) {
            throw new Error('Verified Instagram send projection is incomplete');
          }
        } else {
          if (receipt.state !== ActionExecutionReceiptState.UNKNOWN) {
            throw new Error('Instagram send receipt is no longer Unknown');
          }
          receipt.state = ActionExecutionReceiptState.FAILED;
          receipt.providerCode = 'failed';
          receipt.redactedOutcome = 'failed';
          await manager.save(ActionExecutionReceiptEntity, receipt);
        }

        return manager.save(
          InstagramSendOutcomeResolutionEntity,
          manager.create(InstagramSendOutcomeResolutionEntity, {
            workspaceId: input.workspaceId,
            actionExecutionReceiptId: input.receiptId,
            resolvedByUserWorkspaceId: input.resolvedByUserWorkspaceId,
            outcome: input.outcome,
            evidenceTypes,
            evidenceDigests,
            notes: input.notes?.trim() || null,
          }),
        );
      });

      if (input.outcome === 'CONFIRMED_SENT') {
        await this.completeConfirmedResolution(input);
      }

      await this.budgetService.releaseStartTargetForReceipt({
        workspaceId: input.workspaceId,
        actionExecutionReceiptId: input.receiptId,
        reason: 'RESOLVED',
      });

      return resolution;
    } finally {
      try {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          lockKey,
        ]);
      } finally {
        await queryRunner.release();
      }
    }
  }
  private async completeConfirmedResolution(
    input: ResolveInstagramSendOutcomeInput,
  ): Promise<void> {
    const receipt = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({
        where: { id: input.receiptId, workspaceId: input.workspaceId },
      });

    if (!receipt) {
      throw new Error('Instagram send receipt is unavailable');
    }
    if (receipt.state === ActionExecutionReceiptState.UNKNOWN) {
      const inspection = await this.reconciliationService.reconcile({
        workspaceId: input.workspaceId,
        receiptId: input.receiptId,
      });

      if (inspection.kind !== 'MATCH') {
        throw new Error('Verified Instagram send projection is incomplete');
      }
    } else if (
      receipt.state === ActionExecutionReceiptState.PROVIDER_ACCEPTED
    ) {
      await this.reconciliationService.finalizeProviderAccepted({
        workspaceId: input.workspaceId,
        receiptId: input.receiptId,
      });
    } else if (receipt.state !== ActionExecutionReceiptState.SENT) {
      throw new Error('Verified Instagram send projection is incomplete');
    }
    const projected = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({
        where: { id: input.receiptId, workspaceId: input.workspaceId },
      });
    if (projected?.state !== ActionExecutionReceiptState.SENT)
      throw new Error('Verified Instagram send projection is incomplete');
  }
}
