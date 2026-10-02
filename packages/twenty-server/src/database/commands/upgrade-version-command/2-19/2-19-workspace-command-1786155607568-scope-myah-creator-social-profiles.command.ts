import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const socialProfile = MYAH_STANDARD_OBJECTS.socialProfile;
const socialProfilesView = socialProfile.views.socialProfiles;

@RegisteredWorkspaceCommand('2.19.0', 1786155607568)
@Command({
  name: 'upgrade:2-19:scope-myah-creator-social-profiles',
  description: 'Scope existing Creator Social profiles widgets to their Creator',
})
export class ScopeMyahCreatorSocialProfilesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.dataSource === undefined) {
      return;
    }

    const { flatObjectMetadataMaps, flatViewMaps, flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
        'flatViewMaps',
        'flatFieldMetadataMaps',
      ]);

    if (
      flatObjectMetadataMaps.byUniversalIdentifier[
        socialProfile.universalIdentifier
      ] === undefined
    ) {
      return;
    }

    if (
      flatViewMaps.byUniversalIdentifier[
        socialProfilesView.universalIdentifier
      ] === undefined ||
      flatFieldMetadataMaps.byUniversalIdentifier[
        socialProfile.fields.creator.universalIdentifier
      ] === undefined
    ) {
      throw new Error('SocialProfile widget view or Creator relation is missing');
    }

    await this.synchronizer.synchronizeWorkspace(
      args,
      {
        viewFilter: new Set([
          socialProfilesView.viewFilters.creatorCurrentRecord
            .universalIdentifier,
        ]),
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  }
}
