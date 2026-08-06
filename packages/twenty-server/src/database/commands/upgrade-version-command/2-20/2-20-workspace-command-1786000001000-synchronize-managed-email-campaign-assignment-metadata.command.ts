import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.20.0', 1786000001000)
@Command({
  name: 'upgrade:2-20:synchronize-managed-email-campaign-assignment-metadata',
  description:
    'Synchronize managed email Campaign Creator assignment metadata for existing workspaces',
})
export class SynchronizeManagedEmailCampaignAssignmentMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    return this.synchronizeMyahStandardMetadataCommand.synchronizeWorkspace(
      args,
      {
        migrateLegacyMyahApplication: false,
        targetObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
        ]),
      },
    );
  }
}
