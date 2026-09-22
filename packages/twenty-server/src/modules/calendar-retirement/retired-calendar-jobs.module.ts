import { Module } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

abstract class RetiredCalendarJob {
  async handle(): Promise<void> {}
}

const calendarQueue = MessageQueue.calendarQueue;
const cronQueue = MessageQueue.cronQueue;

@Processor(calendarQueue)
export class CalendarEventListFetchJob extends RetiredCalendarJob {
  @Process(CalendarEventListFetchJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class CalendarEventsImportJob extends RetiredCalendarJob {
  @Process(CalendarEventsImportJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class CalendarOngoingStaleJob extends RetiredCalendarJob {
  @Process(CalendarOngoingStaleJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class CalendarRelaunchFailedCalendarChannelJob extends RetiredCalendarJob {
  @Process(CalendarRelaunchFailedCalendarChannelJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class CalendarEventParticipantMatchParticipantJob extends RetiredCalendarJob {
  @Process(CalendarEventParticipantMatchParticipantJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class DeleteConnectedAccountAssociatedCalendarDataJob extends RetiredCalendarJob {
  @Process(DeleteConnectedAccountAssociatedCalendarDataJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class CalendarChannelDeletionCleanupJob extends RetiredCalendarJob {
  @Process(CalendarChannelDeletionCleanupJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class BlocklistReimportCalendarEventsJob extends RetiredCalendarJob {
  @Process(BlocklistReimportCalendarEventsJob.name)
  override async handle(): Promise<void> {}
}

@Processor(calendarQueue)
export class BlocklistItemDeleteCalendarEventsJob extends RetiredCalendarJob {
  @Process(BlocklistItemDeleteCalendarEventsJob.name)
  override async handle(): Promise<void> {}
}

@Processor(cronQueue)
export class CalendarEventListFetchCronJob extends RetiredCalendarJob {
  @Process(CalendarEventListFetchCronJob.name)
  override async handle(): Promise<void> {}
}

@Processor(cronQueue)
export class CalendarEventsImportCronJob extends RetiredCalendarJob {
  @Process(CalendarEventsImportCronJob.name)
  override async handle(): Promise<void> {}
}

@Processor(cronQueue)
export class CalendarOngoingStaleCronJob extends RetiredCalendarJob {
  @Process(CalendarOngoingStaleCronJob.name)
  override async handle(): Promise<void> {}
}

@Processor(cronQueue)
export class CalendarRelaunchFailedCalendarChannelsCronJob extends RetiredCalendarJob {
  @Process(CalendarRelaunchFailedCalendarChannelsCronJob.name)
  override async handle(): Promise<void> {}
}

// ponytail: compatibility drain only; delete after all pre-retirement queue TTLs expire.
@Module({
  providers: [
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
  ],
})
export class RetiredCalendarJobsModule {}
