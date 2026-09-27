import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';
import { CampaignForecastRefreshService } from 'src/modules/campaign-execution/services/campaign-forecast-refresh.service';

export const CAMPAIGN_EMAIL_RUNTIME_CRON_PATTERN = '* * * * *';

@Processor(MessageQueue.cronQueue)
export class CampaignEmailRuntimeCronJob {
  constructor(
    private readonly runtime: CampaignEmailRuntimeService,
    private readonly forecasts: CampaignForecastRefreshService,
  ) {}

  @Process(CampaignEmailRuntimeCronJob.name)
  async handle(): Promise<void> {
    await this.runtime.runDueOccurrences();
    try {
      await this.forecasts.refreshStaleForecasts();
    } catch (error) {
      // Forecasts are advisory; their outage must not fail authoritative runtime work.
      // oxlint-disable-next-line no-console
      console.error('Campaign forecast refresh failed', error);
    }
  }
}
