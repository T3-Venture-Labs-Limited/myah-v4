import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { type DataSource, type Repository } from 'typeorm';

import { BillingSubscriptionService } from 'src/engine/core-modules/billing/services/billing-subscription.service';
import { BillingService } from 'src/engine/core-modules/billing/services/billing.service';
import { DnsManagerService } from 'src/engine/core-modules/dns-manager/services/dns-manager.service';
import { CustomDomainManagerService } from 'src/engine/core-modules/domain/custom-domain-manager/services/custom-domain-manager.service';
import { SubdomainManagerService } from 'src/engine/core-modules/domain/subdomain-manager/services/subdomain-manager.service';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { FileCorePictureService } from 'src/engine/core-modules/file/file-core-picture/services/file-core-picture.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { generateGraphQLErrorFromError } from 'src/engine/core-modules/graphql/utils/generate-graphql-error-from-error.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { WorkspaceDataSourceService } from 'src/engine/workspace-datasource/workspace-datasource.service';
import { PrefillLogicFunctionService } from 'src/engine/workspace-manager/standard-objects-prefill-data/services/prefill-logic-function.service';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { PreInstalledAppsService } from 'src/engine/core-modules/application/pre-installed-apps/pre-installed-apps.service';
import { SdkClientGenerationService } from 'src/engine/core-modules/sdk-client/sdk-client-generation.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { WorkspaceManagerService } from 'src/engine/workspace-manager/workspace-manager.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let userWorkspaceRepository: Repository<UserWorkspaceEntity>;
  let userRepository: Repository<UserEntity>;
  let workspaceRepository: Repository<WorkspaceEntity>;
  let workspaceCacheStorageService: WorkspaceCacheStorageService;
  let messageQueueService: MessageQueueService;
  let dnsManagerService: DnsManagerService;
  let billingSubscriptionService: BillingSubscriptionService;
  let userWorkspaceService: UserWorkspaceService;
  let preInstalledAppsService: PreInstalledAppsService;
  let coreDataSource: DataSource;

  beforeEach(async () => {
    const flatEntityMaps = createEmptyAllFlatEntityMaps();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        {
          provide: UpgradeWriteLockService,
          useValue: {
            withLock: (operation: () => Promise<unknown>) => operation(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: {
            findOne: jest.fn(),
            softDelete: jest.fn(),
            delete: jest.fn(),
            manager: {
              connection: { driver: { options: { type: 'postgres' } } },
            },
            metadata: { columns: [] },
          },
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {
            find: jest.fn(),
            softDelete: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            softDelete: jest.fn(),
          },
        },
        {
          provide: BillingService,
          useValue: {
            isBillingEnabled: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: BillingSubscriptionService,
          useValue: {
            cancelSubscription: jest.fn(),
            assertSubscriptionCanceledOrNone: jest.fn(),
          },
        },
        ...[
          WorkspaceManagerService,
          DnsManagerService,
          CustomDomainManagerService,
          SubdomainManagerService,
          TwentyConfigService,
          ExceptionHandlerService,
          PermissionsService,
          FeatureFlagService,
          FileCorePictureService,
          AiModelRegistryService,
          ApplicationService,
          PreInstalledAppsService,
          SdkClientGenerationService,
          PrefillLogicFunctionService,
          WorkspaceMigrationValidateBuildAndRunService,
          UpgradeMigrationService,
          UpgradeSequenceReaderService,
        ].map((service) => ({
          provide: service,
          useValue: {},
        })),
        {
          provide: WorkspaceCacheStorageService,
          useValue: {
            flush: jest.fn(),
          },
        },
        {
          provide: WorkspaceDataSourceService,
          useValue: {
            deleteWorkspaceDBSchema: jest.fn(),
          },
        },
        {
          provide: WorkspaceManyOrAllFlatEntityMapsCacheService,
          useValue: {
            flushFlatEntityMaps: jest.fn(),
            getOrRecomputeManyOrAllFlatEntityMaps: jest
              .fn()
              .mockResolvedValue(flatEntityMaps),
          },
        },
        {
          provide: UserWorkspaceService,
          useValue: {
            deleteUserWorkspace: jest.fn(),
          },
        },
        {
          provide: getQueueToken(MessageQueue.deleteCascadeQueue),
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: CoreEntityCacheService,
          useValue: {
            invalidate: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                delete: jest.fn().mockResolvedValue({ affected: 0 }),
              },
            }),
            getRepository: jest.fn().mockReturnValue({
              find: jest.fn().mockResolvedValue([]),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
    userWorkspaceRepository = module.get<Repository<UserWorkspaceEntity>>(
      getRepositoryToken(UserWorkspaceEntity),
    );
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
    workspaceRepository = module.get<Repository<WorkspaceEntity>>(
      getRepositoryToken(WorkspaceEntity),
    );
    workspaceCacheStorageService = module.get<WorkspaceCacheStorageService>(
      WorkspaceCacheStorageService,
    );
    messageQueueService = module.get<MessageQueueService>(
      getQueueToken(MessageQueue.deleteCascadeQueue),
    );
    dnsManagerService = module.get<DnsManagerService>(DnsManagerService);
    dnsManagerService.deleteHostnameSilently = jest.fn();
    billingSubscriptionService = module.get<BillingSubscriptionService>(
      BillingSubscriptionService,
    );
    userWorkspaceService =
      module.get<UserWorkspaceService>(UserWorkspaceService);
    preInstalledAppsService = module.get<PreInstalledAppsService>(
      PreInstalledAppsService,
    );
    coreDataSource = module.get<DataSource>(getDataSourceToken());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('claims activation on the pinned lock connection before pooled initialization', async () => {
    const workspace = {
      id: '00000000-0000-4000-8000-000000000001',
    } as WorkspaceEntity;
    const admission = jest.fn().mockResolvedValue({ affected: 1 });
    const lock = service['upgradeWriteLockService'] as unknown as {
      currentRunner: jest.Mock;
    };
    lock.currentRunner = jest.fn().mockReturnValue({
      manager: { getRepository: () => ({ update: admission }) },
    });
    workspaceRepository.update = jest.fn().mockResolvedValue({ affected: 1 });
    workspaceRepository.findOneBy = jest.fn().mockResolvedValue(workspace);
    (
      service['coreEntityCacheService'] as unknown as { invalidate: jest.Mock }
    ).invalidate = jest.fn();
    (
      service['workspaceManagerService'] as unknown as { init: jest.Mock }
    ).init = jest.fn();
    (
      service['featureFlagService'] as unknown as {
        enableFeatureFlags: jest.Mock;
      }
    ).enableFeatureFlags = jest.fn();
    userWorkspaceService.createWorkspaceMember = jest.fn();
    (
      service as unknown as { prefillCreatedWorkspaceRecords: jest.Mock }
    ).prefillCreatedWorkspaceRecords = jest.fn();
    (
      service as unknown as { activateAndInitializeUpgradeState: jest.Mock }
    ).activateAndInitializeUpgradeState = jest.fn();
    (
      service['sdkClientGenerationService'] as unknown as {
        enqueueSdkClientGenerationForWorkspace: jest.Mock;
      }
    ).enqueueSdkClientGenerationForWorkspace = jest.fn();

    await service.activateWorkspace({ id: 'user-id' } as never, workspace);

    expect(admission).toHaveBeenCalledWith(
      expect.objectContaining({ id: workspace.id }),
      expect.objectContaining({ activationStatus: 'ONGOING_CREATION' }),
    );
    expect(workspaceRepository.update).not.toHaveBeenCalled();
  });

  it('repairs a claimed ONGOING status when the initial eviction fails, then permits retry', async () => {
    const workspace = {
      id: '00000000-0000-4000-8000-000000000001',
    } as WorkspaceEntity;
    const admission = jest.fn().mockResolvedValue({ affected: 1 });
    (
      service['upgradeWriteLockService'] as unknown as {
        currentRunner: jest.Mock;
      }
    ).currentRunner = jest.fn().mockReturnValue({
      manager: { getRepository: () => ({ update: admission }) },
    });
    const invalidate = jest
      .fn()
      .mockRejectedValueOnce(new Error('SENSITIVE_INITIAL_EVICTION_MARKER'))
      .mockResolvedValue(undefined);
    (
      service['coreEntityCacheService'] as unknown as { invalidate: jest.Mock }
    ).invalidate = invalidate;
    workspaceRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ ...workspace, activationStatus: 'ACTIVE' });
    workspaceRepository.update = jest.fn();
    (
      service['workspaceManagerService'] as unknown as { init: jest.Mock }
    ).init = jest.fn();
    (
      service['featureFlagService'] as unknown as {
        enableFeatureFlags: jest.Mock;
      }
    ).enableFeatureFlags = jest.fn();
    userWorkspaceService.createWorkspaceMember = jest.fn();
    (
      service as unknown as { prefillCreatedWorkspaceRecords: jest.Mock }
    ).prefillCreatedWorkspaceRecords = jest.fn();
    (
      service as unknown as { activateAndInitializeUpgradeState: jest.Mock }
    ).activateAndInitializeUpgradeState = jest.fn();
    (
      service['sdkClientGenerationService'] as unknown as {
        enqueueSdkClientGenerationForWorkspace: jest.Mock;
      }
    ).enqueueSdkClientGenerationForWorkspace = jest.fn();
    const error = await service
      .activateWorkspace({ id: 'user-id' } as never, workspace)
      .then(
        () => undefined,
        (cause: Error) => cause,
      );
    expect(error?.message).toBe(
      'Workspace activation is temporarily unavailable. Please retry.',
    );
    const graphqlError = generateGraphQLErrorFromError(error!, {
      _: () => 'An error occurred.',
    } as never);
    expect(graphqlError.message).not.toContain(
      'SENSITIVE_INITIAL_EVICTION_MARKER',
    );
    expect(JSON.stringify(graphqlError.toJSON())).not.toContain(
      'SENSITIVE_INITIAL_EVICTION_MARKER',
    );
    expect(Object.getOwnPropertyDescriptor(error!, 'cause')?.enumerable).toBe(
      false,
    );
    expect(admission).toHaveBeenNthCalledWith(
      2,
      { id: workspace.id, activationStatus: 'ONGOING_CREATION' },
      { activationStatus: 'PENDING_CREATION' },
    );
    expect(workspaceRepository.update).not.toHaveBeenCalled();
    expect(
      (service['workspaceManagerService'] as unknown as { init: jest.Mock })
        .init,
    ).not.toHaveBeenCalled();
    await expect(
      service.activateWorkspace({ id: 'user-id' } as never, workspace),
    ).resolves.toMatchObject({ activationStatus: 'ACTIVE' });
    expect(
      (service['workspaceManagerService'] as unknown as { init: jest.Mock })
        .init,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps committed ACTIVE and fails closed with a safe message when final eviction fails', async () => {
    const workspace = {
      id: '00000000-0000-4000-8000-000000000001',
    } as WorkspaceEntity;
    const admission = jest
      .fn()
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValue({ affected: 0 });
    (
      service['upgradeWriteLockService'] as unknown as {
        currentRunner: jest.Mock;
      }
    ).currentRunner = jest.fn().mockReturnValue({
      manager: { getRepository: () => ({ update: admission }) },
    });
    const invalidate = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('SENSITIVE_FINAL_EVICTION_MARKER'))
      .mockResolvedValue(undefined);
    (
      service['coreEntityCacheService'] as unknown as { invalidate: jest.Mock }
    ).invalidate = invalidate;
    workspaceRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ ...workspace, activationStatus: 'ACTIVE' });
    workspaceRepository.update = jest.fn();
    (
      service['workspaceManagerService'] as unknown as { init: jest.Mock }
    ).init = jest.fn();
    (
      service['featureFlagService'] as unknown as {
        enableFeatureFlags: jest.Mock;
      }
    ).enableFeatureFlags = jest.fn();
    userWorkspaceService.createWorkspaceMember = jest.fn();
    (
      service as unknown as { prefillCreatedWorkspaceRecords: jest.Mock }
    ).prefillCreatedWorkspaceRecords = jest.fn();
    (
      service as unknown as { activateAndInitializeUpgradeState: jest.Mock }
    ).activateAndInitializeUpgradeState = jest.fn();
    (
      service['sdkClientGenerationService'] as unknown as {
        enqueueSdkClientGenerationForWorkspace: jest.Mock;
      }
    ).enqueueSdkClientGenerationForWorkspace = jest.fn();
    const error = await service
      .activateWorkspace({ id: 'user-id' } as never, workspace)
      .then(
        () => undefined,
        (cause: Error) => cause,
      );
    expect(error?.message).toBe(
      'Workspace activation is temporarily unavailable. Please retry.',
    );
    const graphqlError = generateGraphQLErrorFromError(error!, {
      _: () => 'An error occurred.',
    } as never);
    expect(graphqlError.message).not.toContain(
      'SENSITIVE_FINAL_EVICTION_MARKER',
    );
    expect(JSON.stringify(graphqlError.toJSON())).not.toContain(
      'SENSITIVE_FINAL_EVICTION_MARKER',
    );
    expect(Object.getOwnPropertyDescriptor(error!, 'cause')?.enumerable).toBe(
      false,
    );
    expect(workspaceRepository.update).not.toHaveBeenCalled();
    await expect(
      service.activateWorkspace({ id: 'user-id' } as never, workspace),
    ).resolves.toMatchObject({ activationStatus: 'ACTIVE' });
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['commit acknowledged lost', 'committed'],
    ['commit outcome unresolved', 'unknown'],
    ['cache invalidation fails after uncertain COMMIT', 'cache-failed'],
    ['precommit receipt rejection', 'precommit'],
  ])(
    'handles activation %s without contradicting durable state',
    async (_description, outcome) => {
      const commitLost = outcome !== 'precommit';
      const workspace = {
        id: '00000000-0000-4000-8000-000000000001',
        activationStatus: 'ONGOING_CREATION',
      } as WorkspaceEntity;
      const admission = jest.fn().mockResolvedValue({ affected: 1 });
      const pinned = {
        manager: {
          getRepository: () => ({ update: admission }),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        },
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        isTransactionActive: true,
      };
      const secret = 'SENSITIVE_ACTIVATION_COMMIT_MARKER';
      const failure = new Error(
        commitLost ? `commit response lost ${secret}` : 'receipt failed',
      );
      if (commitLost) pinned.commitTransaction.mockRejectedValueOnce(failure);
      const lock = service['upgradeWriteLockService'] as unknown as {
        currentRunner: jest.Mock;
      };
      lock.currentRunner = jest.fn().mockReturnValue(pinned);
      (service['twentyConfigService'] as unknown as { get: jest.Mock }).get =
        jest.fn().mockReturnValue('2.20.0');
      workspaceRepository.update = jest.fn().mockResolvedValue({ affected: 1 });
      workspaceRepository.findOneBy = jest.fn().mockResolvedValue({
        ...workspace,
        activationStatus:
          outcome === 'committed'
            ? 'ACTIVE'
            : outcome === 'unknown' || outcome === 'cache-failed'
              ? 'ONGOING_CREATION'
              : 'PENDING_CREATION',
      });
      (
        service['coreEntityCacheService'] as unknown as {
          invalidate: jest.Mock;
        }
      ).invalidate =
        outcome === 'cache-failed'
          ? jest
              .fn()
              .mockResolvedValueOnce(undefined)
              .mockRejectedValueOnce(
                new Error('SENSITIVE_REDIS_EVICTION_MARKER'),
              )
          : jest.fn();
      (
        service['workspaceManagerService'] as unknown as { init: jest.Mock }
      ).init = jest.fn();
      (
        service['featureFlagService'] as unknown as {
          enableFeatureFlags: jest.Mock;
        }
      ).enableFeatureFlags = jest.fn();
      userWorkspaceService.createWorkspaceMember = jest.fn();
      (
        service as unknown as { prefillCreatedWorkspaceRecords: jest.Mock }
      ).prefillCreatedWorkspaceRecords = jest.fn();
      (
        service['sdkClientGenerationService'] as unknown as {
          enqueueSdkClientGenerationForWorkspace: jest.Mock;
        }
      ).enqueueSdkClientGenerationForWorkspace = jest.fn();
      const ledger = service['upgradeMigrationService'] as unknown as {
        getLastAttemptedInstanceCommandOrThrow: jest.Mock;
        markAsWorkspaceInitial: jest.Mock;
        hasWorkspaceInitialReceipt: jest.Mock;
      };
      ledger.getLastAttemptedInstanceCommandOrThrow = jest
        .fn()
        .mockResolvedValue({ name: 'native', status: 'completed' });
      ledger.markAsWorkspaceInitial = jest.fn().mockImplementation(async () => {
        if (!commitLost) throw failure;
      });
      ledger.hasWorkspaceInitialReceipt = jest
        .fn()
        .mockResolvedValue(outcome === 'committed');
      (
        service['upgradeSequenceReaderService'] as unknown as {
          getInitialCursorForNewWorkspace: jest.Mock;
        }
      ).getInitialCursorForNewWorkspace = jest
        .fn()
        .mockReturnValue({ name: 'native', status: 'completed' });

      if (outcome === 'committed') {
        const result = await service.activateWorkspace(
          { id: 'user-id' } as never,
          workspace,
        );
        expect(result).toMatchObject({ activationStatus: 'ACTIVE' });
        expect(JSON.stringify(result)).not.toContain(secret);
        expect(workspaceRepository.update).not.toHaveBeenCalled();
        expect(ledger.hasWorkspaceInitialReceipt).toHaveBeenCalledWith({
          workspaceId: workspace.id,
          name: 'native',
          status: 'completed',
        });
        expect(pinned.rollbackTransaction).not.toHaveBeenCalled();
        expect(
          (
            service['coreEntityCacheService'] as unknown as {
              invalidate: jest.Mock;
            }
          ).invalidate,
        ).toHaveBeenCalledTimes(3);
      } else if (outcome === 'unknown' || outcome === 'cache-failed') {
        let exposedError: Error | undefined;
        try {
          await service.activateWorkspace(
            { id: 'user-id' } as never,
            workspace,
          );
        } catch (error) {
          exposedError = error as Error;
        }
        expect(exposedError).toBeInstanceOf(Error);
        expect(exposedError?.message).toBe(
          outcome === 'unknown'
            ? 'Workspace activation outcome could not be confirmed. Please retry.'
            : 'Workspace activation is temporarily unavailable. Please retry.',
        );
        const graphqlError = generateGraphQLErrorFromError(exposedError!, {
          _: () => 'An error occurred.',
        } as never);
        expect(graphqlError.message).not.toContain(secret);
        expect(graphqlError.message).not.toContain(
          'SENSITIVE_REDIS_EVICTION_MARKER',
        );
        expect(JSON.stringify(graphqlError.toJSON())).not.toContain(secret);
        expect(JSON.stringify(graphqlError.toJSON())).not.toContain(
          'SENSITIVE_REDIS_EVICTION_MARKER',
        );
        expect(
          Object.getOwnPropertyDescriptor(exposedError!, 'cause')?.enumerable,
        ).toBe(false);
        expect(workspaceRepository.update).not.toHaveBeenCalled();
        expect(pinned.rollbackTransaction).not.toHaveBeenCalled();
        expect(
          (
            service['coreEntityCacheService'] as unknown as {
              invalidate: jest.Mock;
            }
          ).invalidate,
        ).toHaveBeenCalledTimes(2);
      } else {
        await expect(
          service.activateWorkspace({ id: 'user-id' } as never, workspace),
        ).rejects.toThrow('receipt failed');
        expect(pinned.rollbackTransaction).toHaveBeenCalledTimes(1);
        expect(workspaceRepository.update).toHaveBeenCalledWith(
          expect.objectContaining({ id: workspace.id }),
          { activationStatus: 'PENDING_CREATION' },
        );
      }
    },
  );

  it.each([false, true])(
    'invalidates cached ONGOING even when fresh COMMIT reinspection fails (eviction also fails=%s)',
    async (cacheAlsoFails) => {
      const workspace = {
        id: '00000000-0000-4000-8000-000000000001',
      } as WorkspaceEntity;
      const admission = jest.fn().mockResolvedValue({ affected: 1 });
      const pinned = {
        manager: {
          getRepository: () => ({ update: admission }),
          update: jest.fn(),
        },
        startTransaction: jest.fn(),
        commitTransaction: jest
          .fn()
          .mockRejectedValue(new Error('SENSITIVE_COMMIT_READ_MARKER')),
        rollbackTransaction: jest.fn(),
        isTransactionActive: true,
      };
      (
        service['upgradeWriteLockService'] as unknown as {
          currentRunner: jest.Mock;
        }
      ).currentRunner = jest.fn().mockReturnValue(pinned);
      (service['twentyConfigService'] as unknown as { get: jest.Mock }).get =
        jest.fn().mockReturnValue('2.20.0');
      const invalidate = cacheAlsoFails
        ? jest
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(
              new Error('SENSITIVE_COMBINED_EVICTION_MARKER'),
            )
        : jest.fn();
      (
        service['coreEntityCacheService'] as unknown as {
          invalidate: jest.Mock;
        }
      ).invalidate = invalidate;
      workspaceRepository.findOneBy = jest
        .fn()
        .mockRejectedValue(new Error('SENSITIVE_FRESH_READ_MARKER'));
      workspaceRepository.update = jest.fn();
      (
        service['workspaceManagerService'] as unknown as { init: jest.Mock }
      ).init = jest.fn();
      (
        service['featureFlagService'] as unknown as {
          enableFeatureFlags: jest.Mock;
        }
      ).enableFeatureFlags = jest.fn();
      userWorkspaceService.createWorkspaceMember = jest.fn();
      (
        service as unknown as { prefillCreatedWorkspaceRecords: jest.Mock }
      ).prefillCreatedWorkspaceRecords = jest.fn();
      (
        service['upgradeMigrationService'] as unknown as {
          getLastAttemptedInstanceCommandOrThrow: jest.Mock;
          markAsWorkspaceInitial: jest.Mock;
        }
      ).getLastAttemptedInstanceCommandOrThrow = jest
        .fn()
        .mockResolvedValue({ name: 'native', status: 'completed' });
      (
        service['upgradeMigrationService'] as unknown as {
          markAsWorkspaceInitial: jest.Mock;
        }
      ).markAsWorkspaceInitial = jest.fn();
      (
        service['upgradeSequenceReaderService'] as unknown as {
          getInitialCursorForNewWorkspace: jest.Mock;
        }
      ).getInitialCursorForNewWorkspace = jest
        .fn()
        .mockReturnValue({ name: 'native', status: 'completed' });
      let exposedError: Error | undefined;
      try {
        await service.activateWorkspace({ id: 'user-id' } as never, workspace);
      } catch (error) {
        exposedError = error as Error;
      }
      expect(exposedError?.message).toBe(
        cacheAlsoFails
          ? 'Workspace activation is temporarily unavailable. Please retry.'
          : 'Workspace activation outcome could not be confirmed. Please retry.',
      );
      const graphqlError = generateGraphQLErrorFromError(exposedError!, {
        _: () => 'An error occurred.',
      } as never);
      for (const marker of [
        'SENSITIVE_COMMIT_READ_MARKER',
        'SENSITIVE_FRESH_READ_MARKER',
        'SENSITIVE_COMBINED_EVICTION_MARKER',
      ]) {
        expect(graphqlError.message).not.toContain(marker);
        expect(JSON.stringify(graphqlError.toJSON())).not.toContain(marker);
      }
      const uncertainty = cacheAlsoFails
        ? (exposedError as Error & { cause: { uncertainCommit: Error } }).cause
            .uncertainCommit
        : exposedError!;
      expect((uncertainty as Error & { cause: Error }).cause.message).toContain(
        'SENSITIVE_COMMIT_READ_MARKER',
      );
      expect(
        (uncertainty as Error & { inspectionFailure: Error }).inspectionFailure
          .message,
      ).toContain('SENSITIVE_FRESH_READ_MARKER');
      expect(
        Object.getOwnPropertyDescriptor(uncertainty, 'inspectionFailure')
          ?.enumerable,
      ).toBe(false);
      expect(invalidate).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenLastCalledWith(
        'workspaceEntity',
        workspace.id,
      );
      expect(workspaceRepository.update).not.toHaveBeenCalled();
      expect(pinned.rollbackTransaction).not.toHaveBeenCalled();
    },
  );

  it('invalidates cached ONGOING on a later ACTIVE retry before returning', async () => {
    const workspace = {
      id: '00000000-0000-4000-8000-000000000001',
    } as WorkspaceEntity;
    const admission = jest.fn().mockResolvedValue({ affected: 0 });
    (
      service['upgradeWriteLockService'] as unknown as {
        currentRunner: jest.Mock;
      }
    ).currentRunner = jest.fn().mockReturnValue({
      manager: { getRepository: () => ({ update: admission }) },
    });
    workspaceRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ ...workspace, activationStatus: 'ACTIVE' });
    const invalidate = jest.fn();
    (
      service['coreEntityCacheService'] as unknown as { invalidate: jest.Mock }
    ).invalidate = invalidate;
    await expect(
      service.activateWorkspace({ id: 'user-id' } as never, workspace),
    ).resolves.toMatchObject({ activationStatus: 'ACTIVE' });
    expect(invalidate).toHaveBeenCalledWith('workspaceEntity', workspace.id);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('fails closed if ACTIVE retry cache eviction fails', async () => {
    const workspace = {
      id: '00000000-0000-4000-8000-000000000001',
    } as WorkspaceEntity;
    workspaceRepository.update = jest.fn();
    const admission = jest.fn().mockResolvedValue({ affected: 0 });
    (
      service['upgradeWriteLockService'] as unknown as {
        currentRunner: jest.Mock;
      }
    ).currentRunner = jest.fn().mockReturnValue({
      manager: { getRepository: () => ({ update: admission }) },
    });
    workspaceRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ ...workspace, activationStatus: 'ACTIVE' });
    const invalidate = jest
      .fn()
      .mockRejectedValue(new Error('SENSITIVE_ACTIVE_RETRY_MARKER'));
    (
      service['coreEntityCacheService'] as unknown as { invalidate: jest.Mock }
    ).invalidate = invalidate;
    let exposedError: Error | undefined;
    try {
      await service.activateWorkspace({ id: 'user-id' } as never, workspace);
    } catch (error) {
      exposedError = error as Error;
    }
    expect(exposedError?.message).toBe(
      'Workspace activation is temporarily unavailable. Please retry.',
    );
    const graphqlError = generateGraphQLErrorFromError(exposedError!, {
      _: () => 'An error occurred.',
    } as never);
    expect(graphqlError.message).not.toContain('SENSITIVE_ACTIVE_RETRY_MARKER');
    expect(JSON.stringify(graphqlError.toJSON())).not.toContain(
      'SENSITIVE_ACTIVE_RETRY_MARKER',
    );
    expect(
      Object.getOwnPropertyDescriptor(exposedError!, 'cause')?.enumerable,
    ).toBe(false);
    expect(invalidate).toHaveBeenCalledWith('workspaceEntity', workspace.id);
    expect(workspaceRepository.update).not.toHaveBeenCalled();
  });

  it('commits ACTIVE and its native initial receipt on the pinned lock connection', async () => {
    const order: string[] = [];
    const pinned = {
      startTransaction: jest.fn(async () => {
        order.push('begin');
      }),
      commitTransaction: jest.fn(async () => {
        order.push('commit');
      }),
      rollbackTransaction: jest.fn(),
      manager: {
        update: jest.fn(async () => {
          order.push('active');
        }),
      },
    };
    const lock = service['upgradeWriteLockService'] as unknown as {
      currentRunner: jest.Mock;
    };
    lock.currentRunner = jest.fn().mockReturnValue(pinned);
    coreDataSource.createQueryRunner = jest.fn().mockReturnValue({
      ...pinned,
      connect: jest.fn(),
      release: jest.fn(),
    });
    (service['twentyConfigService'] as unknown as { get: jest.Mock }).get = jest
      .fn()
      .mockReturnValue('2.20.0');
    const ledger = service['upgradeMigrationService'] as unknown as {
      getLastAttemptedInstanceCommandOrThrow: jest.Mock;
      markAsWorkspaceInitial: jest.Mock;
    };
    ledger.getLastAttemptedInstanceCommandOrThrow = jest.fn(async () => {
      order.push('cursor');
      return { name: 'native', status: 'completed' };
    });
    ledger.markAsWorkspaceInitial = jest.fn(async () => {
      order.push('receipt');
    });
    const reader = service['upgradeSequenceReaderService'] as unknown as {
      getInitialCursorForNewWorkspace: jest.Mock;
    };
    reader.getInitialCursorForNewWorkspace = jest
      .fn()
      .mockReturnValue({ name: 'native', status: 'completed' });

    await service['activateAndInitializeUpgradeState']({
      workspaceId: 'workspace-id',
    });

    expect(coreDataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(ledger.getLastAttemptedInstanceCommandOrThrow).toHaveBeenCalledWith(
      pinned,
    );
    expect(ledger.markAsWorkspaceInitial).toHaveBeenCalledWith(
      expect.objectContaining({ queryRunner: pinned }),
    );
    expect(order).toEqual(['begin', 'cursor', 'active', 'receipt', 'commit']);
  });

  it('does not describe an uncertain activation COMMIT as rolled back', async () => {
    const pinned = {
      startTransaction: jest.fn(),
      commitTransaction: jest
        .fn()
        .mockRejectedValue(new Error('connection lost after COMMIT')),
      rollbackTransaction: jest.fn(),
      isTransactionActive: true,
      manager: { update: jest.fn() },
    };
    (
      service['upgradeWriteLockService'] as unknown as {
        currentRunner: jest.Mock;
      }
    ).currentRunner = jest.fn().mockReturnValue(pinned);
    (service['twentyConfigService'] as unknown as { get: jest.Mock }).get = jest
      .fn()
      .mockReturnValue('2.20.0');
    (
      service['upgradeMigrationService'] as unknown as {
        getLastAttemptedInstanceCommandOrThrow: jest.Mock;
        markAsWorkspaceInitial: jest.Mock;
      }
    ).getLastAttemptedInstanceCommandOrThrow = jest
      .fn()
      .mockResolvedValue({ name: 'native', status: 'completed' });
    (
      service['upgradeMigrationService'] as unknown as {
        markAsWorkspaceInitial: jest.Mock;
      }
    ).markAsWorkspaceInitial = jest.fn();
    (
      service['upgradeSequenceReaderService'] as unknown as {
        getInitialCursorForNewWorkspace: jest.Mock;
      }
    ).getInitialCursorForNewWorkspace = jest
      .fn()
      .mockReturnValue({ name: 'native', status: 'completed' });

    let exposedError: Error | undefined;
    try {
      await service['activateAndInitializeUpgradeState']({
        workspaceId: 'workspace-id',
      });
    } catch (error) {
      exposedError = error as Error;
    }
    expect(exposedError?.message).toBe(
      'Workspace activation outcome could not be confirmed. Please retry.',
    );
    expect((exposedError as Error & { cause: Error }).cause.message).toBe(
      'connection lost after COMMIT',
    );
    expect(
      Object.getOwnPropertyDescriptor(exposedError!, 'cause')?.enumerable,
    ).toBe(false);
    expect(pinned.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('validates persisted model choices with the execution workspace identity', async () => {
    const registry = service[
      'aiModelRegistryService' as keyof WorkspaceService
    ] as unknown as {
      validateModelAvailability: jest.Mock;
    };
    registry.validateModelAvailability = jest.fn((modelId: string) => {
      if (modelId === 'openai/gpt-4.1') {
        throw new Error('native model rejected for managed workspace');
      }
    });
    const permissionsService = service[
      'permissionsService' as keyof WorkspaceService
    ] as unknown as {
      userHasWorkspaceSettingPermission: jest.Mock;
    };
    permissionsService.userHasWorkspaceSettingPermission = jest
      .fn()
      .mockResolvedValue(true);
    const twentyConfigService = service[
      'twentyConfigService' as keyof WorkspaceService
    ] as unknown as { get: jest.Mock };
    twentyConfigService.get = jest.fn().mockReturnValue(false);
    const workspace = {
      id: 'workspace-id',
      activationStatus: 'INACTIVE',
      fastModel: 'openai/gpt-4.1',
      smartModel: 'openrouter/deepseek/deepseek-v4-flash',
      useRecommendedModels: true,
      enabledAiModelIds: [],
    } as unknown as WorkspaceEntity;
    workspaceRepository.findOneBy = jest.fn().mockResolvedValue(workspace);
    workspaceRepository.save = jest.fn().mockResolvedValue(workspace);

    await expect(
      service.updateWorkspaceById({
        payload: { id: workspace.id, fastModel: 'openai/gpt-4.1' },
        userWorkspaceId: 'user-workspace-id',
        apiKey: undefined,
      }),
    ).rejects.toThrow('Selected model is not available');

    expect(registry.validateModelAvailability).toHaveBeenCalledWith(
      'openai/gpt-4.1',
      expect.objectContaining({ id: 'workspace-id' }),
    );
    expect(workspaceRepository.save).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('installs pre-installed apps when legacy CRM prefill is skipped', async () => {
    preInstalledAppsService.installOnWorkspace = jest.fn();

    await service['prefillCreatedWorkspaceRecords']({
      workspaceId: 'workspace-id',
      schemaName: 'workspace_schema',
    });

    expect(preInstalledAppsService.installOnWorkspace).toHaveBeenCalledWith(
      'workspace-id',
    );
  });

  it('does not provision a dashboard when legacy CRM prefill is skipped', async () => {
    preInstalledAppsService.installOnWorkspace = jest.fn();
    await service['prefillCreatedWorkspaceRecords']({
      workspaceId: 'workspace-id',
      schemaName: 'workspace_schema',
    });

    expect(coreDataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  describe('handleRemoveWorkspaceMember', () => {
    it('should soft delete the user workspace record', async () => {
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([
        {
          userId: 'user-id',
          workspaceId: 'workspace-id',
          id: 'user-workspace-id',
        } as UserWorkspaceEntity,
      ]);

      await service.handleRemoveWorkspaceMember(
        'workspace-id',
        'user-id',
        true,
      );

      expect(userWorkspaceService.deleteUserWorkspace).toHaveBeenCalledWith({
        userWorkspaceId: 'user-workspace-id',
        softDelete: true,
      });
      expect(userWorkspaceRepository.delete).not.toHaveBeenCalled();
      expect(userRepository.softDelete).toHaveBeenCalledWith('user-id');
    });

    it('should destroy the user workspace record', async () => {
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([
        {
          id: 'user-workspace-id',
          userId: 'user-id',
          workspaceId: 'workspace-id',
        } as UserWorkspaceEntity,
      ]);

      await service.handleRemoveWorkspaceMember(
        'workspace-id',
        'user-id',
        false,
      );

      expect(userWorkspaceService.deleteUserWorkspace).toHaveBeenCalledWith({
        userWorkspaceId: 'user-workspace-id',
        softDelete: false,
      });
      expect(userRepository.softDelete).toHaveBeenCalledWith('user-id');
    });

    it('should not soft delete the user record if there are other user workspace records', async () => {
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([
        {
          id: 'remaining-user-workspace-id',
          userId: 'user-id',
          workspaceId: 'other-workspace-id',
        } as UserWorkspaceEntity,
        {
          id: 'user-workspace-id',
          userId: 'user-id',
          workspaceId: 'workspace-id',
        } as UserWorkspaceEntity,
      ]);

      await service.handleRemoveWorkspaceMember(
        'workspace-id',
        'user-id',
        false,
      );

      expect(userWorkspaceService.deleteUserWorkspace).toHaveBeenCalledWith({
        userWorkspaceId: 'user-workspace-id',
        softDelete: false,
      });
      expect(userWorkspaceService.deleteUserWorkspace).not.toHaveBeenCalledWith(
        {
          userWorkspaceId: 'remaining-user-workspace-id',
          softDelete: false,
        },
      );
      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('deleteWorkspace', () => {
    it('should hard delete the workspace', async () => {
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, false);

      expect(
        billingSubscriptionService.assertSubscriptionCanceledOrNone,
      ).toHaveBeenCalledWith(mockWorkspace.id);
      expect(workspaceCacheStorageService.flush).toHaveBeenCalledWith(
        mockWorkspace.id,
        mockWorkspace.metadataVersion,
      );
      expect(messageQueueService.add).toHaveBeenCalled();
      expect(workspaceRepository.delete).toHaveBeenCalledWith(mockWorkspace.id);
      expect(workspaceRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should soft delete the workspace', async () => {
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, true);

      expect(
        billingSubscriptionService.cancelSubscription,
      ).toHaveBeenCalledWith(mockWorkspace.id);
      expect(workspaceRepository.softDelete).toHaveBeenCalledWith({
        id: mockWorkspace.id,
      });
      expect(workspaceRepository.delete).not.toHaveBeenCalled();
    });

    it('should delete the custom domain when hard deleting a workspace with a custom domain', async () => {
      const customDomain = 'custom.example.com';
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
        customDomain,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, false);

      expect(dnsManagerService.deleteHostnameSilently).toHaveBeenCalledWith(
        customDomain,
      );
    });

    it('should not delete the custom domain when soft deleting a workspace with a custom domain', async () => {
      const customDomain = 'custom.example.com';
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
        customDomain,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, true);

      expect(dnsManagerService.deleteHostnameSilently).not.toHaveBeenCalled();
      expect(workspaceRepository.softDelete).toHaveBeenCalledWith({
        id: mockWorkspace.id,
      });
    });
  });
});
