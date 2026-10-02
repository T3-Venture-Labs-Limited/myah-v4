import { type QueryRunner } from 'typeorm';

import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';

const workspaceId = 'workspace-id';
const applicationUniversalIdentifier = 'application-universal-id';
const flatApplication = { id: 'application-id' } as FlatApplication;
const actions = [
  {
    type: 'create',
    metadataName: 'fieldMetadata',
    id: 'field-id',
    flatEntity: { universalIdentifier: 'first' },
    relatedFieldId: 'inverse-id',
    relatedUniversalFlatFieldMetadata: { universalIdentifier: 'inverse' },
  },
  {
    type: 'create',
    metadataName: 'fieldMetadata',
    flatEntity: { universalIdentifier: 'second' },
  },
] as WorkspaceMigration['actions'];
const workspaceMigration: WorkspaceMigration = {
  applicationUniversalIdentifier,
  actions,
};

const setup = () => {
  const queryRunner = {
    isReleased: false,
    isTransactionActive: true,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn().mockResolvedValue(undefined),
  } as unknown as QueryRunner;
  const initialMaps = {
    flatSearchFieldMetadataMaps: { byId: {} },
  } as unknown as AllFlatEntityMaps;
  const nextMaps = {
    ...initialMaps,
    flatObjectMetadataMaps: { byId: { first: {} } },
  } as unknown as AllFlatEntityMaps;
  const sideEffect = { description: 'after commit', run: jest.fn() };
  const event = { type: 'created' };
  const registry = {
    executeActionHandler: jest
      .fn()
      .mockResolvedValueOnce({
        partialOptimisticCache: {
          flatObjectMetadataMaps: nextMaps.flatObjectMetadataMaps,
        },
        metadataEvents: [event],
        afterCommitSideEffects: [sideEffect],
      })
      .mockResolvedValueOnce({
        partialOptimisticCache: {},
        metadataEvents: [],
        afterCommitSideEffects: [],
      }),
    executeActionRollbackHandler: jest.fn(),
  };
  const cache = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest
      .fn()
      .mockResolvedValue(initialMaps),
    invalidateFlatEntityMaps: jest.fn(),
  };
  const workspaceCache = {
    getOrRecompute: jest.fn().mockResolvedValue({
      flatApplicationMaps: {
        idByUniversalIdentifier: {
          [applicationUniversalIdentifier]: flatApplication.id,
        },
        byId: { [flatApplication.id]: flatApplication },
      },
    }),
    invalidateAndRecompute: jest.fn(),
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    query: jest.fn(),
  };
  const version = { incrementMetadataVersion: jest.fn() };
  const storage = { flushGraphQLOperation: jest.fn() };
  const logger = {
    perfTime: jest.fn(),
    perfTimeEnd: jest.fn(),
    perf: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(false) };
  const service = new WorkspaceMigrationRunnerService(
    cache as never,
    dataSource as never,
    registry as never,
    version as never,
    storage as never,
    workspaceCache as never,
    logger as never,
    config as never,
  );
  return {
    service,
    queryRunner,
    initialMaps,
    nextMaps,
    registry,
    cache,
    workspaceCache,
    dataSource,
    version,
    storage,
    sideEffect,
    event,
    config,
  };
};

describe('WorkspaceMigrationRunnerService transaction-only executor', () => {
  it('rejects nontransactional/released runners and DDL lock before handlers', async () => {
    const state = setup();
    const args = {
      queryRunner: state.queryRunner,
      workspaceId,
      workspaceMigration,
      allFlatEntityMaps: state.initialMaps,
      flatApplication,
    };
    (
      state.queryRunner as { isTransactionActive: boolean }
    ).isTransactionActive = false;
    await expect(
      state.service.executeActionsInTransaction(args),
    ).rejects.toThrow();
    (
      state.queryRunner as { isTransactionActive: boolean }
    ).isTransactionActive = true;
    (state.queryRunner as { isReleased: boolean }).isReleased = true;
    await expect(
      state.service.executeActionsInTransaction(args),
    ).rejects.toThrow();
    (state.queryRunner as { isReleased: boolean }).isReleased = false;
    state.config.get.mockReturnValue(true);
    await expect(
      state.service.executeActionsInTransaction(args),
    ).rejects.toThrow('locked');
    expect(state.registry.executeActionHandler).not.toHaveBeenCalled();
  });

  it('uses the caller runner and prior optimistic maps for every ordered action without pooled effects', async () => {
    const state = setup();
    const result = await state.service.executeActionsInTransaction({
      queryRunner: state.queryRunner,
      workspaceId,
      workspaceMigration,
      allFlatEntityMaps: state.initialMaps,
      flatApplication,
    });
    expect(state.registry.executeActionHandler).toHaveBeenCalledTimes(2);
    const [first, second] = state.registry.executeActionHandler.mock.calls.map(
      ([arg]) => arg,
    );
    expect(first.context.queryRunner).toBe(state.queryRunner);
    expect(second.context.queryRunner).toBe(state.queryRunner);
    expect(second.context.allFlatEntityMaps.flatObjectMetadataMaps).toBe(
      state.nextMaps.flatObjectMetadataMaps,
    );
    expect(
      first.context.preallocatedIdByUniversalIdentifierByMetadataName,
    ).toBe(second.context.preallocatedIdByUniversalIdentifierByMetadataName);
    expect(
      first.context.preallocatedIdByUniversalIdentifierByMetadataName
        .fieldMetadata,
    ).toEqual({ first: 'field-id', inverse: 'inverse-id' });
    expect(result.allFlatEntityMaps.flatObjectMetadataMaps).toBe(
      state.nextMaps.flatObjectMetadataMaps,
    );
    expect(result.metadataEvents).toEqual([state.event]);
    expect(result.afterCommitSideEffects).toEqual([state.sideEffect]);
    expect(state.sideEffect.run).not.toHaveBeenCalled();
    expect(state.queryRunner.query).not.toHaveBeenCalled();
    for (const method of [
      'connect',
      'startTransaction',
      'commitTransaction',
      'rollbackTransaction',
      'release',
    ] as const)
      expect(state.queryRunner[method]).not.toHaveBeenCalled();
    for (const mock of [
      state.dataSource.createQueryRunner,
      state.dataSource.query,
      state.cache.getOrRecomputeManyOrAllFlatEntityMaps,
      state.cache.invalidateFlatEntityMaps,
      state.workspaceCache.getOrRecompute,
      state.workspaceCache.invalidateAndRecompute,
      state.version.incrementMetadataVersion,
      state.storage.flushGraphQLOperation,
    ])
      expect(mock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'logic-function creation',
      [{ type: 'create', metadataName: 'logicFunction' }],
    ],
    ['unrelated creation', [{ type: 'create', metadataName: 'role' }]],
    ['field update', [{ type: 'update', metadataName: 'fieldMetadata' }]],
    ['object deletion', [{ type: 'delete', metadataName: 'objectMetadata' }]],
    [
      'mixed plan with unsafe tail',
      [...actions, { type: 'create', metadataName: 'logicFunction' }],
    ],
  ])(
    'rejects %s before any handler or query',
    async (_label, unsafeActions) => {
      const state = setup();
      await expect(
        state.service.executeActionsInTransaction({
          queryRunner: state.queryRunner,
          workspaceId,
          workspaceMigration: {
            applicationUniversalIdentifier,
            actions: unsafeActions as WorkspaceMigration['actions'],
          },
          allFlatEntityMaps: state.initialMaps,
          flatApplication,
        }),
      ).rejects.toThrow('transaction-safe');
      expect(state.registry.executeActionHandler).not.toHaveBeenCalled();
      expect(state.queryRunner.query).not.toHaveBeenCalled();
      expect(state.dataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(
        state.cache.getOrRecomputeManyOrAllFlatEntityMaps,
      ).not.toHaveBeenCalled();
    },
  );

  it('accepts each of the four native transaction-safe create action kinds', async () => {
    const state = setup();
    state.registry.executeActionHandler.mockReset().mockResolvedValue({
      partialOptimisticCache: {},
      metadataEvents: [],
      afterCommitSideEffects: [],
    });
    const quartet = [
      {
        type: 'create',
        metadataName: 'objectMetadata',
        flatEntity: { universalIdentifier: 'object' },
        universalFlatFieldMetadatas: [],
      },
      {
        type: 'create',
        metadataName: 'fieldMetadata',
        flatEntity: { universalIdentifier: 'field' },
      },
      {
        type: 'create',
        metadataName: 'index',
        flatEntity: { universalIdentifier: 'index' },
      },
      {
        type: 'create',
        metadataName: 'objectPermission',
        flatEntity: { universalIdentifier: 'permission' },
      },
    ] as WorkspaceMigration['actions'];
    await state.service.executeActionsInTransaction({
      queryRunner: state.queryRunner,
      workspaceId,
      workspaceMigration: { applicationUniversalIdentifier, actions: quartet },
      allFlatEntityMaps: state.initialMaps,
      flatApplication,
    });
    expect(
      state.registry.executeActionHandler.mock.calls.map(
        ([{ action }]) => action,
      ),
    ).toEqual(quartet);
  });

  it('keeps the legacy wrapper unrestricted for a nonquartet action', async () => {
    const state = setup();
    const logicFunctionAction = {
      type: 'create',
      metadataName: 'logicFunction',
    } as WorkspaceMigration['actions'][number];
    state.registry.executeActionHandler.mockReset().mockResolvedValue({
      partialOptimisticCache: {},
      metadataEvents: [],
      afterCommitSideEffects: [],
    });
    state.cache.invalidateFlatEntityMaps.mockResolvedValue(undefined);
    await state.service.run({
      workspaceId,
      workspaceMigration: {
        applicationUniversalIdentifier,
        actions: [logicFunctionAction],
      },
    });
    expect(state.registry.executeActionHandler).toHaveBeenCalledWith(
      expect.objectContaining({ action: logicFunctionAction }),
    );
    expect(state.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('propagates handler failure without lifecycle or rollback callbacks', async () => {
    const state = setup();
    const failure = new Error('handler failed');
    state.registry.executeActionHandler.mockReset().mockRejectedValue(failure);
    await expect(
      state.service.executeActionsInTransaction({
        queryRunner: state.queryRunner,
        workspaceId,
        workspaceMigration,
        allFlatEntityMaps: state.initialMaps,
        flatApplication,
      }),
    ).rejects.toBe(failure);
    expect(state.registry.executeActionRollbackHandler).not.toHaveBeenCalled();
    expect(state.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(state.queryRunner.release).not.toHaveBeenCalled();
  });

  it('preserves legacy rollback with the latest optimistic maps on action failure', async () => {
    const state = setup();
    state.registry.executeActionHandler
      .mockReset()
      .mockResolvedValueOnce({
        partialOptimisticCache: {
          flatObjectMetadataMaps: state.nextMaps.flatObjectMetadataMaps,
        },
        metadataEvents: [],
        afterCommitSideEffects: [],
      })
      .mockRejectedValueOnce(new Error('second action failed'));
    state.queryRunner.rollbackTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    state.queryRunner.release = jest.fn().mockResolvedValue(undefined);
    state.registry.executeActionRollbackHandler.mockResolvedValue(undefined);
    state.cache.invalidateFlatEntityMaps.mockResolvedValue(undefined);
    state.version.incrementMetadataVersion.mockResolvedValue(undefined);
    state.storage.flushGraphQLOperation.mockResolvedValue(undefined);
    state.workspaceCache.invalidateAndRecompute.mockResolvedValue(undefined);
    await expect(
      state.service.run({ workspaceMigration, workspaceId }),
    ).rejects.toThrow('second action failed');
    expect(state.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(state.queryRunner.release).toHaveBeenCalledTimes(1);
    expect(state.queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(state.registry.executeActionRollbackHandler).toHaveBeenCalledTimes(
      2,
    );
    expect(
      state.registry.executeActionRollbackHandler.mock.calls[0][0].context
        .allFlatEntityMaps.flatObjectMetadataMaps,
    ).toBe(state.nextMaps.flatObjectMetadataMaps);
    expect(state.cache.invalidateFlatEntityMaps).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy wrapper lifecycle and postcommit behavior', async () => {
    const state = setup();
    (
      state.queryRunner as unknown as { isTransactionActive: boolean }
    ).isTransactionActive = false;
    state.cache.invalidateFlatEntityMaps.mockResolvedValue(undefined);
    state.version.incrementMetadataVersion.mockResolvedValue(undefined);
    state.storage.flushGraphQLOperation.mockResolvedValue(undefined);
    state.workspaceCache.invalidateAndRecompute.mockResolvedValue(undefined);
    state.queryRunner.startTransaction = jest.fn(async () => {
      (
        state.queryRunner as unknown as { isTransactionActive: boolean }
      ).isTransactionActive = true;
    });
    const result = await state.service.run({ workspaceMigration, workspaceId });
    expect(result.metadataEvents).toEqual([state.event]);
    expect(state.queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(state.queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(state.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(state.queryRunner.release).toHaveBeenCalledTimes(1);
    expect(state.queryRunner.query).toHaveBeenCalledWith(
      "SET LOCAL lock_timeout = '8s'",
    );
    expect(state.cache.invalidateFlatEntityMaps).toHaveBeenCalledTimes(1);
    expect(state.version.incrementMetadataVersion).toHaveBeenCalledTimes(1);
    expect(state.sideEffect.run).toHaveBeenCalledTimes(1);
  });
});
