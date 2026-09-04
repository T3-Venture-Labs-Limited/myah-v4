import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';

type ReconcileInstagramActionReceiptInput = {
  workspaceId: string;
  actionExecutionReceiptId: string;
};

@Injectable()
export class InstagramActionReceiptReconciliationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async reconcile({
    workspaceId,
    actionExecutionReceiptId,
  }: ReconcileInstagramActionReceiptInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `instagram-action-receipt:${workspaceId}:${actionExecutionReceiptId}`,
      ]);

      const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
        lock: { mode: 'pessimistic_write' },
        where: { id: actionExecutionReceiptId, workspaceId },
      });
      if (!receipt) throw new Error('Action execution receipt not found');
      if (receipt.state !== ActionExecutionReceiptState.PROCESSING) return;

      const binding = await manager.findOne(ActionApprovalBindingEntity, {
        where: { id: receipt.actionApprovalBindingId, workspaceId },
      });
      if (
        !binding ||
        binding.actionName !== 'send_instagram_message' ||
        binding.actionVersion !== 2
      ) {
        return;
      }

      const reservation = await manager.findOne(
        InstagramActionReservationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { actionExecutionReceiptId, workspaceId },
        },
      );
      const dbNow = await this.dbNow(manager);

      if (reservation?.providerAttemptedAt) {
        receipt.providerCode = 'INSTAGRAM_ACTION_OUTCOME_UNKNOWN';
        receipt.redactedOutcome =
          'Instagram action outcome requires reconciliation';
        receipt.state = ActionExecutionReceiptState.UNKNOWN;
        await manager.save(ActionExecutionReceiptEntity, receipt);

        return;
      }

      receipt.providerCode = 'INSTAGRAM_ACTION_NOT_DISPATCHED';
      receipt.redactedOutcome = 'Instagram action was not dispatched';
      receipt.state = ActionExecutionReceiptState.FAILED;

      if (reservation && !reservation.releasedAt) {
        reservation.releasedAt = dbNow;
        reservation.releaseReason = 'INSTAGRAM_ACTION_NOT_DISPATCHED';
        reservation.targetLockReleasedAt = dbNow;
        await manager.save(InstagramActionReservationEntity, reservation);
      }

      await manager.save(ActionExecutionReceiptEntity, receipt);
    });
  }

  private async dbNow(manager: EntityManager): Promise<Date> {
    const [row] = await manager.query<{ dbNow: Date | string }[]>(
      'SELECT clock_timestamp() AS "dbNow"',
    );

    return row.dbNow instanceof Date ? row.dbNow : new Date(row.dbNow);
  }
}
