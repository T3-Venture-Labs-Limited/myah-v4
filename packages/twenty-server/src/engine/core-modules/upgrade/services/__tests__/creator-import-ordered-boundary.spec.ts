import type { QueryRunner } from 'typeorm';

import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { MigrateMyahCreatorImportMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785283200000-migrate-myah-creator-import-metadata.command';
import type { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import type { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import type { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import type { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import type { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';

const workspaceId = '20202020-0000-0000-0000-000000000001';
const metadata = getRegisteredWorkspaceCommandMetadata(
  MigrateMyahCreatorImportMetadataCommand,
)!;
const name = `${metadata.version}_${MigrateMyahCreatorImportMetadataCommand.name}_${metadata.timestamp}`;

const setup = () => {
  const operations: string[] = [];
  const synchronizeWorkspace = jest.fn(async () => {
    operations.push('synchronize');
  });
  const migrate = jest.fn(async () => {
    operations.push('social-links');
    return { canDeleteOldFields: true };
  });
  const workspaceQuery = jest.fn();
  const dataSource = { query: workspaceQuery } as unknown as NonNullable<
    RunOnWorkspaceArgs['dataSource']
  >;
  const command = new MigrateMyahCreatorImportMetadataCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeMyahStandardMetadataCommand,
    { migrate } as unknown as MigrateMyahCreatorSocialLinksService,
  );
  const args: RunOnWorkspaceArgs = {
    workspaceId,
    options: {},
    dataSource,
    index: 0,
    total: 1,
  };

  return {
    command,
    args,
    synchronizeWorkspace,
    migrate,
    workspaceQuery,
    operations,
  };
};

describe('registered Creator import transaction boundary', () => {
  it('fails before either real nested writer on the ordered path, even when the workspace datasource exists', async () => {
    const { command, args, synchronizeWorkspace, migrate, workspaceQuery } =
      setup();
    const recorded = jest.fn();
    const pinned = {
      isTransactionActive: false,
      isReleased: false,
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
    } as unknown as QueryRunner;
    const runner = new WorkspaceCommandRunnerService(
      { get: () => '2.19.0' } as unknown as TwentyConfigService,
      {
        recordUpgradeMigration: recorded,
      } as unknown as UpgradeMigrationService,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
      } as unknown as UpgradeStatusService,
      { currentRunner: () => pinned } as UpgradeWriteLockService,
    );

    expect(name).toContain('1785283200000');
    await expect(
      runner.runWorkspaceCommands({
        iteratorContext: args,
        options: {},
        workspaceCommands: [{ name, command }],
      }),
    ).rejects.toThrow(
      `${name} is not adapted to the pinned upgrade transaction`,
    );

    expect(synchronizeWorkspace).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(workspaceQuery).not.toHaveBeenCalled();
    expect(pinned.startTransaction).toHaveBeenCalledTimes(1); // failed receipt only
    expect(recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        name,
        status: 'failed',
        workspaceIds: [workspaceId],
        queryRunner: pinned,
      }),
    );
    expect(recorded).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('retains direct CLI ordering: sync, copy/verify, then obsolete-field sync', async () => {
    const { command, args, synchronizeWorkspace, migrate, operations } =
      setup();
    await command.runOnWorkspace(args);
    expect(operations).toEqual(['synchronize', 'social-links', 'synchronize']);
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
    expect(migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        workspaceDataSource: args.dataSource,
        dryRun: false,
      }),
    );
  });

  it('retains direct dry-run behavior without the destructive second synchronization', async () => {
    const { command, args, synchronizeWorkspace, migrate, operations } =
      setup();
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(operations).toEqual(['synchronize', 'social-links']);
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });
});
