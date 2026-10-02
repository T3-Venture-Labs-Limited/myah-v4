import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const { campaign, campaignCreator, campaignEmailConversationBinding: binding } =
  MYAH_STANDARD_OBJECTS;

const campaignControlFields = [
  campaign.fields.replyAgentEnabled,
  campaign.fields.replyAgentMode,
  campaign.fields.replyAgentRevision,
  campaign.fields.replyAgentEnabledAt,
  campaign.fields.replyAgentEnabledByUserWorkspaceId,
  campaign.fields.replyAgentChangedAt,
  campaign.fields.replyAgentChangedByWorkspaceMemberId,
];
const participationControlFields = [
  campaignCreator.fields.replyAgentPaused,
  campaignCreator.fields.replyAgentRevision,
  campaignCreator.fields.replyAgentMaterialGeneration,
  campaignCreator.fields.replyAgentPauseHistory,
  campaignCreator.fields.replyAgentChangedAt,
  campaignCreator.fields.replyAgentChangedByWorkspaceMemberId,
  campaignCreator.fields.emailConversationBindings,
];

// Dormant source only: MYAH-410 must verify late-command admission and genuine
// upgrade ordering before this class is added to the 2.20 command module.
@RegisteredWorkspaceCommand('2.20.0', 1790000000003)
@Command({
  name: 'upgrade:2-20:synchronize-campaign-reply-authority',
  description: 'Install dormant Campaign reply controls and exact Email binding metadata',
})
export class SynchronizeCampaignReplyAuthorityCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    // A successful return may become a durable upgrade receipt. Never claim a
    // legacy workspace was upgraded when its prerequisites are not present.
    if (!args.dataSource) {
      throw new Error('Campaign reply authority requires a workspace datasource');
    }

    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);
    if (
      !flatObjectMetadataMaps.byUniversalIdentifier[
        campaign.universalIdentifier
      ] ||
      !flatObjectMetadataMaps.byUniversalIdentifier[
        campaignCreator.universalIdentifier
      ]
    ) {
      throw new Error(
        'Campaign reply authority prerequisite Campaign/CampaignCreator metadata is absent',
      );
    }

    await this.synchronizer.synchronizeWorkspace(args, {
      objectMetadata: new Set([binding.universalIdentifier]),
      fieldMetadata: new Set([
        ...campaignControlFields.map(({ universalIdentifier }) => universalIdentifier),
        ...participationControlFields.map(({ universalIdentifier }) => universalIdentifier),
        ...Object.values(binding.fields).map(({ universalIdentifier }) => universalIdentifier),
      ]),
      index: new Set(
        Object.values(binding.indexes).map(({ universalIdentifier }) => universalIdentifier),
      ),
    });
  }
}
