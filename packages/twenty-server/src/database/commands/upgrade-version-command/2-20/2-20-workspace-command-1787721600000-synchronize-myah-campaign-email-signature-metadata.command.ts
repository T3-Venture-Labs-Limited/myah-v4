import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@RegisteredWorkspaceCommand('2.20.0', 1787721600000)
@Command({
  name: 'upgrade:2-20:synchronize-myah-campaign-email-signature-metadata',
  description: 'Synchronize Campaign Email signature metadata',
})
export class SynchronizeMyahCampaignEmailSignatureMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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

    await this.synchronizer.synchronizeWorkspace(args, {
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.emailSignature
          .universalIdentifier,
      ]),
      view: new Set([
        MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5.universalIdentifier,
      ]),
      viewField: new Set([
        MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5.viewFields
          .emailSignature.universalIdentifier,
      ]),
    });
  }
}
