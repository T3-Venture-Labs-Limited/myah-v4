import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  CAMPAIGN_EMAIL_RUNTIME_CRON_PATTERN,
  CampaignEmailRuntimeCronJob,
} from 'src/modules/campaign-execution/services/campaign-email-runtime.cron.job';

@Command({
  name: 'cron:campaign:email-runtime',
  description: 'Processes due Campaign email outreach safely',
})
export class CampaignEmailRuntimeCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly queue: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.queue.addCron<undefined>({
      jobName: CampaignEmailRuntimeCronJob.name,
      data: undefined,
      options: { repeat: { pattern: CAMPAIGN_EMAIL_RUNTIME_CRON_PATTERN } },
    });
  }
}
