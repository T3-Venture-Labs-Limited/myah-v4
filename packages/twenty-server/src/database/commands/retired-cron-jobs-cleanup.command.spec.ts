import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import {
  RETIRED_CRON_JOB_NAMES,
  RetiredCronJobsCleanupCommand,
} from './retired-cron-jobs-cleanup.command';

describe('RetiredCronJobsCleanupCommand', () => {
  it('removes the schedules of cron jobs whose code was deleted', async () => {
    const removeCron = jest.fn().mockResolvedValue(undefined);
    const command = new RetiredCronJobsCleanupCommand({
      removeCron,
    } as unknown as MessageQueueService);

    await command.run();

    expect(removeCron.mock.calls.map(([args]) => args.jobName)).toEqual([
      'CalendarEventsImportCronJob',
      'CalendarEventListFetchCronJob',
      'CalendarOngoingStaleCronJob',
      'CalendarRelaunchFailedCalendarChannelsCronJob',
    ]);
    expect(RETIRED_CRON_JOB_NAMES).toHaveLength(4);
  });
});
