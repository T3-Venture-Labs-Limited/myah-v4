import { Injectable } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as Row[])
    : Array.isArray(value)
      ? (value as Row[])
      : [];

export type InboundInstagramMessage = {
  workspaceId: string;
  conversationRecordId: string;
  messageRecordId: string;
};

// Instagram creator messages after a Campaign step (MYAH-445): link the chat to
// its creator by handle, and record a reply that stops the creator's sequence.
@Injectable()
export class CampaignInstagramReplyService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly progression: CampaignProgressionService,
    private readonly timeline: CampaignTimelineEventWriterService,
    private readonly triage: MyahInboxContactTriageLifecycleService,
  ) {}

  async handleInboundMessage(input: InboundInstagramMessage): Promise<void> {
    if (
      !isValidUuid(input.workspaceId) ||
      !isValidUuid(input.conversationRecordId) ||
      !isValidUuid(input.messageRecordId)
    )
      return;
    await this.orm.executeInWorkspaceContext(async () => {
      const dataSource = await this.orm.getGlobalWorkspaceDataSource();
      await dataSource.transaction((manager) =>
        this.linkCreatorByHandleInTransaction(
          input,
          manager as WorkspaceEntityManager,
        ),
      );
      await dataSource.transaction((manager) =>
        this.recordReplyInTransaction(input, manager as WorkspaceEntityManager),
      );
    }, buildSystemAuthContext(input.workspaceId));
  }

  // Unlinked chats link to the single Creator whose Instagram handle matches
  // the other participant; ambiguous or unknown senders stay unlinked.
  private async linkCreatorByHandleInTransaction(
    input: InboundInstagramMessage,
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner!;
    const schema = getWorkspaceSchemaName(input.workspaceId);
    const [conversation] = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
      await runner.query(
        `SELECT "creatorId", lower(trim(both '@' from "recipientUsername")) AS handle
           FROM "${schema}"."myahSocialConversation" WHERE id=$1 AND "deletedAt" IS NULL`,
        [input.conversationRecordId],
      ),
    );
    if (!conversation || conversation.creatorId || !conversation.handle) return;
    const matches = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
      await runner.query(
        `SELECT DISTINCT sp."creatorId" FROM "${schema}"."socialProfile" sp
           JOIN "${schema}".creator c ON c.id = sp."creatorId" AND c."deletedAt" IS NULL
          WHERE sp."deletedAt" IS NULL AND sp.platform::text = 'INSTAGRAM'
            AND lower(trim(both '@' from sp.handle)) = $1
          LIMIT 2`,
        [conversation.handle],
      ),
    );
    if (matches.length !== 1) return;
    const creatorId = String(matches[0].creatorId);
    await this.triage.withPreparedSourceMutationInTransaction({
      workspaceId: input.workspaceId,
      sourceType: 'INSTAGRAM_CONVERSATION',
      sourceRecordIds: [input.conversationRecordId],
      nextCreatorIds: [creatorId],
      manager,
      mutate: () =>
        // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
        runner.query(
          `UPDATE "${schema}"."myahSocialConversation" SET "creatorId"=$1, "updatedAt"=now()
            WHERE id=$2 AND "creatorId" IS NULL`,
          [creatorId, input.conversationRecordId],
        ),
    });
  }

  private async recordReplyInTransaction(
    input: InboundInstagramMessage,
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner!;
    const schema = getWorkspaceSchemaName(input.workspaceId);
    const [message] = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
      await runner.query(
        `SELECT m.direction::text AS direction, COALESCE(m."providerCreatedAt", m."createdAt") AS "sentAt",
                c."providerConversationId"
           FROM "${schema}"."myahSocialMessage" m
           JOIN "${schema}"."myahSocialConversation" c ON c.id = m."conversationId"
          WHERE m.id=$1 AND c.id=$2 AND m."deletedAt" IS NULL`,
        [input.messageRecordId, input.conversationRecordId],
      ),
    );
    if (!message || message.direction !== 'INBOUND') return;
    // Campaign Instagram steps accepted into this chat before the message.
    const steps = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
      await runner.query(
        `SELECT DISTINCT o."campaignId", o."enrollmentId", e.state AS "enrollmentState",
                e."campaignCreatorId", e."creatorId"
           FROM core."campaignOccurrence" o
           JOIN core."actionExecutionReceipt" r ON r.id = o."actionExecutionReceiptId"
           JOIN core."campaignEnrollment" e ON e.id = o."enrollmentId"
          WHERE o."workspaceId"=$1 AND r."workspaceId"=$1
            AND r."providerThreadExternalId"=$2
            AND r.state IN ('SENT','PROVIDER_ACCEPTED')
            AND COALESCE(o."terminalAt", r."updatedAt") <= $3`,
        [input.workspaceId, message.providerConversationId, message.sentAt],
      ),
    );
    const campaigns = new Set(steps.map(({ campaignId }) => campaignId));
    if (campaigns.size !== 1) return;
    const step = steps[0];
    const campaignId = String(step.campaignId);
    if (step.enrollmentState === 'ACTIVE') {
      const result = await this.progression.terminalizeReplyInTransaction(
        {
          workspaceId: input.workspaceId,
          campaignId,
          enrollmentId: String(step.enrollmentId),
          inboundEvidenceId: input.messageRecordId,
        },
        manager,
      );
      if (result.status === 'EXACT_REPLAY') return;
    }
    const stage = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
      await runner.query(
        `UPDATE "${schema}"."campaignCreator" SET stage='NEGOTIATING', "updatedAt"=clock_timestamp()
          WHERE id=$1 AND "campaignId"=$2 AND stage IN ('READY','CONTACTED') AND "deletedAt" IS NULL
          RETURNING id`,
        [step.campaignCreatorId, campaignId],
      ),
    );
    if (stage.length === 1)
      await this.timeline.writeInTransaction(
        { manager, workspaceId: input.workspaceId, campaignId },
        {
          businessEventKey: `reply-stage:${input.messageRecordId}:NEGOTIATING`,
          eventKind: 'STAGE_CHANGED',
          happenedAt: new Date().toISOString(),
          sourceId: input.messageRecordId,
          sourceType: 'MESSAGE',
          creatorId: String(step.creatorId),
          stageValue: 'NEGOTIATING',
          stageLabel: 'Negotiating',
        },
      );
  }
}
