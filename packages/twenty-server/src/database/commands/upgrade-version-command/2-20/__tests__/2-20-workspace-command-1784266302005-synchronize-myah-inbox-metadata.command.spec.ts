import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { SynchronizeMyahInboxMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302005-synchronize-myah-inbox-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: true },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahInboxMetadataCommand', () => {
  it('delegates unchanged workspace runs to the standard Myah metadata synchronizer exactly once', async () => {
    const runOnWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahInboxMetadataCommand(
      {} as WorkspaceIteratorService,
      { runOnWorkspace } as unknown as SynchronizeMyahStandardMetadataCommand,
    );

    await command.runOnWorkspace(args);

    expect(runOnWorkspace).toHaveBeenCalledTimes(1);
    expect(runOnWorkspace).toHaveBeenCalledWith(args);
  });

  it('registers the forward-only Inbox synchronization command once at timestamp 1784266302005', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahInboxMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.20.0',
      timestamp: 1784266302005,
    });
  });
});
