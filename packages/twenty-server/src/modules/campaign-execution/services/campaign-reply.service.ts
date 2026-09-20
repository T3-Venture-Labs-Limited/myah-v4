import { Injectable, Optional } from '@nestjs/common';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];

@Injectable()
export class CampaignReplyService {
  constructor(
    private readonly progression: CampaignProgressionService,
    @Optional()
    private readonly timelineEventWriter?: CampaignTimelineEventWriterService,
  ) {}

  async reconcileInboundMessageInTransaction(
    input: {
      workspaceId: string;
      messageChannelId: string;
      threadExternalId: string;
      fromHandle: string;
      inboundEvidenceId: string;
    },
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== manager)
      throw new Error('Campaign reply reconciliation requires active manager');
    const from = input.fromHandle.trim().toLowerCase();
    if (!from || !input.threadExternalId.trim()) return;
    const matches = rows(
      await runner.query(
        `SELECT a."workspaceId",a."campaignId",a."enrollmentId",a."authorizationId",auth.generation AS "authorizationGeneration",act.id AS "activationId",a."workflowVersionId",a."occurrenceId",a."connectedAccountId",a."messageChannelId",a."attemptId",e."campaignCreatorId",e."creatorId"
         FROM core."outboundEmailAttempt" a
         JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId" AND e.state='ACTIVE'
         JOIN core."campaignSequenceAuthorization" auth ON auth."authorizationId"=a."authorizationId" AND auth."workspaceId"=a."workspaceId" AND auth."campaignId"=a."campaignId"
         JOIN core."campaignActivation" act ON act."workspaceId"=a."workspaceId" AND act."campaignId"=a."campaignId" AND act."authorizationId"=a."authorizationId" AND act."authorizationGeneration"=auth.generation AND act."workflowVersionId"=a."workflowVersionId"
        WHERE a."workspaceId"=$1 AND a."messageChannelId"=$2 AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
          AND a."resolvedThreadExternalId"=$3 AND a."normalizedRecipient"=$4
        FOR UPDATE OF a,e,auth,act`,
        [
          input.workspaceId,
          input.messageChannelId,
          input.threadExternalId,
          from,
        ],
      ),
    );
    const unique = new Map(
      matches.map((match) => [
        `${match.workspaceId}:${match.campaignId}:${match.enrollmentId}:${match.messageChannelId}`,
        match,
      ]),
    );
    if (unique.size !== 1) return;
    const match = [...unique.values()][0];
    const result = await this.progression.terminalizeReplyInTransaction(
      {
        workspaceId: String(match.workspaceId),
        campaignId: String(match.campaignId),
        enrollmentId: String(match.enrollmentId),
        inboundEvidenceId: input.inboundEvidenceId,
      },
      manager,
    );
    if (result.status === 'EXACT_REPLAY') return;
    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    const stageUpdates = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await runner.query(
        `UPDATE "${schemaName}"."campaignCreator"
         SET stage='NEGOTIATING', "updatedAt"=clock_timestamp()
         WHERE id=$1 AND "campaignId"=$2
           AND stage IN ('READY', 'CONTACTED') AND "deletedAt" IS NULL
         RETURNING id`,
        [match.campaignCreatorId, match.campaignId],
      ),
    );
    if (stageUpdates.length === 1 && this.timelineEventWriter) {
      const happenedAtRows = rows(
        await runner.query('SELECT clock_timestamp() AS "happenedAt"'),
      );
      const happenedAt = new Date(
        String(happenedAtRows[0]?.happenedAt),
      ).toISOString();
      await this.timelineEventWriter.writeInTransaction(
        {
          manager,
          workspaceId: input.workspaceId,
          campaignId: String(match.campaignId),
        },
        {
          businessEventKey: `reply-stage:${input.inboundEvidenceId}:NEGOTIATING`,
          eventKind: 'STAGE_CHANGED',
          happenedAt,
          sourceId: input.inboundEvidenceId,
          sourceType: 'MESSAGE',
          creatorId: String(match.creatorId),
          messageId: input.inboundEvidenceId,
          stageValue: 'NEGOTIATING',
          stageLabel: 'Negotiating',
        },
      );
    }
  }
}
