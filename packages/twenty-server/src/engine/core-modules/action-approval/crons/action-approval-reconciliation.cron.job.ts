import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ACTION_APPROVAL_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/action-approval/crons/constants/action-approval-reconciliation-cron-pattern.constant';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

const PROCESSING_GRACE_MS = 60_000;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ActionApprovalReconciliationCronJob {
  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    private readonly dataSource: DataSource,
  ) {}

  @Process(ActionApprovalReconciliationCronJob.name)
  @SentryCronMonitor(
    ActionApprovalReconciliationCronJob.name,
    ACTION_APPROVAL_RECONCILIATION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    let locked = false;

    try {
      await queryRunner.connect();
      const [lock] = await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        ['action-approval-reconciliation'],
      );
      locked = lock?.locked === true;
      if (!locked) {
        return;
      }

      await this.actionApprovalService.reconcile({
        processingBefore: new Date(Date.now() - PROCESSING_GRACE_MS),
      });
    } finally {
      if (locked) {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          'action-approval-reconciliation',
        ]);
      }
      await queryRunner.release();
    }
  }
}
