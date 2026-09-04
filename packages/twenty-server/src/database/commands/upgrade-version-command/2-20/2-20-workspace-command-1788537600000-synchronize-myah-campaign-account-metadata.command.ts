import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MYAH_CAMPAIGN_ACCOUNT_READ_ONLY_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIER } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@RegisteredWorkspaceCommand('2.20.0', 1788537600000)
@Command({
  name: 'upgrade:2-20:synchronize-myah-campaign-account-metadata',
  description:
    'Synchronize Campaign account metadata for existing workspaces',
})
export class SynchronizeMyahCampaignAccountMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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
      objectMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.universalIdentifier,
      ]),
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.campaignAccounts
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.outreachAction.fields.campaignAccountId
          .universalIdentifier,
      ]),
      index: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.indexes.campaignAccountUniqueIndex
          .universalIdentifier,
      ]),
      objectPermission: new Set([
        MYAH_CAMPAIGN_ACCOUNT_READ_ONLY_OBJECT_PERMISSION_UNIVERSAL_IDENTIFIER,
      ]),
    });
  }
}
