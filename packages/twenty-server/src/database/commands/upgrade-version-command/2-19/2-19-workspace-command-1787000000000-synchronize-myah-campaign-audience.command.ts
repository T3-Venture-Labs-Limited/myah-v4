import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS, MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

const audienceObjects = new Set([
  MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreatorList.universalIdentifier,
]);
const audienceFields = new Set([
  ...Object.values(MYAH_STANDARD_OBJECTS.campaignCreator.fields).map(({ universalIdentifier }) => universalIdentifier),
  ...Object.values(MYAH_STANDARD_OBJECTS.campaignCreatorList.fields).map(({ universalIdentifier }) => universalIdentifier),
]);
const audienceIndexes = new Set([
  MYAH_STANDARD_OBJECTS.campaignCreator.indexes.creatorCampaignUniqueIndex.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreatorList.indexes.campaignCreatorListUniqueIndex.universalIdentifier,
]);
const audienceViews = new Set([
  MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaign.views.viewCampaignInformationCreatorLists.universalIdentifier,
]);
const audienceViewFields = new Set([
  'd2fa2cd5-9df0-4e85-85b8-47f5ed2a2a71',
  '8d5e6b5f-125e-4f3f-9c73-2f52208b2897',
  'e26a2ba0-7cd6-46b8-a4a5-d74716f98e3c',
  'b2e85f41-2f5a-4c33-bb24-bc3a1f8ac7df',
]);
const audienceObjectPermissions = new Set(
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS
    .filter(({ objectMetadataUniversalIdentifier }) => audienceObjects.has(objectMetadataUniversalIdentifier))
    .map(({ universalIdentifier }) => universalIdentifier),
);
const audienceFieldPermissions = new Set(
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS
    .filter(({ objectMetadataUniversalIdentifier }) => audienceObjects.has(objectMetadataUniversalIdentifier))
    .map(({ universalIdentifier }) => universalIdentifier),
);

@RegisteredWorkspaceCommand('2.19.0', 1787000000000)
@Command({
  name: 'upgrade:2-19:synchronize-myah-campaign-audience',
  description: 'Synchronize Campaign Creator audience source metadata',
})
export class SynchronizeMyahCampaignAudienceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
  ) { super(workspaceIteratorService); }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource) return;
    await this.synchronizer.synchronizeWorkspace(args, {
      objectMetadata: audienceObjects,
      fieldMetadata: audienceFields,
      index: audienceIndexes,
      view: audienceViews,
      objectPermission: audienceObjectPermissions,
      fieldPermission: audienceFieldPermissions,
    }, { synchronizeExistingSelectedMetadata: true });
  }
}
