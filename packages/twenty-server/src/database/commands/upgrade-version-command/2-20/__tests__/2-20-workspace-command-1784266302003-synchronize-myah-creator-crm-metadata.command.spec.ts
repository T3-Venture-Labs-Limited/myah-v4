import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { SynchronizeMyahCreatorCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302003-synchronize-myah-creator-crm-metadata.command';
import type { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: true },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahCreatorCrmMetadataCommand', () => {
  it('delegates unchanged workspace runs to the standard Myah metadata synchronizer', async () => {
    const runOnWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahCreatorCrmMetadataCommand(
      {} as WorkspaceIteratorService,
      { runOnWorkspace } as unknown as SynchronizeMyahStandardMetadataCommand,
    );

    await command.runOnWorkspace(args);

    expect(runOnWorkspace).toHaveBeenCalledTimes(1);
    expect(runOnWorkspace).toHaveBeenCalledWith(args);
  });

  it('registers the forward-only Creator CRM synchronization command', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCreatorCrmMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.20.0',
      timestamp: 1784266302003,
    });
  });
});
