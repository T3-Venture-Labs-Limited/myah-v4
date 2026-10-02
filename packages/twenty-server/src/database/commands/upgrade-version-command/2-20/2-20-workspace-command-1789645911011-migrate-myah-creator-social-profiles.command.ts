import { Injectable } from '@nestjs/common';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { MigrateMyahCreatorSocialProfilesService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-profiles.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';

@RegisteredWorkspaceCommand('2.20.0', 1789645911011)
@Injectable()
export class MigrateMyahCreatorSocialProfilesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly migrationService: MigrateMyahCreatorSocialProfilesService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource) {
      this.logger.log(
        `MYAH-409 Creator migration skipped workspace=${args.workspaceId} reason=no-data-source`,
      );
      return;
    }

    const report = await this.migrationService.migrate({
      workspaceId: args.workspaceId,
      workspaceDataSource: args.dataSource,
      dryRun: args.options.dryRun ?? false,
    });

    if (
      !args.options.dryRun &&
      (report.conflicts > 0 ||
        report.skippedRestrictedValues > 0 ||
        report.failures > 0 ||
        report.reconciliationMismatches > 0)
    ) {
      throw new Error(
        `MYAH-409 Creator migration requires repair: ${JSON.stringify(report)}`,
      );
    }
  }
}
