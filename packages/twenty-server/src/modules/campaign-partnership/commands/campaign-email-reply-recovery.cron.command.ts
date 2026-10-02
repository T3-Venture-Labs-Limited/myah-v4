import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  CAMPAIGN_EMAIL_REPLY_RECOVERY_CRON_NAME,
  CAMPAIGN_EMAIL_REPLY_RECOVERY_CRON_PATTERN,
} from 'src/modules/campaign-partnership/constants/campaign-email-reply-jobs.constant';

@Command({
  name: 'cron:campaign-email-reply:recover',
  description:
    'Register durable pending Email reply work recovery without generation or sends',
})
export class CampaignEmailReplyRecoveryCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly queue: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.queue.addCron<undefined>({
      jobName: CAMPAIGN_EMAIL_REPLY_RECOVERY_CRON_NAME,
      data: undefined,
      options: {
        repeat: { pattern: CAMPAIGN_EMAIL_REPLY_RECOVERY_CRON_PATTERN },
      },
    });
  }
}
