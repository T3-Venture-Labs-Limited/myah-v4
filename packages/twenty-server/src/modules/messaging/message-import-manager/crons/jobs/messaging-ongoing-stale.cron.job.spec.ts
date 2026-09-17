import {
  MESSAGING_ONGOING_STALE_CRON_PATTERN,
  MessagingOngoingStaleCronJob,
} from 'src/modules/messaging/message-import-manager/crons/jobs/messaging-ongoing-stale.cron.job';

describe('MessagingOngoingStaleCronJob', () => {
  it('checks every five minutes and schedules one recovery per active workspace', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const job = new MessagingOngoingStaleCronJob(
      {
        find: jest.fn().mockResolvedValue([{ id: 'workspace-id' }]),
      } as never,
      { add } as never,
      { captureExceptions: jest.fn() } as never,
    );

    expect(MESSAGING_ONGOING_STALE_CRON_PATTERN).toBe('*/5 * * * *');

    await job.handle();

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('MessagingOngoingStaleJob', {
      workspaceId: 'workspace-id',
    });
  });
});
