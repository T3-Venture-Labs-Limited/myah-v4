import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { INSTAGRAM_MESSAGE_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.constants';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';
import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

const BATCH_SIZE = 25;
const LOCK_KEY = 'instagram-message-reconciliation';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class InstagramMessageReconciliationJob {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly reconciliationService: InstagramMessageReconciliationService,
  ) {}

  @Process(InstagramMessageReconciliationJob.name)
  @SentryCronMonitor(
    InstagramMessageReconciliationJob.name,
    INSTAGRAM_MESSAGE_RECONCILIATION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    let locked = false;

    try {
      await queryRunner.connect();
      const [lock] = await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [LOCK_KEY],
      );
      locked = lock?.locked === true;
      if (!locked) return;

      const receipts = await this.dataSource
        .getRepository(ActionExecutionReceiptEntity)
        .createQueryBuilder('receipt')
        .innerJoin('receipt.actionApprovalBinding', 'binding')
        .leftJoin(
          InstagramActionReservationEntity,
          'reservation',
          'reservation.actionExecutionReceiptId = receipt.id',
        )
        .select('receipt.id', 'id')
        .addSelect('receipt.workspaceId', 'workspaceId')
        .addSelect('receipt.state', 'state')
        .where(
          `(
            receipt.state IN (:...activeStates)
            OR (
              receipt.state IN (:...terminalStates)
              AND reservation.actionKind = :startChat
              AND reservation.targetLockReleasedAt IS NULL
            )
          )`,
          {
            activeStates: [
              ActionExecutionReceiptState.UNKNOWN,
              ActionExecutionReceiptState.PROVIDER_ACCEPTED,
            ],
            terminalStates: [
              ActionExecutionReceiptState.SENT,
              ActionExecutionReceiptState.FAILED,
            ],
            startChat: 'START_CHAT',
          },
        )
        .andWhere('binding.actionName = :actionName', {
          actionName: 'send_instagram_message',
        })
        .andWhere('binding.actionVersion = :actionVersion', {
          actionVersion: 2,
        })
        .orderBy('receipt.updatedAt', 'ASC')
        .addOrderBy('receipt.id', 'ASC')
        .take(BATCH_SIZE)
        .getRawMany<{
          id: string;
          workspaceId: string;
          state: ActionExecutionReceiptState;
        }>();

      for (const receipt of receipts) {
        const input = {
          receiptId: receipt.id,
          workspaceId: receipt.workspaceId,
        };
        try {
          if (
            receipt.state === ActionExecutionReceiptState.SENT ||
            receipt.state === ActionExecutionReceiptState.FAILED
          ) {
            await this.reconciliationService.repairTerminalTarget({
              ...input,
              state: receipt.state,
            });
            await this.deferReceipt(receipt);
          } else if (
            receipt.state === ActionExecutionReceiptState.PROVIDER_ACCEPTED
          ) {
            await this.reconciliationService.finalizeProviderAccepted(input);
          } else {
            const result = await this.reconciliationService.reconcile(input);
            if (result.kind !== 'MATCH') {
              await this.deferReceipt(receipt);
            }
          }
        } catch {
          await this.deferReceipt(receipt);
        }
      }
    } finally {
      if (locked) {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          LOCK_KEY,
        ]);
      }
      await queryRunner.release();
    }
  }

  private async deferReceipt(receipt: {
    id: string;
    state: ActionExecutionReceiptState;
  }): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(ActionExecutionReceiptEntity)
      .set({ updatedAt: new Date() })
      .where('id = :id', { id: receipt.id })
      .andWhere('state = :state', { state: receipt.state })
      .execute();
  }
}
