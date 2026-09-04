type UnipileInstagramAccountRecoveryJob = {
  handle: () => Promise<void>;
};

type UnipileInstagramAccountRecoveryJobModule = {
  UnipileInstagramAccountRecoveryJob: new (
    recoveryService: { recover: jest.Mock },
    dataSource: { createQueryRunner: jest.Mock },
  ) => UnipileInstagramAccountRecoveryJob;
};

const loadRecoveryJobModule = ():
  | UnipileInstagramAccountRecoveryJobModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.job') as UnipileInstagramAccountRecoveryJobModule;
  } catch {
    return undefined;
  }
};

describe('UnipileInstagramAccountRecoveryJob', () => {
  it('recovers accounts at the exact 60-second processing cutoff when it acquires the lock', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T12:00:00.000Z'));

    try {
      const recoveryJobModule = loadRecoveryJobModule();

      expect(recoveryJobModule).toBeDefined();

      if (!recoveryJobModule) {
        return;
      }

      const recoveryService = {
        recover: jest.fn().mockResolvedValue({
          disconnectRecovered: 0,
          hostedRecovered: 0,
          failed: 0,
        }),
      };
      const queryRunner = {
        connect: jest.fn(),
        release: jest.fn(),
        query: jest
          .fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(undefined),
      };
      const dataSource = {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      };
      const job = new recoveryJobModule.UnipileInstagramAccountRecoveryJob(
        recoveryService,
        dataSource,
      );

      await job.handle();

      expect(recoveryService.recover).toHaveBeenCalledWith({
        processingBefore: new Date('2026-09-04T11:59:00.000Z'),
      });
      expect(queryRunner.query).toHaveBeenNthCalledWith(
        1,
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        ['unipile-instagram-account-recovery'],
      );
      expect(queryRunner.query).toHaveBeenNthCalledWith(
        2,
        'SELECT pg_advisory_unlock(hashtext($1))',
        ['unipile-instagram-account-recovery'],
      );
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('releases its query runner without recovering when the lock is unavailable', async () => {
    const recoveryJobModule = loadRecoveryJobModule();

    expect(recoveryJobModule).toBeDefined();

    if (!recoveryJobModule) {
      return;
    }

    const recoveryService = { recover: jest.fn() };
    const queryRunner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([{ locked: false }]),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const job = new recoveryJobModule.UnipileInstagramAccountRecoveryJob(
      recoveryService,
      dataSource,
    );

    await job.handle();

    expect(recoveryService.recover).not.toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('unlocks and releases its query runner when recovery throws', async () => {
    const recoveryJobModule = loadRecoveryJobModule();

    expect(recoveryJobModule).toBeDefined();

    if (!recoveryJobModule) {
      return;
    }

    const recoveryError = new Error('recovery failed');
    const recoveryService = {
      recover: jest.fn().mockRejectedValue(recoveryError),
    };
    const queryRunner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const job = new recoveryJobModule.UnipileInstagramAccountRecoveryJob(
      recoveryService,
      dataSource,
    );

    await expect(job.handle()).rejects.toThrow(recoveryError);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['unipile-instagram-account-recovery'],
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
