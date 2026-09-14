import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';

export const CAMPAIGN_EMAIL_RUNTIME_CRON_PATTERN = '* * * * *';

@Processor(MessageQueue.cronQueue)
export class CampaignEmailRuntimeCronJob {
  constructor(private readonly runtime: CampaignEmailRuntimeService) {}

  @Process(CampaignEmailRuntimeCronJob.name)
  async handle(): Promise<void> {
    await this.runtime.runDueOccurrences();
  }
}
