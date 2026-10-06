import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

// Cron jobs whose code was deleted. Their BullMQ schedules outlive the code and
// keep firing every minute (and Sentry keeps reporting missed check-ins), so
// remove them whenever crons are registered. Calendar sync: MYAH-410.
export const RETIRED_CRON_JOB_NAMES = [
  'CalendarEventsImportCronJob',
  'CalendarEventListFetchCronJob',
  'CalendarOngoingStaleCronJob',
  'CalendarRelaunchFailedCalendarChannelsCronJob',
] as const;

@Command({
  name: 'cron:remove-retired',
  description: 'Remove schedules of cron jobs that no longer exist',
})
export class RetiredCronJobsCleanupCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    for (const jobName of RETIRED_CRON_JOB_NAMES) {
      await this.messageQueueService.removeCron({ jobName });
    }
  }
}
