import { Command } from 'nest-commander';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { ScopeMyahCreatorSocialProfilesCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786155607568-scope-myah-creator-social-profiles.command';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@RegisteredWorkspaceCommand('2.20.0', 1789645911012)
@Command({
  name: 'upgrade:2-20:scope-myah-creator-social-profiles',
  description:
    'Install the canonical Creator Social profiles widget filter on existing workspaces',
})
export class ScopeMyahCreatorSocialProfilesForwardCommand extends ScopeMyahCreatorSocialProfilesCommand {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    synchronizer: SynchronizeSourceControlledMyahMetadataService,
    workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService, synchronizer, workspaceCacheService);
  }
}
