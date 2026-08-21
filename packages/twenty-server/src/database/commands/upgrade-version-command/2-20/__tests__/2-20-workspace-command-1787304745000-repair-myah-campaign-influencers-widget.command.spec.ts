import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RepairMyahCampaignInfluencersWidgetCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787304745000-repair-myah-campaign-influencers-widget.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const normalizeSelection = (selection: Record<string, Set<string>>) =>
  Object.fromEntries(
    Object.entries(selection).map(([type, universalIdentifiers]) => [
      type,
      [...universalIdentifiers].sort(),
    ]),
  );

const createCommand = ({
  campaignExists = true,
  synchronizeWorkspace = jest.fn().mockResolvedValue(undefined),
}: {
  campaignExists?: boolean;
  synchronizeWorkspace?: jest.Mock;
} = {}) => {
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignExists
        ? { [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {} }
        : {},
    },
  });

  return {
    command: new RepairMyahCampaignInfluencersWidgetCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as unknown as SynchronizeSourceControlledMyahMetadataService,
      { getOrRecompute } as unknown as WorkspaceCacheService,
    ),
    getOrRecompute,
    synchronizeWorkspace,
  };
};

describe('RepairMyahCampaignInfluencersWidgetCommand', () => {
  it('registers a new repair command in the active version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RepairMyahCampaignInfluencersWidgetCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1787304745000 });
  });

  it('synchronizes only the frozen Influencers metadata selection', async () => {
    const { command, synchronizeWorkspace } = createCommand();

    await command.runOnWorkspace({ ...args, dataSource: {} as never });

    expect(normalizeSelection(synchronizeWorkspace.mock.calls[0][1])).toEqual({
      view: [
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .universalIdentifier,
      ],
      viewField: [
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .viewFields.creator.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .viewFields.stage.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .viewFields.isDirectlyAdded.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .viewFields.campaignCreatorListSources.universalIdentifier,
      ].sort(),
      pageLayout: [MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.universalIdentifier],
      pageLayoutTab: [
        MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers
          .universalIdentifier,
      ],
      pageLayoutWidget: [
        MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers.widgets
          .influencers.universalIdentifier,
      ],
    });
    expect(synchronizeWorkspace.mock.calls[0][2]).toEqual({
      synchronizeExistingSelectedMetadata: true,
    });
  });

  it('does not synchronize when Campaign metadata is absent', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = createCommand({
      campaignExists: false,
    });

    await command.runOnWorkspace({ ...args, dataSource: {} as never });

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
