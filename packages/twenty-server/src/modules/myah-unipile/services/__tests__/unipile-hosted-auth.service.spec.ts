import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { IsNull, QueryFailedError } from 'typeorm';

type HostedAuthLinkInput = {
  expiresOn: Date;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  notifyUrl: string;
  name: string;
};

type UnipileHostedAuthService = {
  createConnectionAttempt: (input: {
    workspaceId: string;
    userWorkspaceId: string;
  }) => Promise<{ attemptId: string; url: string }>;
  createReconnectAttempt: (input: {
    workspaceId: string;
    userWorkspaceId: string;
  }) => Promise<{ attemptId: string; url: string }>;
  expirePendingAttempt: (attemptId: string) => Promise<void>;
  resumeProcessingAttempt: (
    attemptId: string,
  ) => Promise<{ attemptId: string; status: string }>;
  processNotification: (input: {
    attemptId: string;
    name: string;
    status: 'CREATION_SUCCESS' | 'RECONNECTED';
    accountId: string;
  }) => Promise<{ attemptId: string; status: string }>;
  getAttemptStatus: (input: {
    attemptId: string;
    workspaceId: string;
    userWorkspaceId: string;
  }) => Promise<{
    attemptId: string;
    status: string;
    failureCode: string | null;
    failureReason: string | null;
  }>;
};

type UnipileHostedAuthServiceModule = {
  UnipileHostedAuthService: new (
    attemptRepository: {
      create: jest.Mock;
      save: jest.Mock;
      manager?: {
        transaction: jest.Mock;
      };
    },
    bindingRepository: { findOne: jest.Mock; find?: jest.Mock },
    client: { createHostedAuthLink: jest.Mock; getAccount?: jest.Mock },
    twentyConfigService: { get: jest.Mock },
    availabilityService: { assertEnabled: jest.Mock },
    accountService?: { finalizeHostedAuthConnection: jest.Mock },
  ) => UnipileHostedAuthService;
};

const loadHostedAuthServiceModule = ():
  | UnipileHostedAuthServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-hosted-auth.service') as UnipileHostedAuthServiceModule;
  } catch {
    return undefined;
  }
};

const collectStrings = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
};

const createAvailabilityService = () => ({
  assertEnabled: jest.fn(),
});

describe('UnipileHostedAuthService', () => {
  const workspaceId = '3bb95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
  const userWorkspaceId = 'f0c7cbb3-7772-455d-9d9a-4dfe7a2f49af';
  const now = new Date('2026-09-04T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists a pending CREATE attempt before requesting its Hosted Auth link', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    let attemptWasPersisted = false;
    const attemptRepository = {
      create: jest.fn((attempt) => attempt),
      save: jest.fn(async (attempt) => {
        attemptWasPersisted = true;

        return attempt;
      }),
    };
    const availabilityService = createAvailabilityService();
    const bindingRepository = {
      findOne: jest.fn(async () => {
        expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

        return null;
      }),
    };
    const client = {
      createHostedAuthLink: jest.fn(async (_input: HostedAuthLinkInput) => {
        expect(attemptWasPersisted).toBe(true);

        return { url: 'https://auth.unipile.test/hosted-link' };
      }),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SERVER_URL') return 'https://api.myah.test';
        if (key === 'FRONTEND_URL') return 'https://app.myah.test';
      }),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      bindingRepository,
      client,
      twentyConfigService,
      availabilityService,
    );

    const result = await service.createConnectionAttempt({
      workspaceId,
      userWorkspaceId,
    });

    const { attemptId } = result;

    const persistedAttempt = attemptRepository.save.mock.calls[0][0];
    const providerInput = client.createHostedAuthLink.mock
      .calls[0][0] as HostedAuthLinkInput;
    const rawSecret = providerInput.name;

    expect(result).toEqual({
      attemptId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
      url: 'https://auth.unipile.test/hosted-link',
    });
    expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);
    expect(bindingRepository.findOne).toHaveBeenCalledTimes(1);
    expect(attemptRepository.create).toHaveBeenCalledWith({
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: expect.any(String),
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: expect.any(Date),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    });
    expect(persistedAttempt.callbackSecretHash).not.toBe(rawSecret);
    expect(persistedAttempt.callbackSecretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(persistedAttempt.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    expect(
      persistedAttempt.expiresAt.getTime() - now.getTime(),
    ).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(providerInput).toEqual({
      expiresOn: persistedAttempt.expiresAt,
      successRedirectUrl: `https://app.myah.test/settings/accounts/instagram?connection=success&attemptId=${attemptId}`,
      failureRedirectUrl: `https://app.myah.test/settings/accounts/instagram?connection=failed&attemptId=${attemptId}`,
      notifyUrl: `https://api.myah.test/rest/myah/unipile/instagram/hosted-auth/${attemptId}/notify`,
      name: rawSecret,
    });
    expect(rawSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(collectStrings(persistedAttempt)).not.toContain(rawSecret);
    expect(collectStrings(result)).not.toContain(rawSecret);
  });

  it('uses a dedicated callback base URL with a stable slash join without changing frontend redirects', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptRepository = {
      create: jest.fn((attempt) => attempt),
      save: jest.fn(async (attempt) => attempt),
    };
    const client = {
      createHostedAuthLink: jest.fn(async () => ({
        url: 'https://auth.unipile.test/hosted-link',
      })),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn().mockResolvedValue(null) },
      client,
      {
        get: jest.fn((key: string) => {
          if (key === 'SERVER_URL') return 'https://api.myah.test/';
          if (key === 'FRONTEND_URL') return 'https://app.myah.test';
          if (key === 'UNIPILE_INSTAGRAM_CALLBACK_BASE_URL') {
            return 'https://callback-tunnel.trycloudflare.com/';
          }
        }),
      },
      createAvailabilityService(),
    );

    const { attemptId } = await service.createConnectionAttempt({
      workspaceId,
      userWorkspaceId,
    });
    const providerInput = (
      client.createHostedAuthLink.mock.calls as unknown as Array<
        [HostedAuthLinkInput]
      >
    )[0][0];

    expect(providerInput).toEqual(
      expect.objectContaining({
        notifyUrl: `https://callback-tunnel.trycloudflare.com/rest/myah/unipile/instagram/hosted-auth/${attemptId}/notify`,
        successRedirectUrl: `https://app.myah.test/settings/accounts/instagram?connection=success&attemptId=${attemptId}`,
        failureRedirectUrl: `https://app.myah.test/settings/accounts/instagram?connection=failed&attemptId=${attemptId}`,
      }),
    );
  });

  it('marks the persisted attempt failed when Hosted Auth link creation rejects', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const safeError = new Error('Unable to start Instagram authorization');
    const attemptRepository = {
      create: jest.fn((attempt) => attempt),
      save: jest.fn(async (attempt) => attempt),
    };
    const client = {
      createHostedAuthLink: jest.fn().mockRejectedValue(safeError),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn().mockResolvedValue(null) },
      client,
      {
        get: jest.fn((key: string) => {
          if (key === 'SERVER_URL') return 'https://api.myah.test';
          if (key === 'FRONTEND_URL') return 'https://app.myah.test';
        }),
      },
      createAvailabilityService(),
    );

    await expect(
      service.createConnectionAttempt({ workspaceId, userWorkspaceId }),
    ).rejects.toBe(safeError);

    const [pendingAttempt, failedAttempt] =
      attemptRepository.save.mock.calls.map(([attempt]) => attempt);

    expect(attemptRepository.save).toHaveBeenCalledTimes(2);
    expect(failedAttempt).toBe(pendingAttempt);
    expect(failedAttempt).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        processedAt: expect.any(Date),
        failureCode: 'HOSTED_AUTH_LINK_UNAVAILABLE',
        failureReason: 'Unable to start Instagram authorization',
      }),
    );
  });

  it.each([{ status: 'NEEDS_RECONNECT' }, { status: 'ERROR' }])(
    'persists a pending RECONNECT attempt for the sole $status binding before requesting its Hosted Auth link',
    async ({ status }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      let attemptWasPersisted = false;
      const binding = {
        id: 'eligible-binding-id',
        unipileAccountId: 'eligible-unipile-account-id',
        status,
      };
      const attemptRepository = {
        create: jest.fn((attempt) => attempt),
        save: jest.fn(async (attempt) => {
          attemptWasPersisted = true;

          return attempt;
        }),
      };
      const availabilityService = createAvailabilityService();
      const bindingRepository = {
        findOne: jest.fn(),
        find: jest.fn(async () => {
          expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

          return [binding];
        }),
      };
      const client = {
        createHostedAuthLink: jest.fn(async () => {
          expect(attemptWasPersisted).toBe(true);

          return { url: 'https://auth.unipile.test/reconnect-link' };
        }),
      };
      const twentyConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'SERVER_URL') return 'https://api.myah.test';
          if (key === 'FRONTEND_URL') return 'https://app.myah.test';
        }),
      };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        bindingRepository,
        client,
        twentyConfigService,
        availabilityService,
      );

      const result = await service.createReconnectAttempt({
        workspaceId,
        userWorkspaceId,
      });

      const persistedAttempt = attemptRepository.save.mock.calls[0][0];
      const providerCalls = client.createHostedAuthLink.mock
        .calls as unknown as Array<
        [
          HostedAuthLinkInput & {
            operation: string;
            reconnectAccountId: string;
          },
        ]
      >;
      const providerInput = providerCalls[0][0];

      expect(result).toEqual({
        attemptId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
        url: 'https://auth.unipile.test/reconnect-link',
      });
      expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);
      expect(bindingRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId }),
        }),
      );
      expect(
        collectStrings(
          (
            bindingRepository.find.mock.calls as unknown as Array<[unknown]>
          )[0][0],
        ),
      ).toEqual(expect.arrayContaining(['NEEDS_RECONNECT', 'ERROR']));
      expect(attemptRepository.create).toHaveBeenCalledWith({
        id: result.attemptId,
        workspaceId,
        userWorkspaceId,
        operation: 'RECONNECT',
        expectedBindingId: binding.id,
        callbackSecretHash: expect.any(String),
        callbackDigest: null,
        callbackAccountId: null,
        callbackStatus: null,
        status: 'PENDING',
        expiresAt: expect.any(Date),
        processedAt: null,
        failureCode: null,
        failureReason: null,
      });
      expect(persistedAttempt.callbackSecretHash).toMatch(/^[0-9a-f]{64}$/);
      expect(providerInput).toEqual({
        expiresOn: persistedAttempt.expiresAt,
        successRedirectUrl: `https://app.myah.test/settings/accounts/instagram?connection=success&attemptId=${result.attemptId}`,
        failureRedirectUrl: `https://app.myah.test/settings/accounts/instagram?connection=failed&attemptId=${result.attemptId}`,
        notifyUrl: `https://api.myah.test/rest/myah/unipile/instagram/hosted-auth/${result.attemptId}/notify`,
        name: expect.stringMatching(/^[0-9a-f]{64}$/),
        operation: 'RECONNECT',
        reconnectAccountId: binding.unipileAccountId,
      });
      expect(collectStrings(persistedAttempt)).not.toContain(
        providerInput.name,
      );
      expect(collectStrings(result)).not.toContain(providerInput.name);
    },
  );

  it.each([
    { description: 'no eligible binding', bindings: [] },
    {
      description: 'more than one eligible binding',
      bindings: [
        { id: 'first-binding-id', unipileAccountId: 'first-account-id' },
        { id: 'second-binding-id', unipileAccountId: 'second-account-id' },
      ],
    },
  ])(
    'rejects reconnect initiation with $description before requesting a provider link',
    async ({ bindings }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const attemptRepository = { create: jest.fn(), save: jest.fn() };
      const bindingRepository = {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue(bindings),
      };
      const client = { createHostedAuthLink: jest.fn() };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        bindingRepository,
        client,
        { get: jest.fn() },
        createAvailabilityService(),
      );

      await expect(
        service.createReconnectAttempt({ workspaceId, userWorkspaceId }),
      ).rejects.toThrow();

      expect(attemptRepository.create).not.toHaveBeenCalled();
      expect(attemptRepository.save).not.toHaveBeenCalled();
      expect(client.createHostedAuthLink).not.toHaveBeenCalled();
    },
  );

  it('processes a valid CREATE callback through persisted processing and completion states', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '7aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-callback-secret';
    const accountId = 'unipile-account-id';
    const callbackSecretHash = createHash('sha256').update(name).digest('hex');
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash,
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const persistedStatuses: string[] = [];
    const transactionEvents: string[] = [];
    const availabilityService = createAvailabilityService();
    const createManager = () => ({
      query: jest.fn(),
      findOne: jest.fn(async () => {
        expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

        return attempt;
      }),
      save: jest.fn(async (...args: unknown[]) => {
        const savedAttempt = args[args.length - 1] as { status: string };

        persistedStatuses.push(savedAttempt.status);

        return savedAttempt;
      }),
    });
    const processingManager = createManager();
    const finalizationManager = createManager();
    let transactionNumber = 0;
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          transactionNumber += 1;
          const manager =
            transactionNumber === 1 ? processingManager : finalizationManager;
          transactionEvents.push(`transaction:${transactionNumber}:start`);

          try {
            const result = await callback(manager);

            transactionEvents.push(`transaction:${transactionNumber}:commit`);

            return result;
          } catch (error) {
            transactionEvents.push(`transaction:${transactionNumber}:rollback`);
            throw error;
          }
        }),
      },
    };
    const account = {
      accountId,
      instagramUserId: 'instagram-user-id',
      username: 'myah',
      sourceStatus: 'OK',
    };
    const client = {
      createHostedAuthLink: jest.fn(),
      getAccount: jest.fn(async (requestedAccountId: string) => {
        expect(requestedAccountId).toBe(accountId);
        expect(transactionEvents).toEqual([
          'transaction:1:start',
          'transaction:1:commit',
          'transaction:2:start',
        ]);
        expect(persistedStatuses).toEqual(['PROCESSING']);

        return account;
      }),
    };
    const accountService = {
      finalizeHostedAuthConnection: jest.fn(async () => {
        expect(transactionEvents).toEqual([
          'transaction:1:start',
          'transaction:1:commit',
          'transaction:2:start',
        ]);
      }),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      client,
      { get: jest.fn() },
      availabilityService,
      accountService,
    );

    const result = await service.processNotification({
      attemptId,
      name,
      status: 'CREATION_SUCCESS',
      accountId,
    });

    expect(attemptRepository.manager.transaction).toHaveBeenCalledTimes(2);
    expect(processingManager.findOne).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(finalizationManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`unipile-hosted-auth-finalization:${attemptId}`],
    );
    expect(finalizationManager.findOne).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);
    expect(persistedStatuses).toEqual(['PROCESSING', 'COMPLETED']);
    expect(transactionEvents).toEqual([
      'transaction:1:start',
      'transaction:1:commit',
      'transaction:2:start',
      'transaction:2:commit',
    ]);
    expect(attempt).toEqual(
      expect.objectContaining({
        callbackDigest: callbackSecretHash,
        callbackAccountId: accountId,
        callbackStatus: 'CREATION_SUCCESS',
        status: 'COMPLETED',
        processedAt: expect.any(Date),
      }),
    );
    expect(client.getAccount).toHaveBeenCalledWith(accountId);
    expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledWith({
      attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      account,
      coreManager: finalizationManager,
    });
    expect(result).toEqual({ attemptId, status: 'COMPLETED' });
    expect(collectStrings(processingManager.save.mock.calls)).not.toContain(
      name,
    );
    expect(
      collectStrings(accountService.finalizeHostedAuthConnection.mock.calls),
    ).not.toContain(name);
    expect(collectStrings(result)).not.toContain(name);
  });

  it('processes a valid RECONNECTED callback for its expected binding', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = 'cab95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-reconnected-secret';
    const accountId = 'reconnected-unipile-account-id';
    const expectedBindingId = 'reconnected-binding-id';
    const callbackDigest = createHash('sha256').update(name).digest('hex');
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'RECONNECT',
      expectedBindingId,
      callbackSecretHash: callbackDigest,
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const persistedStatuses: string[] = [];
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(async (savedAttempt: { status: string }) => {
        persistedStatuses.push(savedAttempt.status);

        return savedAttempt;
      }),
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const account = { accountId, instagramUserId: 'instagram-user-id' };
    const client = {
      createHostedAuthLink: jest.fn(),
      getAccount: jest.fn().mockResolvedValue(account),
    };
    const accountService = { finalizeHostedAuthConnection: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      client,
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );

    const result = await service.processNotification({
      attemptId,
      name,
      status: 'RECONNECTED',
      accountId,
    });

    expect(result).toEqual({ attemptId, status: 'COMPLETED' });

    expect(persistedStatuses).toEqual(['PROCESSING', 'COMPLETED']);
    expect(attempt).toEqual(
      expect.objectContaining({
        callbackDigest,
        callbackAccountId: accountId,
        callbackStatus: 'RECONNECTED',
        status: 'COMPLETED',
        processedAt: expect.any(Date),
      }),
    );
    expect(client.getAccount).toHaveBeenCalledWith(accountId);
    expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledWith({
      attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'RECONNECT',
      expectedBindingId,
      account,
      coreManager: manager,
    });
    expect(collectStrings(manager.save.mock.calls)).not.toContain(name);
    expect(
      collectStrings(accountService.finalizeHostedAuthConnection.mock.calls),
    ).not.toContain(name);
    expect(collectStrings(result)).not.toContain(name);
  });

  it('resumes an exact PROCESSING callback and completes it', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '8aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-resume-secret';
    const accountId = 'resumed-unipile-account-id';
    const callbackDigest = createHash('sha256').update(name).digest('hex');
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: callbackDigest,
      callbackDigest,
      callbackAccountId: accountId,
      callbackStatus: 'CREATION_SUCCESS',
      status: 'PROCESSING',
      expiresAt: new Date(now.getTime() - 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(async (savedAttempt) => savedAttempt),
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const account = { accountId, instagramUserId: 'instagram-user-id' };
    const client = {
      createHostedAuthLink: jest.fn(),
      getAccount: jest.fn().mockResolvedValue(account),
    };
    const accountService = { finalizeHostedAuthConnection: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      client,
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );

    await expect(
      service.processNotification({
        attemptId,
        name,
        status: 'CREATION_SUCCESS',
        accountId,
      }),
    ).resolves.toEqual({ attemptId, status: 'COMPLETED' });

    expect(client.getAccount).toHaveBeenCalledWith(accountId);
    expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledWith({
      attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      account,
      coreManager: manager,
    });
    expect(attemptRepository.manager.transaction).toHaveBeenCalledTimes(2);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`unipile-hosted-auth-finalization:${attemptId}`],
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        processedAt: expect.any(Date),
      }),
    );
    expect(collectStrings(manager.save.mock.calls)).not.toContain(name);
  });

  it('resumes a stored PROCESSING CREATE callback without its raw name', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '8ba95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const accountId = 'resumed-worker-unipile-account-id';
    const callbackDigest = createHash('sha256')
      .update('hosted-auth-resume-worker-secret')
      .digest('hex');
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: callbackDigest,
      callbackDigest,
      callbackAccountId: accountId,
      callbackStatus: 'CREATION_SUCCESS',
      status: 'PROCESSING',
      expiresAt: new Date(now.getTime() - 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const persistedStatuses: string[] = [];
    const availabilityService = createAvailabilityService();
    const manager = {
      query: jest.fn(),
      findOne: jest.fn(async () => {
        expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

        return attempt;
      }),
      save: jest.fn(async (savedAttempt: { status: string }) => {
        persistedStatuses.push(savedAttempt.status);

        return savedAttempt;
      }),
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const account = { accountId, instagramUserId: 'instagram-user-id' };
    const client = {
      createHostedAuthLink: jest.fn(),
      getAccount: jest.fn().mockResolvedValue(account),
    };
    const accountService = { finalizeHostedAuthConnection: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      client,
      { get: jest.fn() },
      availabilityService,
      accountService,
    );

    await expect(service.resumeProcessingAttempt(attemptId)).resolves.toEqual({
      attemptId,
      status: 'COMPLETED',
    });

    expect(attemptRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`unipile-hosted-auth-finalization:${attemptId}`],
    );
    expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(client.getAccount).toHaveBeenCalledWith(accountId);
    expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledWith({
      attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      account,
      coreManager: manager,
    });
    expect(persistedStatuses).toEqual(['COMPLETED']);
    expect(attempt).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        processedAt: expect.any(Date),
      }),
    );
  });

  it.each([
    ['callback digest', 'callbackDigest'],
    ['account ID', 'callbackAccountId'],
    ['callback status', 'callbackStatus'],
  ] as const)(
    'rejects a PROCESSING attempt without its stored %s before the provider',
    async (_description, missingFact) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const attemptId = '8ca95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
      const accountId = 'incomplete-worker-unipile-account-id';
      const callbackDigest = createHash('sha256')
        .update('hosted-auth-incomplete-worker-secret')
        .digest('hex');
      const storedCallback = {
        callbackDigest,
        callbackAccountId: accountId,
        callbackStatus: 'CREATION_SUCCESS',
      } as Record<
        'callbackDigest' | 'callbackAccountId' | 'callbackStatus',
        string | null
      >;

      storedCallback[missingFact] = null;

      const attempt = {
        id: attemptId,
        workspaceId,
        userWorkspaceId,
        operation: 'CREATE',
        expectedBindingId: null,
        callbackSecretHash: callbackDigest,
        ...storedCallback,
        status: 'PROCESSING',
        expiresAt: new Date(now.getTime() - 60_000),
        processedAt: null,
        failureCode: null,
        failureReason: null,
      };

      const manager = {
        query: jest.fn(),
        findOne: jest.fn().mockResolvedValue(attempt),
        save: jest.fn(),
      };
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => callback(manager)),
        },
      };
      const client = {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn(),
      };
      const accountService = { finalizeHostedAuthConnection: jest.fn() };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        { findOne: jest.fn() },
        client,
        { get: jest.fn() },
        createAvailabilityService(),
        accountService,
      );

      await expect(service.resumeProcessingAttempt(attemptId)).rejects.toThrow(
        'Unable to process Hosted Auth callback',
      );

      expect(client.getAccount).not.toHaveBeenCalled();
      expect(
        accountService.finalizeHostedAuthConnection,
      ).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('replays a completed worker attempt without provider or finalizer side effects', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '8da95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const accountId = 'completed-worker-unipile-account-id';
    const callbackDigest = createHash('sha256')
      .update('hosted-auth-completed-worker-secret')
      .digest('hex');
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: callbackDigest,
      callbackDigest,
      callbackAccountId: accountId,
      callbackStatus: 'CREATION_SUCCESS',
      status: 'COMPLETED',
      expiresAt: new Date(now.getTime() - 60_000),
      processedAt: now,
      failureCode: null,
      failureReason: null,
    };
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(),
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const client = {
      createHostedAuthLink: jest.fn(),
      getAccount: jest.fn(),
    };
    const accountService = { finalizeHostedAuthConnection: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      client,
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );

    await expect(service.resumeProcessingAttempt(attemptId)).resolves.toEqual({
      attemptId,
      status: 'COMPLETED',
    });

    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(client.getAccount).not.toHaveBeenCalled();
    expect(accountService.finalizeHostedAuthConnection).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns an exact COMPLETED replay without provider or finalizer side effects', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '9aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-completed-secret';
    const accountId = 'completed-unipile-account-id';
    const callbackDigest = createHash('sha256').update(name).digest('hex');
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: callbackDigest,
      callbackDigest,
      callbackAccountId: accountId,
      callbackStatus: 'CREATION_SUCCESS',
      status: 'COMPLETED',
      expiresAt: new Date(now.getTime() - 60_000),
      processedAt: now,
      failureCode: null,
      failureReason: null,
    };
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(),
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const client = {
      createHostedAuthLink: jest.fn(),
      getAccount: jest.fn(),
    };
    const accountService = { finalizeHostedAuthConnection: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      client,
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );

    await expect(
      service.processNotification({
        attemptId,
        name,
        status: 'CREATION_SUCCESS',
        accountId,
      }),
    ).resolves.toEqual({ attemptId, status: 'COMPLETED' });

    expect(client.getAccount).not.toHaveBeenCalled();
    expect(accountService.finalizeHostedAuthConnection).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(collectStrings(manager.save.mock.calls)).not.toContain(name);
  });

  it.each([
    {
      description: 'account',
      name: 'hosted-auth-conflict-secret',
      accountId: 'different-unipile-account-id',
      callbackStatus: 'CREATION_SUCCESS',
    },
    {
      description: 'secret',
      name: 'different-hosted-auth-conflict-secret',
      accountId: 'conflict-unipile-account-id',
      callbackStatus: 'CREATION_SUCCESS',
    },
    {
      description: 'status',
      name: 'hosted-auth-conflict-secret',
      accountId: 'conflict-unipile-account-id',
      callbackStatus: 'CREATION_FAILURE',
    },
  ])(
    'rejects a COMPLETED replay with a conflicting $description before the provider',
    async ({ name, accountId, callbackStatus }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const attemptId = 'aaa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
      const storedName = 'hosted-auth-conflict-secret';
      const storedAccountId = 'conflict-unipile-account-id';
      const callbackDigest = createHash('sha256')
        .update(storedName)
        .digest('hex');
      const attempt = {
        id: attemptId,
        workspaceId,
        userWorkspaceId,
        operation: 'CREATE',
        expectedBindingId: null,
        callbackSecretHash: callbackDigest,
        callbackDigest,
        callbackAccountId: storedAccountId,
        callbackStatus,
        status: 'COMPLETED',
        expiresAt: new Date(now.getTime() + 60_000),
        processedAt: now,
        failureCode: null,
        failureReason: null,
      };
      const manager = {
        query: jest.fn(),
        findOne: jest.fn().mockResolvedValue(attempt),
        save: jest.fn(),
      };
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => callback(manager)),
        },
      };
      const client = {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn(),
      };
      const accountService = { finalizeHostedAuthConnection: jest.fn() };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        { findOne: jest.fn() },
        client,
        { get: jest.fn() },
        createAvailabilityService(),
        accountService,
      );

      await expect(
        service.processNotification({
          attemptId,
          name,
          status: 'CREATION_SUCCESS',
          accountId,
        }),
      ).rejects.toThrow('Unable to process Hosted Auth callback');

      expect(client.getAccount).not.toHaveBeenCalled();
      expect(
        accountService.finalizeHostedAuthConnection,
      ).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(attempt.status).toBe('COMPLETED');
      expect(collectStrings(manager.save.mock.calls)).not.toContain(name);
    },
  );

  it.each([
    {
      description: 'expired pending attempt',
      name: 'hosted-auth-rejection-secret',
      attemptStatus: 'PENDING',
      operation: 'CREATE',
      expiresAt: new Date(now.getTime() - 1),
    },
    {
      description: 'wrong callback secret',
      name: 'wrong-hosted-auth-rejection-secret',
      attemptStatus: 'PENDING',
      operation: 'CREATE',
      expiresAt: new Date(now.getTime() + 60_000),
    },
    {
      description: 'non-pending attempt status',
      name: 'hosted-auth-rejection-secret',
      attemptStatus: 'FAILED',
      operation: 'CREATE',
      expiresAt: new Date(now.getTime() + 60_000),
    },
    {
      description: 'non-CREATE attempt operation',
      name: 'hosted-auth-rejection-secret',
      attemptStatus: 'PENDING',
      operation: 'RECONNECT',
      expiresAt: new Date(now.getTime() + 60_000),
    },
  ])(
    'rejects $description before the provider and never completes the attempt',
    async ({ name, attemptStatus, operation, expiresAt }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const attemptId = 'baa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
      const accountId = 'rejected-unipile-account-id';
      const expectedName = 'hosted-auth-rejection-secret';
      const attempt = {
        id: attemptId,
        workspaceId,
        userWorkspaceId,
        operation,
        expectedBindingId: null,
        callbackSecretHash: createHash('sha256')
          .update(expectedName)
          .digest('hex'),
        callbackDigest: null,
        callbackAccountId: null,
        callbackStatus: null,
        status: attemptStatus,
        expiresAt,
        processedAt: null,
        failureCode: null,
        failureReason: null,
      };
      const manager = {
        query: jest.fn(),
        findOne: jest.fn().mockResolvedValue(attempt),
        save: jest.fn(),
      };
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => callback(manager)),
        },
      };
      const client = {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn(),
      };
      const accountService = { finalizeHostedAuthConnection: jest.fn() };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        { findOne: jest.fn() },
        client,
        { get: jest.fn() },
        createAvailabilityService(),
        accountService,
      );

      await expect(
        service.processNotification({
          attemptId,
          name,
          status: 'CREATION_SUCCESS',
          accountId,
        }),
      ).rejects.toThrow('Unable to process Hosted Auth callback');

      expect(client.getAccount).not.toHaveBeenCalled();
      expect(
        accountService.finalizeHostedAuthConnection,
      ).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(attempt.status).not.toBe('COMPLETED');
      expect(collectStrings(manager.save.mock.calls)).not.toContain(name);
    },
  );

  it.each([
    {
      description: 'a finalization conflict',
      error: new ConflictException('Account already belongs to this workspace'),
    },
  ])(
    'persists a safe FAILED result under lock when $description rejects deterministically',
    async ({ error }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const attemptId = '0aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
      const name = 'hosted-auth-finalization-conflict';
      const accountId = 'finalization-conflict-account-id';
      const attempt = {
        id: attemptId,
        workspaceId,
        userWorkspaceId,
        operation: 'CREATE',
        expectedBindingId: null,
        callbackSecretHash: createHash('sha256').update(name).digest('hex'),
        callbackDigest: null,
        callbackAccountId: null,
        callbackStatus: null,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + 60_000),
        processedAt: null,
        failureCode: null,
        failureReason: null,
      };
      const savedAttempts: Array<Record<string, unknown>> = [];
      const manager = {
        query: jest.fn(),
        findOne: jest.fn().mockResolvedValue(attempt),
        save: jest.fn(async (savedAttempt: Record<string, unknown>) => {
          savedAttempts.push({ ...savedAttempt });

          return savedAttempt;
        }),
      };
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => callback(manager)),
        },
      };
      const accountService = {
        finalizeHostedAuthConnection: jest.fn(async () => {
          throw error;
        }),
      };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        { findOne: jest.fn() },
        {
          createHostedAuthLink: jest.fn(),
          getAccount: jest.fn().mockResolvedValue({ accountId }),
        },
        { get: jest.fn() },
        createAvailabilityService(),
        accountService,
      );

      await expect(
        service.processNotification({
          attemptId,
          name,
          status: 'CREATION_SUCCESS',
          accountId,
        }),
      ).rejects.toBe(error);

      expect(manager.findOne).toHaveBeenCalledTimes(2);
      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { id: attemptId },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(savedAttempts).toEqual([
        expect.objectContaining({ status: 'PROCESSING' }),
        expect.objectContaining({
          status: 'FAILED',
          failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
          failureReason: 'Unable to finalize Instagram account connection',
          processedAt: expect.any(Date),
        }),
      ]);
    },
  );
  it('rolls back an aborted unique-binding finalization before terminalizing the stored PROCESSING attempt', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '6aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-finalization-duplicate-key';
    const accountId = 'duplicate-key-account-id';
    const duplicateKeyError = new QueryFailedError(
      'INSERT INTO "myahInstagramAccountBinding"',
      [],
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );
    const pendingAttempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: createHash('sha256').update(name).digest('hex'),
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    let storedProcessingAttempt = { ...pendingAttempt };
    const processingManager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(pendingAttempt),
      save: jest.fn(async (attempt: Record<string, unknown>) => {
        Object.assign(storedProcessingAttempt, attempt);

        return attempt;
      }),
    };
    let finalizationTransactionAborted = false;
    const abortedFinalizationManager = {
      query: jest.fn(),
      findOne: jest.fn(async () => ({ ...storedProcessingAttempt })),
      save: jest.fn(async () => {
        if (finalizationTransactionAborted) {
          throw new Error(
            'current transaction is aborted, commands ignored until end of transaction block',
          );
        }
      }),
    };
    const recoveryReads: Array<Record<string, unknown>> = [];
    const recoveryManager = {
      query: jest.fn(),
      findOne: jest.fn(async () => {
        const attempt = { ...storedProcessingAttempt };

        recoveryReads.push({ ...attempt });

        return attempt;
      }),
      save: jest.fn(async (attempt: Record<string, unknown>) => attempt),
    };
    const transactionEvents: string[] = [];
    const transactionManagers = [
      processingManager,
      abortedFinalizationManager,
      recoveryManager,
    ];
    let transactionNumber = 0;
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          const transactionName = ['A', 'B', 'C'][transactionNumber];
          const manager = transactionManagers[transactionNumber++];

          transactionEvents.push(`transaction:${transactionName}:start`);

          try {
            const result = await callback(manager);

            transactionEvents.push(`transaction:${transactionName}:commit`);

            return result;
          } catch (error) {
            transactionEvents.push(`transaction:${transactionName}:rollback`);
            throw error;
          }
        }),
      },
    };
    const accountService = {
      finalizeHostedAuthConnection: jest.fn(
        async (input: { coreManager: unknown }) => {
          expect(input.coreManager).toBe(abortedFinalizationManager);
          finalizationTransactionAborted = true;

          throw duplicateKeyError;
        },
      ),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn().mockResolvedValue({ accountId }),
      },
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );

    await expect(
      service.processNotification({
        attemptId,
        name,
        status: 'CREATION_SUCCESS',
        accountId,
      }),
    ).rejects.toBe(duplicateKeyError);

    expect(transactionEvents).toEqual([
      'transaction:A:start',
      'transaction:A:commit',
      'transaction:B:start',
      'transaction:B:rollback',
      'transaction:C:start',
      'transaction:C:commit',
    ]);
    expect(processingManager.save.mock.calls).toEqual([
      [expect.objectContaining({ status: 'PROCESSING' })],
    ]);
    expect(abortedFinalizationManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`unipile-hosted-auth-finalization:${attemptId}`],
    );
    expect(recoveryManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`unipile-hosted-auth-finalization:${attemptId}`],
    );
    expect(recoveryManager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(recoveryReads).toEqual([
      expect.objectContaining({
        id: attemptId,
        status: 'PROCESSING',
        callbackDigest: createHash('sha256').update(name).digest('hex'),
        callbackAccountId: accountId,
        callbackStatus: 'CREATION_SUCCESS',
      }),
    ]);
    expect(recoveryManager.save).toHaveBeenCalledTimes(1);
    expect(abortedFinalizationManager.save).not.toHaveBeenCalled();
    expect(recoveryManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: attemptId,
        status: 'FAILED',
        failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
        failureReason: 'Unable to finalize Instagram account connection',
        processedAt: expect.any(Date),
      }),
    );
  });

  it.each([
    {
      description: 'a retryable account lookup transport failure',
      rejectedOperation: 'account lookup',
    },
    {
      description: 'a generic account finalizer projection outage',
      rejectedOperation: 'account finalizer',
    },
  ])(
    'leaves a PROCESSING attempt untouched after $description',
    async ({ rejectedOperation }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const attemptId = '1aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
      const name = 'hosted-auth-transport-failure';
      const accountId = 'transport-failure-account-id';
      const projectionError = new Error('Unipile read timed out');
      const attempt = {
        id: attemptId,
        workspaceId,
        userWorkspaceId,
        operation: 'CREATE',
        expectedBindingId: null,
        callbackSecretHash: createHash('sha256').update(name).digest('hex'),
        callbackDigest: null,
        callbackAccountId: null,
        callbackStatus: null,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + 60_000),
        processedAt: null,
        failureCode: null,
        failureReason: null,
      };
      const savedStatuses: string[] = [];
      const transactionEvents: string[] = [];
      const createManager = () => ({
        query: jest.fn(),
        findOne: jest.fn().mockResolvedValue(attempt),
        save: jest.fn(async (savedAttempt: { status: string }) => {
          savedStatuses.push(savedAttempt.status);

          return savedAttempt;
        }),
      });
      const processingManager = createManager();
      const finalizationManager = createManager();
      let transactionNumber = 0;
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => {
            transactionNumber += 1;
            const manager =
              transactionNumber === 1 ? processingManager : finalizationManager;

            transactionEvents.push(`transaction:${transactionNumber}:start`);

            try {
              const result = await callback(manager);

              transactionEvents.push(`transaction:${transactionNumber}:commit`);

              return result;
            } catch (error) {
              transactionEvents.push(
                `transaction:${transactionNumber}:rollback`,
              );
              throw error;
            }
          }),
        },
      };
      const accountService = {
        finalizeHostedAuthConnection: jest.fn(async () => {
          if (rejectedOperation === 'account finalizer') {
            throw projectionError;
          }
        }),
      };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        { findOne: jest.fn() },
        {
          createHostedAuthLink: jest.fn(),
          getAccount: jest.fn(() =>
            rejectedOperation === 'account lookup'
              ? Promise.reject(projectionError)
              : Promise.resolve({ accountId }),
          ),
        },
        { get: jest.fn() },
        createAvailabilityService(),
        accountService,
      );

      await expect(
        service.processNotification({
          attemptId,
          name,
          status: 'CREATION_SUCCESS',
          accountId,
        }),
      ).rejects.toBe(projectionError);

      expect(savedStatuses).toEqual(['PROCESSING']);
      expect(attemptRepository.manager.transaction).toHaveBeenCalledTimes(2);
      expect(transactionEvents).toEqual([
        'transaction:1:start',
        'transaction:1:commit',
        'transaction:2:start',
        'transaction:2:rollback',
      ]);
      expect(attempt).toEqual(
        expect.objectContaining({
          status: 'PROCESSING',
          failureCode: null,
          failureReason: null,
          processedAt: null,
        }),
      );
      expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledTimes(
        rejectedOperation === 'account finalizer' ? 1 : 0,
      );
    },
  );

  it('leaves a direct callback PROCESSING when the provider account is temporarily absent', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();
    const { UnipileReadError } =
      require('src/modules/myah-unipile/services/unipile-v1-client.service') as {
        UnipileReadError: new (
          status: number,
          code: string,
          message: string,
          retryable: boolean,
        ) => Error;
      };

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '2aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-account-not-yet-visible';
    const accountId = 'not-yet-visible-account-id';
    const notFoundError = new UnipileReadError(
      404,
      'UNIPILE_ACCOUNT_NOT_FOUND',
      'Unable to retrieve the requested Instagram account',
      true,
    );
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: createHash('sha256').update(name).digest('hex'),
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const savedStatuses: string[] = [];
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(async (savedAttempt: { status: string }) => {
        savedStatuses.push(savedAttempt.status);

        return savedAttempt;
      }),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => callback(manager)),
        },
      },
      { findOne: jest.fn() },
      {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn().mockRejectedValue(notFoundError),
      },
      { get: jest.fn() },
      createAvailabilityService(),
      { finalizeHostedAuthConnection: jest.fn() },
    );

    await expect(
      service.processNotification({
        attemptId,
        name,
        status: 'CREATION_SUCCESS',
        accountId,
      }),
    ).rejects.toBe(notFoundError);

    expect(savedStatuses).toEqual(['PROCESSING']);
    expect(attempt).toMatchObject({
      status: 'PROCESSING',
      failureCode: null,
      failureReason: null,
      processedAt: null,
    });
  });

  it('terminalizes a resumed PROCESSING callback when the provider account remains absent', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();
    const { UnipileReadError } =
      require('src/modules/myah-unipile/services/unipile-v1-client.service') as {
        UnipileReadError: new (
          status: number,
          code: string,
          message: string,
          retryable: boolean,
        ) => Error;
      };

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '3aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const accountId = 'still-absent-account-id';
    const notFoundError = new UnipileReadError(
      404,
      'UNIPILE_ACCOUNT_NOT_FOUND',
      'Unable to retrieve the requested Instagram account',
      true,
    );
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: 'callback-secret-hash',
      callbackDigest: 'callback-digest',
      callbackAccountId: accountId,
      callbackStatus: 'CREATION_SUCCESS',
      status: 'PROCESSING',
      expiresAt: new Date(now.getTime() - 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const savedStatuses: string[] = [];
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(async (savedAttempt: { status: string }) => {
        savedStatuses.push(savedAttempt.status);

        return savedAttempt;
      }),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          transaction: jest.fn(async (callback) => callback(manager)),
        },
      },
      { findOne: jest.fn() },
      {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn().mockRejectedValue(notFoundError),
      },
      { get: jest.fn() },
      createAvailabilityService(),
      { finalizeHostedAuthConnection: jest.fn() },
    );

    await expect(service.resumeProcessingAttempt(attemptId)).rejects.toBe(
      notFoundError,
    );

    expect(savedStatuses).toEqual(['FAILED']);
    expect(attempt).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
        failureReason: 'Unable to finalize Instagram account connection',
        processedAt: expect.any(Date),
      }),
    );
  });

  it('marks a PROCESSING attempt failed when account lookup has a non-retryable read error', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const { UnipileReadError } =
      require('src/modules/myah-unipile/services/unipile-v1-client.service') as {
        UnipileReadError: new (
          status: number,
          code: string,
          message: string,
          retryable: boolean,
        ) => Error;
      };
    const attemptId = '2aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-non-retryable-read-failure';
    const accountId = 'non-retryable-read-failure-account-id';
    const error = new UnipileReadError(
      200,
      'UNIPILE_ACCOUNT_UNAVAILABLE',
      'Unable to retrieve the requested Instagram account',
      false,
    );
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: createHash('sha256').update(name).digest('hex'),
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    const savedAttempts: Array<Record<string, unknown>> = [];
    const manager = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue(attempt),
      save: jest.fn(async (savedAttempt: Record<string, unknown>) => {
        savedAttempts.push({ ...savedAttempt });

        return savedAttempt;
      }),
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const accountService = { finalizeHostedAuthConnection: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn().mockRejectedValue(error),
      },
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );

    await expect(
      service.processNotification({
        attemptId,
        name,
        status: 'CREATION_SUCCESS',
        accountId,
      }),
    ).rejects.toBe(error);

    expect(savedAttempts).toEqual([
      expect.objectContaining({ status: 'PROCESSING' }),
      expect.objectContaining({
        status: 'FAILED',
        failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
        failureReason: 'Unable to finalize Instagram account connection',
        processedAt: expect.any(Date),
      }),
    ]);
    expect(accountService.finalizeHostedAuthConnection).not.toHaveBeenCalled();
  });

  it('returns only the caller-owned Hosted Auth attempt status projection', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const availabilityService = createAvailabilityService();
    const attemptId = '2aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(async () => {
        expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

        return {
          id: attemptId,
          workspaceId,
          userWorkspaceId,
          status: 'FAILED',
          failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
          failureReason: 'Unable to finalize Instagram account connection',
          callbackSecretHash: 'must-not-be-projected',
        };
      }),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      { createHostedAuthLink: jest.fn() },
      { get: jest.fn() },
      availabilityService,
    );

    await expect(
      service.getAttemptStatus({ attemptId, workspaceId, userWorkspaceId }),
    ).resolves.toEqual({
      attemptId,
      status: 'FAILED',
      failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
      failureReason: 'Unable to finalize Instagram account connection',
    });
    expect(attemptRepository.findOne).toHaveBeenCalledWith({
      where: { id: attemptId, workspaceId, userWorkspaceId },
    });
  });

  it.each([
    {
      description: 'unknown',
      attemptId: '3aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd',
      workspaceId,
      userWorkspaceId,
    },
    {
      description: 'cross-workspace',
      attemptId: '2aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd',
      workspaceId: 'other-workspace-id',
      userWorkspaceId,
    },
    {
      description: 'cross-user',
      attemptId: '2aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd',
      workspaceId,
      userWorkspaceId: 'other-user-workspace-id',
    },
  ])(
    'rejects a $description Hosted Auth attempt status lookup safely',
    async ({
      attemptId,
      workspaceId: requestedWorkspaceId,
      userWorkspaceId: requestedUserWorkspaceId,
    }) => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      expect(hostedAuthServiceModule).toBeDefined();

      if (!hostedAuthServiceModule) {
        return;
      }

      const availabilityService = createAvailabilityService();
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(async () => {
          expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);

          return null;
        }),
      };
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        { findOne: jest.fn() },
        { createHostedAuthLink: jest.fn() },
        { get: jest.fn() },
        availabilityService,
      );

      await expect(
        service.getAttemptStatus({
          attemptId,
          workspaceId: requestedWorkspaceId,
          userWorkspaceId: requestedUserWorkspaceId,
        }),
      ).rejects.toThrow(ConflictException);
    },
  );

  it('rejects any current workspace binding without requesting or persisting a Hosted Auth link', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptRepository = { create: jest.fn(), save: jest.fn() };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'current-deactivated-null-binding-id',
        status: 'FAILED',
        deactivatedAt: null,
      }),
    };
    const client = { createHostedAuthLink: jest.fn() };
    const twentyConfigService = { get: jest.fn() };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      bindingRepository,
      client,
      twentyConfigService,
      createAvailabilityService(),
    );

    await expect(
      service.createConnectionAttempt({ workspaceId, userWorkspaceId }),
    ).rejects.toThrow();
    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { workspaceId, deactivatedAt: IsNull() },
    });
    expect(attemptRepository.create).not.toHaveBeenCalled();
    expect(attemptRepository.save).not.toHaveBeenCalled();
    expect(client.createHostedAuthLink).not.toHaveBeenCalled();
  });
  it('serializes exact callback and resume replays without duplicate finalization', async () => {
    const hostedAuthServiceModule = loadHostedAuthServiceModule();

    expect(hostedAuthServiceModule).toBeDefined();

    if (!hostedAuthServiceModule) {
      return;
    }

    const attemptId = '4aa95c5a-b046-4a21-a8ee-8f3a4b3eb1dd';
    const name = 'hosted-auth-concurrent-replay';
    const accountId = 'concurrent-replay-account-id';
    const attempt = {
      id: attemptId,
      workspaceId,
      userWorkspaceId,
      operation: 'CREATE',
      expectedBindingId: null,
      callbackSecretHash: createHash('sha256').update(name).digest('hex'),
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 60_000),
      processedAt: null,
      failureCode: null,
      failureReason: null,
    };
    let releaseFinalization: () => void;
    const finalizationMayFinish = new Promise<void>((resolve) => {
      releaseFinalization = resolve;
    });
    let signalFinalizationStarted: () => void;
    const finalizationStarted = new Promise<void>((resolve) => {
      signalFinalizationStarted = resolve;
    });
    let nextLock = Promise.resolve();
    const advisoryLockQuery = jest.fn();
    let signalReplaysQueued: () => void;
    const replaysQueued = new Promise<void>((resolve) => {
      signalReplaysQueued = resolve;
    });
    let findOneCalls = 0;
    const createManager = () => {
      let releaseLock: (() => void) | undefined;

      return {
        query: jest.fn(async (sql: string, parameters: string[]) => {
          advisoryLockQuery(sql, parameters);
          if (advisoryLockQuery.mock.calls.length >= 2) {
            signalReplaysQueued!();
          }

          const previousLock = nextLock;
          let releaseNextLock: () => void;
          nextLock = new Promise<void>((resolve) => {
            releaseNextLock = resolve;
          });
          await previousLock;
          releaseLock = releaseNextLock!;
        }),
        findOne: jest.fn(async () => {
          findOneCalls += 1;

          if (findOneCalls >= 3) {
            signalReplaysQueued!();
          }

          return attempt;
        }),
        save: jest.fn(async (savedAttempt) => {
          return savedAttempt;
        }),
        releaseLock: () => {
          if (releaseLock) {
            releaseLock();
          }
        },
      };
    };
    const attemptRepository = {
      create: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          const manager = createManager();

          try {
            return await callback(manager);
          } finally {
            manager.releaseLock();
          }
        }),
      },
    };
    const accountService = {
      finalizeHostedAuthConnection: jest.fn(async () => {
        signalFinalizationStarted!();
        await finalizationMayFinish;
      }),
    };
    const service = new hostedAuthServiceModule.UnipileHostedAuthService(
      attemptRepository,
      { findOne: jest.fn() },
      {
        createHostedAuthLink: jest.fn(),
        getAccount: jest.fn().mockResolvedValue({ accountId }),
      },
      { get: jest.fn() },
      createAvailabilityService(),
      accountService,
    );
    const notification = {
      attemptId,
      name,
      status: 'CREATION_SUCCESS' as const,
      accountId,
    };

    const first = service.processNotification(notification);

    await finalizationStarted;

    const exactReplay = service.processNotification(notification);
    const resume = service.resumeProcessingAttempt(attemptId);

    await replaysQueued;

    for (let microtasks = 0; microtasks < 6; microtasks += 1) {
      await Promise.resolve();
    }

    expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledTimes(
      1,
    );
    releaseFinalization!();

    await expect(Promise.all([first, exactReplay, resume])).resolves.toEqual([
      { attemptId, status: 'COMPLETED' },
      { attemptId, status: 'COMPLETED' },
      { attemptId, status: 'COMPLETED' },
    ]);
    expect(accountService.finalizeHostedAuthConnection).toHaveBeenCalledTimes(
      1,
    );
    expect(advisoryLockQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`unipile-hosted-auth-finalization:${attemptId}`],
    );
  });

  describe('expirePendingAttempt', () => {
    const createExpiryHarness = () => {
      const hostedAuthServiceModule = loadHostedAuthServiceModule();

      if (!hostedAuthServiceModule) {
        throw new Error('Hosted Auth service unavailable');
      }

      const notification = {
        attemptId: 'expired-attempt',
        name: 'expiry-callback-secret',
        status: 'CREATION_SUCCESS' as const,
        accountId: 'opaque-account-id',
      };
      const initialAttempt = {
        id: notification.attemptId,
        workspaceId,
        userWorkspaceId,
        operation: 'CREATE',
        expectedBindingId: null,
        callbackSecretHash: createHash('sha256')
          .update(notification.name)
          .digest('hex'),
        callbackDigest: null as string | null,
        callbackAccountId: null as string | null,
        callbackStatus: null as string | null,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() - 1),
        processedAt: null as Date | null,
        failureCode: null as string | null,
        failureReason: null as string | null,
      };
      let storedAttempt: typeof initialAttempt | null = { ...initialAttempt };
      const events: string[] = [];
      const manager = {
        query: jest.fn(),
        findOne: jest.fn(async () =>
          storedAttempt ? { ...storedAttempt } : null,
        ),
        save: jest.fn(async (attempt: typeof initialAttempt) => attempt),
      };
      const attemptRepository = {
        create: jest.fn(),
        save: jest.fn(),
        manager: {
          // Mock commit/rollback only: this is not database lock evidence.
          transaction: jest.fn(async (callback) => {
            const firstSave = manager.save.mock.calls.length;

            events.push('start');
            try {
              const result = await callback(manager);
              const saves = manager.save.mock.calls.slice(firstSave);

              if (saves.length > 0) {
                storedAttempt = { ...saves[saves.length - 1][0] };
              }
              events.push('commit');

              return result;
            } catch (error) {
              events.push('rollback');
              throw error;
            }
          }),
        },
      };
      const bindingRepository = { findOne: jest.fn() };
      const client = { createHostedAuthLink: jest.fn(), getAccount: jest.fn() };
      const accountService = { finalizeHostedAuthConnection: jest.fn() };
      const availability = createAvailabilityService();
      const service = new hostedAuthServiceModule.UnipileHostedAuthService(
        attemptRepository,
        bindingRepository,
        client,
        { get: jest.fn() },
        availability,
        accountService,
      );

      return {
        service,
        manager,
        events,
        notification,
        availability,
        attemptRepository,
        client,
        accountService,
        initialAttempt,
        readStored: () => storedAttempt,
        setStored: (attempt: typeof initialAttempt | null) => {
          storedAttempt = attempt;
        },
        expectNoFinalization: () => {
          expect(client.getAccount).not.toHaveBeenCalled();
          expect(client.createHostedAuthLink).not.toHaveBeenCalled();
          expect(
            accountService.finalizeHostedAuthConnection,
          ).not.toHaveBeenCalled();
          expect(bindingRepository.findOne).not.toHaveBeenCalled();
          expect(manager.query).not.toHaveBeenCalled();
          expect(attemptRepository.save).not.toHaveBeenCalled();
        },
      };
    };

    it.each([-1, 0])(
      'terminalizes PENDING at expiry offset %s exactly once without finalization',
      async (offset) => {
        const harness = createExpiryHarness();

        harness.setStored({
          ...harness.initialAttempt,
          expiresAt: new Date(now.getTime() + offset),
        });
        await harness.service.expirePendingAttempt(
          harness.notification.attemptId,
        );
        const terminal = harness.readStored();

        expect(terminal).toEqual({
          ...harness.initialAttempt,
          expiresAt: new Date(now.getTime() + offset),
          status: 'FAILED',
          processedAt: now,
          failureCode: 'HOSTED_AUTH_EXPIRED',
          failureReason: 'Instagram authorization expired',
        });
        jest.setSystemTime(new Date(now.getTime() + 60_000));
        await harness.service.expirePendingAttempt(
          harness.notification.attemptId,
        );
        expect(harness.readStored()).toEqual(terminal);
        expect(harness.manager.save).toHaveBeenCalledTimes(1);
        expect(harness.manager.findOne).toHaveBeenCalledWith(
          expect.anything(),
          {
            where: { id: harness.notification.attemptId },
            lock: { mode: 'pessimistic_write' },
          },
        );
        expect(harness.events).toEqual(['start', 'commit', 'start', 'commit']);
        harness.expectNoFinalization();
      },
    );

    it.each(['PROCESSING', 'COMPLETED', 'FAILED', 'future', 'missing'])(
      'ignores a stale selected id whose locked row is %s',
      async (state) => {
        const harness = createExpiryHarness();
        const current =
          state === 'missing'
            ? null
            : {
                ...harness.initialAttempt,
                status: state === 'future' ? 'PENDING' : state,
                expiresAt: new Date(
                  now.getTime() + (state === 'future' ? 1 : -1),
                ),
              };

        harness.setStored(current);
        await harness.service.expirePendingAttempt(
          harness.notification.attemptId,
        );
        expect(harness.readStored()).toEqual(current);
        expect(harness.manager.save).not.toHaveBeenCalled();
        expect(harness.manager.findOne).toHaveBeenCalledWith(
          expect.anything(),
          {
            where: { id: harness.notification.attemptId },
            lock: { mode: 'pessimistic_write' },
          },
        );
        harness.expectNoFinalization();
      },
    );

    it('propagates a failed expiry write and leaves the mock committed row PENDING for retry', async () => {
      const harness = createExpiryHarness();
      const failure = new Error('synthetic failed write');

      harness.manager.save.mockRejectedValueOnce(failure);
      await expect(
        harness.service.expirePendingAttempt(harness.notification.attemptId),
      ).rejects.toBe(failure);
      expect(harness.readStored()).toEqual(harness.initialAttempt);
      expect(harness.events).toEqual(['start', 'rollback']);
      await harness.service.expirePendingAttempt(
        harness.notification.attemptId,
      );
      expect(harness.readStored()?.status).toBe('FAILED');
      harness.expectNoFinalization();
    });

    it('does zero expiry work when disabled', async () => {
      const harness = createExpiryHarness();
      const failure = new Error('disabled');

      harness.availability.assertEnabled.mockImplementation(() => {
        throw failure;
      });
      await expect(
        harness.service.expirePendingAttempt(harness.notification.attemptId),
      ).rejects.toBe(failure);
      expect(
        harness.attemptRepository.manager.transaction,
      ).not.toHaveBeenCalled();
      harness.expectNoFinalization();
    });

    it('keeps an expiry-winning mock row FAILED when a later valid callback arrives', async () => {
      const harness = createExpiryHarness();

      await harness.service.expirePendingAttempt(
        harness.notification.attemptId,
      );
      await expect(
        harness.service.processNotification(harness.notification),
      ).rejects.toThrow(ConflictException);
      expect(harness.readStored()?.status).toBe('FAILED');
      expect(harness.manager.save).toHaveBeenCalledTimes(1);
      harness.expectNoFinalization();
    });

    it('leaves a callback-winning mock row PROCESSING for ordinary recovery after expiry', async () => {
      const harness = createExpiryHarness();
      const outage = new Error('temporary lookup outage');

      harness.setStored({
        ...harness.initialAttempt,
        expiresAt: new Date(now.getTime() + 1),
      });
      harness.client.getAccount.mockRejectedValueOnce(outage);
      await expect(
        harness.service.processNotification(harness.notification),
      ).rejects.toBe(outage);
      expect(harness.readStored()?.status).toBe('PROCESSING');
      jest.setSystemTime(new Date(now.getTime() + 1));
      harness.manager.save.mockClear();
      harness.manager.query.mockClear();
      harness.client.getAccount.mockClear();
      await harness.service.expirePendingAttempt(
        harness.notification.attemptId,
      );
      expect(harness.readStored()?.status).toBe('PROCESSING');
      expect(harness.manager.save).not.toHaveBeenCalled();
      harness.expectNoFinalization();
      harness.client.getAccount.mockResolvedValue({
        accountId: harness.notification.accountId,
      });
      await expect(
        harness.service.resumeProcessingAttempt(harness.notification.attemptId),
      ).resolves.toEqual({
        attemptId: harness.notification.attemptId,
        status: 'COMPLETED',
      });
      expect(
        harness.accountService.finalizeHostedAuthConnection,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
