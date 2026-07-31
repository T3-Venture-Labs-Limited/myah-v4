import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignAutomationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785240016001-synchronize-myah-campaign-automation-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahCampaignAutomationMetadataCommand', () => {
  it('uses the existing Myah metadata synchronizer for the active release line', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignAutomationMetadataCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as never,
    );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args);
  });

  it('registers after the current 2.19 workspace command', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignAutomationMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.19.0',
      timestamp: 1785240016001,
    });
  });
});
