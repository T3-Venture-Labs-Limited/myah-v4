import { UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN } from 'src/modules/myah-unipile/constants/unipile-instagram-account-recovery-cron-pattern.constant';
import { UnipileInstagramAccountRecoveryJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.job';

type UnipileInstagramAccountRecoveryCronCommand = {
  run: () => Promise<void>;
};

type UnipileInstagramAccountRecoveryCronCommandModule = {
  UnipileInstagramAccountRecoveryCronCommand: new (
    messageQueueService: { addCron: jest.Mock },
    availability: { assertEnabled: jest.Mock },
  ) => UnipileInstagramAccountRecoveryCronCommand;
};

const loadRecoveryCronCommandModule = ():
  | UnipileInstagramAccountRecoveryCronCommandModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.cron-command') as UnipileInstagramAccountRecoveryCronCommandModule;
  } catch {
    return undefined;
  }
};

describe('UnipileInstagramAccountRecoveryCronCommand', () => {
  it('is registered under the recovery cron command name', () => {
    const recoveryCronCommandModule = loadRecoveryCronCommandModule();

    expect(recoveryCronCommandModule).toBeDefined();

    if (!recoveryCronCommandModule) {
      return;
    }

    expect(
      Reflect.getMetadata(
        'CommandBuilder:Command:Meta',
        recoveryCronCommandModule.UnipileInstagramAccountRecoveryCronCommand,
      ),
    ).toMatchObject({ name: 'cron:unipile-instagram-account-recovery' });
  });

  it('registers exactly one five-minute recovery cron job', async () => {
    const recoveryCronCommandModule = loadRecoveryCronCommandModule();

    expect(recoveryCronCommandModule).toBeDefined();

    if (!recoveryCronCommandModule) {
      return;
    }

    expect(UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN).toBe('*/5 * * * *');

    const messageQueueService = {
      addCron: jest.fn().mockResolvedValue(undefined),
    };
    const availability = { assertEnabled: jest.fn() };
    const command =
      new recoveryCronCommandModule.UnipileInstagramAccountRecoveryCronCommand(
        messageQueueService,
        availability,
      );

    await command.run();
    expect(availability.assertEnabled).toHaveBeenCalledTimes(1);
    expect(availability.assertEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      messageQueueService.addCron.mock.invocationCallOrder[0],
    );

    expect(messageQueueService.addCron).toHaveBeenCalledTimes(1);
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      jobName: UnipileInstagramAccountRecoveryJob.name,
      data: undefined,
      options: {
        repeat: {
          pattern: UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN,
        },
      },
    });
  });

  it('does not add the recovery cron while Unipile Instagram is disabled', async () => {
    const recoveryCronCommandModule = loadRecoveryCronCommandModule();

    expect(recoveryCronCommandModule).toBeDefined();

    if (!recoveryCronCommandModule) {
      return;
    }

    const messageQueueService = { addCron: jest.fn() };
    const availabilityError = new Error('Unipile Instagram is disabled');
    const availability = {
      assertEnabled: jest.fn(() => {
        throw availabilityError;
      }),
    };
    const command =
      new recoveryCronCommandModule.UnipileInstagramAccountRecoveryCronCommand(
        messageQueueService,
        availability,
      );

    await expect(command.run()).rejects.toThrow(availabilityError);

    expect(availability.assertEnabled).toHaveBeenCalledTimes(1);
    expect(messageQueueService.addCron).not.toHaveBeenCalled();
  });
});
