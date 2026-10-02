import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.20.0', 1784266302002)
@Command({
  name: 'upgrade:2-20:remove-replaced-twenty-crm-metadata',
  description:
    'Preserve replaced Company, Person, and Opportunity metadata pending task 7.1 retirement',
})
export class RemoveReplacedTwentyCrmMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({ workspaceId }: RunOnWorkspaceArgs): Promise<void> {
    this.logger.log(
      `Skipping replaced Twenty CRM metadata removal for workspace ${workspaceId}: task 5 preserves the historical CRM/dashboard closure pending task 7.1`,
    );
  }
}
