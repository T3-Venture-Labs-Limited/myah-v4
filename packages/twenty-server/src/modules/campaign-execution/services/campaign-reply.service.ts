import { Injectable } from '@nestjs/common';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];

@Injectable()
export class CampaignReplyService {
  constructor(private readonly progression: CampaignProgressionService) {}

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
        `SELECT a."workspaceId",a."campaignId",a."enrollmentId",a."campaignExecutionId",a."authorizationId",auth.generation AS "authorizationGeneration",act.id AS "activationId",a."workflowVersionId",a."occurrenceId",a."connectedAccountId",a."messageChannelId",a."attemptId",e."campaignCreatorId"
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
    await manager
      .createQueryBuilder()
      .update(`${getWorkspaceSchemaName(input.workspaceId)}.campaignCreator`)
      .set({ stage: 'NEGOTIATING', updatedAt: () => 'clock_timestamp()' })
      .where('id = :id', { id: match.campaignCreatorId })
      .andWhere("stage IN ('READY', 'CONTACTED')")
      .andWhere('"deletedAt" IS NULL')
      .execute();
  }
}
