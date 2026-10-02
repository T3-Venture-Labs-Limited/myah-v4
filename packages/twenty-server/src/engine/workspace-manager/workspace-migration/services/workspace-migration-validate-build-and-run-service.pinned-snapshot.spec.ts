import { WorkspaceMigrationValidateBuildAndRunService } from './workspace-migration-validate-build-and-run-service';
import type { PinnedWorkspaceMetadataSnapshot } from 'src/engine/workspace-manager/workspace-migration/types/pinned-workspace-metadata-snapshot.type';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

const workspaceId = '20202020-0000-4000-8000-000000000001';

describe('FromTo pinned snapshot boundary', () => {
  const build = jest.fn();
  const run = jest.fn();
  const emitAsync = jest.fn();
  const service = new WorkspaceMigrationValidateBuildAndRunService(
    { run } as never,
    { buildWorkspaceMigration: build } as never,
    {} as never,
    {
      emitMetadataEvents: jest.fn(),
      emitMetadataEventsAsync: emitAsync,
    } as never,
    {} as never,
    { perf: jest.fn(), error: jest.fn() } as never,
    { get: () => [] } as never,
  );
  const makeArgs = () => {
    const manager = { queryRunner: null as unknown };
    const runner = { isTransactionActive: true, isReleased: false, manager };
    manager.queryRunner = runner;
    const tx = {
      queryRunner: runner,
      afterCommit: jest.fn(),
    } as unknown as UpgradeWorkspaceTransaction;
    const snapshot = {
      workspaceId,
      workspace: { id: workspaceId },
      queryRunner: runner,
      featureFlagsMap: { MYAH_TEST: false },
    } as unknown as PinnedWorkspaceMetadataSnapshot;
    return {
      workspaceId,
      buildOptions: {
        applicationUniversalIdentifier: workspaceId,
        isSystemBuild: false,
      },
      fromToAllFlatEntityMaps: {} as never,
      dependencyAllFlatEntityMaps: {} as never,
      additionalCacheDataMaps: {} as never,
      pinnedSnapshot: snapshot,
      upgradeTransaction: tx,
    };
  };
  beforeEach(() => {
    build.mockReset();
    run.mockReset();
    emitAsync.mockReset();
  });

  it.each([
    'workspace',
    'runner',
    'inactive',
    'released',
    'manager',
    'callback',
  ])(
    'rejects mismatched %s before builder even for dry-run/no-action paths',
    async (kind) => {
      const args = makeArgs();
      if (kind === 'workspace') args.pinnedSnapshot.workspaceId = 'different';
      if (kind === 'runner') args.pinnedSnapshot.queryRunner = {} as never;
      const mutableRunner = args.upgradeTransaction.queryRunner as unknown as {
        isTransactionActive: boolean;
        isReleased: boolean;
      };
      if (kind === 'inactive') mutableRunner.isTransactionActive = false;
      if (kind === 'released') mutableRunner.isReleased = true;
      if (kind === 'manager')
        (
          args.upgradeTransaction.queryRunner.manager as {
            queryRunner?: unknown;
          }
        ).queryRunner = {};
      if (kind === 'callback')
        (args.upgradeTransaction as { afterCommit?: unknown }).afterCommit =
          undefined;
      await expect(
        service.validateBuildAndRunWorkspaceMigrationFromTo({
          ...args,
          dryRun: true,
        }),
      ).rejects.toThrow('Pinned migration snapshot');
      expect(build).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('forwards flags to builder without leaking snapshot into build args, and preserves no-action return', async () => {
    const args = makeArgs();
    build.mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: workspaceId,
        actions: [],
      },
    });
    await expect(
      service.validateBuildAndRunWorkspaceMigrationFromTo(args),
    ).resolves.toMatchObject({ status: 'success' });
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalCacheDataMaps: { featureFlagsMap: { MYAH_TEST: false } },
      }),
    );
    expect(build.mock.calls[0][0].pinnedSnapshot).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects a disallowed pinned action before the native runner writes', async () => {
    const args = makeArgs();
    const action = {
      type: 'delete',
      metadataName: 'viewField',
      universalIdentifier: workspaceId,
    };
    build.mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: workspaceId,
        actions: [action],
      },
    });
    const assertBeforeRun = jest.fn(() => {
      throw new Error('disallowed pinned action');
    });

    await expect(
      service.validateBuildAndRunWorkspaceMigrationFromTo({
        ...args,
        assertBeforeRun,
      }),
    ).rejects.toThrow('disallowed pinned action');
    expect(assertBeforeRun).toHaveBeenCalledWith(
      expect.objectContaining({ actions: [action] }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('waits for pinned metadata listeners after commit and surfaces their failure', async () => {
    const args = makeArgs();
    build.mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: workspaceId,
        actions: [
          {
            type: 'update',
            metadataName: 'fieldMetadata',
            universalIdentifier: workspaceId,
          },
        ],
      },
    });
    run.mockResolvedValue({
      hasSchemaMetadataChanged: false,
      metadataEvents: [{ metadataName: 'fieldMetadata', type: 'updated' }],
    });
    emitAsync.mockRejectedValue(new Error('listener delivery failed'));

    await service.validateBuildAndRunWorkspaceMigrationFromTo(args);
    expect(args.upgradeTransaction.afterCommit).toHaveBeenCalledTimes(1);
    const postCommit = (args.upgradeTransaction.afterCommit as jest.Mock).mock
      .calls[0][0];
    await expect(postCommit()).rejects.toThrow('listener delivery failed');
    expect(emitAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        metadataEvents: [{ metadataName: 'fieldMetadata', type: 'updated' }],
      }),
    );
  });

  it('forwards exact snapshot and transaction to native runner when there is an action', async () => {
    const args = makeArgs();
    build.mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: workspaceId,
        actions: [
          {
            type: 'delete',
            metadataName: 'viewField',
            universalIdentifier: workspaceId,
          },
        ],
      },
    });
    run.mockResolvedValue({
      hasSchemaMetadataChanged: false,
      metadataEvents: [],
    });
    await service.validateBuildAndRunWorkspaceMigrationFromTo(args);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedSnapshot: args.pinnedSnapshot,
        upgradeTransaction: args.upgradeTransaction,
      }),
    );
  });
});
