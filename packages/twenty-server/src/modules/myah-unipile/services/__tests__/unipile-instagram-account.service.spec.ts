import { ConflictException } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import type { UnipileInstagramWebhookAccountStatus } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';

type SafeMappedInstagramAccount = {
  accountId: string;
  instagramUserId: string;
  username: string | null;
  sourceStatus:
    | 'OK'
    | 'CONNECTING'
    | 'CREDENTIALS'
    | 'PERMISSIONS'
    | 'ERROR'
    | 'STOPPED';
};

type FinalizeHostedAuthConnectionInput = {
  attemptId: string;
  workspaceId: string;
  userWorkspaceId: string | null;
  operation: 'CREATE' | 'RECONNECT';
  expectedBindingId: string | null;
  account: SafeMappedInstagramAccount;
  coreManager?: CoreManager;
};

type DisconnectAccountInput = {
  workspaceId: string;
  userWorkspaceId: string;
};

type WorkspaceAccountStatus = {
  id: string;
  username: string | null;
  status:
    | 'CONNECTING'
    | 'ACTIVE'
    | 'NEEDS_RECONNECT'
    | 'ERROR'
    | 'DELETE_UNKNOWN'
    | 'INACTIVE';
  lastCheckedAt: string | null;
  lastError: string | null;
};

type UnipileInstagramAccountService = {
  getWorkspaceAccountStatus: (
    workspaceId: string,
  ) => Promise<WorkspaceAccountStatus | null>;
  finalizeHostedAuthConnection: (
    input: FinalizeHostedAuthConnectionInput,
  ) => Promise<void>;
  disconnectAccount: (
    input: DisconnectAccountInput,
  ) => Promise<{ status: 'DISCONNECTED' | 'PENDING_RECOVERY' }>;
  reconcileWebhookAccountStatus: (input: {
    bindingId: string;
    status: UnipileInstagramWebhookAccountStatus;
  }) => Promise<WorkspaceAccountStatus['status'] | null>;
  reconcileBoundAccountStatus: (
    bindingId: string,
  ) => Promise<WorkspaceAccountStatus['status'] | null>;
  reconcileUnknownDisconnect: (bindingId: string) => Promise<void>;
  reconcileConnectingAccount: (bindingId: string) => Promise<void>;
};

type AccountClient = {
  deleteAccount: jest.Mock;
  getAccount: jest.Mock;
};

type FinalizationLockService = {
  withLock: jest.Mock;
  withSessionLock?: jest.Mock;
};

type AvailabilityService = {
  assertEnabled: jest.Mock;
};

type UnipileInstagramAccountServiceModule = {
  UnipileInstagramAccountService: new (
    workspaceRepository: { findOne: jest.Mock },
    bindingRepository: {
      find?: jest.Mock;
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    },
    projectionService: {
      getAccountStatus: jest.Mock;
      upsertVerifiedAccount: jest.Mock;
      markAccountStatus: jest.Mock;
    },
    accountClient: AccountClient,
    finalizationLockService: FinalizationLockService,
    availabilityService: AvailabilityService,
  ) => UnipileInstagramAccountService;
};

const loadAccountServiceModule = ():
  | UnipileInstagramAccountServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-account.service') as UnipileInstagramAccountServiceModule;
  } catch {
    return undefined;
  }
};

const workspaceId = '0d8d57c4-683d-4333-99f6-d3f974e9023a';
const userWorkspaceId = 'dc6e810c-a82d-4936-99d5-bf1a5638f4f4';
const attemptId = 'c8a0ba70-9f98-4850-97d6-2d62b56340bc';
const workspaceInstagramAccountRecordId =
  'f593a92c-943f-4f9e-8b4e-6426a359315d';
const workspace = { id: workspaceId };
const account: SafeMappedInstagramAccount = {
  accountId: 'unipile-instagram-account-123',
  instagramUserId: '17841400000000001',
  username: 'verified.creator',
  sourceStatus: 'OK',
};

const finalizeInput: FinalizeHostedAuthConnectionInput = {
  attemptId,
  workspaceId,
  userWorkspaceId,
  operation: 'CREATE',
  expectedBindingId: null,
  account,
};

const reconnectBindingId = '1b7727f4-83f3-4701-ab93-d23a43662503';
const reconnectFinalizeInput: FinalizeHostedAuthConnectionInput = {
  ...finalizeInput,
  operation: 'RECONNECT',
  expectedBindingId: reconnectBindingId,
};
type CoreManager = {
  getRepository: jest.Mock;
};

type CoreQueryRunner = {
  manager: {
    transaction: jest.Mock;
  };
};

const createCoreManager = (
  workspaceRepository: { findOne: jest.Mock },
  bindingRepository: {
    find?: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  },
): CoreManager => ({
  getRepository: jest.fn((target: { name?: string }) =>
    target.name === 'WorkspaceEntity' ? workspaceRepository : bindingRepository,
  ),
});

const createAccountService = (input: {
  workspaceRepository: { findOne: jest.Mock };
  bindingRepository: {
    find?: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  projectionService: {
    getAccountStatus?: jest.Mock;
    upsertVerifiedAccount: jest.Mock;
    markAccountStatus?: jest.Mock;
  };
  accountClient?: AccountClient;
  finalizationLockService?: FinalizationLockService;
  availabilityService?: AvailabilityService;
}) => {
  const accountServiceModule = loadAccountServiceModule();

  expect(accountServiceModule).toBeDefined();

  if (!accountServiceModule) {
    return undefined;
  }

  const coreManager = createCoreManager(
    input.workspaceRepository,
    input.bindingRepository,
  );

  return new accountServiceModule.UnipileInstagramAccountService(
    input.workspaceRepository,
    input.bindingRepository,
    {
      getAccountStatus: jest.fn(),
      markAccountStatus: jest.fn(),
      ...input.projectionService,
    },
    input.accountClient ?? {
      deleteAccount: jest.fn(),
      getAccount: jest.fn(),
    },
    input.finalizationLockService ?? {
      withLock: jest.fn(
        async (
          _scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (manager: CoreManager) => Promise<unknown>,
        ) => operation(coreManager),
      ),
      withSessionLock: jest.fn(
        async (
          _scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (queryRunner: CoreQueryRunner) => Promise<unknown>,
        ) =>
          operation({
            manager: {
              transaction: jest.fn(
                async (callback: (manager: CoreManager) => Promise<unknown>) =>
                  callback(coreManager),
              ),
            },
          }),
      ),
    },
    input.availabilityService ?? {
      assertEnabled: jest.fn(),
    },
  );
};

describe('UnipileInstagramAccountService', () => {
  it.each([
    {
      name: 'getWorkspaceAccountStatus',
      invoke: (service: UnipileInstagramAccountService) =>
        service.getWorkspaceAccountStatus(workspaceId),
    },
    {
      name: 'finalizeHostedAuthConnection',
      invoke: (service: UnipileInstagramAccountService) =>
        service.finalizeHostedAuthConnection(finalizeInput),
    },
    {
      name: 'disconnectAccount',
      invoke: (service: UnipileInstagramAccountService) =>
        service.disconnectAccount({ workspaceId, userWorkspaceId }),
    },
    {
      name: 'reconcileBoundAccountStatus',
      invoke: (service: UnipileInstagramAccountService) =>
        service.reconcileBoundAccountStatus(reconnectBindingId),
    },
    {
      name: 'reconcileWebhookAccountStatus',
      invoke: (service: UnipileInstagramAccountService) =>
        service.reconcileWebhookAccountStatus({
          bindingId: reconnectBindingId,
          status: 'RECONNECTED',
        }),
    },
    {
      name: 'reconcileUnknownDisconnect',
      invoke: (service: UnipileInstagramAccountService) =>
        service.reconcileUnknownDisconnect(reconnectBindingId),
    },
    {
      name: 'reconcileConnectingAccount',
      invoke: (service: UnipileInstagramAccountService) =>
        service.reconcileConnectingAccount(reconnectBindingId),
    },
  ])(
    'rejects disabled $name before its first dependency call',
    async ({ invoke }) => {
      const callOrder: string[] = [];
      const unavailableError = new Error('Instagram integration is disabled');
      const unexpectedDependencyCall = jest.fn(() => {
        callOrder.push('dependency');
      });
      const availabilityService = {
        assertEnabled: jest.fn(() => {
          callOrder.push('availability');
          throw unavailableError;
        }),
      };
      const service = createAccountService({
        workspaceRepository: { findOne: unexpectedDependencyCall },
        bindingRepository: {
          find: unexpectedDependencyCall,
          findOne: unexpectedDependencyCall,
          create: unexpectedDependencyCall,
          save: unexpectedDependencyCall,
        },
        projectionService: {
          getAccountStatus: unexpectedDependencyCall,
          upsertVerifiedAccount: unexpectedDependencyCall,
          markAccountStatus: unexpectedDependencyCall,
        },
        accountClient: {
          deleteAccount: unexpectedDependencyCall,
          getAccount: unexpectedDependencyCall,
        },
        finalizationLockService: { withLock: unexpectedDependencyCall },
        availabilityService,
      });

      if (!service) {
        return;
      }

      const operation = invoke(service);

      expect(availabilityService.assertEnabled).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['availability']);
      expect(unexpectedDependencyCall).not.toHaveBeenCalled();
      await expect(operation).rejects.toBe(unavailableError);
    },
  );

  it('projects the verified CREATE account before saving its core binding', async () => {
    const callOrder: string[] = [];
    const workspaceRepository = {
      findOne: jest.fn(async () => {
        callOrder.push('workspace');

        return workspace;
      }),
    };
    const bindingRepository = {
      findOne: jest.fn(async ({ where }) => {
        if ('instagramUserId' in where) {
          callOrder.push('owner-binding');
        } else {
          callOrder.push('workspace-active-binding');
        }

        return null;
      }),
      create: jest.fn((binding) => {
        callOrder.push('binding-create');

        return binding;
      }),
      save: jest.fn(async (binding) => {
        callOrder.push('binding-save');

        return binding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(async (input) => {
        callOrder.push('projection');
        expect(input).toEqual({ workspace, account, status: 'ACTIVE' });

        return workspaceInstagramAccountRecordId;
      }),
    };
    const finalizationLockService = {
      withLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (manager: CoreManager) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });
          callOrder.push('lock');

          return operation(
            createCoreManager(workspaceRepository, bindingRepository),
          );
        },
      ),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.finalizeHostedAuthConnection(finalizeInput),
    ).resolves.toBeUndefined();

    expect(workspaceRepository.findOne).toHaveBeenCalledWith({
      where: { id: workspaceId },
    });
    expect(bindingRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: {
        instagramUserId: account.instagramUserId,
        deactivatedAt: IsNull(),
      },
    });
    expect(bindingRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { workspaceId, deactivatedAt: IsNull() },
    });
    expect(projectionService.upsertVerifiedAccount).toHaveBeenCalledTimes(1);
    expect(finalizationLockService.withLock).toHaveBeenCalledTimes(1);
    expect(bindingRepository.create).toHaveBeenCalledWith({
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      connectedByUserWorkspaceId: userWorkspaceId,
      status: 'ACTIVE',
      deactivatedAt: null,
    });
    expect(bindingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        workspaceInstagramAccountRecordId,
        unipileAccountId: account.accountId,
        connectedByUserWorkspaceId: userWorkspaceId,
      }),
    );
    expect(callOrder).toEqual([
      'lock',
      'workspace',
      'owner-binding',
      'workspace-active-binding',
      'projection',
      'binding-create',
      'binding-save',
    ]);
  });

  it('uses the lock transaction repositories for CREATE finalization', async () => {
    const accountServiceModule = loadAccountServiceModule();

    expect(accountServiceModule).toBeDefined();

    if (!accountServiceModule) {
      return;
    }

    const unexpectedRepositoryCall = jest.fn(() => {
      throw new Error('finalization must use the lock transaction manager');
    });
    const workspaceRepository = { findOne: unexpectedRepositoryCall };
    const bindingRepository = {
      findOne: unexpectedRepositoryCall,
      create: unexpectedRepositoryCall,
      save: unexpectedRepositoryCall,
    };
    const transactionalWorkspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const transactionalBindingRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((binding) => binding),
      save: jest.fn(async (binding) => binding),
    };
    const coreManager = createCoreManager(
      transactionalWorkspaceRepository,
      transactionalBindingRepository,
    );
    const finalizationLockService = {
      withLock: jest.fn(
        async (
          _scope: unknown,
          operation: (manager: CoreManager) => Promise<unknown>,
          existingManager?: CoreManager,
        ) => {
          expect(existingManager).toBe(coreManager);

          return operation(coreManager);
        },
      ),
    };
    const service = new accountServiceModule.UnipileInstagramAccountService(
      workspaceRepository,
      bindingRepository,
      {
        getAccountStatus: jest.fn(),
        markAccountStatus: jest.fn(),
        upsertVerifiedAccount: jest
          .fn()
          .mockResolvedValue(workspaceInstagramAccountRecordId),
      },
      { deleteAccount: jest.fn(), getAccount: jest.fn() },
      finalizationLockService,
      { assertEnabled: jest.fn() },
    );

    await expect(
      service.finalizeHostedAuthConnection({
        ...finalizeInput,
        userWorkspaceId: null,
        coreManager,
      }),
    ).resolves.toBeUndefined();

    expect(coreManager.getRepository).toHaveBeenCalled();
    expect(transactionalWorkspaceRepository.findOne).toHaveBeenCalledWith({
      where: { id: workspaceId },
    });
    expect(transactionalBindingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ connectedByUserWorkspaceId: null }),
    );
    expect(unexpectedRepositoryCall).not.toHaveBeenCalled();
  });

  it.each(['CONNECTING', 'ACTIVE', 'NEEDS_RECONNECT', 'ERROR'] as const)(
    'treats an exact %s CREATE replay as idempotent without projecting or duplicating its binding',
    async (status) => {
      const existingBinding = {
        id: '6ff7d2a4-c8d1-47b0-b143-aa68a74cfdcd',
        workspaceId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status,
        deactivatedAt: null,
      };
      const workspaceRepository = {
        findOne: jest.fn().mockResolvedValue(workspace),
      };
      const bindingRepository = {
        findOne: jest.fn(async ({ where }) =>
          where.instagramUserId === account.instagramUserId
            ? existingBinding
            : null,
        ),
        create: jest.fn(),
        save: jest.fn(),
      };
      const projectionService = { upsertVerifiedAccount: jest.fn() };
      const service = createAccountService({
        workspaceRepository,
        bindingRepository,
        projectionService,
      });

      if (!service) {
        return;
      }

      await expect(
        service.finalizeHostedAuthConnection(finalizeInput),
      ).resolves.toBeUndefined();

      expect(workspaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: workspaceId },
      });
      expect(bindingRepository.findOne).toHaveBeenCalledTimes(1);
      expect(bindingRepository.findOne).toHaveBeenCalledWith({
        where: {
          instagramUserId: account.instagramUserId,
          deactivatedAt: IsNull(),
        },
      });
      expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
      expect(bindingRepository.create).not.toHaveBeenCalled();
      expect(bindingRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'Instagram owner is bound to another workspace through a different provider account',
      ownerBinding: {
        workspaceId: '81557d3a-4de2-4c9b-a4cd-06c75e83b226',
        unipileAccountId: 'different-provider-account',
        instagramUserId: account.instagramUserId,
        deactivatedAt: null,
      },
      currentWorkspaceBinding: null,
    },
    {
      name: 'workspace has a different current Instagram owner',
      ownerBinding: null,
      currentWorkspaceBinding: {
        workspaceId,
        unipileAccountId: 'different-provider-account',
        instagramUserId: '17841400000000002',
        deactivatedAt: null,
      },
    },
  ])(
    'rejects CREATE when $name',
    async ({ ownerBinding, currentWorkspaceBinding }) => {
      const workspaceRepository = {
        findOne: jest.fn().mockResolvedValue(workspace),
      };
      const bindingRepository = {
        findOne: jest.fn(async ({ where }) =>
          where.instagramUserId === account.instagramUserId
            ? ownerBinding
            : currentWorkspaceBinding,
        ),
        create: jest.fn(),
        save: jest.fn(),
      };
      const projectionService = { upsertVerifiedAccount: jest.fn() };
      const service = createAccountService({
        workspaceRepository,
        bindingRepository,
        projectionService,
      });

      if (!service) {
        return;
      }

      await expect(
        service.finalizeHostedAuthConnection(finalizeInput),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(bindingRepository.findOne).toHaveBeenCalledWith({
        where: {
          instagramUserId: account.instagramUserId,
          deactivatedAt: IsNull(),
        },
      });
      expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
      expect(bindingRepository.create).not.toHaveBeenCalled();
      expect(bindingRepository.save).not.toHaveBeenCalled();
    },
  );

  it('projects a RECONNECT into its existing undeactivated reconnectable exact binding', async () => {
    const callOrder: string[] = [];
    const existingBinding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      connectedByUserWorkspaceId: 'previous-actor',
      status: 'NEEDS_RECONNECT',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn(async () => {
        callOrder.push('workspace');

        return workspace;
      }),
    };
    const bindingRepository = {
      findOne: jest.fn(async ({ where }) => {
        callOrder.push('binding');
        expect(where).toMatchObject({ id: reconnectBindingId });

        return existingBinding;
      }),
      create: jest.fn(),
      save: jest.fn(async (binding) => {
        callOrder.push('binding-save');

        return binding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(async (input) => {
        callOrder.push('projection');
        expect(input).toEqual({
          workspace,
          account,
          status: 'ACTIVE',
        });

        return workspaceInstagramAccountRecordId;
      }),
    };
    const finalizationLockService = {
      withLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (manager: CoreManager) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });
          callOrder.push('lock');

          return operation(
            createCoreManager(workspaceRepository, bindingRepository),
          );
        },
      ),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.finalizeHostedAuthConnection(reconnectFinalizeInput),
    ).resolves.toBeUndefined();

    expect(workspaceRepository.findOne).toHaveBeenCalledWith({
      where: { id: workspaceId },
    });
    expect(bindingRepository.findOne).toHaveBeenCalledTimes(1);
    expect(projectionService.upsertVerifiedAccount).toHaveBeenCalledTimes(1);
    expect(finalizationLockService.withLock).toHaveBeenCalledTimes(1);
    expect(bindingRepository.create).not.toHaveBeenCalled();
    expect(bindingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: reconnectBindingId,
        workspaceId,
        workspaceInstagramAccountRecordId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        connectedByUserWorkspaceId: userWorkspaceId,
        status: 'ACTIVE',
        deactivatedAt: null,
      }),
    );
    expect(callOrder).toEqual([
      'lock',
      'binding',
      'workspace',
      'projection',
      'binding-save',
    ]);
  });

  it.each([
    ['CREDENTIALS', 'NEEDS_RECONNECT'],
    ['ERROR', 'ERROR'],
  ] as const)(
    'persists a CREATE account with %s source status as %s',
    async (sourceStatus, status) => {
      const accountWithSourceStatus = { ...account, sourceStatus };
      const workspaceRepository = {
        findOne: jest.fn().mockResolvedValue(workspace),
      };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((binding) => binding),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const projectionService = {
        upsertVerifiedAccount: jest
          .fn()
          .mockResolvedValue(workspaceInstagramAccountRecordId),
      };
      const service = createAccountService({
        workspaceRepository,
        bindingRepository,
        projectionService,
      });

      if (!service) {
        return;
      }

      await expect(
        service.finalizeHostedAuthConnection({
          ...finalizeInput,
          account: accountWithSourceStatus,
        }),
      ).resolves.toBeUndefined();

      expect(projectionService.upsertVerifiedAccount).toHaveBeenCalledWith({
        workspace,
        account: accountWithSourceStatus,
        status,
      });
      expect(bindingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      );
    },
  );

  it.each([
    ['CREDENTIALS', 'NEEDS_RECONNECT', 'NEEDS_RECONNECT'],
    ['ERROR', 'ERROR', 'ERROR'],
  ] as const)(
    'persists a RECONNECT account with %s source status from a %s binding as %s',
    async (sourceStatus, existingBindingStatus, status) => {
      const accountWithSourceStatus = { ...account, sourceStatus };
      const existingBinding = {
        id: reconnectBindingId,
        workspaceId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        connectedByUserWorkspaceId: 'previous-actor',
        status: existingBindingStatus,
        deactivatedAt: null,
      };
      const workspaceRepository = {
        findOne: jest.fn().mockResolvedValue(workspace),
      };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(existingBinding),
        create: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const projectionService = {
        upsertVerifiedAccount: jest.fn().mockResolvedValue(undefined),
      };
      const service = createAccountService({
        workspaceRepository,
        bindingRepository,
        projectionService,
      });

      if (!service) {
        return;
      }

      await expect(
        service.finalizeHostedAuthConnection({
          ...reconnectFinalizeInput,
          account: accountWithSourceStatus,
        }),
      ).resolves.toBeUndefined();

      expect(projectionService.upsertVerifiedAccount).toHaveBeenCalledWith({
        workspace,
        account: accountWithSourceStatus,
        status,
      });
      expect(bindingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      );
    },
  );

  it.each([
    ['missing', null],
    [
      'bound to another workspace',
      {
        id: reconnectBindingId,
        workspaceId: '81557d3a-4de2-4c9b-a4cd-06c75e83b226',
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
      },
    ],
    [
      'bound to another Unipile account',
      {
        id: reconnectBindingId,
        workspaceId,
        unipileAccountId: 'different-unipile-instagram-account',
        instagramUserId: account.instagramUserId,
      },
    ],
    [
      'owned by another Instagram user',
      {
        id: reconnectBindingId,
        workspaceId,
        unipileAccountId: account.accountId,
        instagramUserId: '17841400000000002',
      },
    ],
    [
      'still pending an unknown delete',
      {
        id: reconnectBindingId,
        workspaceId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'DELETE_UNKNOWN',
        deactivatedAt: null,
      },
    ],
    [
      'already inactive',
      {
        id: reconnectBindingId,
        workspaceId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'INACTIVE',
        deactivatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ],
    [
      'stale after deactivation',
      {
        id: reconnectBindingId,
        workspaceId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'ERROR',
        deactivatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ],
  ])(
    'rejects a RECONNECT binding that is %s before projection',
    async (_description, existingBinding) => {
      const workspaceRepository = {
        findOne: jest.fn(),
      };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(existingBinding),
        create: jest.fn(),
        save: jest.fn(),
      };
      const projectionService = { upsertVerifiedAccount: jest.fn() };
      const service = createAccountService({
        workspaceRepository,
        bindingRepository,
        projectionService,
      });

      if (!service) {
        return;
      }

      await expect(
        service.finalizeHostedAuthConnection(reconnectFinalizeInput),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(bindingRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: reconnectBindingId }),
        }),
      );
      expect(workspaceRepository.findOne).not.toHaveBeenCalled();
      expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
      expect(bindingRepository.create).not.toHaveBeenCalled();
      expect(bindingRepository.save).not.toHaveBeenCalled();
    },
  );

  it('commits DELETE_UNKNOWN before provider dispatch and commits terminal core state only after terminal projection', async () => {
    const callOrder: string[] = [];
    const savedBindings: Array<{
      status: string;
      deactivatedAt: Date | null;
    }> = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (savedBinding) => {
        savedBindings.push({
          status: savedBinding.status,
          deactivatedAt: savedBinding.deactivatedAt,
        });
        callOrder.push(`save:${savedBinding.status}`);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn().mockImplementation(async ({ status }) => {
        callOrder.push(`projection:${status}`);
      }),
    };
    const accountClient = {
      deleteAccount: jest
        .fn()
        .mockImplementation(async (_accountId, { beforeDispatch }) => {
          await beforeDispatch();
          expect(callOrder).toEqual([
            'session-lock',
            'transaction:1:start',
            'save:DELETE_UNKNOWN',
            'transaction:1:commit',
            'projection:ERROR',
          ]);
          callOrder.push('provider-outcome');

          return {
            kind: 'ACCEPTED',
            value: { deleted: true },
          };
        }),
      getAccount: jest.fn(),
    };
    const coreManager = createCoreManager(
      workspaceRepository,
      bindingRepository,
    );
    let transactionNumber = 0;
    const queryRunner: CoreQueryRunner = {
      manager: {
        transaction: jest.fn(
          async (callback: (manager: CoreManager) => Promise<unknown>) => {
            transactionNumber += 1;
            callOrder.push(`transaction:${transactionNumber}:start`);
            const result = await callback(coreManager);
            callOrder.push(`transaction:${transactionNumber}:commit`);

            return result;
          },
        ),
      },
    };
    const finalizationLockService: FinalizationLockService = {
      withLock: jest.fn(() => {
        throw new Error('disconnect must use the session lock');
      }),
      withSessionLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (runner: CoreQueryRunner) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });
          callOrder.push('session-lock');

          return operation(queryRunner);
        },
      ),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      accountClient,
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({
        workspaceId,
        userWorkspaceId,
      }),
    ).resolves.toEqual({ status: 'DISCONNECTED' });

    expect(accountClient.deleteAccount).toHaveBeenCalledWith(
      account.accountId,
      {
        beforeDispatch: expect.any(Function),
      },
    );
    expect(savedBindings).toEqual([
      { status: 'DELETE_UNKNOWN', deactivatedAt: null },
      { status: 'INACTIVE', deactivatedAt: expect.any(Date) },
    ]);
    expect(finalizationLockService.withSessionLock).toHaveBeenCalledTimes(1);
    expect(finalizationLockService.withLock).not.toHaveBeenCalled();
    expect(queryRunner.manager.transaction).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual([
      'session-lock',
      'transaction:1:start',
      'save:DELETE_UNKNOWN',
      'transaction:1:commit',
      'projection:ERROR',
      'provider-outcome',
      'projection:INACTIVE',
      'transaction:2:start',
      'save:INACTIVE',
      'transaction:2:commit',
    ]);
  });
  it('re-reads the current binding in the marker transaction under the shared session lock before disconnect side effects', async () => {
    const callOrder: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockImplementationOnce(async () => {
          callOrder.push('initial-read');

          return binding;
        })
        .mockImplementationOnce(async () => {
          callOrder.push('locked-reread');

          return null;
        }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const accountClient = {
      deleteAccount: jest.fn(async () => {
        callOrder.push('provider-delete');

        return { kind: 'ACCEPTED', value: { deleted: true } };
      }),
      getAccount: jest.fn(),
    };
    const coreManager = createCoreManager(
      { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
    );
    const transaction = jest.fn(
      async (operation: (manager: CoreManager) => Promise<unknown>) => {
        callOrder.push('marker-transaction');

        return operation(coreManager);
      },
    );
    const finalizationLockService: FinalizationLockService = {
      withLock: jest.fn(() => {
        throw new Error('disconnect must use the session lock');
      }),
      withSessionLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (runner: CoreQueryRunner) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });
          callOrder.push('session-lock');

          return operation({ manager: { transaction } });
        },
      ),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService: {
        upsertVerifiedAccount: jest.fn(),
        markAccountStatus: jest.fn(),
      },
      accountClient,
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({ workspaceId, userWorkspaceId }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(finalizationLockService.withSessionLock).toHaveBeenCalledTimes(1);
    expect(finalizationLockService.withLock).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(callOrder.indexOf('locked-reread')).toBeGreaterThan(
      callOrder.indexOf('marker-transaction'),
    );
    expect(accountClient.deleteAccount).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
  });

  it('returns DISCONNECTED after a terminal provider 404 rejection', async () => {
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository: {
        findOne: jest.fn().mockResolvedValue(binding),
        create: jest.fn(),
        save: jest.fn().mockResolvedValue(binding),
      },
      projectionService: {
        upsertVerifiedAccount: jest.fn(),
        markAccountStatus: jest.fn(),
      },
      accountClient: {
        deleteAccount: jest.fn(async (_accountId, { beforeDispatch }) => {
          await beforeDispatch();

          return {
            kind: 'KNOWN_REJECTION',
            status: 404,
            code: 'UNIPILE_ACCOUNT_NOT_FOUND',
          };
        }),
        getAccount: jest.fn(),
      },
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({ workspaceId, userWorkspaceId }),
    ).resolves.toEqual({ status: 'DISCONNECTED' });
  });

  it('keeps DELETE_UNKNOWN durable when terminal projection fails after a confirmed delete', async () => {
    const savedStatuses: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (savedBinding) => {
        savedStatuses.push(savedBinding.status);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(async ({ status }) => {
        if (status === 'INACTIVE') {
          throw new Error('projection unavailable');
        }
      }),
    };
    const accountClient = {
      deleteAccount: jest.fn(async (_accountId, { beforeDispatch }) => {
        await beforeDispatch();

        return { kind: 'ACCEPTED', value: { deleted: true } };
      }),
      getAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({ workspaceId, userWorkspaceId }),
    ).rejects.toThrow('projection unavailable');

    expect(savedStatuses).toEqual(['DELETE_UNKNOWN']);
    expect(binding.status).toBe('DELETE_UNKNOWN');
  });

  it('retains the committed DELETE_UNKNOWN marker when the terminal core transaction fails', async () => {
    const savedStatuses: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(async (savedBinding) => {
        savedStatuses.push(savedBinding.status);

        return savedBinding;
      }),
    };
    const terminalFailure = new Error('terminal core transaction unavailable');
    let markerTransactionCommitted = false;
    let transactionNumber = 0;
    const coreManager = createCoreManager(
      workspaceRepository,
      bindingRepository,
    );
    const finalizationLockService: FinalizationLockService = {
      withLock: jest.fn(() => {
        throw new Error('disconnect must use the session lock');
      }),
      withSessionLock: jest.fn(
        async (
          _scope: unknown,
          operation: (runner: CoreQueryRunner) => Promise<unknown>,
        ) =>
          operation({
            manager: {
              transaction: jest.fn(
                async (
                  callback: (manager: CoreManager) => Promise<unknown>,
                ) => {
                  transactionNumber += 1;

                  if (transactionNumber === 2) {
                    throw terminalFailure;
                  }

                  const result = await callback(coreManager);
                  markerTransactionCommitted = true;

                  return result;
                },
              ),
            },
          }),
      ),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService: {
        upsertVerifiedAccount: jest.fn(),
        markAccountStatus: jest.fn(),
      },
      accountClient: {
        deleteAccount: jest.fn(async (_accountId, { beforeDispatch }) => {
          await beforeDispatch();
          expect(markerTransactionCommitted).toBe(true);

          return { kind: 'ACCEPTED', value: { deleted: true } };
        }),
        getAccount: jest.fn(),
      },
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({ workspaceId, userWorkspaceId }),
    ).rejects.toBe(terminalFailure);

    expect(savedStatuses).toEqual(['DELETE_UNKNOWN']);
    expect(binding.status).toBe('DELETE_UNKNOWN');
    expect(transactionNumber).toBe(2);
  });

  it('serializes an existing DELETE_UNKNOWN retry without writing a duplicate marker', async () => {
    const savedStatuses: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'DELETE_UNKNOWN',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(async (savedBinding) => {
        savedStatuses.push(savedBinding.status);

        return savedBinding;
      }),
    };
    const coreManager = createCoreManager(
      workspaceRepository,
      bindingRepository,
    );
    const transaction = jest.fn(
      async (callback: (manager: CoreManager) => Promise<unknown>) =>
        callback(coreManager),
    );
    const finalizationLockService: FinalizationLockService = {
      withLock: jest.fn(() => {
        throw new Error('disconnect must use the session lock');
      }),
      withSessionLock: jest.fn(
        async (
          _scope: unknown,
          operation: (runner: CoreQueryRunner) => Promise<unknown>,
        ) => operation({ manager: { transaction } }),
      ),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService: {
        upsertVerifiedAccount: jest.fn(),
        markAccountStatus: jest.fn(),
      },
      accountClient: {
        deleteAccount: jest.fn(async (_accountId, { beforeDispatch }) => {
          await beforeDispatch();

          return { kind: 'ACCEPTED', value: { deleted: true } };
        }),
        getAccount: jest.fn(),
      },
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({ workspaceId, userWorkspaceId }),
    ).resolves.toEqual({ status: 'DISCONNECTED' });

    expect(finalizationLockService.withSessionLock).toHaveBeenCalledTimes(1);
    expect(finalizationLockService.withLock).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(savedStatuses).toEqual(['INACTIVE']);
  });

  it('persists a safe ERROR after a non-404 known rejection and rejects the disconnect', async () => {
    const callOrder: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(async (savedBinding) => {
        callOrder.push(`save:${savedBinding.status}`);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(async ({ status }) => {
        callOrder.push(`projection:${status}`);
      }),
    };
    const accountClient = {
      deleteAccount: jest.fn(async (_accountId, { beforeDispatch }) => {
        await beforeDispatch();
        callOrder.push('provider-rejection');

        return {
          kind: 'KNOWN_REJECTION',
          status: 403,
          code: 'UNIPILE_ACCOUNT_DELETE_FORBIDDEN',
        };
      }),
      getAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({ workspaceId, userWorkspaceId }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(callOrder).toEqual([
      'save:DELETE_UNKNOWN',
      'projection:ERROR',
      'provider-rejection',
      'projection:ERROR',
      'save:ERROR',
    ]);
    expect(binding.status).toBe('ERROR');
  });

  it('leaves the crash marker after an unknown disconnect without leaking the provider account id', async () => {
    const callOrder: string[] = [];
    const savedBindings: Array<{
      status: string;
      deactivatedAt: Date | null;
    }> = [];
    const projectionInputs: Array<{
      status: string;
      lastError: string | null;
    }> = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (savedBinding) => {
        savedBindings.push({
          status: savedBinding.status,
          deactivatedAt: savedBinding.deactivatedAt,
        });
        callOrder.push(`save:${savedBinding.status}`);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn().mockImplementation(async (input) => {
        projectionInputs.push({
          status: input.status,
          lastError: input.lastError,
        });
        callOrder.push(`projection:${input.status}`);
      }),
    };
    const accountClient = {
      deleteAccount: jest
        .fn()
        .mockImplementation(async (_accountId, { beforeDispatch }) => {
          await beforeDispatch();
          callOrder.push('provider-outcome');

          return {
            kind: 'UNKNOWN',
            status: null,
            code: 'UNIPILE_ACCOUNT_DELETE_UNKNOWN',
          };
        }),
      getAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      accountClient,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({
        workspaceId,
        userWorkspaceId,
      }),
    ).resolves.toEqual({ status: 'PENDING_RECOVERY' });

    expect(accountClient.deleteAccount).toHaveBeenCalledWith(
      account.accountId,
      {
        beforeDispatch: expect.any(Function),
      },
    );
    expect(savedBindings).toEqual([
      { status: 'DELETE_UNKNOWN', deactivatedAt: null },
    ]);
    expect(projectionInputs).toEqual([
      {
        status: 'ERROR',
        lastError: expect.not.stringContaining(account.accountId),
      },
    ]);
    expect(callOrder).toEqual([
      'save:DELETE_UNKNOWN',
      'projection:ERROR',
      'provider-outcome',
    ]);
  });

  it('retains the crash marker when dispatch throws after the hook', async () => {
    const callOrder: string[] = [];
    const savedBindings: Array<{
      status: string;
      deactivatedAt: Date | null;
    }> = [];
    const projectionStatuses: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (savedBinding) => {
        savedBindings.push({
          status: savedBinding.status,
          deactivatedAt: savedBinding.deactivatedAt,
        });
        callOrder.push(`save:${savedBinding.status}`);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn().mockImplementation(async ({ status }) => {
        projectionStatuses.push(status);
        callOrder.push(`projection:${status}`);
      }),
    };
    const accountClient = {
      deleteAccount: jest
        .fn()
        .mockImplementation(async (_accountId, { beforeDispatch }) => {
          await beforeDispatch();
          throw new Error('provider connection interrupted');
        }),
      getAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      accountClient,
    });

    if (!service) {
      return;
    }

    await expect(
      service.disconnectAccount({
        workspaceId,
        userWorkspaceId,
      }),
    ).rejects.toThrow('provider connection interrupted');

    expect(accountClient.deleteAccount).toHaveBeenCalledWith(
      account.accountId,
      {
        beforeDispatch: expect.any(Function),
      },
    );
    expect(savedBindings).toEqual([
      { status: 'DELETE_UNKNOWN', deactivatedAt: null },
    ]);
    expect(projectionStatuses).toEqual(['ERROR']);
    expect(callOrder).toEqual(['save:DELETE_UNKNOWN', 'projection:ERROR']);
    expect(binding.status).toBe('DELETE_UNKNOWN');
  });

  it('abandons unknown-disconnect recovery when the binding advances while its provider read is in flight', async () => {
    const callOrder: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'DELETE_UNKNOWN',
      deactivatedAt: null,
    };
    let signalProviderReadStarted: () => void = () => undefined;
    const providerReadStarted = new Promise<void>((resolve) => {
      signalProviderReadStarted = resolve;
    });
    let rejectProviderRead: (reason: unknown) => void = () => undefined;
    const providerRead = new Promise<never>((_resolve, reject) => {
      rejectProviderRead = reject;
    });
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(binding)
        .mockImplementationOnce(async () => {
          callOrder.push('locked-reread');

          return null;
        }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const finalizationLockService = {
      withLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (manager: CoreManager) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });
          callOrder.push('lock');

          return operation(
            createCoreManager(
              { findOne: jest.fn().mockResolvedValue(workspace) },
              bindingRepository,
            ),
          );
        },
      ),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient: {
        deleteAccount: jest.fn(),
        getAccount: jest.fn(() => {
          callOrder.push('provider-read');
          signalProviderReadStarted();

          return providerRead;
        }),
      },
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    const recovery = service.reconcileUnknownDisconnect(reconnectBindingId);

    await providerReadStarted;

    rejectProviderRead({
      status: 404,
      code: 'UNIPILE_ACCOUNT_NOT_FOUND',
    });
    await expect(recovery).resolves.toBeUndefined();

    expect(finalizationLockService.withLock).toHaveBeenCalledTimes(1);
    expect(bindingRepository.findOne).toHaveBeenCalledTimes(2);
    expect(callOrder).toContain('provider-read');
    expect(callOrder.indexOf('locked-reread')).toBeGreaterThan(
      callOrder.indexOf('lock'),
    );
    expect(bindingRepository.save).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).not.toHaveBeenCalled();
  });

  it('deactivates an unknown disconnect when recovery confirms a safe 404 without deleting again', async () => {
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'DELETE_UNKNOWN',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(binding),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn().mockResolvedValue(undefined),
    };
    const accountClient = {
      deleteAccount: jest.fn(),
      getAccount: jest.fn().mockRejectedValue({
        status: 404,
        code: 'UNIPILE_ACCOUNT_NOT_FOUND',
        message: 'Unable to retrieve the requested Instagram account',
      }),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      accountClient,
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileUnknownDisconnect(reconnectBindingId),
    ).resolves.toBeUndefined();

    expect(accountClient.getAccount).toHaveBeenCalledWith(account.accountId);
    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { id: reconnectBindingId, status: 'DELETE_UNKNOWN' },
    });
    expect(accountClient.deleteAccount).not.toHaveBeenCalled();
    expect(bindingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: reconnectBindingId,
        status: 'INACTIVE',
        deactivatedAt: expect.any(Date),
      }),
    );
    expect(projectionService.markAccountStatus).toHaveBeenCalledWith({
      workspace,
      workspaceInstagramAccountRecordId,
      status: 'INACTIVE',
      lastError: null,
    });
  });

  it('requires an explicit new disconnect when recovery finds the account still exists', async () => {
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      status: 'DELETE_UNKNOWN',
      deactivatedAt: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(binding),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn().mockResolvedValue(undefined),
    };
    const accountClient = {
      deleteAccount: jest.fn(),
      getAccount: jest.fn().mockResolvedValue(account),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
      accountClient,
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileUnknownDisconnect(reconnectBindingId),
    ).resolves.toBeUndefined();

    expect(accountClient.getAccount).toHaveBeenCalledWith(account.accountId);
    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { id: reconnectBindingId, status: 'DELETE_UNKNOWN' },
    });
    expect(accountClient.deleteAccount).not.toHaveBeenCalled();
    expect(bindingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: reconnectBindingId,
        status: 'ERROR',
        deactivatedAt: null,
      }),
    );
    expect(projectionService.markAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        workspaceInstagramAccountRecordId,
        status: 'ERROR',
        lastError: expect.not.stringContaining(account.accountId),
      }),
    );
  });
  it('abandons CONNECTING reconciliation when the binding advances while its provider read is in flight', async () => {
    const callOrder: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'CONNECTING',
      deactivatedAt: null,
    };
    let signalProviderReadStarted: () => void = () => undefined;
    const providerReadStarted = new Promise<void>((resolve) => {
      signalProviderReadStarted = resolve;
    });
    let resolveProviderRead: (value: SafeMappedInstagramAccount) => void = () =>
      undefined;
    const providerRead = new Promise<SafeMappedInstagramAccount>((resolve) => {
      resolveProviderRead = resolve;
    });
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(binding)
        .mockImplementationOnce(async () => {
          callOrder.push('locked-reread');

          return null;
        }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const finalizationLockService = {
      withLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (manager: CoreManager) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });
          callOrder.push('lock');

          return operation(
            createCoreManager(
              { findOne: jest.fn().mockResolvedValue(workspace) },
              bindingRepository,
            ),
          );
        },
      ),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient: {
        deleteAccount: jest.fn(),
        getAccount: jest.fn(() => {
          callOrder.push('provider-read');
          signalProviderReadStarted();

          return providerRead;
        }),
      },
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    const recovery = service.reconcileConnectingAccount(reconnectBindingId);

    await providerReadStarted;

    resolveProviderRead(account);
    await expect(recovery).resolves.toBeUndefined();

    expect(finalizationLockService.withLock).toHaveBeenCalledTimes(1);
    expect(bindingRepository.findOne).toHaveBeenCalledTimes(2);
    expect(callOrder).toContain('provider-read');
    expect(callOrder.indexOf('locked-reread')).toBeGreaterThan(
      callOrder.indexOf('lock'),
    );
    expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
  });
  it.each([
    ['OK', 'ACTIVE'],

    ['CONNECTING', 'CONNECTING'],
    ['CREDENTIALS', 'NEEDS_RECONNECT'],
    ['PERMISSIONS', 'NEEDS_RECONNECT'],
    ['ERROR', 'ERROR'],
    ['STOPPED', 'ERROR'],
  ] as const)(
    'reconciles an exact CONNECTING account with provider status %s as %s',
    async (sourceStatus, status) => {
      const callOrder: string[] = [];
      const binding = {
        id: reconnectBindingId,
        workspaceId,
        workspaceInstagramAccountRecordId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'CONNECTING',
        deactivatedAt: null,
      };
      const refreshedAccount = { ...account, sourceStatus };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(binding),
        create: jest.fn(),
        save: jest.fn(async (savedBinding) => {
          callOrder.push(`save:${savedBinding.status}`);

          return savedBinding;
        }),
      };
      const projectionService = {
        upsertVerifiedAccount: jest.fn(async (input) => {
          callOrder.push(`projection:${input.status}`);
        }),
      };
      const service = createAccountService({
        workspaceRepository: {
          findOne: jest.fn().mockResolvedValue(workspace),
        },
        bindingRepository,
        projectionService,
        accountClient: {
          deleteAccount: jest.fn(),
          getAccount: jest.fn().mockResolvedValue(refreshedAccount),
        },
      });

      if (!service) {
        return;
      }

      await expect(
        service.reconcileConnectingAccount(reconnectBindingId),
      ).resolves.toBeUndefined();

      expect(projectionService.upsertVerifiedAccount).toHaveBeenCalledWith({
        workspace,
        account: refreshedAccount,
        status,
      });
      expect(callOrder).toEqual([`projection:${status}`, `save:${status}`]);
    },
  );

  it.each([
    [
      'provider account id',
      { ...account, accountId: 'different-provider-account' },
    ],
    ['Instagram owner', { ...account, instagramUserId: '17841400000000002' }],
  ])(
    'projects and persists safe ERROR when the CONNECTING %s does not exactly match',
    async (_mismatch, refreshedAccount) => {
      const callOrder: string[] = [];
      const binding = {
        id: reconnectBindingId,
        workspaceId,
        workspaceInstagramAccountRecordId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'CONNECTING',
        deactivatedAt: null,
      };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(binding),
        create: jest.fn(),
        save: jest.fn(async (savedBinding) => {
          callOrder.push(`save:${savedBinding.status}`);

          return savedBinding;
        }),
      };
      const projectionService = {
        upsertVerifiedAccount: jest.fn(),
        markAccountStatus: jest.fn(async (input) => {
          callOrder.push(`projection:${input.status}`);
        }),
      };
      const service = createAccountService({
        workspaceRepository: {
          findOne: jest.fn().mockResolvedValue(workspace),
        },
        bindingRepository,
        projectionService,
        accountClient: {
          deleteAccount: jest.fn(),
          getAccount: jest.fn().mockResolvedValue(refreshedAccount),
        },
      });

      if (!service) {
        return;
      }

      await expect(
        service.reconcileConnectingAccount(reconnectBindingId),
      ).resolves.toBeUndefined();

      expect(projectionService.markAccountStatus).toHaveBeenCalledWith({
        workspace,
        workspaceInstagramAccountRecordId,
        status: 'ERROR',
        lastError: 'Unable to verify Instagram account connection',
      });
      expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
      expect(callOrder).toEqual(['projection:ERROR', 'save:ERROR']);
      expect(binding.status).toBe('ERROR');
    },
  );

  it('leaves CONNECTING unchanged after a retryable Unipile read error', async () => {
    const { UnipileReadError } =
      require('src/modules/myah-unipile/services/unipile-v1-client.service') as {
        UnipileReadError: new (
          status: number,
          code: string,
          message: string,
          retryable: boolean,
        ) => Error;
      };
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'CONNECTING',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient: {
        deleteAccount: jest.fn(),
        getAccount: jest
          .fn()
          .mockRejectedValue(
            new UnipileReadError(
              429,
              'UNIPILE_ACCOUNT_UNAVAILABLE',
              'Provider is temporarily unavailable',
              true,
            ),
          ),
      },
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileConnectingAccount(reconnectBindingId),
    ).resolves.toBeUndefined();

    expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
    expect(binding.status).toBe('CONNECTING');
  });

  it('persists safe ERROR when a CONNECTING account is deterministically absent at the provider', async () => {
    const { UnipileReadError } =
      require('src/modules/myah-unipile/services/unipile-v1-client.service') as {
        UnipileReadError: new (
          status: number,
          code: string,
          message: string,
          retryable: boolean,
        ) => Error;
      };
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'CONNECTING',
      deactivatedAt: null,
    };
    const callOrder: string[] = [];
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(async (savedBinding) => {
        callOrder.push(`save:${savedBinding.status}`);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(async (input) => {
        callOrder.push(`projection:${input.status}`);
      }),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient: {
        deleteAccount: jest.fn(),
        getAccount: jest
          .fn()
          .mockRejectedValue(
            new UnipileReadError(
              404,
              'UNIPILE_ACCOUNT_NOT_FOUND',
              'Unable to retrieve the requested Instagram account',
              false,
            ),
          ),
      },
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileConnectingAccount(reconnectBindingId),
    ).resolves.toBeUndefined();

    expect(projectionService.markAccountStatus).toHaveBeenCalledWith({
      workspace,
      workspaceInstagramAccountRecordId,
      status: 'ERROR',
      lastError: 'Unable to verify Instagram account connection',
    });
    expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['projection:ERROR', 'save:ERROR']);
    expect(binding.status).toBe('ERROR');
  });

  it.each([
    ['OK', 'ACTIVE'],
    ['CONNECTING', 'CONNECTING'],
    ['CREDENTIALS', 'NEEDS_RECONNECT'],
    ['PERMISSIONS', 'NEEDS_RECONNECT'],
    ['ERROR', 'ERROR'],
    ['STOPPED', 'ERROR'],
  ] as const)(
    'reconciles an exact active account with provider status %s as %s',
    async (sourceStatus, status) => {
      const callOrder: string[] = [];
      const binding = {
        id: reconnectBindingId,
        workspaceId,
        workspaceInstagramAccountRecordId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'ACTIVE',
        deactivatedAt: null,
      };
      const refreshedAccount = { ...account, sourceStatus };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(binding),
        create: jest.fn(),
        save: jest.fn(async (savedBinding) => {
          callOrder.push(`save:${savedBinding.status}`);

          return savedBinding;
        }),
      };
      const projectionService = {
        upsertVerifiedAccount: jest.fn(async (input) => {
          callOrder.push(`projection:${input.status}`);
        }),
      };
      const finalizationLockService = {
        withLock: jest.fn(
          async (
            scope: {
              workspaceId: string;
              unipileAccountId: string;
              instagramUserId: string;
            },
            operation: (manager: CoreManager) => Promise<unknown>,
          ) => {
            expect(scope).toEqual({
              workspaceId,
              unipileAccountId: account.accountId,
              instagramUserId: account.instagramUserId,
            });

            return operation(
              createCoreManager(
                { findOne: jest.fn().mockResolvedValue(workspace) },
                bindingRepository,
              ),
            );
          },
        ),
      };
      const service = createAccountService({
        workspaceRepository: {
          findOne: jest.fn().mockResolvedValue(workspace),
        },
        bindingRepository,
        projectionService,
        accountClient: {
          deleteAccount: jest.fn(),
          getAccount: jest.fn().mockResolvedValue(refreshedAccount),
        },
        finalizationLockService,
      });

      if (!service) {
        return;
      }

      await expect(
        service.reconcileBoundAccountStatus(reconnectBindingId),
      ).resolves.toBe(status);

      expect(bindingRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { id: reconnectBindingId, deactivatedAt: IsNull() },
      });
      expect(bindingRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: reconnectBindingId, deactivatedAt: IsNull() },
      });
      expect(projectionService.upsertVerifiedAccount).toHaveBeenCalledWith({
        workspace,
        account: refreshedAccount,
        status,
      });
      expect(callOrder).toEqual([`projection:${status}`, `save:${status}`]);
      expect(binding.status).toBe(status);
    },
  );

  it('handles a DELETED webhook terminally without rereading the provider', async () => {
    const callOrder: string[] = [];
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const coreBindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(async (savedBinding) => {
        callOrder.push(`save:${savedBinding.status}`);

        return savedBinding;
      }),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(async ({ status }) => {
        callOrder.push(`projection:${status}`);
      }),
    };
    const finalizationLockService = {
      withLock: jest.fn(
        async (
          scope: {
            workspaceId: string;
            unipileAccountId: string;
            instagramUserId: string;
          },
          operation: (manager: CoreManager) => Promise<unknown>,
        ) => {
          expect(scope).toEqual({
            workspaceId,
            unipileAccountId: account.accountId,
            instagramUserId: account.instagramUserId,
          });

          return operation(
            createCoreManager(
              { findOne: jest.fn().mockResolvedValue(workspace) },
              coreBindingRepository,
            ),
          );
        },
      ),
    };
    const accountClient = {
      deleteAccount: jest.fn(),
      getAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient,
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileWebhookAccountStatus({
        bindingId: reconnectBindingId,
        status: 'DELETED',
      }),
    ).resolves.toBe('INACTIVE');

    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { id: reconnectBindingId, deactivatedAt: IsNull() },
    });
    expect(coreBindingRepository.findOne).toHaveBeenCalledWith({
      where: { id: reconnectBindingId, deactivatedAt: IsNull() },
    });
    expect(bindingRepository.save).not.toHaveBeenCalled();
    expect(accountClient.getAccount).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).toHaveBeenCalledWith({
      workspace,
      workspaceInstagramAccountRecordId,
      status: 'INACTIVE',
      lastError: null,
    });
    expect(callOrder).toEqual(['projection:INACTIVE', 'save:INACTIVE']);
    expect(binding).toEqual(
      expect.objectContaining({
        status: 'INACTIVE',
        deactivatedAt: expect.any(Date),
      }),
    );
  });

  it('delegates nonterminal webhook statuses to the bound account reread', async () => {
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn() },
      bindingRepository: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
      projectionService: { upsertVerifiedAccount: jest.fn() },
    });

    if (!service) {
      return;
    }

    const reconcileBoundAccountStatus = jest
      .spyOn(service, 'reconcileBoundAccountStatus')
      .mockResolvedValue('ACTIVE');

    await expect(
      service.reconcileWebhookAccountStatus({
        bindingId: reconnectBindingId,
        status: 'RECONNECTED',
      }),
    ).resolves.toBe('ACTIVE');

    expect(reconcileBoundAccountStatus).toHaveBeenCalledWith(
      reconnectBindingId,
    );
  });
  it('returns DELETE_UNKNOWN without reading the provider or mutating the binding', async () => {
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'DELETE_UNKNOWN',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(),
    };
    const finalizationLockService = { withLock: jest.fn() };
    const accountClient = {
      deleteAccount: jest.fn(),
      getAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient,
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileBoundAccountStatus(reconnectBindingId),
    ).resolves.toBe('DELETE_UNKNOWN');

    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { id: reconnectBindingId, deactivatedAt: IsNull() },
    });
    expect(accountClient.getAccount).not.toHaveBeenCalled();
    expect(finalizationLockService.withLock).not.toHaveBeenCalled();
    expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
    expect(binding.status).toBe('DELETE_UNKNOWN');
  });

  it.each([
    [
      'provider account id',
      { ...account, accountId: 'different-provider-account' },
    ],
    ['Instagram owner', { ...account, instagramUserId: '17841400000000002' }],
  ])(
    'marks ERROR without replacing the binding identity when the %s changes',
    async (_mismatch, refreshedAccount) => {
      const callOrder: string[] = [];
      const binding = {
        id: reconnectBindingId,
        workspaceId,
        workspaceInstagramAccountRecordId,
        unipileAccountId: account.accountId,
        instagramUserId: account.instagramUserId,
        status: 'ACTIVE',
        deactivatedAt: null,
      };
      const bindingRepository = {
        findOne: jest.fn().mockResolvedValue(binding),
        create: jest.fn(),
        save: jest.fn(async (savedBinding) => {
          callOrder.push(`save:${savedBinding.status}`);

          return savedBinding;
        }),
      };
      const projectionService = {
        upsertVerifiedAccount: jest.fn(),
        markAccountStatus: jest.fn(async ({ status }) => {
          callOrder.push(`projection:${status}`);
        }),
      };
      const service = createAccountService({
        workspaceRepository: {
          findOne: jest.fn().mockResolvedValue(workspace),
        },
        bindingRepository,
        projectionService,
        accountClient: {
          deleteAccount: jest.fn(),
          getAccount: jest.fn().mockResolvedValue(refreshedAccount),
        },
      });

      if (!service) {
        return;
      }

      await expect(
        service.reconcileBoundAccountStatus(reconnectBindingId),
      ).resolves.toBe('ERROR');

      expect(projectionService.markAccountStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace,
          workspaceInstagramAccountRecordId,
          status: 'ERROR',
        }),
      );
      expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
      expect(callOrder).toEqual(['projection:ERROR', 'save:ERROR']);
      expect(binding).toEqual(
        expect.objectContaining({
          unipileAccountId: account.accountId,
          instagramUserId: account.instagramUserId,
          status: 'ERROR',
        }),
      );
    },
  );

  it('propagates a retryable provider read without mutating the active binding', async () => {
    const { UnipileReadError } =
      require('src/modules/myah-unipile/services/unipile-v1-client.service') as {
        UnipileReadError: new (
          status: number,
          code: string,
          message: string,
          retryable: boolean,
        ) => Error;
      };
    const retryableError = new UnipileReadError(
      429,
      'UNIPILE_ACCOUNT_UNAVAILABLE',
      'Provider is temporarily unavailable',
      true,
    );
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(),
    };
    const finalizationLockService = { withLock: jest.fn() };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient: {
        deleteAccount: jest.fn(),
        getAccount: jest.fn().mockRejectedValue(retryableError),
      },
      finalizationLockService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileBoundAccountStatus(reconnectBindingId),
    ).rejects.toBe(retryableError);

    expect(finalizationLockService.withLock).not.toHaveBeenCalled();
    expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
    expect(binding.status).toBe('ACTIVE');
  });

  it('returns the locked current status without projection when the binding advances during its provider read', async () => {
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      unipileAccountId: account.accountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE',
      deactivatedAt: null,
    };
    const advancedBinding = { ...binding, status: 'DELETE_UNKNOWN' };
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(binding)
        .mockResolvedValueOnce(advancedBinding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      upsertVerifiedAccount: jest.fn(),
      markAccountStatus: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
      accountClient: {
        deleteAccount: jest.fn(),
        getAccount: jest.fn().mockResolvedValue(account),
      },
    });

    if (!service) {
      return;
    }

    await expect(
      service.reconcileBoundAccountStatus(reconnectBindingId),
    ).resolves.toBe('DELETE_UNKNOWN');

    expect(projectionService.upsertVerifiedAccount).not.toHaveBeenCalled();
    expect(projectionService.markAccountStatus).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
  });

  it('uses the current core binding status as lifecycle authority over a stale projection', async () => {
    const binding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      status: 'DELETE_UNKNOWN',
      deactivatedAt: null,
    };
    const projectedStatus = {
      id: workspaceInstagramAccountRecordId,
      username: account.username,
      status: 'ACTIVE' as const,
      lastCheckedAt: '2026-09-04T12:34:56.000Z',
      lastError: null,
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(binding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      getAccountStatus: jest.fn().mockResolvedValue(projectedStatus),
      upsertVerifiedAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.getWorkspaceAccountStatus(workspaceId),
    ).resolves.toEqual({
      id: workspaceInstagramAccountRecordId,
      username: account.username,
      status: 'DELETE_UNKNOWN',
      lastCheckedAt: '2026-09-04T12:34:56.000Z',
      lastError: null,
    });
    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { workspaceId, deactivatedAt: IsNull() },
    });
    expect(projectionService.getAccountStatus).toHaveBeenCalledWith({
      workspace,
      workspaceInstagramAccountRecordId,
    });
  });

  it('returns the most recent inactive binding projection when no current binding exists', async () => {
    const inactiveBinding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      status: 'INACTIVE',
      deactivatedAt: new Date('2026-09-04T12:00:00.000Z'),
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(workspace),
    };
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(inactiveBinding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      getAccountStatus: jest.fn().mockResolvedValue({
        id: workspaceInstagramAccountRecordId,
        username: account.username,
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
      upsertVerifiedAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository,
      bindingRepository,
      projectionService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.getWorkspaceAccountStatus(workspaceId),
    ).resolves.toEqual({
      id: workspaceInstagramAccountRecordId,
      username: account.username,
      status: 'INACTIVE',
      lastCheckedAt: null,
      lastError: null,
    });
    expect(bindingRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { workspaceId, deactivatedAt: IsNull() },
    });
    expect(bindingRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {
        workspaceId,
        status: 'INACTIVE',
        deactivatedAt: Not(IsNull()),
      },
      order: { deactivatedAt: 'DESC' },
    });
  });

  it('returns the current binding without reading inactive history when both exist', async () => {
    const currentBinding = {
      id: reconnectBindingId,
      workspaceId,
      workspaceInstagramAccountRecordId,
      status: 'NEEDS_RECONNECT',
      deactivatedAt: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue(currentBinding),
      create: jest.fn(),
      save: jest.fn(),
    };
    const projectionService = {
      getAccountStatus: jest.fn().mockResolvedValue({
        id: workspaceInstagramAccountRecordId,
        username: account.username,
        status: 'INACTIVE',
        lastCheckedAt: null,
        lastError: 'stale projection status',
      }),
      upsertVerifiedAccount: jest.fn(),
    };
    const service = createAccountService({
      workspaceRepository: { findOne: jest.fn().mockResolvedValue(workspace) },
      bindingRepository,
      projectionService,
    });

    if (!service) {
      return;
    }

    await expect(
      service.getWorkspaceAccountStatus(workspaceId),
    ).resolves.toEqual({
      id: workspaceInstagramAccountRecordId,
      username: account.username,
      status: 'NEEDS_RECONNECT',
      lastCheckedAt: null,
      lastError: 'stale projection status',
    });
    expect(bindingRepository.findOne).toHaveBeenCalledTimes(1);
    expect(bindingRepository.findOne).toHaveBeenCalledWith({
      where: { workspaceId, deactivatedAt: IsNull() },
    });
  });
});
