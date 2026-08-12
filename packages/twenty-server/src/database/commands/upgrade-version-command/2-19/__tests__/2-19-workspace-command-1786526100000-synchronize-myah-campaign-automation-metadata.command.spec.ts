import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignAutomationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786526100000-synchronize-myah-campaign-automation-metadata.command';
import { SynchronizeMyahCreatorListPageLayoutCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786155607567-synchronize-myah-creator-list-page-layout.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahCampaignAutomationMetadataCommand', () => {
  it('replaces obsolete Campaign Automation metadata', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignAutomationMetadataCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as never,
    );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      explicitObsoleteUniversalIdentifiersByMetadataName: {
        fieldMetadata: new Set([
          'f173bd4d-0e7e-410b-876e-7c2dcf768a99',
          '0a178c94-60ff-48e0-9982-64318f6ca3fa',
          'a58a03e6-4c1d-4b0c-b40f-f3a78f6b6c16',
        ]),
        viewField: new Set(['9ecf92f8-6702-49bb-a25f-1d6e4ade47d8']),
        viewFilter: new Set(['e505cfd8-a195-4b9a-997c-6c8208394a37']),
        pageLayoutWidget: new Set([
          '0c878749-e445-4309-b799-26c2294e48ee',
        ]),
      },
    });
  });

  it('registers after the latest current 2.19 workspace command', () => {
    const commandMetadata = getRegisteredWorkspaceCommandMetadata(
      SynchronizeMyahCampaignAutomationMetadataCommand,
    );
    const latestCurrentCommandMetadata = getRegisteredWorkspaceCommandMetadata(
      SynchronizeMyahCreatorListPageLayoutCommand,
    );

    if (
      commandMetadata === undefined ||
      latestCurrentCommandMetadata === undefined
    ) {
      throw new Error('Workspace command registration is required');
    }

    expect(commandMetadata).toMatchObject({
      version: '2.19.0',
      timestamp: 1786526100000,
    });
    expect(commandMetadata.timestamp).toBeGreaterThan(
      latestCurrentCommandMetadata.timestamp,
    );
  });
});
