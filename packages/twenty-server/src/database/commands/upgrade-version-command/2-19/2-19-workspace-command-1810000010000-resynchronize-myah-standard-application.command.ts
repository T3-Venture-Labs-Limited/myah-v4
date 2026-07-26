import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';

@RegisteredWorkspaceCommand('2.19.0', 1810000010000)
@Command({
  name: 'upgrade:2-19:resynchronize-myah-standard-application',
  description:
    'Resynchronize canonical Myah standard metadata for existing workspaces',
})
export class ResynchronizeMyahStandardApplicationCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly twentyStandardApplicationService: TwentyStandardApplicationService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun === true) {
      this.logger.log(
        `[DRY RUN] Would resynchronize Myah standard metadata for workspace ${workspaceId}`,
      );

      return;
    }

    await this.twentyStandardApplicationService.synchronizeTwentyStandardApplicationOrThrow(
      { workspaceId, profile: 'myah' },
    );
  }
}
