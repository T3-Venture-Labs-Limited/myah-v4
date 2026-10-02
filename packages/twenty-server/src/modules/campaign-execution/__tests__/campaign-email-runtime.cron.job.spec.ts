import { CampaignEmailRuntimeCronJob } from 'src/modules/campaign-execution/services/campaign-email-runtime.cron.job';

describe('CampaignEmailRuntimeCronJob', () => {
  it('does not fail authoritative runtime work when forecast refresh fails', async () => {
    const runtime = {
      runDueOccurrences: jest.fn().mockResolvedValue(undefined),
    };
    const forecasts = {
      refreshStaleForecasts: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const error = jest.spyOn(console, 'error').mockImplementation();
    const job = new CampaignEmailRuntimeCronJob(
      runtime as never,
      forecasts as never,
    );

    await expect(job.handle()).resolves.toBeUndefined();
    expect(runtime.runDueOccurrences).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Campaign forecast refresh failed',
      expect.any(Error),
    );

    error.mockRestore();
  });
});
