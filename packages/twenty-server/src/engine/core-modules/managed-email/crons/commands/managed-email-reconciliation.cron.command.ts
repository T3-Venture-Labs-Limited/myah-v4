import { Command, CommandRunner } from 'nest-commander';

import { MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/managed-email/constants/managed-email-reconciliation-cron-pattern.constant';
import { ManagedEmailReconciliationCronJob } from 'src/engine/core-modules/managed-email/crons/managed-email-reconciliation.cron.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

@Command({
  description: 'Starts recurring managed-email acquisition reconciliation',
  name: 'cron:managed-email-reconciliation',
})
export class ManagedEmailReconciliationCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.add(
      ManagedEmailReconciliationCronJob.name,
      {},
    );
    await this.messageQueueService.addCron<undefined>({
      data: undefined,
      jobName: ManagedEmailReconciliationCronJob.name,
      options: {
        repeat: { pattern: MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN },
      },
    });
  }
}
