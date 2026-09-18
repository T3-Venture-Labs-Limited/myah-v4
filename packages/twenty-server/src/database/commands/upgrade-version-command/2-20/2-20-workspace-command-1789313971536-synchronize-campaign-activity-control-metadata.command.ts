import { Command } from 'nest-commander';
import {
  MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE,
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  escapeIdentifier,
  escapeLiteral,
} from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const CAMPAIGN_CREATOR_STAGE_ENUM_NAME = 'campaignCreator_stage_enum';
const CAMPAIGN_CREATOR_STAGE_VALUES = MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.map(
  ({ value }) => value,
);

@RegisteredWorkspaceCommand('2.20.0', 1789313971536)
@Command({
  name: 'upgrade:2-20:synchronize-campaign-activity-control-metadata',
  description:
    'Add Campaign timeline relations and update Campaign Creator stage defaults',
})
export class SynchronizeCampaignActivityControlMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.dataSource === undefined) return;

    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);
    if (
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
      ] === undefined
    )
      return;

    if (!args.options.dryRun) {
      await this.convertLegacyCampaignCreatorStage(args);
    }

    await this.synchronizer.synchronizeWorkspace(
      args,
      {
        fieldMetadata: new Set([
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.excludedAt
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaignCreator.fields
            .excludedByWorkspaceMemberId.universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.exclusionReason
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.fields.timelineActivities
            .universalIdentifier,
          STANDARD_OBJECTS.timelineActivity.fields.targetCampaign
            .universalIdentifier,
        ]),
      },
      { synchronizeExistingSelectedMetadata: true },
    );

    if (args.options.dryRun === true) return;
    const schema = escapeIdentifier(getWorkspaceSchemaName(args.workspaceId));
    // SAFETY: schema is a UUID-derived escaped identifier; all values are bound.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    await args.dataSource.query(
      `WITH retained AS (
         SELECT 'activation:'||a.id||':ACTIVATED' AS "businessKey", 'ACTIVATED' AS kind,
                a.id AS "sourceId", 'ACTIVATION' AS "sourceType", a."campaignId",
                NULL::uuid AS "creatorId", a."activatedAt" AS "happensAt", NULL::text AS reason,
                NULL::uuid AS "messageId", NULL::uuid AS "messageThreadId", NULL::uuid AS "workspaceMemberId"
           FROM core."campaignActivation" a WHERE a."workspaceId"=$1
         UNION ALL
         SELECT 'enrollment:'||e.id||':ENROLLED','ENROLLED',e.id,'ENROLLMENT',e."campaignId",
                e."creatorId",e."enrolledAt",NULL,NULL,NULL,NULL
           FROM core."campaignEnrollment" e WHERE e."workspaceId"=$1
         UNION ALL
         SELECT 'occurrence:'||o.id||':SCHEDULED','SCHEDULED',o.id,'OCCURRENCE',o."campaignId",
                e."creatorId",o."createdAt",NULL,NULL,NULL,NULL
           FROM core."campaignOccurrence" o JOIN core."campaignEnrollment" e ON e.id=o."enrollmentId"
          WHERE o."workspaceId"=$1
         UNION ALL
         SELECT 'attempt:'||a."attemptId"||':MESSAGE_ACCEPTED','MESSAGE_ACCEPTED',a."attemptId",'ATTEMPT',a."campaignId",
                e."creatorId",a."providerAcceptedAt",NULL,a."projectedMessageId",a."projectedMessageThreadId",NULL
           FROM core."outboundEmailAttempt" a JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId"
          WHERE a."workspaceId"=$1 AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
            AND a."providerAcceptedAt" IS NOT NULL
         UNION ALL
         SELECT 'terminal:occurrence:'||o.id||':'||
                to_char(timezone('UTC',o."terminalAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||':'||o."terminalReason",
                'TERMINAL',o.id,'OCCURRENCE',o."campaignId",e."creatorId",o."terminalAt",o."terminalReason",NULL,NULL,NULL
           FROM core."campaignOccurrence" o JOIN core."campaignEnrollment" e ON e.id=o."enrollmentId"
          WHERE o."workspaceId"=$1 AND o.state IN ('SKIPPED','CANCELLED')
            AND o."terminalReason" IS NOT NULL AND o."terminalAt" IS NOT NULL
         UNION ALL
         SELECT 'terminal:enrollment:'||e.id||':'||
                to_char(timezone('UTC',e."terminalAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||':'||e."terminalReason",
                'TERMINAL',e.id,'ENROLLMENT',e."campaignId",e."creatorId",e."terminalAt",e."terminalReason",NULL,NULL,NULL
           FROM core."campaignEnrollment" e
          WHERE e."workspaceId"=$1 AND e.state IN ('FINISHED','EXCLUDED')
            AND e."terminalReason" IS NOT NULL AND e."terminalAt" IS NOT NULL
         UNION ALL
         SELECT 'exclusion:'||cc.id||':'||to_char(timezone('UTC',cc."excludedAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'EXCLUDED',cc.id,'CAMPAIGN_CREATOR',cc."campaignId",cc."creatorId",cc."excludedAt",cc."exclusionReason",
                NULL,NULL,cc."excludedByWorkspaceMemberId"::uuid
           FROM ${schema}."campaignCreator" cc
          WHERE cc."excludedAt" IS NOT NULL AND cc."deletedAt" IS NULL
       ), events AS (
         SELECT retained.*,
                (substr(md5('campaign-event:v1:business:'||"businessKey"),1,8)||'-'||
                 substr(md5('campaign-event:v1:business:'||"businessKey"),9,4)||'-'||
                 substr(md5('campaign-event:v1:business:'||"businessKey"),13,4)||'-'||
                 substr(md5('campaign-event:v1:business:'||"businessKey"),17,4)||'-'||
                 substr(md5('campaign-event:v1:business:'||"businessKey"),21,12))::uuid AS "businessEventId"
           FROM retained
       ), projections AS (
         SELECT events.*, 'CAMPAIGN' AS target, "campaignId" AS "targetId" FROM events
         UNION ALL
         SELECT events.*, 'CREATOR', "creatorId" FROM events WHERE "creatorId" IS NOT NULL
       )
       INSERT INTO ${schema}."timelineActivity"
         (id,name,"happensAt",properties,"workspaceMemberId","targetCampaignId","targetCreatorId")
       SELECT (substr(md5('campaign-event:v1:projection:'||"businessEventId"||':'||target||':'||"targetId"),1,8)||'-'||
               substr(md5('campaign-event:v1:projection:'||"businessEventId"||':'||target||':'||"targetId"),9,4)||'-'||
               substr(md5('campaign-event:v1:projection:'||"businessEventId"||':'||target||':'||"targetId"),13,4)||'-'||
               substr(md5('campaign-event:v1:projection:'||"businessEventId"||':'||target||':'||"targetId"),17,4)||'-'||
               substr(md5('campaign-event:v1:projection:'||"businessEventId"||':'||target||':'||"targetId"),21,12))::uuid,
              'campaign.'||lower(kind),"happensAt",
              jsonb_build_object('campaignEvent',jsonb_strip_nulls(jsonb_build_object(
                'version',1,'businessEventId',"businessEventId",'campaignId',"campaignId",'eventKind',kind,
                'sourceType',"sourceType",'sourceId',"sourceId",'reason',reason,
                'messageId',"messageId",'messageThreadId',"messageThreadId"))),
              "workspaceMemberId",
              CASE WHEN target='CAMPAIGN' THEN "targetId" END,
              CASE WHEN target='CREATOR' THEN "targetId" END
         FROM projections
       ON CONFLICT (id) DO NOTHING`,
      [args.workspaceId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  }

  private async convertLegacyCampaignCreatorStage(
    args: RunOnWorkspaceArgs,
  ): Promise<void> {
    if (args.dataSource === undefined) return;
    const queryRunner = args.dataSource.createQueryRunner();
    const schemaName = getWorkspaceSchemaName(args.workspaceId);
    const schema = escapeIdentifier(schemaName);
    const enumName = escapeIdentifier(CAMPAIGN_CREATOR_STAGE_ENUM_NAME);
    let converted = false;

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const [stageField] = (await queryRunner.query(
        `SELECT id,type FROM core."fieldMetadata"
          WHERE "workspaceId"=$1 AND "universalIdentifier"=$2
          FOR UPDATE`,
        [
          args.workspaceId,
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage
            .universalIdentifier,
        ],
      )) as Array<{ id: string; type: string }>;

      if (stageField === undefined || stageField.type === 'SELECT') {
        await queryRunner.commitTransaction();
        return;
      }
      if (stageField.type !== 'TEXT') {
        throw new Error(
          `Campaign Creator stage conversion requires TEXT or SELECT metadata for workspace ${args.workspaceId}`,
        );
      }

      // SAFETY: schema and enum names are fixed or UUID-derived escaped identifiers.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await queryRunner.query(
        `LOCK TABLE ${schema}."campaignCreator" IN ACCESS EXCLUSIVE MODE`,
      );
      // SAFETY: schema is a UUID-derived escaped identifier; values are bound.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      const [{ exists: hasUnknownValues }] = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM ${schema}."campaignCreator"
            WHERE stage IS NOT NULL AND NOT (stage::text = ANY($1::text[]))
         ) AS exists`,
        [CAMPAIGN_CREATOR_STAGE_VALUES],
      )) as Array<{ exists: boolean }>;
      if (hasUnknownValues) {
        throw new Error(
          `Campaign Creator stage contains unsupported legacy values for workspace ${args.workspaceId}`,
        );
      }

      const [existingEnum] = (await queryRunner.query(
        `SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
           FROM pg_type t
           JOIN pg_namespace n ON n.oid=t.typnamespace
           JOIN pg_enum e ON e.enumtypid=t.oid
          WHERE n.nspname=$1 AND t.typname=$2`,
        [schemaName, CAMPAIGN_CREATOR_STAGE_ENUM_NAME],
      )) as Array<{ labels: string[] | null }>;
      if (existingEnum?.labels === null) {
        const enumValues = CAMPAIGN_CREATOR_STAGE_VALUES.map(escapeLiteral).join(
          ',',
        );
        // SAFETY: schema and enum names are escaped; values use SQL literal escaping.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await queryRunner.query(
          `CREATE TYPE ${schema}.${enumName} AS ENUM(${enumValues})`,
        );
      } else if (
        JSON.stringify(existingEnum?.labels) !==
        JSON.stringify(CAMPAIGN_CREATOR_STAGE_VALUES)
      ) {
        throw new Error(
          `Campaign Creator stage enum is incompatible for workspace ${args.workspaceId}`,
        );
      }

      // SAFETY: schema and enum names are fixed or UUID-derived escaped identifiers.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await queryRunner.query(
        `ALTER TABLE ${schema}."campaignCreator" ALTER COLUMN stage DROP DEFAULT`,
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await queryRunner.query(
        `ALTER TABLE ${schema}."campaignCreator" ALTER COLUMN stage TYPE ${schema}.${enumName} USING stage::text::${schema}.${enumName}`,
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await queryRunner.query(
        `ALTER TABLE ${schema}."campaignCreator" ALTER COLUMN stage SET DEFAULT ${escapeLiteral(MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE)}::${schema}.${enumName}`,
      );
      const [{ count: updatedCount }] = (await queryRunner.query(
        `WITH updated AS (
           UPDATE core."fieldMetadata"
              SET type='SELECT', options=$2::jsonb, "updatedAt"=now()
            WHERE id=$1 AND type='TEXT' RETURNING id
         ) SELECT count(*)::int AS count FROM updated`,
        [stageField.id, JSON.stringify(MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS)],
      )) as Array<{ count: number }>;
      if (updatedCount !== 1) {
        throw new Error(
          `Campaign Creator stage metadata changed during conversion for workspace ${args.workspaceId}`,
        );
      }

      await queryRunner.commitTransaction();
      converted = true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (converted) {
      await this.workspaceCacheService.flush(args.workspaceId, [
        'flatFieldMetadataMaps',
      ]);
      await this.workspaceMetadataVersionService.incrementMetadataVersion(
        args.workspaceId,
      );
    }
  }
}
