import { Command } from 'nest-commander';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const campaignPageLayoutTabs = Object.values(
  MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs,
);
const campaignPageLayoutWidgets = new Set(
  campaignPageLayoutTabs.flatMap(({ widgets }) =>
    Object.values(widgets).map(({ universalIdentifier }) => universalIdentifier),
  ),
);
const campaignViews = [
  MYAH_STANDARD_OBJECTS.campaign.views.view6bfee1b9,
  MYAH_STANDARD_OBJECTS.campaign.views.vieweb4da94a,
  MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5,
];
const campaignViewFieldUniversalIdentifiers = new Set(
  campaignViews.flatMap(({ viewFields }) =>
    Object.values(viewFields).map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  ),
);

@RegisteredWorkspaceCommand('2.19.0', 1785839371449)
@Command({
  name: 'upgrade:2-19:synchronize-myah-campaign-page-layout',
  description:
    'Transfer the Campaign page layout to source-controlled standard metadata',
})
export class SynchronizeMyahCampaignPageLayoutCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeSourceControlledMyahMetadataService: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.dataSource === undefined) {
      return;
    }

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

    const campaignChildSelection = {
      pageLayoutTab: new Set(
        campaignPageLayoutTabs.map(({ universalIdentifier }) =>
          universalIdentifier,
        ),
      ),
      pageLayoutWidget: campaignPageLayoutWidgets,
      view: new Set(
        campaignViews.map(({ universalIdentifier }) => universalIdentifier),
      ),
      viewField: campaignViewFieldUniversalIdentifiers,
    };

    await this.synchronizeSourceControlledMyahMetadataService.synchronizeWorkspace(
      args,
      {
        pageLayout: new Set([
          MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        ...campaignChildSelection,
      },
    );

    await this.synchronizeSourceControlledMyahMetadataService.synchronizeWorkspace(
      args,
      {
        pageLayout: new Set([
          MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        ...campaignChildSelection,
      },
      {
        synchronizeExistingSelectedMetadata: true,
        deletionSelection: {
          pageLayoutWidget: new Set([
            '368b8c66-435d-4e5b-94b8-4d3f08fc283b',
          ]),
        },
      },
    );
  }
}
