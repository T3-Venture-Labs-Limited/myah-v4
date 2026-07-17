import { Command, CommandRunner } from 'nest-commander';

import { ACTION_APPROVAL_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/action-approval/crons/constants/action-approval-reconciliation-cron-pattern.constant';
import { ActionApprovalReconciliationCronJob } from 'src/engine/core-modules/action-approval/crons/action-approval-reconciliation.cron.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

@Command({
  name: 'cron:action-approval-reconciliation',
  description: 'Reconciles terminal action approval receipts',
})
export class ActionApprovalReconciliationCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: ActionApprovalReconciliationCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: ACTION_APPROVAL_RECONCILIATION_CRON_PATTERN },
      },
    });
  }
}
