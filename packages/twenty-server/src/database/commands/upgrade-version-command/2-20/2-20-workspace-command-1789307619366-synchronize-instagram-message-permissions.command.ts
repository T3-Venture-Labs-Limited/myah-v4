import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.20.0', 1789307619366)
@Command({
  name: 'upgrade:2-20:synchronize-instagram-message-permissions',
  description:
    'Synchronize default-false Instagram message permission metadata for existing workspaces',
})
export class SynchronizeInstagramMessagePermissionsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly standardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    return this.standardMetadataCommand.synchronizeWorkspace(args);
  }
}
