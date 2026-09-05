import { Command, CommandRunner } from 'nest-commander';

import { INSTAGRAM_MESSAGE_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.constants';
import { InstagramMessageReconciliationJob } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

@Command({
  name: 'cron:instagram-message-reconciliation',
  description:
    'Reconciles uncertain Unipile Instagram message sends by reads only',
})
export class InstagramMessageReconciliationCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: InstagramMessageReconciliationJob.name,
      data: undefined,
      options: {
        repeat: { pattern: INSTAGRAM_MESSAGE_RECONCILIATION_CRON_PATTERN },
      },
    });
  }
}
