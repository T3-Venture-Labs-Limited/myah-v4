import { Command } from 'nest-commander';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const campaignInstructionsView =
  MYAH_STANDARD_OBJECTS.campaign.views.vieweb4da94a;
const campaignInstructionsViewFieldUniversalIdentifiers = new Set(
  Object.values(campaignInstructionsView.viewFields).map(
    ({ universalIdentifier }) => universalIdentifier,
  ),
);

@RegisteredWorkspaceCommand('2.19.0', 1785497244000)
@Command({
  name: 'upgrade:2-19:synchronize-myah-campaign-instructions-metadata',
  description:
    'Synchronize source-controlled Myah Campaign Instructions metadata for existing workspaces',
})
export class SynchronizeMyahCampaignInstructionsMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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

    await this.synchronizeSourceControlledMyahMetadataService.synchronizeWorkspace(
      args,
      {
        fieldMetadata: new Set([
          MYAH_STANDARD_OBJECTS.campaign.fields.campaignBrief.universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.fields.communicationGuidelines
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.fields.replyRules.universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.fields.escalationBoundaries
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.fields.additionalNotes.universalIdentifier,
        ]),
        view: new Set([campaignInstructionsView.universalIdentifier]),
        viewField: campaignInstructionsViewFieldUniversalIdentifiers,
      },
    );
  }
}
