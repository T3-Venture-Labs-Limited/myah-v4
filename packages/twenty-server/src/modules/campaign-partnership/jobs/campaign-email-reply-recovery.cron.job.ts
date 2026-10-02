import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { CAMPAIGN_EMAIL_REPLY_RECOVERY_CRON_NAME } from 'src/modules/campaign-partnership/constants/campaign-email-reply-jobs.constant';
import { CampaignEmailReplyPendingRecoveryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-pending-recovery.service';

@Processor(MessageQueue.cronQueue)
export class CampaignEmailReplyRecoveryCronJob {
  constructor(
    private readonly recovery: CampaignEmailReplyPendingRecoveryService,
  ) {}

  @Process(CAMPAIGN_EMAIL_REPLY_RECOVERY_CRON_NAME)
  async handle(): Promise<void> {
    await this.recovery.publishPending();
  }
}
