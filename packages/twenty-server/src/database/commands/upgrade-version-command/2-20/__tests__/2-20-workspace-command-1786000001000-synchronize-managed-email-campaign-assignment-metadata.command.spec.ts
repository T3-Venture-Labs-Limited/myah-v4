import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { SynchronizeManagedEmailCampaignAssignmentMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786000001000-synchronize-managed-email-campaign-assignment-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: true },
  index: 0,
  total: 1,
};

describe('SynchronizeManagedEmailCampaignAssignmentMetadataCommand', () => {
  it('synchronizes only Campaign Creator metadata without legacy migration', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command =
      new SynchronizeManagedEmailCampaignAssignmentMetadataCommand(
        {} as WorkspaceIteratorService,
        {
          synchronizeWorkspace,
        } as unknown as SynchronizeMyahStandardMetadataCommand,
      );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      migrateLegacyMyahApplication: false,
      targetObjectUniversalIdentifiers: new Set([
        MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      ]),
    });
  });

  it('registers after the managed email persistence migrations', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeManagedEmailCampaignAssignmentMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.20.0',
      timestamp: 1786000001000,
    });
  });
});
