import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { IsNull, type ObjectLiteral } from 'typeorm';
import { validate as isUuid } from 'uuid';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignEmailReplyWorkBoundaryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-boundary.service';

export type PromoteHeldEmailWorkInput = {
  authContext: UserWorkspaceAuthContext;
  expectedWorkspaceId: string;
  workItemId: string;
  bindingId: string;
  expectedContextGeneration: number;
  expectedParticipationMaterialGeneration: number;
};
type Work = {
  id: string;
  workspaceId: string;
  state: string;
  purpose: string;
  reason: string | null;
  createdAt: Date;
  contextGeneration: number;
  canonicalMessageId: string;
  messageThreadId: string;
  messageChannelId: string;
  connectedAccountId: string;
  accountIncarnationId: string;
  providerMessageId: string;
  providerThreadId: string;
  creatorSender: string;
  accountRecipient: string;
  baselineGenerationId: string;
  providerOccurredAt: Date;
  participationId: string | null;
};
type Binding = ObjectLiteral & {
  id: string;
  campaignId: string;
  participationId: string;
  creatorId: string;
  messageThreadId: string;
  messageChannelId: string;
  connectedAccountId: string;
  providerThreadId: string;
  creatorSender: string;
  accountRecipient: string;
  messageId: string | null;
  establishedAt: Date;
  revokedAt: Date | null;
  deletedAt: Date | null;
};
type Campaign = ObjectLiteral & {
  id: string;
  replyAgentEnabled: boolean;
  replyAgentMode: string;
  replyAgentEnabledAt: Date | null;
  deletedAt: Date | null;
};
type Participation = ObjectLiteral & {
  id: string;
  campaignId: string;
  creatorId: string;
  replyAgentPaused: boolean;
  replyAgentMaterialGeneration: number;
  replyAgentPauseHistory: Array<{
    pausedAt: Date;
    resumedAt: Date | null;
  }> | null;
  excludedAt: Date | null;
  deletedAt: Date | null;
  stage: string;
};
type Row = ObjectLiteral & {
  id: string;
  deletedAt: Date | null;
  userId?: string;
};
const available = (date: Date | null | undefined) =>
  date instanceof Date && Number.isFinite(date.getTime());

const PAGE_SIZE = 20;
type AttentionScope = {
  kind: 'held' | 'collision';
  workspaceId: string;
  threadId: string;
  memberId: string;
  userWorkspaceId: string;
  userId: string;
};
const encodeAttentionCursor = (
  scope: AttentionScope,
  row: { id: string; createdAt: Date },
) =>
  Buffer.from(
    JSON.stringify({
      ...scope,
      id: row.id,
      createdAt: row.createdAt.toISOString(),
    }),
  ).toString('base64url');
const decodeAttentionCursor = (
  cursor: string | undefined,
  scope: AttentionScope,
): { id: string; createdAt: Date } | null => {
  if (cursor === undefined) return null;
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 512)
    throw new ConflictException('Inbox attention cursor is invalid');
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== cursor)
      throw new Error('Noncanonical cursor');
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== 'object') throw new Error('Invalid cursor');
    const row = value as Record<string, unknown>;
    if (
      Object.entries(scope).some(([key, expected]) => row[key] !== expected) ||
      typeof row.id !== 'string' ||
      !isUuid(row.id) ||
      typeof row.createdAt !== 'string'
    )
      throw new Error('Wrong cursor scope');
    const createdAt = new Date(row.createdAt);
    if (!available(createdAt) || createdAt.toISOString() !== row.createdAt)
      throw new Error('Invalid cursor timestamp');
    return { id: row.id as string, createdAt };
  } catch {
    throw new ConflictException('Inbox attention cursor is invalid or stale');
  }
};

/** Authenticated operator acknowledgement only; no draft, model, queue job or send. */
@Injectable()
export class CampaignEmailReplyWorkReviewService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    @Optional()
    private readonly bindingBoundary?: CampaignEmailReplyWorkBoundaryService,
  ) {}

  async threadIdForHeld(input: {
    authContext: UserWorkspaceAuthContext;
    expectedWorkspaceId: string;
    workItemId: string;
  }): Promise<string> {
    const { authContext, expectedWorkspaceId, workItemId } = input;
    if (
      authContext?.type !== 'user' ||
      authContext.workspace?.id !== expectedWorkspaceId ||
      !authContext.workspaceMemberId ||
      authContext.workspaceMember?.userId !== authContext.user?.id ||
      ![expectedWorkspaceId, workItemId].every(isUuid)
    )
      throw new ForbiddenException('Inbox work requires authenticated user');
    return this.orm.executeInWorkspaceContext(async () => {
      const context = getWorkspaceContext();
      if (
        context.authContext.type !== 'user' ||
        context.authContext.workspace.id !== expectedWorkspaceId ||
        context.authContext.workspaceMemberId !== authContext.workspaceMemberId
      )
        throw new ForbiddenException('Inbox work context changed');
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException('Inbox role unavailable');
      const repo = await this.orm.getRepository<Row>(
        expectedWorkspaceId,
        'messageThread',
        permissions,
      );
      return repo.manager.transaction(async (manager) => {
        if (
          !manager.queryRunner?.isTransactionActive ||
          manager.queryRunner.isReleased
        )
          throw new ForbiddenException('Inbox source transaction unavailable');
        const rows: Array<{ messageThreadId: string }> =
          await manager.queryRunner.query(
            `SELECT "messageThreadId" FROM core."campaignPartnershipWorkItem"
           WHERE "id" = $1 AND "workspaceId" = $2 AND "state" = 'HELD'
             AND "purpose" = 'REPLY_AMBIGUITY' AND "providerMessageId" IS NOT NULL`,
            [workItemId, expectedWorkspaceId],
          );
        const threadId = rows[0]?.messageThreadId;
        if (!isUuid(threadId))
          throw new ForbiddenException('Inbox held source unavailable');
        const visible = await (manager as WorkspaceEntityManager)
          .getRepository<Row>(repo.target, permissions, authContext)
          .findOne({
            where: { id: threadId, deletedAt: IsNull() },
            select: { id: true },
          });
        if (visible?.id !== threadId)
          throw new ForbiddenException('Inbox source not visible');
        return threadId;
      });
    }, authContext);
  }

  /** Neutral attention only: collisions can never be promoted through the HELD action. */
  async listCollisions(input: {
    authContext: UserWorkspaceAuthContext;
    expectedWorkspaceId: string;
    threadId: string;
    cursor?: string;
  }): Promise<{
    hasNextPage: boolean;
    endCursor: string | null;
    items: Array<{
      collisionId: string;
      originalWorkItemId: string;
      originalState: string;
    }>;
  }> {
    const { authContext, expectedWorkspaceId, threadId } = input;
    if (
      authContext?.type !== 'user' ||
      authContext.workspace?.id !== expectedWorkspaceId ||
      !authContext.userWorkspaceId ||
      !authContext.workspaceMemberId ||
      authContext.workspaceMember?.userId !== authContext.user?.id ||
      ![expectedWorkspaceId, threadId].every(isUuid)
    )
      throw new ForbiddenException(
        'Authenticated Inbox collision attention required',
      );
    return this.orm.executeInWorkspaceContext(async () => {
      const context = getWorkspaceContext();
      if (
        context.authContext.type !== 'user' ||
        context.authContext.workspace.id !== expectedWorkspaceId ||
        context.authContext.userWorkspaceId !== authContext.userWorkspaceId ||
        context.authContext.workspaceMemberId !== authContext.workspaceMemberId
      )
        throw new ForbiddenException('Inbox collision context changed');
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException('Inbox collision role unavailable');
      const [threadBase, memberBase] = await Promise.all([
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'messageThread',
          permissions,
        ),
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'workspaceMember',
          permissions,
        ),
      ]);
      return threadBase.manager.transaction(async (manager) => {
        if (
          !manager.queryRunner?.isTransactionActive ||
          manager.queryRunner.isReleased
        )
          throw new ForbiddenException(
            'Inbox collision transaction unavailable',
          );
        const scoped = manager as WorkspaceEntityManager;
        const [thread, member] = await Promise.all([
          scoped
            .getRepository<Row>(threadBase.target, permissions, authContext)
            .findOne({
              where: { id: threadId, deletedAt: IsNull() },
              select: { id: true },
            }),
          scoped
            .getRepository<Row>(memberBase.target, permissions, authContext)
            .findOne({
              where: { id: authContext.workspaceMemberId, deletedAt: IsNull() },
              select: { id: true, userId: true },
            }),
        ]);
        if (thread?.id !== threadId || member?.userId !== authContext.user.id)
          throw new ForbiddenException(
            'Inbox collision thread is not readable',
          );
        const shape: Array<{ exists: string | null }> =
          await manager.queryRunner.query(
            `SELECT to_regclass('core."campaignEmailWorkCollision"')::text AS "exists"`,
          );
        if (!shape[0]?.exists)
          return { items: [], hasNextPage: false, endCursor: null };
        const scope: AttentionScope = {
          kind: 'collision',
          workspaceId: expectedWorkspaceId,
          threadId,
          memberId: authContext.workspaceMemberId,
          userWorkspaceId: authContext.userWorkspaceId,
          userId: authContext.user.id,
        };
        const cursor = decodeAttentionCursor(input.cursor, scope);
        if (cursor) {
          const anchors: Array<{ createdAt: Date }> =
            await manager.queryRunner.query(
              `SELECT c."createdAt" AS "createdAt" FROM core."campaignEmailWorkCollision" c
              WHERE c."workspaceId"=$1 AND c."messageThreadId"=$2 AND c."id"=$3`,
              [expectedWorkspaceId, threadId, cursor.id],
            );
          if (
            anchors.length !== 1 ||
            !available(anchors[0].createdAt) ||
            anchors[0].createdAt.getTime() !== cursor.createdAt.getTime()
          )
            throw new ConflictException('Inbox collision cursor is stale');
        }
        const rows: Array<{
          collisionId: string;
          originalWorkItemId: string;
          originalState: string;
          createdAt: Date;
        }> = await manager.queryRunner.query(
          `SELECT c."id" AS "collisionId", c."originalWorkId" AS "originalWorkItemId",
              w."state" AS "originalState", c."createdAt" AS "createdAt"
             FROM core."campaignEmailWorkCollision" c
             JOIN core."campaignPartnershipWorkItem" w ON w."id"=c."originalWorkId"
               AND w."workspaceId"=c."workspaceId"
             WHERE c."workspaceId"=$1 AND c."messageThreadId"=$2
               AND ($3::timestamptz IS NULL OR (c."createdAt",c."id") > ($3::timestamptz,$4::uuid))
             ORDER BY c."createdAt", c."id" LIMIT 21`,
          [
            expectedWorkspaceId,
            threadId,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
          ],
        );
        const page = rows.slice(0, PAGE_SIZE);
        const last = page[page.length - 1];
        if (last && (!isUuid(last.collisionId) || !available(last.createdAt)))
          throw new ConflictException('Inbox collision page is invalid');
        return {
          items: page
            .map(({ collisionId, originalWorkItemId, originalState }) => ({
              collisionId,
              originalWorkItemId,
              originalState,
            }))
            .filter((row) => isUuid(row.originalWorkItemId)),
          hasNextPage: rows.length > PAGE_SIZE,
          endCursor: last
            ? encodeAttentionCursor(scope, {
                id: last.collisionId,
                createdAt: last.createdAt,
              })
            : null,
        };
      });
    }, authContext);
  }

  async listHeld(input: {
    authContext: UserWorkspaceAuthContext;
    expectedWorkspaceId: string;
    threadId: string;
    cursor?: string;
  }): Promise<{
    hasNextPage: boolean;
    endCursor: string | null;
    items: Array<{
      workItemId: string;
      contextGeneration: number;
      choices: Array<{
        bindingId: string;
        campaignId: string;
        participationId: string;
        creatorId: string;
      }>;
    }>;
  }> {
    const { authContext, expectedWorkspaceId, threadId } = input;
    const boundary = this.bindingBoundary;
    if (
      authContext?.type !== 'user' ||
      authContext.workspace?.id !== expectedWorkspaceId ||
      !authContext.workspaceMemberId ||
      !authContext.userWorkspaceId ||
      authContext.workspaceMember?.userId !== authContext.user?.id ||
      ![expectedWorkspaceId, threadId].every(isUuid) ||
      !boundary
    )
      throw new ForbiddenException('Authenticated Inbox work read required');
    return this.orm.executeInWorkspaceContext(async () => {
      const context = getWorkspaceContext();
      if (
        context.authContext.type !== 'user' ||
        context.authContext.workspace.id !== expectedWorkspaceId ||
        context.authContext.userWorkspaceId !== authContext.userWorkspaceId ||
        context.authContext.workspaceMemberId !== authContext.workspaceMemberId
      )
        throw new ForbiddenException('Inbox work context changed');
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException('Inbox work role unavailable');
      const [threadRepo, memberRepo] = await Promise.all([
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'messageThread',
          permissions,
        ),
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'workspaceMember',
          permissions,
        ),
      ]);
      return threadRepo.manager.transaction(async (manager) => {
        if (
          !manager.queryRunner?.isTransactionActive ||
          manager.queryRunner.isReleased
        )
          throw new ForbiddenException(
            'Inbox work requires active transaction',
          );
        const tx = manager as WorkspaceEntityManager;
        const [thread, member] = await Promise.all([
          tx
            .getRepository<Row>(threadRepo.target, permissions, authContext)
            .findOne({
              where: { id: threadId, deletedAt: IsNull() },
              select: { id: true },
            }),
          tx
            .getRepository<Row>(memberRepo.target, permissions, authContext)
            .findOne({
              where: { id: authContext.workspaceMemberId, deletedAt: IsNull() },
              select: { id: true, userId: true },
            }),
        ]);
        if (thread?.id !== threadId || member?.userId !== authContext.user.id)
          throw new ForbiddenException('Inbox thread is not readable');
        const query = manager.queryRunner.query.bind(manager.queryRunner);
        const shape: Array<{ exists: string | null }> = await query(
          `SELECT to_regclass('core."UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM"')::text AS "exists"`,
        );
        if (!shape[0]?.exists)
          return { items: [], hasNextPage: false, endCursor: null };
        const scope: AttentionScope = {
          kind: 'held',
          workspaceId: expectedWorkspaceId,
          threadId,
          memberId: authContext.workspaceMemberId,
          userWorkspaceId: authContext.userWorkspaceId,
          userId: authContext.user.id,
        };
        const cursor = decodeAttentionCursor(input.cursor, scope);
        if (cursor) {
          const anchors: Array<{ createdAt: Date }> = await query(
            `SELECT "createdAt" FROM core."campaignPartnershipWorkItem"
             WHERE "workspaceId"=$1 AND "messageThreadId"=$2 AND "id"=$3
               AND "purpose"='REPLY_AMBIGUITY' AND "state"='HELD' AND "providerMessageId" IS NOT NULL`,
            [expectedWorkspaceId, threadId, cursor.id],
          );
          if (
            anchors.length !== 1 ||
            !available(anchors[0].createdAt) ||
            anchors[0].createdAt.getTime() !== cursor.createdAt.getTime()
          )
            throw new ConflictException('Inbox held cursor is stale');
        }
        const works: Work[] = await query(
          `SELECT * FROM core."campaignPartnershipWorkItem" WHERE "workspaceId" = $1 AND "messageThreadId" = $2
           AND "purpose" = 'REPLY_AMBIGUITY' AND "state" = 'HELD' AND "providerMessageId" IS NOT NULL
           AND ($3::timestamptz IS NULL OR ("createdAt","id") > ($3::timestamptz,$4::uuid))
           ORDER BY "createdAt", "id" LIMIT 21`,
          [
            expectedWorkspaceId,
            threadId,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
          ],
        );
        const page = works.slice(0, PAGE_SIZE);
        const last = page[page.length - 1];
        if (last && (!isUuid(last.id) || !available(last.createdAt)))
          throw new ConflictException('Inbox held page is invalid');
        const items = [];
        for (const work of page) {
          if (
            !isUuid(work.canonicalMessageId) ||
            !isUuid(work.messageChannelId) ||
            !isUuid(work.connectedAccountId) ||
            !available(work.providerOccurredAt) ||
            !Number.isSafeInteger(work.contextGeneration)
          )
            continue;
          if (work.reason === 'PROVIDER_ID_COLLISION') {
            items.push({
              workItemId: work.id,
              contextGeneration: work.contextGeneration,
              choices: [],
            });
            continue;
          }
          const inspected = await boundary.inspect({
            authContext,
            route: {
              workspaceId: expectedWorkspaceId,
              messageId: work.canonicalMessageId,
              messageThreadId: threadId,
              messageChannelId: work.messageChannelId,
              connectedAccountId: work.connectedAccountId,
              providerThreadId: work.providerThreadId,
              creatorSender: work.creatorSender,
              accountRecipient: work.accountRecipient,
              providerOccurredAt: work.providerOccurredAt,
            },
          });
          items.push({
            workItemId: work.id,
            contextGeneration: work.contextGeneration,
            choices: inspected.choices,
          });
        }
        return {
          items,
          hasNextPage: works.length > PAGE_SIZE,
          endCursor: last
            ? encodeAttentionCursor(scope, {
                id: last.id,
                createdAt: last.createdAt,
              })
            : null,
        };
      });
    }, authContext);
  }

  async promote(input: PromoteHeldEmailWorkInput): Promise<{
    workItemId: string;
    state: 'PENDING';
    contextGeneration: number;
  }> {
    const { authContext, expectedWorkspaceId, workItemId, bindingId } = input;
    if (
      authContext?.type !== 'user' ||
      authContext.workspace?.id !== expectedWorkspaceId ||
      !authContext.userWorkspaceId ||
      !authContext.workspaceMemberId ||
      !authContext.user?.id ||
      authContext.workspaceMember?.id !== authContext.workspaceMemberId ||
      authContext.workspaceMember.userId !== authContext.user.id ||
      ![expectedWorkspaceId, workItemId, bindingId].every(isUuid) ||
      !Number.isSafeInteger(input.expectedContextGeneration) ||
      input.expectedContextGeneration < 0 ||
      !Number.isSafeInteger(input.expectedParticipationMaterialGeneration) ||
      input.expectedParticipationMaterialGeneration < 0
    )
      throw new ForbiddenException('Authenticated exact work review required');
    return this.orm.executeInWorkspaceContext(async () => {
      const context = getWorkspaceContext();
      if (
        context.authContext.type !== 'user' ||
        context.authContext.workspace.id !== expectedWorkspaceId ||
        context.authContext.userWorkspaceId !== authContext.userWorkspaceId ||
        context.authContext.workspaceMemberId !==
          authContext.workspaceMemberId ||
        context.authContext.user.id !== authContext.user.id
      )
        throw new ForbiddenException('Review workspace context changed');
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException('Current user role required');
      const [
        bindingsBase,
        campaignsBase,
        participationsBase,
        creatorsBase,
        membersBase,
        threadsBase,
      ] = await Promise.all([
        this.orm.getRepository<Binding>(
          expectedWorkspaceId,
          'campaignEmailConversationBinding',
          permissions,
        ),
        this.orm.getRepository<Campaign>(
          expectedWorkspaceId,
          'campaign',
          permissions,
        ),
        this.orm.getRepository<Participation>(
          expectedWorkspaceId,
          'campaignCreator',
          permissions,
        ),
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'creator',
          permissions,
        ),
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'workspaceMember',
          permissions,
        ),
        this.orm.getRepository<Row>(
          expectedWorkspaceId,
          'messageThread',
          permissions,
        ),
      ]);
      // SERIALIZABLE prevents a competing exact route from appearing between the
      // raw all-bindings count and the permissioned selected-row CAS.
      return bindingsBase.manager.transaction(
        'SERIALIZABLE',
        async (manager) => {
          if (
            !manager.queryRunner?.isTransactionActive ||
            manager.queryRunner.isReleased
          )
            throw new ConflictException('Active review transaction required');
          const tx = manager as WorkspaceEntityManager;
          const query = manager.queryRunner.query.bind(manager.queryRunner);
          const bindings = tx.getRepository<Binding>(
            bindingsBase.target,
            permissions,
            authContext,
          );
          const campaigns = tx.getRepository<Campaign>(
            campaignsBase.target,
            permissions,
            authContext,
          );
          const participations = tx.getRepository<Participation>(
            participationsBase.target,
            permissions,
            authContext,
          );
          const creators = tx.getRepository<Row>(
            creatorsBase.target,
            permissions,
            authContext,
          );
          const members = tx.getRepository<Row>(
            membersBase.target,
            permissions,
            authContext,
          );
          const threads = tx.getRepository<Row>(
            threadsBase.target,
            permissions,
            authContext,
          );
          const member = await members.findOne({
            where: { id: authContext.workspaceMemberId, deletedAt: IsNull() },
            select: { id: true, userId: true },
          });
          if (
            member?.id !== authContext.workspaceMemberId ||
            member.userId !== authContext.user.id
          )
            throw new ForbiddenException('Operator membership is not visible');
          const [work]: Work[] = await query(
            `SELECT * FROM core."campaignPartnershipWorkItem" WHERE "id" = $1 AND "workspaceId" = $2 FOR UPDATE`,
            [workItemId, expectedWorkspaceId],
          );
          if (
            !work ||
            work.state !== 'HELD' ||
            work.purpose !== 'REPLY_AMBIGUITY' ||
            work.reason === 'PROVIDER_ID_COLLISION' ||
            work.participationId !== null ||
            work.contextGeneration !== input.expectedContextGeneration ||
            ![
              work.canonicalMessageId,
              work.messageThreadId,
              work.messageChannelId,
              work.connectedAccountId,
              work.accountIncarnationId,
              work.baselineGenerationId,
            ].every(isUuid) ||
            !available(work.providerOccurredAt) ||
            !work.providerMessageId ||
            !work.providerThreadId ||
            !work.creatorSender ||
            !work.accountRecipient
          )
            throw new ConflictException(
              'Held work changed or source identity unavailable',
            );
          const readableThread = await threads.findOne({
            where: { id: work.messageThreadId, deletedAt: IsNull() },
            select: { id: true },
          });
          if (readableThread?.id !== work.messageThreadId)
            throw new ForbiddenException('Inbox thread is no longer visible');
          const [ready]: Array<{ id: string; completedAt: Date }> = await query(
            `SELECT g."id", g."completedAt" FROM core."campaignEmailBaselineGeneration" g
           JOIN core."connectedAccount" a ON a."id" = g."connectedAccountId" AND a."workspaceId" = g."workspaceId"
           JOIN core."messageChannel" ch ON ch."id" = g."messageChannelId" AND ch."workspaceId" = g."workspaceId"
           WHERE g."id" = $1 AND g."workspaceId" = $2 AND g."messageChannelId" = $3
             AND g."connectedAccountId" = $4 AND g."accountIncarnationId" = $5
             AND a."campaignEmailIncarnationId" = g."accountIncarnationId"
             AND ch."connectedAccountId" = a."id" AND a."provider" = 'google' AND g."provider" = 'google'
             AND (a."handle" = $7 OR $7 = ANY(COALESCE(a."handleAliases", '{}'::varchar[])))
             AND g."status" = 'READY' AND g."isCurrent" = true
             AND NOT EXISTS (SELECT 1 FROM core."campaignEmailBaselineItem" i
               WHERE i."generationId" = g."id" AND i."providerMessageId" = $6)
           FOR SHARE OF g, a, ch`,
            [
              work.baselineGenerationId,
              expectedWorkspaceId,
              work.messageChannelId,
              work.connectedAccountId,
              work.accountIncarnationId,
              work.providerMessageId,
              work.accountRecipient,
            ],
          );
          if (
            !ready ||
            !available(ready.completedAt) ||
            work.providerOccurredAt <= ready.completedAt
          )
            throw new ConflictException(
              'Original new-mail frontier is no longer valid',
            );
          await query("SELECT set_config('search_path', $1, true)", [
            getWorkspaceSchemaName(expectedWorkspaceId),
          ]);
          const [source]: Array<{
            id: string;
            creatorId: string | null;
            receivedAt: Date;
            createdAt: Date;
            direction: string;
            isDraft: boolean;
          }> = await query(
            `SELECT m."id", t."creatorId", m."receivedAt", m."createdAt", a."direction", m."isDraft"
           FROM "message" m
           JOIN "messageThread" t ON t."id" = m."messageThreadId" AND t."deletedAt" IS NULL
           JOIN "messageChannelMessageAssociation" a ON a."messageId" = m."id"
             AND a."messageChannelId" = $3 AND a."messageExternalId" = $4
             AND a."messageThreadExternalId" = $7 AND a."deletedAt" IS NULL
           WHERE m."id" = $1 AND m."messageThreadId" = $2 AND m."deletedAt" IS NULL
             AND EXISTS (SELECT 1 FROM "messageParticipant" p
               WHERE p."messageId" = m."id" AND p."role" = 'FROM' AND p."handle" = $5 AND p."deletedAt" IS NULL)
             AND EXISTS (SELECT 1 FROM "messageParticipant" p
               WHERE p."messageId" = m."id" AND p."role" = 'TO' AND p."handle" = $6 AND p."deletedAt" IS NULL)
           FOR SHARE OF m, t, a`,
            [
              work.canonicalMessageId,
              work.messageThreadId,
              work.messageChannelId,
              work.providerMessageId,
              work.creatorSender,
              work.accountRecipient,
              work.providerThreadId,
            ],
          );
          if (
            !source ||
            source.id !== work.canonicalMessageId ||
            !source.creatorId ||
            source.direction !== 'INCOMING' ||
            source.isDraft ||
            !available(source.createdAt) ||
            !available(source.receivedAt) ||
            source.createdAt <= ready.completedAt ||
            source.receivedAt <= ready.completedAt ||
            work.providerOccurredAt > source.createdAt ||
            source.receivedAt > source.createdAt
          )
            throw new ConflictException(
              'Canonical inbound source is no longer exact',
            );
          const [count]: Array<{ count: number }> = await query(
            `SELECT count(*)::integer AS count FROM "campaignEmailConversationBinding"
           WHERE "messageThreadId" = $1 AND "messageChannelId" = $2 AND "connectedAccountId" = $3
             AND "providerThreadId" = $4 AND "creatorSender" = $5 AND "accountRecipient" = $6
             AND "creatorId" = $7 AND ("messageId" IS NULL OR "messageId" = $8)
             AND "revokedAt" IS NULL AND "deletedAt" IS NULL`,
            [
              work.messageThreadId,
              work.messageChannelId,
              work.connectedAccountId,
              work.providerThreadId,
              work.creatorSender,
              work.accountRecipient,
              source.creatorId,
              work.canonicalMessageId,
            ],
          );
          if (count?.count !== 1)
            throw new ConflictException('Exact route is not unique');
          const visible = await bindings.find({
            where: {
              messageThreadId: work.messageThreadId,
              messageChannelId: work.messageChannelId,
              connectedAccountId: work.connectedAccountId,
              providerThreadId: work.providerThreadId,
              creatorSender: work.creatorSender,
              accountRecipient: work.accountRecipient,
              creatorId: source.creatorId,
              revokedAt: IsNull(),
              deletedAt: IsNull(),
            },
          });
          const candidates = visible.filter(
            (row) =>
              row.id === bindingId &&
              (row.messageId === null ||
                row.messageId === work.canonicalMessageId) &&
              row.messageThreadId === work.messageThreadId &&
              row.messageChannelId === work.messageChannelId &&
              row.connectedAccountId === work.connectedAccountId &&
              row.providerThreadId === work.providerThreadId &&
              row.creatorSender === work.creatorSender &&
              row.accountRecipient === work.accountRecipient &&
              row.creatorId === source.creatorId &&
              row.revokedAt === null &&
              row.deletedAt === null,
          );
          if (candidates.length !== 1)
            throw new ForbiddenException(
              'Selected binding is not currently visible',
            );
          const binding = candidates[0];
          if (
            !available(binding.establishedAt) ||
            binding.establishedAt > work.providerOccurredAt ||
            ![binding.campaignId, binding.participationId].every(isUuid)
          )
            throw new ConflictException(
              'Binding establishment or participation changed',
            );
          const campaign = await campaigns.findOne({
            where: { id: binding.campaignId, deletedAt: IsNull() },
            select: {
              id: true,
              replyAgentEnabled: true,
              replyAgentMode: true,
              replyAgentEnabledAt: true,
            },
            lock: { mode: 'pessimistic_write' },
          });
          const participation = await participations.findOne({
            where: {
              id: binding.participationId,
              campaignId: binding.campaignId,
              creatorId: source.creatorId,
              deletedAt: IsNull(),
            },
            select: {
              id: true,
              campaignId: true,
              creatorId: true,
              replyAgentPaused: true,
              replyAgentMaterialGeneration: true,
              replyAgentPauseHistory: true,
              excludedAt: true,
              stage: true,
            },
            lock: { mode: 'pessimistic_write' },
          });
          const creator = await creators.findOne({
            where: { id: source.creatorId, deletedAt: IsNull() },
            select: { id: true },
          });
          if (
            !campaign ||
            !participation ||
            !creator ||
            campaign.replyAgentEnabled !== true ||
            campaign.replyAgentMode !== 'REVIEW' ||
            !available(campaign.replyAgentEnabledAt) ||
            campaign.replyAgentEnabledAt! > work.providerOccurredAt ||
            participation.id !== binding.participationId ||
            participation.campaignId !== binding.campaignId ||
            participation.creatorId !== source.creatorId ||
            participation.replyAgentPaused !== false ||
            participation.excludedAt !== null ||
            participation.stage === 'DROPPED' ||
            (participation.replyAgentPauseHistory !== null &&
              (!Array.isArray(participation.replyAgentPauseHistory) ||
                participation.replyAgentPauseHistory.some(
                  (pause) =>
                    !available(pause.pausedAt) ||
                    (pause.resumedAt !== null && !available(pause.resumedAt)) ||
                    (work.providerOccurredAt >= pause.pausedAt &&
                      (pause.resumedAt === null ||
                        work.providerOccurredAt < pause.resumedAt)),
                ))) ||
            participation.replyAgentMaterialGeneration !==
              input.expectedParticipationMaterialGeneration
          )
            throw new ConflictException(
              'Campaign or participation reply controls changed',
            );
          if (!participations.objectRecordsPermissions)
            throw new ForbiddenException(
              'Participation update permission unavailable',
            );
          validateOperationIsPermittedOrThrow({
            entityName: 'campaignCreator',
            operationType: 'update',
            objectsPermissions: participations.objectRecordsPermissions,
            flatObjectMetadataMaps: context.flatObjectMetadataMaps,
            flatFieldMetadataMaps: context.flatFieldMetadataMaps,
            objectIdByNameSingular: context.objectIdByNameSingular,
            selectedColumns: ['id'],
            allFieldsSelected: false,
            updatedColumns: ['replyAgentMaterialGeneration'],
          });
          // No provider route field changes. Existing G check permits HELD -> PENDING
          // only with the exact resolved participation and actor evidence.
          // TypeORM Postgres UPDATE ... RETURNING yields [rows, rowCount],
          // unlike SELECT/INSERT. Never mistake the tuple for successful CAS.
          const [updated]: [Array<{ id: string }>, number] = await query(
            `UPDATE core."campaignPartnershipWorkItem" SET "state" = 'PENDING',
             "participationId" = $4, "resolvedCampaignId" = $8, "resolvedCreatorId" = $9,
             "resolvedByWorkspaceMemberId" = $5, "resolvedAt" = now(),
             "reason" = NULL, "contextGeneration" = "contextGeneration" + 1,
             "nextDueAt" = now(), "updatedAt" = now()
           WHERE "id" = $1 AND "workspaceId" = $2 AND "state" = 'HELD'
             AND "contextGeneration" = $3 AND "participationId" IS NULL
             AND "baselineGenerationId" = $6 AND "accountIncarnationId" = $7
             AND NOT EXISTS (SELECT 1 FROM core."campaignEmailWorkCollision" c
               WHERE c."workspaceId" = $2 AND c."originalWorkId" = $1)
           RETURNING "id"`,
            [
              workItemId,
              expectedWorkspaceId,
              input.expectedContextGeneration,
              binding.participationId,
              authContext.workspaceMemberId,
              work.baselineGenerationId,
              work.accountIncarnationId,
              binding.campaignId,
              source.creatorId,
            ],
          );
          if (
            !Array.isArray(updated) ||
            updated.length !== 1 ||
            updated[0].id !== workItemId
          )
            throw new ConflictException('Work generation changed');
          return {
            workItemId,
            state: 'PENDING',
            contextGeneration: input.expectedContextGeneration + 1,
          };
        },
      );
    }, authContext);
  }
}
