import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS,
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

const campaignCreatorListSourceObject =
  MYAH_STANDARD_OBJECTS.campaignCreatorListSource;

const campaignCreatorListSourceFields = new Set([
  ...Object.values(campaignCreatorListSourceObject.fields).map(
    ({ universalIdentifier }) => universalIdentifier,
  ),
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.campaignCreatorListSources
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.creatorList.fields.campaignCreatorListSources
    .universalIdentifier,
]);

const campaignCreatorListSourceObjectPermissions = new Set(
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
    ({ objectMetadataUniversalIdentifier }) =>
      objectMetadataUniversalIdentifier ===
      campaignCreatorListSourceObject.universalIdentifier,
  ).map(({ universalIdentifier }) => universalIdentifier),
);

const campaignCreatorListSourceFieldPermissions = new Set(
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS.filter(
    ({ objectMetadataUniversalIdentifier }) =>
      objectMetadataUniversalIdentifier ===
      campaignCreatorListSourceObject.universalIdentifier,
  ).map(({ universalIdentifier }) => universalIdentifier),
);

@RegisteredWorkspaceCommand('2.20.0', 1786602066315)
@Command({
  name: 'upgrade:2-20:synchronize-myah-campaign-creator-list-sources',
  description:
    'Synchronize retained Campaign Creator List source metadata and backfill provable sources',
})
export class SynchronizeMyahCampaignCreatorListSourcesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
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
        objectMetadata: new Set([
          campaignCreatorListSourceObject.universalIdentifier,
        ]),
        fieldMetadata: campaignCreatorListSourceFields,
        index: new Set([
          campaignCreatorListSourceObject.indexes
            .campaignCreatorListSourceUniqueIndex.universalIdentifier,
        ]),
        viewField: new Set([
          MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
            .viewFields.campaignCreatorListSources.universalIdentifier,
        ]),
        objectPermission: campaignCreatorListSourceObjectPermissions,
        fieldPermission: campaignCreatorListSourceFieldPermissions,
      },
      { synchronizeExistingSelectedMetadata: true },
    );

    if (args.options.dryRun === true) return;

    const schemaName = getWorkspaceSchemaName(args.workspaceId);

    await args.dataSource.query(
      `
      INSERT INTO "${schemaName}"."campaignCreatorListSource"
        ("campaignCreatorId", "creatorListId")
      SELECT "campaignCreator"."id", "campaignCreatorList"."creatorListId"
      FROM "${schemaName}"."campaignCreator" AS "campaignCreator"
      INNER JOIN "${schemaName}"."campaignCreatorList" AS "campaignCreatorList"
        ON "campaignCreatorList"."campaignId" = "campaignCreator"."campaignId"
        AND "campaignCreatorList"."deletedAt" IS NULL
      INNER JOIN "${schemaName}"."creatorListMember" AS "creatorListMember"
        ON "creatorListMember"."creatorListId" = "campaignCreatorList"."creatorListId"
        AND "creatorListMember"."creatorId" = "campaignCreator"."creatorId"
        AND "creatorListMember"."deletedAt" IS NULL
      WHERE "campaignCreator"."deletedAt" IS NULL
      ON CONFLICT ("campaignCreatorId", "creatorListId")
        WHERE "deletedAt" IS NULL DO NOTHING;
    `,
      undefined,
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  }
}
