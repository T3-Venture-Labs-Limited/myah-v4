import { Injectable } from '@nestjs/common';

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
  constructor(private readonly actionApprovalService: ActionApprovalService) {}

  @Process(ActionApprovalReconciliationCronJob.name)
  @SentryCronMonitor(
    ActionApprovalReconciliationCronJob.name,
    ACTION_APPROVAL_RECONCILIATION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    await this.actionApprovalService.reconcile({
      processingBefore: new Date(Date.now() - PROCESSING_GRACE_MS),
    });
  }
}
