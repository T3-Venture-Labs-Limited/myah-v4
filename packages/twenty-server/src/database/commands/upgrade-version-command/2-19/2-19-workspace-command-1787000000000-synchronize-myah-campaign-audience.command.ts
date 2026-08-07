import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import {
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS,
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';
import { MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const audienceObjects = new Set<string>([
  MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreatorList.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
]);
const audienceFields = new Set([
  ...Object.values(MYAH_STANDARD_OBJECTS.campaignCreator.fields).map(
    ({ universalIdentifier }) => universalIdentifier,
  ),
  ...Object.values(MYAH_STANDARD_OBJECTS.campaignCreatorList.fields).map(
    ({ universalIdentifier }) => universalIdentifier,
  ),
  ...Object.values(MYAH_STANDARD_OBJECTS.creatorListMember.fields).map(
    ({ universalIdentifier }) => universalIdentifier,
  ),
]);
const audienceIndexes = new Set([
  MYAH_STANDARD_OBJECTS.campaignCreator.indexes.creatorCampaignUniqueIndex
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreatorList.indexes
    .campaignCreatorListUniqueIndex.universalIdentifier,
]);
const audienceViews = new Set([
  MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreatorList.views.campaignCreatorLists
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaign.views.viewCampaignInformationCreatorLists
    .universalIdentifier,
]);
const audienceViewFields = new Set([
  'd2fa2cd5-9df0-4e85-85b8-47f5ed2a2a71',
  '8d5e6b5f-125e-4f3f-9c73-2f52208b2897',
  MYAH_STANDARD_OBJECTS.campaignCreatorList.views.campaignCreatorLists
    .viewFields.creatorList.universalIdentifier,
  'e26a2ba0-7cd6-46b8-a4a5-d74716f98e3c',
  'b2e85f41-2f5a-4c33-bb24-bc3a1f8ac7df',
]);
const audienceObjectPermissions = new Set(
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
    ({ objectMetadataUniversalIdentifier }) =>
      audienceObjects.has(objectMetadataUniversalIdentifier),
  ).map(({ universalIdentifier }) => universalIdentifier),
);
const audienceFieldPermissions = new Set(
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS.filter(
    ({ objectMetadataUniversalIdentifier }) =>
      audienceObjects.has(objectMetadataUniversalIdentifier),
  ).map(({ universalIdentifier }) => universalIdentifier),
);

const campaignTabs = Object.values(MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs);
const campaignWidgets = new Set(
  campaignTabs.flatMap(({ widgets }) =>
    Object.values(widgets).map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  ),
);
const audienceViewFilters = new Set([
  'f4adf3a0-07bf-48f6-a5c9-20be6f1e2d93',
  MYAH_STANDARD_OBJECTS.campaignCreatorList.views.campaignCreatorLists
    .viewFilters.campaignCurrentRecord.universalIdentifier,
]);
@RegisteredWorkspaceCommand('2.19.0', 1787000000000)
@Command({
  name: 'upgrade:2-19:synchronize-myah-campaign-audience',
  description: 'Synchronize Campaign Creator audience source metadata',
})
export class SynchronizeMyahCampaignAudienceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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
        objectMetadata: audienceObjects,
        fieldMetadata: audienceFields,
        index: audienceIndexes,
        view: audienceViews,
        viewFilter: audienceViewFilters,
        viewField: audienceViewFields,
        objectPermission: audienceObjectPermissions,
        fieldPermission: audienceFieldPermissions,
        pageLayout: new Set([
          MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        pageLayoutTab: new Set(
          campaignTabs.map(({ universalIdentifier }) => universalIdentifier),
        ),
        pageLayoutWidget: campaignWidgets,
      },
      { synchronizeExistingSelectedMetadata: true },
    );

    await args.dataSource.query(`
      UPDATE "campaignCreator" AS "campaignCreator"
      SET "isDirectlyAdded" = TRUE
      WHERE "campaignCreator"."isDirectlyAdded" = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM "campaignCreatorList" AS "campaignCreatorList"
          INNER JOIN "creatorListMember" AS "creatorListMember"
            ON "creatorListMember"."creatorListId" =
              "campaignCreatorList"."creatorListId"
            AND "creatorListMember"."creatorId" =
              "campaignCreator"."creatorId"
          WHERE "campaignCreatorList"."campaignId" =
              "campaignCreator"."campaignId"
            AND "campaignCreatorList"."deletedAt" IS NULL
            AND "creatorListMember"."deletedAt" IS NULL
        )
    `);
  }
}
