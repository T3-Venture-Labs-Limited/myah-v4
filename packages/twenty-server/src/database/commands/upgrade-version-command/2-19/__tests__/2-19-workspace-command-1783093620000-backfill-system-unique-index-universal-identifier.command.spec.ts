import type { QueryRunner } from 'typeorm';

import { BackfillSystemUniqueIndexUniversalIdentifierCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1783093620000-backfill-system-unique-index-universal-identifier.command';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const objectUniversalIdentifier = '20202020-0000-4000-8000-000000000002';
const applicationUniversalIdentifier = '20202020-0000-4000-8000-000000000003';
const fixture = {
  flatObjectMetadataMaps: {
    universalIdentifierById: { object: objectUniversalIdentifier },
    byUniversalIdentifier: {
      [objectUniversalIdentifier]: {
        id: 'object',
        universalIdentifier: objectUniversalIdentifier,
      },
    },
  },
  flatFieldMetadataMaps: {
    byUniversalIdentifier: {
      field: {
        id: 'field',
        objectMetadataId: 'object',
        applicationId: 'app',
        isUnique: true,
        type: 'TEXT',
        name: 'name',
      },
    },
  },
  flatIndexMaps: {
    byUniversalIdentifier: {
      index: {
        id: 'index',
        name: 'IDX_CREATOR_NAME',
        universalIdentifier: 'old-index',
        isSystemSideEffect: true,
        isUnique: true,
        flatIndexFieldMetadatas: [{ fieldMetadataId: 'field' }],
      },
    },
  },
  flatApplicationMaps: {
    byId: { app: { universalIdentifier: applicationUniversalIdentifier } },
  },
};

const harness = () => {
  const update = jest.fn(async () => undefined);
  const flush = jest.fn(async () => undefined);
  const incrementMetadataVersion = jest.fn(async () => undefined);
  const publishCommittedMetadataVersion = jest.fn(async () => undefined);
  const pooledUpdate = jest.fn(() => {
    throw new Error('pooled index write forbidden');
  });
  const command = new BackfillSystemUniqueIndexUniversalIdentifierCommand(
    {} as never,
    { getOrRecompute: jest.fn(async () => fixture), flush } as never,
    { incrementMetadataVersion, publishCommittedMetadataVersion } as never,
    { update: pooledUpdate } as never,
  );
  let active = false;
  const queryRunner = {
    get isTransactionActive() {
      return active;
    },
    isReleased: false,
    manager: { getRepository: () => ({ update }) },
    startTransaction: jest.fn(async () => {
      active = true;
    }),
    commitTransaction: jest.fn(async () => {
      active = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      active = false;
    }),
  } as unknown as QueryRunner;
  const recordUpgradeMigration = jest.fn(async () => undefined);
  const runner = new WorkspaceCommandRunnerService(
    { get: () => 'test' } as never,
    { recordUpgradeMigration } as never,
    {
      invalidateInstanceAndAllWorkspacesStatus: jest.fn(async () => undefined),
    } as never,
    { currentRunner: () => queryRunner } as never,
  );
  const run = () =>
    runner.runWorkspaceCommands({
      iteratorContext: { workspaceId, index: 0, total: 1 },
      options: {},
      workspaceCommands: [{ name: 'index-backfill', command }],
    });
  return {
    run,
    queryRunner,
    update,
    flush,
    incrementMetadataVersion,
    publishCommittedMetadataVersion,
    pooledUpdate,
    recordUpgradeMigration,
    command,
  };
};

describe('pinned system unique index backfill', () => {
  it('updates index/version and receipt on one runner before publishing cache', async () => {
    const h = harness();
    await h.run();
    expect(h.pooledUpdate).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith(
      { id: 'index', workspaceId },
      { universalIdentifier: expect.not.stringMatching(/^old-index$/) },
    );
    expect(h.incrementMetadataVersion).toHaveBeenCalledWith(workspaceId, {
      queryRunner: h.queryRunner,
      afterCommit: expect.any(Function),
    });
    expect(h.recordUpgradeMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        workspaceIds: [workspaceId],
        queryRunner: h.queryRunner,
      }),
    );
    expect(
      jest.mocked(h.queryRunner.commitTransaction).mock.invocationCallOrder[0],
    ).toBeLessThan(h.flush.mock.invocationCallOrder[0]);
    expect(h.flush).toHaveBeenCalledTimes(1);
  });

  it('heals a committed receipt after the Redis flush throws before version publication', async () => {
    const h = harness();
    h.flush.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(h.run()).rejects.toThrow('Redis unavailable');
    expect(h.recordUpgradeMigration).toHaveBeenCalledTimes(1);
    expect(h.recordUpgradeMigration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    expect(h.publishCommittedMetadataVersion).not.toHaveBeenCalled();
    await h.command.reconcileCommittedUpgrade(workspaceId);
    expect(h.flush).toHaveBeenCalledTimes(2);
    expect(h.publishCommittedMetadataVersion).toHaveBeenCalledWith(workspaceId);
    expect(h.flush.mock.invocationCallOrder[1]).toBeLessThan(
      h.publishCommittedMetadataVersion.mock.invocationCallOrder[0],
    );
    expect(h.recordUpgradeMigration).toHaveBeenCalledTimes(1);
  });

  it('does not flush on precommit failure, and rolls back before its short failure receipt', async () => {
    const h = harness();
    h.recordUpgradeMigration.mockRejectedValueOnce(new Error('receipt failed'));
    await expect(h.run()).rejects.toThrow('receipt failed');
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.flush).not.toHaveBeenCalled();
    expect(h.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(h.recordUpgradeMigration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', queryRunner: h.queryRunner }),
    );
  });

  it('does not flush or fabricate failure when COMMIT response is uncertain', async () => {
    const h = harness();
    jest
      .mocked(h.queryRunner.commitTransaction)
      .mockRejectedValueOnce(new Error('commit response lost'));
    await expect(h.run()).rejects.toThrow('commit response lost');
    expect(h.flush).not.toHaveBeenCalled();
    expect(h.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(h.recordUpgradeMigration).toHaveBeenCalledTimes(1);
    expect(h.recordUpgradeMigration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    // A new locked process may discover the durable receipt and republish.
    await h.command.reconcileCommittedUpgrade(workspaceId);
    expect(h.flush).toHaveBeenCalledTimes(1);
    expect(h.publishCommittedMetadataVersion).toHaveBeenCalledWith(workspaceId);
    expect(h.recordUpgradeMigration).toHaveBeenCalledTimes(1);
  });

  it('retains native dry-run with no index/version/cache write', async () => {
    const h = harness();
    await h.command.runOnWorkspace({
      workspaceId,
      options: { dryRun: true },
      index: 0,
      total: 1,
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.pooledUpdate).not.toHaveBeenCalled();
    expect(h.flush).not.toHaveBeenCalled();
    expect(h.incrementMetadataVersion).not.toHaveBeenCalled();
  });
});
