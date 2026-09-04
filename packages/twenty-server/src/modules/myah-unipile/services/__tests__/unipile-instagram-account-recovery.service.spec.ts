import { LessThan } from 'typeorm';

type UnipileInstagramAccountRecoveryService = {
  recover: (input: { processingBefore: Date }) => Promise<{
    disconnectRecovered: number;
    hostedRecovered: number;
    failed: number;
  }>;
};

type UnipileInstagramAccountRecoveryServiceModule = {
  UnipileInstagramAccountRecoveryService: new (
    bindingRepository: { find: jest.Mock },
    hostedAuthAttemptRepository: { find: jest.Mock },
    accountService: {
      reconcileUnknownDisconnect: jest.Mock;
      reconcileConnectingAccount: jest.Mock;
    },
    hostedAuthService: { resumeProcessingAttempt: jest.Mock },
    availability: { assertEnabled: jest.Mock },
  ) => UnipileInstagramAccountRecoveryService;
};

const loadRecoveryServiceModule = ():
  | UnipileInstagramAccountRecoveryServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-account-recovery.service') as UnipileInstagramAccountRecoveryServiceModule;
  } catch {
    return undefined;
  }
};

describe('UnipileInstagramAccountRecoveryService', () => {
  it('recovers oldest bounded unknown disconnects and stale Hosted Auth attempts independently', async () => {
    const recoveryServiceModule = loadRecoveryServiceModule();

    expect(recoveryServiceModule).toBeDefined();

    if (!recoveryServiceModule) {
      return;
    }

    const processingBefore = new Date('2026-09-04T12:00:00.000Z');
    const bindingRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'disconnect-recovered' },
          { id: 'disconnect-failed' },
        ])
        .mockResolvedValueOnce([]),
    };
    const hostedAuthAttemptRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'hosted-recovered' },
          { id: 'hosted-failed' },
        ]),
    };
    const accountService = {
      reconcileUnknownDisconnect: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('disconnect recovery failed')),
      reconcileConnectingAccount: jest.fn(),
    };
    const hostedAuthService = {
      resumeProcessingAttempt: jest
        .fn()
        .mockResolvedValueOnce({
          attemptId: 'hosted-recovered',
          status: 'COMPLETED',
        })
        .mockRejectedValueOnce(new Error('Hosted Auth recovery failed')),
    };
    const availability = {
      assertEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const RecoveryService =
      recoveryServiceModule.UnipileInstagramAccountRecoveryService as unknown as new (
        ...dependencies: unknown[]
      ) => UnipileInstagramAccountRecoveryService;
    const service = new RecoveryService(
      bindingRepository,
      hostedAuthAttemptRepository,
      accountService,
      hostedAuthService,
      availability,
    );

    await expect(service.recover({ processingBefore })).resolves.toEqual({
      disconnectRecovered: 1,
      hostedRecovered: 1,
      failed: 2,
    });
    expect(availability.assertEnabled).toHaveBeenCalledTimes(1);
    expect(availability.assertEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      bindingRepository.find.mock.invocationCallOrder[0],
    );

    expect(bindingRepository.find).toHaveBeenCalledWith({
      where: { status: 'DELETE_UNKNOWN' },
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: 50,
    });
    expect(hostedAuthAttemptRepository.find).toHaveBeenCalledWith({
      where: {
        status: 'PROCESSING',
        updatedAt: LessThan(processingBefore),
      },
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: 50,
    });
    expect(accountService.reconcileUnknownDisconnect).toHaveBeenNthCalledWith(
      1,
      'disconnect-recovered',
    );
    expect(accountService.reconcileUnknownDisconnect).toHaveBeenNthCalledWith(
      2,
      'disconnect-failed',
    );
    expect(hostedAuthService.resumeProcessingAttempt).toHaveBeenNthCalledWith(
      1,
      'hosted-recovered',
    );
    expect(hostedAuthService.resumeProcessingAttempt).toHaveBeenNthCalledWith(
      2,
      'hosted-failed',
    );
  });

  it('reconciles the oldest fifty CONNECTING bindings through the read-only account service seam', async () => {
    const recoveryServiceModule = loadRecoveryServiceModule();

    expect(recoveryServiceModule).toBeDefined();

    if (!recoveryServiceModule) {
      return;
    }

    const connectingBindings = Array.from({ length: 50 }, (_, index) => ({
      id: `connecting-${index}`,
    }));
    const bindingRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(connectingBindings),
    };
    const accountService = {
      reconcileUnknownDisconnect: jest.fn(),
      reconcileConnectingAccount: jest.fn().mockResolvedValue(undefined),
    };
    const hostedAuthAttemptRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const availability = {
      assertEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const hostedAuthService = { resumeProcessingAttempt: jest.fn() };
    const RecoveryService =
      recoveryServiceModule.UnipileInstagramAccountRecoveryService as unknown as new (
        ...dependencies: unknown[]
      ) => UnipileInstagramAccountRecoveryService;
    const service = new RecoveryService(
      bindingRepository,
      hostedAuthAttemptRepository,
      accountService,
      hostedAuthService,
      availability,
    );

    await expect(
      service.recover({
        processingBefore: new Date('2026-09-04T12:00:00.000Z'),
      }),
    ).resolves.toBeDefined();

    expect(bindingRepository.find).toHaveBeenCalledWith({
      where: { status: 'CONNECTING' },
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: 50,
    });
    expect(accountService.reconcileConnectingAccount).toHaveBeenCalledTimes(50);
    expect(accountService.reconcileConnectingAccount).toHaveBeenNthCalledWith(
      1,
      'connecting-0',
    );
    expect(accountService.reconcileConnectingAccount).toHaveBeenNthCalledWith(
      50,
      'connecting-49',
    );
  });

  it('asserts Unipile Instagram availability before reading recovery candidates', async () => {
    const recoveryServiceModule = loadRecoveryServiceModule();

    expect(recoveryServiceModule).toBeDefined();

    if (!recoveryServiceModule) {
      return;
    }

    const bindingRepository = { find: jest.fn() };
    const hostedAuthAttemptRepository = { find: jest.fn() };
    const availabilityError = new Error('Unipile Instagram is disabled');
    const availability = {
      assertEnabled: jest.fn().mockRejectedValue(availabilityError),
    };
    const RecoveryService =
      recoveryServiceModule.UnipileInstagramAccountRecoveryService as unknown as new (
        ...dependencies: unknown[]
      ) => UnipileInstagramAccountRecoveryService;
    const service = new RecoveryService(
      bindingRepository,
      hostedAuthAttemptRepository,
      {
        reconcileUnknownDisconnect: jest.fn(),
        reconcileConnectingAccount: jest.fn(),
      },
      { resumeProcessingAttempt: jest.fn() },
      availability,
    );

    await expect(
      service.recover({
        processingBefore: new Date('2026-09-04T12:00:00.000Z'),
      }),
    ).rejects.toThrow(availabilityError);

    expect(availability.assertEnabled).toHaveBeenCalledTimes(1);
    expect(bindingRepository.find).not.toHaveBeenCalled();
    expect(hostedAuthAttemptRepository.find).not.toHaveBeenCalled();
  });
});
