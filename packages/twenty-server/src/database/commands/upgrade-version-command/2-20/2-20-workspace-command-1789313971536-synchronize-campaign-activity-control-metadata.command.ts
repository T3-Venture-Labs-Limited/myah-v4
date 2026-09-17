import { Command } from 'nest-commander';
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

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
    const schemaName = getWorkspaceSchemaName(args.workspaceId);
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
           FROM "${schemaName}"."campaignCreator" cc
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
       INSERT INTO "${schemaName}"."timelineActivity"
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
}
