import {
  BlocklistItemDeleteCalendarEventsJob,
  BlocklistReimportCalendarEventsJob,
  CalendarChannelDeletionCleanupJob,
  CalendarEventListFetchCronJob,
  CalendarEventListFetchJob,
  CalendarEventParticipantMatchParticipantJob,
  CalendarEventsImportCronJob,
  CalendarEventsImportJob,
  CalendarOngoingStaleCronJob,
  CalendarOngoingStaleJob,
  CalendarRelaunchFailedCalendarChannelJob,
  CalendarRelaunchFailedCalendarChannelsCronJob,
  DeleteConnectedAccountAssociatedCalendarDataJob,
} from 'src/modules/calendar-retirement/retired-calendar-jobs.module';

describe('retired calendar queue compatibility', () => {
  it('drains every legacy job without dependencies or side effects', async () => {
    const jobs = [
      CalendarEventListFetchJob,
      CalendarEventsImportJob,
      CalendarOngoingStaleJob,
      CalendarRelaunchFailedCalendarChannelJob,
      CalendarEventParticipantMatchParticipantJob,
      DeleteConnectedAccountAssociatedCalendarDataJob,
      CalendarChannelDeletionCleanupJob,
      BlocklistReimportCalendarEventsJob,
      BlocklistItemDeleteCalendarEventsJob,
      CalendarEventListFetchCronJob,
      CalendarEventsImportCronJob,
      CalendarOngoingStaleCronJob,
      CalendarRelaunchFailedCalendarChannelsCronJob,
    ];

    await expect(
      Promise.all(jobs.map((Job) => new Job().handle())),
    ).resolves.toEqual(jobs.map(() => undefined));
  });
});
