import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MyahInboxTriageReceiptRecoveryCronJob } from './myah-inbox-triage-receipt-recovery.job';

@Command({
  name: 'cron:myah-inbox-triage-receipt-recovery',
  description: 'Recovers pending Myah Inbox triage receipts',
})
export class MyahInboxTriageReceiptRecoveryCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: MyahInboxTriageReceiptRecoveryCronJob.name,
      data: undefined,
      options: { repeat: { every: 60_000 } },
    });
  }
}
