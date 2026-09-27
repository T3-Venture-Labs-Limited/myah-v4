import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

@RegisteredWorkspaceCommand('2.20.0', 1790537642854)
@Command({
  name: 'upgrade:2-20:resynchronize-myah-campaign-layout',
  description: 'Resynchronize the standard Campaign layout and tabs',
})
export class ResynchronizeMyahCampaignLayoutCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource || args.options.dryRun) return;

    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);
    if (
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
      ] === undefined
    )
      return;

    await this.synchronizer.synchronizeWorkspace(
      args,
      {
        pageLayout: new Set([
          MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        pageLayoutTab: new Set(
          Object.values(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs).map(
            ({ universalIdentifier }) => universalIdentifier,
          ),
        ),
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  }
}
