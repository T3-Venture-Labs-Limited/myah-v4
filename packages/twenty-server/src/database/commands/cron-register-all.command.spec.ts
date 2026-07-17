jest.mock('twenty-client-sdk/generate', () => ({}), { virtual: true });

import { CronRegisterAllCommand } from './cron-register-all.command';

const silentLogger = {
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

const runAggregate = async (metronomeEnabled: boolean) => {
  const otherCronCommand = { run: jest.fn().mockResolvedValue(undefined) };
  const managedProviderBillingRecoveryCronCommand = {
    run: jest.fn().mockResolvedValue(undefined),
  };
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'METRONOME_ENABLED') return metronomeEnabled;
      return undefined;
    }),
  };
  const aggregate = new Proxy(
    {},
    {
      get: (_, property) => {
        if (property === 'logger') return silentLogger;
        if (property === 'twentyConfigService') return twentyConfigService;
        if (property === 'managedProviderBillingRecoveryCronCommand') {
          return managedProviderBillingRecoveryCronCommand;
        }

        return otherCronCommand;
      },
    },
  );

  await CronRegisterAllCommand.prototype.run.call(aggregate);

  return { managedProviderBillingRecoveryCronCommand };
};

describe('CronRegisterAllCommand', () => {
  it('registers managed-provider billing recovery when Metronome is enabled', async () => {
    const { managedProviderBillingRecoveryCronCommand } =
      await runAggregate(true);

    expect(managedProviderBillingRecoveryCronCommand.run).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not register managed-provider billing recovery when Metronome is disabled', async () => {
    const { managedProviderBillingRecoveryCronCommand } =
      await runAggregate(false);

    expect(
      managedProviderBillingRecoveryCronCommand.run,
    ).not.toHaveBeenCalled();
  });
});
