import { WorkspaceMigrationRunnerService } from './workspace-migration-runner.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';
import type { PinnedWorkspaceMetadataSnapshot } from 'src/engine/workspace-manager/workspace-migration/types/pinned-workspace-metadata-snapshot.type';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const applicationUid = '20202020-0000-4000-8000-000000000002';
const applicationId = '20202020-0000-4000-8000-000000000003';

describe('pinned native migration runner', () => {
  const pooledMaps = jest.fn(() => {
    throw new Error('pooled metadata read');
  });
  const pooledApplication = jest.fn(() => {
    throw new Error('pooled application read');
  });
  const pooledDb = jest.fn(() => {
    throw new Error('pooled failure diagnostic');
  });
  const execute = jest.fn();
  const version = jest.fn().mockResolvedValue(undefined);
  const logger = {
    perfTime: jest.fn(),
    perfTimeEnd: jest.fn(),
    perf: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  const service = new WorkspaceMigrationRunnerService(
    { getOrRecomputeManyOrAllFlatEntityMaps: pooledMaps } as never,
    { query: pooledDb } as never,
    { executeActionHandler: execute } as never,
    { incrementMetadataVersion: version } as never,
    {} as never,
    { getOrRecompute: pooledApplication } as never,
    logger as never,
    { get: () => false } as never,
  );
  const makeArgs = () => {
    const manager = { queryRunner: null as unknown };
    const runner = {
      isTransactionActive: true,
      isReleased: false,
      manager,
      query: jest.fn().mockResolvedValue([]),
      commitTransaction: jest.fn(),
      release: jest.fn(),
    };
    manager.queryRunner = runner;
    const tx = {
      queryRunner: runner,
      afterCommit: jest.fn(),
      optimisticFlatEntityMaps: {
        flatViewFieldMaps: {
          byUniversalIdentifier: { stale: { id: 'stale' } },
        },
      },
    } as unknown as UpgradeWorkspaceTransaction;
    const maps = createEmptyAllFlatEntityMaps();
    const snapshot = {
      workspaceId,
      workspace: { id: workspaceId },
      queryRunner: runner,
      allFlatEntityMaps: maps,
      flatApplicationMaps: {
        byId: {
          [applicationId]: {
            id: applicationId,
            universalIdentifier: applicationUid,
          },
        },
        idByUniversalIdentifier: { [applicationUid]: applicationId },
      },
    } as unknown as PinnedWorkspaceMetadataSnapshot;
    return {
      workspaceId,
      upgradeTransaction: tx,
      pinnedSnapshot: snapshot,
      workspaceMigration: {
        applicationUniversalIdentifier: applicationUid,
        actions: [
          {
            type: 'delete',
            metadataName: 'viewField',
            universalIdentifier: workspaceId,
          },
        ],
      } as never,
    };
  };
  beforeEach(() => {
    pooledMaps.mockClear();
    pooledApplication.mockClear();
    pooledDb.mockClear();
    execute.mockReset().mockResolvedValue({
      partialOptimisticCache: {},
      metadataEvents: [],
      afterCommitSideEffects: [],
    });
    version.mockClear();
  });

  it('uses complete fresh snapshot rather than either pooled read or stale optimistic overlay', async () => {
    const args = makeArgs();
    await service.run(args);
    expect(pooledMaps).not.toHaveBeenCalled();
    expect(pooledApplication).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          allFlatEntityMaps: expect.objectContaining({
            flatViewFieldMaps:
              args.pinnedSnapshot.allFlatEntityMaps.flatViewFieldMaps,
          }),
        }),
      }),
    );
    expect(
      args.upgradeTransaction.optimisticFlatEntityMaps?.flatViewFieldMaps,
    ).toEqual(args.pinnedSnapshot.allFlatEntityMaps.flatViewFieldMaps);
    expect(
      args.upgradeTransaction.optimisticFlatEntityMaps?.flatViewFieldMaps,
    ).not.toBe(args.pinnedSnapshot.allFlatEntityMaps.flatViewFieldMaps);
  });

  it('fails closed on a missing requested map without cache fallback', async () => {
    const args = makeArgs();
    (
      args.pinnedSnapshot.allFlatEntityMaps as unknown as Record<
        string,
        unknown
      >
    ).flatViewFieldMaps = undefined;
    await expect(service.run(args)).rejects.toThrow(
      'Pinned metadata snapshot missing flatViewFieldMaps',
    );
    expect(pooledMaps).not.toHaveBeenCalled();
    expect(pooledApplication).not.toHaveBeenCalled();
  });

  it('refuses a missing application without consulting pooled caches', async () => {
    const args = makeArgs();
    args.pinnedSnapshot.flatApplicationMaps.idByUniversalIdentifier[
      applicationUid
    ] = undefined as never;
    await expect(service.run(args)).rejects.toThrow(
      'Could not find application',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(pooledApplication).not.toHaveBeenCalled();
  });

  it('skips pooled DB diagnostics after pinned handler failure', async () => {
    const args = makeArgs();
    execute.mockRejectedValue(new Error('pinned action failed'));
    await expect(service.run(args)).rejects.toThrow('pinned action failed');
    expect(pooledDb).not.toHaveBeenCalled();
  });

  it('refuses mismatched runner before any pooled read', async () => {
    const args = makeArgs();
    args.pinnedSnapshot.queryRunner = {} as never;
    await expect(service.run(args)).rejects.toThrow('Pinned runner snapshot');
    expect(pooledMaps).not.toHaveBeenCalled();
    expect(pooledApplication).not.toHaveBeenCalled();
  });
});
