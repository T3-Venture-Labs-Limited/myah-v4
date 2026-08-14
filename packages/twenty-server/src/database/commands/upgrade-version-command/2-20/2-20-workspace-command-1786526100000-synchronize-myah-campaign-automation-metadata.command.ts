import { Command } from 'nest-commander';

import { SystemPermissionFlag } from 'twenty-shared/constants';
import { MYAH_STANDARD_OBJECTS, STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { fromPermissionFlagToUniversalFlatRolePermissionFlag } from 'src/engine/core-modules/application/application-manifest/converters/from-permission-flag-to-universal-flat-role-permission-flag.util';
import { MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';


const OBSOLETE_CAMPAIGN_AUTOMATION_METADATA_IDS = {
  fieldMetadata: new Set([
    'f173bd4d-0e7e-410b-876e-7c2dcf768a99',
    '0a178c94-60ff-48e0-9982-64318f6ca3fa',
    'a58a03e6-4c1d-4b0c-b40f-f3a78f6b6c16',
  ]),
  viewField: new Set(['9ecf92f8-6702-49bb-a25f-1d6e4ade47d8']),
  viewFilter: new Set(['e505cfd8-a195-4b9a-997c-6c8208394a37']),
  pageLayoutTab: new Set(['1c137df3-a23f-477c-a890-fb40aecc40f7']),
  pageLayoutWidget: new Set([
    '0c878749-e445-4309-b799-26c2294e48ee',
    '833783c1-7cc0-4993-a856-977f95e1e3b4',
  ]),
};


const CREATOR_OPS_WORKFLOW_ROLE_PERMISSION_FLAG_UNIVERSAL_IDENTIFIER =
  fromPermissionFlagToUniversalFlatRolePermissionFlag({
    applicationUniversalIdentifier:
      TWENTY_STANDARD_APPLICATION.universalIdentifier,
    now: '',
    permissionFlagUniversalIdentifier: SystemPermissionFlag.WORKFLOWS,
    roleUniversalIdentifier: MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  }).universalIdentifier;

@RegisteredWorkspaceCommand('2.20.0', 1786526100000)
@Command({
  name: 'upgrade:2-20:synchronize-myah-campaign-automation-metadata',
  description:
    'Replace source-controlled Campaign Automation metadata for existing workspaces',
})
export class SynchronizeMyahCampaignAutomationMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly synchronizeSourceControlledMyahMetadataService: SynchronizeSourceControlledMyahMetadataService,
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

    await this.synchronizeMyahStandardMetadataCommand.synchronizeWorkspace(
      args,
      {
        explicitObsoleteUniversalIdentifiersByMetadataName:
          OBSOLETE_CAMPAIGN_AUTOMATION_METADATA_IDS,
        targetObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
          STANDARD_OBJECTS.workflow.universalIdentifier,
        ]),
      },
    );

    await this.synchronizeSourceControlledMyahMetadataService.synchronizeWorkspace(
      args,
      {
        rolePermissionFlag: new Set([
          CREATOR_OPS_WORKFLOW_ROLE_PERMISSION_FLAG_UNIVERSAL_IDENTIFIER,
        ]),
      },
    );
  }
}
