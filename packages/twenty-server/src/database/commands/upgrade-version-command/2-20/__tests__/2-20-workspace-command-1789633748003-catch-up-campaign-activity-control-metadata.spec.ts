import { CatchUpCampaignActivityControlMetadataWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748003-catch-up-campaign-activity-control-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

describe('CatchUpCampaignActivityControlMetadataWorkspaceCommand', () => {
  it('runs the repaired synchronizer under a newer durable identity', async () => {
    const runOnWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new CatchUpCampaignActivityControlMetadataWorkspaceCommand(
      {} as never,
      { runOnWorkspace } as never,
    );
    const args = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      options: {},
    } as never;

    await command.runOnWorkspace(args);

    expect(runOnWorkspace).toHaveBeenCalledWith(args);
    expect(getRegisteredWorkspaceCommandMetadata(command.constructor)).toEqual({
      version: '2.20.0',
      timestamp: 1789633748003,
    });
  });
});
