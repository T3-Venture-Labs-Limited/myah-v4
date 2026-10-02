import type { DataSource, QueryRunner } from 'typeorm';

import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const action = {
  metadataName: 'objectMetadata',
  type: 'create',
  universalIdentifier: 'object',
  universalFlatFieldMetadatas: [],
} as never;

function harness() {
  const events: string[] = [];
  const callbacks: Array<() => Promise<void> | void> = [];
  const pooledUpdate = jest.fn(() => {
    throw new Error('pooled write');
  });
  const pinnedUpdate = jest.fn(async () => {
    events.push('version-sql');
  });
  const setMetadataVersion = jest.fn(async () => {
    events.push('version-cache');
  });
  const invalidateCore = jest.fn(async () => {
    events.push('core-cache');
  });
  const metadataVersionService = new WorkspaceMetadataVersionService(
    {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: workspaceId, metadataVersion: 4 }),
      update: pooledUpdate,
    } as never,
    { setMetadataVersion } as never,
    { invalidate: invalidateCore } as never,
  );
  const queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    manager: {
      getRepository: jest.fn(() => ({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: workspaceId, metadataVersion: 4 }),
        update: pinnedUpdate,
      })),
    },
    query: jest.fn(async (sql: string) => {
      if (sql === 'INSERT') events.push('action-sql');
    }),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  } as unknown as QueryRunner;
  const invalidateFlatEntityMaps = jest.fn(async () => {
    events.push('flat-cache');
  });
  const invalidateAndRecompute = jest.fn(async () => {
    events.push('derived-cache');
  });
  const flushGraphQLOperation = jest.fn(async () => {
    events.push('graphql-cache');
  });
  let failAction = false;
  const executeActionRollbackHandler = jest.fn(async () => {
    events.push('rollback-handler');
  });
  const flatApplication = { id: 'app', universalIdentifier: 'app' };
  const service = new WorkspaceMigrationRunnerService(
    {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({}),
      invalidateFlatEntityMaps,
    } as never,
    {
      createQueryRunner: jest.fn(() => {
        throw new Error('pooled runner');
      }),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource,
    {
      executeActionHandler: jest.fn(
        async ({ context }: { context: { queryRunner: QueryRunner } }) => {
          await context.queryRunner.query('INSERT');
          if (failAction) throw new Error('action failed');
          return {
            partialOptimisticCache: {},
            metadataEvents: [],
            afterCommitSideEffects: [],
          };
        },
      ),
      executeActionRollbackHandler,
    } as never,
    metadataVersionService,
    { flushGraphQLOperation } as never,
    {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatApplicationMaps: {
          idByUniversalIdentifier: { app: 'app' },
          byId: { app: flatApplication },
        },
      }),
      invalidateAndRecompute,
    } as never,
    {
      perfTime: jest.fn(),
      perfTimeEnd: jest.fn(),
      perf: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as never,
    { get: jest.fn().mockReturnValue(false) } as never,
  );
  const run = () =>
    service.run({
      workspaceId,
      workspaceMigration: {
        actions: [action],
        applicationUniversalIdentifier: 'app',
      },
      upgradeTransaction: {
        queryRunner,
        afterCommit: (callback) => callbacks.push(callback),
      },
    });
  return {
    run,
    service,
    events,
    callbacks,
    queryRunner,
    pinnedUpdate,
    pooledUpdate,
    setMetadataVersion,
    invalidateFlatEntityMaps,
    invalidateAndRecompute,
    flushGraphQLOperation,
    executeActionRollbackHandler,
    failAction: () => {
      failAction = true;
    },
  };
}

describe('pinned migration metadata version lifecycle', () => {
  it('retains ordinary direct invalidation/version behavior outside an upgrade', async () => {
    const h = harness();
    await expect(
      h.service.invalidateCache({
        workspaceId,
        allFlatEntityMapsKeys: ['flatObjectMetadataMaps'],
      }),
    ).rejects.toThrow('Failed to invalidate 1 cache operations');
    expect(h.pooledUpdate).toHaveBeenCalledTimes(1);
    expect(h.invalidateFlatEntityMaps).toHaveBeenCalledTimes(1);
  });

  it('does not publish or write outside the owner transaction when an action fails', async () => {
    const h = harness();
    h.failAction();
    await expect(h.run()).rejects.toThrow('action failed');
    expect(h.events).toEqual(['action-sql']);
    expect(h.callbacks).toHaveLength(0);
    expect(h.executeActionRollbackHandler).not.toHaveBeenCalled();
    expect(h.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(h.pooledUpdate).not.toHaveBeenCalled();
  });

  it('writes version before the outer receipt/commit and only publishes committed state afterward', async () => {
    const h = harness();
    await h.run();
    expect(h.events).toEqual(['action-sql', 'version-sql']);
    expect(h.pinnedUpdate).toHaveBeenCalledWith(
      { id: workspaceId },
      { metadataVersion: 5 },
    );
    expect(h.pooledUpdate).not.toHaveBeenCalled();
    expect(h.queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(h.callbacks.length).toBeGreaterThan(0);
    for (const callback of h.callbacks) await callback();
    expect(h.events).toContain('flat-cache');
    expect(h.events).toContain('version-cache');
    expect(h.events).toContain('derived-cache');
    expect(h.pooledUpdate).not.toHaveBeenCalled();
  });

  it('leaves rollback to the owner if the pinned version SQL fails after the action', async () => {
    const h = harness();
    h.pinnedUpdate.mockRejectedValueOnce(new Error('version SQL failed'));
    await expect(h.run()).rejects.toThrow('version SQL failed');
    expect(h.events).toEqual(['action-sql']);
    expect(h.callbacks).toHaveLength(0);
    expect(h.invalidateFlatEntityMaps).not.toHaveBeenCalled();
    expect(h.executeActionRollbackHandler).not.toHaveBeenCalled();
    expect(h.pooledUpdate).not.toHaveBeenCalled();
  });

  it('propagates failed committed-version publication without retrying the SQL write', async () => {
    const h = harness();
    await h.run();
    h.setMetadataVersion.mockRejectedValueOnce(
      new Error('version cache unavailable'),
    );
    await expect(h.callbacks[0]()).rejects.toThrow('version cache unavailable');
    expect(h.pinnedUpdate).toHaveBeenCalledTimes(1);
    expect(h.pooledUpdate).not.toHaveBeenCalled();
  });

  it('propagates a postcommit cache failure without another DB version write', async () => {
    const h = harness();
    await h.run();
    h.invalidateFlatEntityMaps.mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );
    await expect(
      Promise.all(h.callbacks.map((callback) => callback())),
    ).rejects.toThrow('Redis unavailable');
    expect(h.pinnedUpdate).toHaveBeenCalledTimes(1);
    expect(h.pooledUpdate).not.toHaveBeenCalled();
  });
});
