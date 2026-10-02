import type { DataSource, QueryRunner } from 'typeorm';

import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const action = {
  metadataName: 'pageLayout',
  type: 'create',
  universalIdentifier: 'layout',
} as never;

const makeHarness = () => {
  const order: string[] = [];
  const runner = {
    isReleased: false,
    isTransactionActive: true,
    connect: jest.fn(() => {
      throw new Error('must reuse pinned connection');
    }),
    startTransaction: jest.fn(() => {
      throw new Error('must reuse outer transaction');
    }),
    commitTransaction: jest.fn(() => {
      throw new Error('must not commit before receipt');
    }),
    release: jest.fn(() => {
      throw new Error('must not release lock connection');
    }),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('INSERT')) order.push('action-sql');
    }),
  } as unknown as QueryRunner;
  const afterCommit: Array<() => Promise<void> | void> = [];
  const invalidate = jest.fn(async () => {
    order.push('cache');
  });
  const emit = jest.fn(async () => {
    order.push('side-effect');
  });
  const flatApplication = { id: 'app', universalIdentifier: 'app' };
  const allFlatEntityMaps = {
    flatPageLayoutMaps: { byId: {} },
    flatApplicationMaps: {
      idByUniversalIdentifier: { app: 'app' },
      byId: { app: flatApplication },
    },
  };
  const service = new WorkspaceMigrationRunnerService(
    {
      getOrRecomputeManyOrAllFlatEntityMaps: jest
        .fn()
        .mockResolvedValue(allFlatEntityMaps),
    } as never,
    {
      createQueryRunner: jest.fn(() => {
        throw new Error('pooled connection forbidden');
      }),
    } as unknown as DataSource,
    {
      executeActionHandler: jest.fn(
        async ({ context }: { context: { queryRunner: QueryRunner } }) => {
          await context.queryRunner.query(
            'INSERT INTO core.metadata_probe DEFAULT VALUES',
          );
          return {
            partialOptimisticCache: {},
            metadataEvents: [],
            afterCommitSideEffects: [{ description: 'test', run: emit }],
          };
        },
      ),
    } as never,
    { incrementMetadataVersion: jest.fn(async () => undefined) } as never,
    {} as never,
    {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatApplicationMaps: allFlatEntityMaps.flatApplicationMaps,
      }),
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
  // Test only the ordering boundary, not cache implementation specifics.
  (
    service as unknown as { invalidateCache: typeof invalidate }
  ).invalidateCache = invalidate;
  return { service, runner, afterCommit, order, emit, invalidate };
};

describe('WorkspaceMigrationRunnerService pinned upgrade transaction', () => {
  it('runs a real metadata action on the supplied runner and defers cache/side effects until outer commit', async () => {
    const { service, runner, afterCommit, order, invalidate, emit } =
      makeHarness();
    await service.run({
      workspaceId,
      workspaceMigration: {
        actions: [action],
        applicationUniversalIdentifier: 'app',
      },
      upgradeTransaction: {
        queryRunner: runner,
        afterCommit: (effect) => afterCommit.push(effect),
      },
    });
    expect(order).toEqual(['action-sql']);
    expect(afterCommit).toHaveLength(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).not.toHaveBeenCalled();
    await afterCommit[0]();
    expect(order).toEqual(['action-sql', 'cache', 'side-effect']);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('rejects logic-function install before its first write', async () => {
    const { service, runner, afterCommit } = makeHarness();
    await expect(
      service.run({
        workspaceId,
        workspaceMigration: {
          actions: [{ metadataName: 'logicFunction', type: 'create' } as never],
          applicationUniversalIdentifier: 'app',
        },
        upgradeTransaction: {
          queryRunner: runner,
          afterCommit: (effect) => afterCommit.push(effect),
        },
      }),
    ).rejects.toThrow('cannot run logic-function install/update');
    expect(runner.query).not.toHaveBeenCalled();
  });
});
