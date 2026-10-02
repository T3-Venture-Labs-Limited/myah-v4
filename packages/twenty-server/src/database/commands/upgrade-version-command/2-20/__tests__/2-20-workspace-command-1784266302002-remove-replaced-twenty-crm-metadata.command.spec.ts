import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RemoveReplacedTwentyCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302002-remove-replaced-twenty-crm-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';

describe('RemoveReplacedTwentyCrmMetadataCommand', () => {
  it('preserves its registered identity while building no deletion plan', async () => {
    const command = new RemoveReplacedTwentyCrmMetadataCommand(
      {} as WorkspaceIteratorService,
    );
    const log = jest.spyOn(command['logger'], 'log').mockImplementation();

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun: false },
      index: 0,
      total: 1,
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('preserves the historical CRM/dashboard closure'),
    );
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RemoveReplacedTwentyCrmMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1784266302002 });
  });
});
