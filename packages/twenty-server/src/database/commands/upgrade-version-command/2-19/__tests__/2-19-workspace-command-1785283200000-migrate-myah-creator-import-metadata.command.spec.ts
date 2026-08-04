import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import type { DataSource } from 'typeorm';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { MigrateMyahCreatorImportMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785283200000-migrate-myah-creator-import-metadata.command';
import type { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import type { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const workspaceDataSource = {} as DataSource;
const args = {
  workspaceId: WORKSPACE_ID,
  dataSource: workspaceDataSource,
  options: { dryRun: false },
  index: 0,
  total: 1,
} as RunOnWorkspaceArgs;

const expectedCreatorImportSyncOptions = {
  targetObjectUniversalIdentifiers: new Set([
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
  ]),
  migrateLegacyMyahApplication: false,
};

describe('MigrateMyahCreatorImportMetadataCommand', () => {
  it('creates and verifies Creator import metadata before limited view-field cleanup', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const migrate = jest
      .fn()
      .mockResolvedValue({ canDeleteOldFields: true });
    const command = new MigrateMyahCreatorImportMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeMyahStandardMetadataCommand,
      { migrate } as unknown as MigrateMyahCreatorSocialLinksService,
    );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
    expect(synchronizeWorkspace.mock.calls[0]).toEqual([
      args,
      expectedCreatorImportSyncOptions,
    ]);
    expect(migrate).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      workspaceDataSource,
      dryRun: false,
    });
    expect(synchronizeWorkspace.mock.calls[1]).toEqual([
      args,
      {
        ...expectedCreatorImportSyncOptions,
        explicitObsoleteUniversalIdentifiersByMetadataName: {
          viewField: expect.any(Set),
        },
      },
    ]);
    expect(synchronizeWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      migrate.mock.invocationCallOrder[0],
    );
    expect(migrate.mock.invocationCallOrder[0]).toBeLessThan(
      synchronizeWorkspace.mock.invocationCallOrder[1],
    );
  });

  it('does not remove old metadata during dry-run', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const migrate = jest
      .fn()
      .mockResolvedValue({ canDeleteOldFields: true });
    const command = new MigrateMyahCreatorImportMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeMyahStandardMetadataCommand,
      { migrate } as unknown as MigrateMyahCreatorSocialLinksService,
    );

    await command.runOnWorkspace({
      ...args,
      options: { dryRun: true },
    });

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(synchronizeWorkspace.mock.calls[0][1]).toEqual(
      expectedCreatorImportSyncOptions,
    );
    expect(migrate).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('fails before cleanup when social-link verification rejects deletion', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const migrate = jest
      .fn()
      .mockResolvedValue({ canDeleteOldFields: false });
    const command = new MigrateMyahCreatorImportMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeMyahStandardMetadataCommand,
      { migrate } as unknown as MigrateMyahCreatorSocialLinksService,
    );

    await expect(command.runOnWorkspace(args)).rejects.toThrow(
      'Creator social link migration verification failed',
    );

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
  });

  it('skips workspaces without a workspace schema', async () => {
    const synchronizeWorkspace = jest.fn();
    const migrate = jest.fn();
    const command = new MigrateMyahCreatorImportMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeMyahStandardMetadataCommand,
      {
        migrate,
      } as unknown as MigrateMyahCreatorSocialLinksService,
    );

    await expect(
      command.runOnWorkspace({ ...args, dataSource: undefined }),
    ).resolves.toBeUndefined();

    expect(synchronizeWorkspace).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it('registers the forward-only migration in the current version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        MigrateMyahCreatorImportMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.19.0',
      timestamp: 1785283200000,
    });
  });
});
