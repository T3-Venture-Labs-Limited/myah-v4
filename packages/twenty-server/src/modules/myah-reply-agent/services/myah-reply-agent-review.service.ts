import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, In } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MyahAgentService } from 'src/engine/core-modules/myah-agent/services/myah-agent.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  findCampaignActiveParticipations,
  findCreatorInstagramHandles,
} from 'src/modules/campaign-execution/utils/campaign-active-participation.util';
import {
  type MyahReplyAgentDraftLabelDTO,
  type MyahReplyAgentReviewDTO,
  type MyahReplyAgentReviewNodeDTO,
} from 'src/modules/myah-reply-agent/dtos/myah-reply-agent-review.dto';
import { MyahReplyAgentService } from 'src/modules/myah-reply-agent/services/myah-reply-agent.service';

type Row = Record<string, unknown>;
type Run = {
  creatorId: string;
  channel: 'EMAIL' | 'INSTAGRAM';
  conversationRecordId: string;
  status: string;
  reason: string | null;
  draftBody: string | null;
  createdAt: Date;
  handled: boolean;
};

// What the agent left for people to do, per Campaign influencer (MYAH-445).
// Membership and conversation access use the caller's permissions; run rows
// carry only agent outcomes, not message content.
@Injectable()
export class MyahReplyAgentReviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly agentSettings: MyahAgentService,
    private readonly agent: MyahReplyAgentService,
  ) {}

  async review(
    campaignId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<MyahReplyAgentReviewDTO> {
    await this.agentSettings.assertCampaign(campaignId, authContext, 'read');
    const workspaceId = authContext.workspace.id;
    const memberships = await this.readableMemberships(authContext, {
      campaignId,
    });
    const creatorIds = memberships.map(({ creatorId }) => creatorId);
    const runs = await this.latestRuns(workspaceId, campaignId, creatorIds);
    const query = (sql: string, parameters: unknown[]) =>
      this.dataSource.query(sql, parameters);
    const ready = memberships.filter(
      ({ stage }) => stage === null || stage === 'READY',
    );
    const readyIds = ready.map(({ creatorId }) => creatorId);
    const [activeElsewhere, handles, emails] = await Promise.all([
      findCampaignActiveParticipations(query, {
        workspaceId,
        creatorIds: readyIds,
        excludeCampaignId: campaignId,
      }),
      findCreatorInstagramHandles(query, { workspaceId, creatorIds: readyIds }),
      this.creatorsWithEmail(workspaceId, readyIds),
    ]);
    const nodes = memberships.map((membership): MyahReplyAgentReviewNodeDTO => {
      const run = runs.get(membership.creatorId);
      const base = {
        campaignCreatorId: membership.id,
        creatorId: membership.creatorId,
        channel: run?.channel ?? null,
        conversationRecordId: run?.conversationRecordId ?? null,
        inboxContactId: run ? this.inboxContactId(workspaceId, run) : null,
      };
      if (run && !run.handled) {
        if (run.status === 'DRAFTED')
          return { ...base, nextAction: 'REVIEW_DRAFT', reason: run.reason };
        // A failed run left nothing to send: a person has to act.
        if (run.status === 'HANDED_OFF' || run.status === 'FAILED')
          return { ...base, nextAction: 'NEEDS_YOU', reason: run.reason };
        if (run.status === 'SEND_UNKNOWN')
          return { ...base, nextAction: 'SEND_UNKNOWN', reason: run.reason };
        if (run.status === 'SENT')
          return { ...base, nextAction: 'SENT_AUTOMATICALLY', reason: null };
      }
      if (membership.stage === null || membership.stage === 'READY') {
        const elsewhere = activeElsewhere.get(membership.creatorId);
        if (elsewhere)
          return {
            ...base,
            nextAction: 'SKIPPED',
            reason: `Skipped: active in ${elsewhere.campaignName ?? 'another Campaign'}`,
          };
        if (
          !handles.has(membership.creatorId) &&
          !emails.has(membership.creatorId)
        )
          return {
            ...base,
            nextAction: 'NOT_CONTACTABLE',
            reason: 'Not contactable: no Instagram handle or email',
          };
      }
      return { ...base, nextAction: null, reason: null };
    });
    return {
      nodes,
      needReviewCount: nodes.filter(
        ({ nextAction }) =>
          nextAction === 'REVIEW_DRAFT' ||
          nextAction === 'NEEDS_YOU' ||
          nextAction === 'SEND_UNKNOWN',
      ).length,
    };
  }

  async regenerate(
    campaignCreatorId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<MyahReplyAgentReviewNodeDTO> {
    const [membership] = await this.readableMemberships(authContext, {
      id: campaignCreatorId,
    });
    if (!membership) throw new NotFoundException('Influencer not found');
    await this.agentSettings.assertCampaign(
      membership.campaignId,
      authContext,
      'read',
    );
    const workspaceId = authContext.workspace.id;
    const run = (
      await this.latestRuns(workspaceId, membership.campaignId, [
        membership.creatorId,
      ])
    ).get(membership.creatorId);
    if (!run)
      throw new BadRequestException(
        'The agent has no creator message to answer yet',
      );
    await this.agent.run({
      workspaceId,
      channel: run.channel,
      conversationRecordId: run.conversationRecordId,
      regenerate: true,
    });
    const review = await this.review(membership.campaignId, authContext);
    return (
      review.nodes.find(
        (node) => node.campaignCreatorId === campaignCreatorId,
      ) ?? review.nodes[0]
    );
  }

  // "Drafted by agent" / "Needs you" for an Inbox composer, until a person
  // edits or sends the draft.
  async draftLabel(
    input: { channel: 'EMAIL' | 'INSTAGRAM'; conversationRecordId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<MyahReplyAgentDraftLabelDTO | null> {
    const workspaceId = authContext.workspace.id;
    const readable = await this.orm.executeInWorkspaceContext(async () => {
      const repository = await this.orm.getRepository<{ id: string }>(
        workspaceId,
        input.channel === 'EMAIL' ? 'messageThread' : 'myahSocialConversation',
        this.permissions(authContext),
      );
      return repository.findOne({
        where: { id: input.conversationRecordId },
        select: { id: true },
      });
    }, authContext);
    if (!readable) return null;
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const [row] = (await this.dataSource.query(
      `SELECT r.status, r.reason, r."draftBody", r."createdAt", r."campaignId"
         FROM core."myahAgentRun" r
        WHERE r."workspaceId"=$1 AND r."conversationRecordId"=$2
        ORDER BY r."createdAt" DESC LIMIT 1`,
      [workspaceId, input.conversationRecordId],
    )) as Row[];
    if (
      !row ||
      !['DRAFTED', 'HANDED_OFF', 'FAILED'].includes(String(row.status))
    )
      return null;
    const current = await this.currentDraftBody(
      workspaceId,
      input.channel,
      input.conversationRecordId,
    );
    const agentBody = typeof row.draftBody === 'string' ? row.draftBody : null;
    // A hand-off without a holding reply is labelled until someone types.
    const untouched =
      agentBody === null
        ? current === null || current.trim() === ''
        : current !== null && current.trim() === agentBody.trim();
    if (!untouched) return null;
    const campaignName =
      typeof row.campaignId === 'string'
        ? await this.campaignName(workspaceId, row.campaignId)
        : null;
    return {
      kind: row.status === 'DRAFTED' ? 'DRAFTED' : 'NEEDS_YOU',
      reason: typeof row.reason === 'string' ? row.reason : null,
      campaignName,
    };
  }

  private permissions(authContext: WorkspaceAuthContext) {
    const context = getWorkspaceContext();
    const permissions = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });
    if (!permissions) throw new NotFoundException('Not found');
    return permissions;
  }

  private readableMemberships(
    authContext: WorkspaceAuthContext,
    where: { campaignId: string } | { id: string },
  ): Promise<
    Array<{
      id: string;
      campaignId: string;
      creatorId: string;
      stage: string | null;
    }>
  > {
    return this.orm.executeInWorkspaceContext(async () => {
      const repository = await this.orm.getRepository<{
        id: string;
        campaignId: string;
        creatorId: string;
        stage: string | null;
      }>(
        authContext.workspace.id,
        'campaignCreator',
        this.permissions(authContext),
      );
      return repository.find({
        where: 'id' in where ? { id: In([where.id]) } : where,
        select: { id: true, campaignId: true, creatorId: true, stage: true },
        take: 5_000,
      });
    }, authContext);
  }

  private async latestRuns(
    workspaceId: string,
    campaignId: string,
    creatorIds: string[],
  ): Promise<Map<string, Run>> {
    if (creatorIds.length === 0) return new Map();
    const schema = getWorkspaceSchemaName(workspaceId);
    // A person handled the conversation when the brand sent anything after the run.
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const found = (await this.dataSource.query(
      `SELECT DISTINCT ON (r."creatorId") r."creatorId", r.channel, r."conversationRecordId",
              r.status, r.reason, r."draftBody", r."createdAt",
              CASE WHEN r.status='SENT' THEN false
                   WHEN r.channel='INSTAGRAM' THEN EXISTS (
                     SELECT 1 FROM "${schema}"."myahSocialMessage" m
                      WHERE m."conversationId"=r."conversationRecordId" AND m."deletedAt" IS NULL
                        AND m.direction::text='OUTBOUND' AND m."createdAt" > r."createdAt")
                   ELSE EXISTS (
                     SELECT 1 FROM "${schema}".message m
                       JOIN "${schema}"."messageChannelMessageAssociation" a ON a."messageId"=m.id AND a."deletedAt" IS NULL
                      WHERE m."messageThreadId"=r."conversationRecordId" AND m."deletedAt" IS NULL
                        AND a.direction::text='OUTGOING' AND m."createdAt" > r."createdAt")
              END AS handled
         FROM core."myahAgentRun" r
        WHERE r."workspaceId"=$1 AND r."campaignId"=$2 AND r."creatorId"=ANY($3::uuid[])
          AND r.status <> 'RUNNING'
        ORDER BY r."creatorId", r."createdAt" DESC`,
      [workspaceId, campaignId, creatorIds],
    )) as Run[];
    return new Map(found.map((run) => [run.creatorId, run]));
  }

  private async creatorsWithEmail(
    workspaceId: string,
    creatorIds: string[],
  ): Promise<Set<string>> {
    if (creatorIds.length === 0) return new Set();
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const found = (await this.dataSource.query(
      `SELECT id FROM "${getWorkspaceSchemaName(workspaceId)}".creator
        WHERE id=ANY($1::uuid[]) AND "deletedAt" IS NULL AND COALESCE(email,'') LIKE '%@%'`,
      [creatorIds],
    )) as Row[];
    return new Set(found.map(({ id }) => String(id)));
  }

  private async currentDraftBody(
    workspaceId: string,
    channel: 'EMAIL' | 'INSTAGRAM',
    conversationRecordId: string,
  ): Promise<string | null> {
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const [draft] = (await this.dataSource.query(
      channel === 'INSTAGRAM'
        ? `SELECT body FROM "${getWorkspaceSchemaName(workspaceId)}"."myahInstagramReplyDraft"
            WHERE "conversationId"=$1 AND kind='REPLY' AND "sentAt" IS NULL AND "deletedAt" IS NULL
            ORDER BY "updatedAt" DESC LIMIT 1`
        : `SELECT "bodyMarkdown" AS body FROM core."myahInboxReplyContextDraft"
            WHERE "workspaceId"=$2 AND "deliveryTargetId"=$1 AND channel::text='EMAIL'
            ORDER BY "updatedAt" DESC LIMIT 1`,
      channel === 'INSTAGRAM'
        ? [conversationRecordId]
        : [conversationRecordId, workspaceId],
    )) as Row[];
    return typeof draft?.body === 'string' ? draft.body : null;
  }

  private async campaignName(
    workspaceId: string,
    campaignId: string,
  ): Promise<string | null> {
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const [campaign] = (await this.dataSource.query(
      `SELECT name FROM "${getWorkspaceSchemaName(workspaceId)}".campaign WHERE id=$1`,
      [campaignId],
    )) as Row[];
    return typeof campaign?.name === 'string' ? campaign.name : null;
  }

  private inboxContactId(workspaceId: string, run: Run): string {
    return encodeMyahInboxContactId({
      workspaceId,
      identity:
        run.channel === 'INSTAGRAM'
          ? {
              kind: 'instagram-conversation',
              recordId: run.conversationRecordId,
            }
          : { kind: 'creator', recordId: run.creatorId },
    });
  }
}
