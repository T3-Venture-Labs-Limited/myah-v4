import { Command } from 'nest-commander';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SynchronizeMyahAssistantSkillsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

@RegisteredWorkspaceCommand('2.20.0', 1789645911006)
@Command({
  name: 'upgrade:2-20:refresh-myah-assistant-skills',
  description:
    'Refresh source-controlled Myah assistant skills for existing workspaces',
})
export class RefreshMyahAssistantSkillsWorkspaceCommand extends SynchronizeMyahAssistantSkillsCommand {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    applicationService: ApplicationService,
    workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    workspaceCacheService: WorkspaceCacheService,
  ) {
    super(
      workspaceIteratorService,
      applicationService,
      workspaceMigrationValidateBuildAndRunService,
      workspaceCacheService,
    );
  }
}
