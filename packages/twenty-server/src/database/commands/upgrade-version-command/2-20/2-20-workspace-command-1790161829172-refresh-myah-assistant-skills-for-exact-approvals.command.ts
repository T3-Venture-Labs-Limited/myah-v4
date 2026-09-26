import { Command } from 'nest-commander';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SynchronizeMyahAssistantSkillsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type FlatSkill } from 'src/engine/metadata-modules/flat-skill/types/flat-skill.type';
import { internalWriteApproval } from 'src/engine/workspace-manager/twenty-standard-application/utils/skill-metadata/myah-standard-skill-builders.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const previousInternalWriteApproval =
  'Call request_approval immediately before every internal/generated write in its own step; after approval, execute exactly that one write and read back its returned state. Never authorize or describe more than one write tool call in the same approval.';

const approvalSkillNames = new Set([
  'myah-inbox',
  'myah-creators',
  'myah-creator-lists',
  'myah-campaigns',
]);

@RegisteredWorkspaceCommand('2.20.0', 1790161829172)
@Command({
  name: 'upgrade:2-20:refresh-myah-assistant-skills-for-exact-approvals',
  description:
    'Refresh source-controlled Myah assistant skills with exact-argument approval guidance',
})
export class RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand extends SynchronizeMyahAssistantSkillsCommand {
  protected override readonly createMissingSkills = false;

  protected override buildSkillUpdate(
    existingSkill: FlatSkill,
    standardSkill: FlatSkill,
  ): FlatSkill | undefined {
    if (
      !approvalSkillNames.has(standardSkill.name) ||
      !existingSkill.content.includes(previousInternalWriteApproval)
    ) {
      return undefined;
    }

    return {
      ...existingSkill,
      content: existingSkill.content
        .split(previousInternalWriteApproval)
        .join(internalWriteApproval),
    };
  }

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
