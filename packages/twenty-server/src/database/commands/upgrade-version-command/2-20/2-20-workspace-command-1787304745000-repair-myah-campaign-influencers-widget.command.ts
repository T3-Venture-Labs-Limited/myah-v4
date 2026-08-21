import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const campaignInfluencersView =
  MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers;

const campaignInfluencersViewFields = new Set([
  campaignInfluencersView.viewFields.creator.universalIdentifier,
  campaignInfluencersView.viewFields.stage.universalIdentifier,
  campaignInfluencersView.viewFields.isDirectlyAdded.universalIdentifier,
  campaignInfluencersView.viewFields.campaignCreatorListSources
    .universalIdentifier,
]);

@RegisteredWorkspaceCommand('2.20.0', 1787304745000)
@Command({
  name: 'upgrade:2-20:repair-myah-campaign-influencers-widget',
  description: 'Repair the Campaign Influencers table widget metadata',
})
export class RepairMyahCampaignInfluencersWidgetCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource) return;

    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    if (
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
      ] === undefined
    ) {
      return;
    }

    await this.synchronizer.synchronizeWorkspace(
      args,
      {
        view: new Set([campaignInfluencersView.universalIdentifier]),
        viewField: campaignInfluencersViewFields,
        pageLayout: new Set([
          MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        pageLayoutTab: new Set([
          MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers
            .universalIdentifier,
        ]),
        pageLayoutWidget: new Set([
          MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers.widgets
            .influencers.universalIdentifier,
        ]),
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  }
}
