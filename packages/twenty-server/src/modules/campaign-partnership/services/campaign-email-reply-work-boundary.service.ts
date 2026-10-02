import { ForbiddenException, Injectable } from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { IsNull, type ObjectLiteral } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

/** Readable options only; this never authorizes promotion, generation or send.
 * A selected binding is rechecked with the original provider receipt in the
 * authenticated SERIALIZABLE review transaction. */

type Route = {
  workspaceId: string;
  messageId: string;
  messageThreadId: string;
  messageChannelId: string;
  connectedAccountId: string;
  providerThreadId: string;
  creatorSender: string;
  accountRecipient: string;
  providerOccurredAt: Date;
};
type Binding = ObjectLiteral &
  Omit<Route, 'providerOccurredAt'> & {
    id: string;
    campaignId: string;
    participationId: string;
    creatorId: string;
    messageId: string | null;
    establishedAt: Date;
    revokedAt: Date | null;
    deletedAt: Date | null;
  };
type Row = ObjectLiteral & { id: string; deletedAt: Date | null };
type Campaign = Row & {
  replyAgentEnabled: boolean;
  replyAgentMode: string;
  replyAgentEnabledAt: Date | null;
};
type Participation = Row & {
  campaignId: string;
  creatorId: string;
  replyAgentPaused: boolean;
  excludedAt: Date | null;
  stage: string;
};
type Member = Row & { userId: string };
type Inspection = {
  choices: Array<{
    bindingId: string;
    campaignId: string;
    participationId: string;
    creatorId: string;
  }>;
};

@Injectable()
export class CampaignEmailReplyWorkBoundaryService {
  constructor(private readonly orm: GlobalWorkspaceOrmManager) {}

  async inspect(input: {
    authContext: UserWorkspaceAuthContext;
    route: Route;
  }): Promise<Inspection> {
    const { authContext, route } = input;
    if (
      authContext?.type !== 'user' ||
      !authContext.userWorkspaceId ||
      !authContext.workspaceMemberId ||
      !authContext.user?.id ||
      authContext.workspaceMember?.id !== authContext.workspaceMemberId ||
      authContext.workspaceMember.userId !== authContext.user.id ||
      authContext.workspace?.id !== route.workspaceId ||
      ![
        route.workspaceId,
        route.messageId,
        route.messageThreadId,
        route.messageChannelId,
        route.connectedAccountId,
      ].every(isUuid) ||
      !(route.providerOccurredAt instanceof Date) ||
      !Number.isFinite(route.providerOccurredAt.getTime()) ||
      ![
        route.providerThreadId,
        route.creatorSender,
        route.accountRecipient,
      ].every((value) => typeof value === 'string' && value.trim().length > 0)
    )
      throw new ForbiddenException(
        'Reply work requires an exact workspace route and user',
      );

    return this.orm.executeInWorkspaceContext(async () => {
      const context = getWorkspaceContext();
      if (
        context.authContext.type !== 'user' ||
        context.authContext.workspace.id !== route.workspaceId ||
        context.authContext.userWorkspaceId !== authContext.userWorkspaceId ||
        context.authContext.workspaceMemberId !==
          authContext.workspaceMemberId ||
        context.authContext.user.id !== authContext.user.id
      )
        throw new ForbiddenException('Reply work workspace context changed');
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException('Current role permissions required');
      const [
        bindingBase,
        campaignBase,
        participationBase,
        creatorBase,
        memberBase,
      ] = await Promise.all([
        this.orm.getRepository<Binding>(
          route.workspaceId,
          'campaignEmailConversationBinding',
          permissions,
        ),
        this.orm.getRepository<Campaign>(
          route.workspaceId,
          'campaign',
          permissions,
        ),
        this.orm.getRepository<Participation>(
          route.workspaceId,
          'campaignCreator',
          permissions,
        ),
        this.orm.getRepository<Row>(route.workspaceId, 'creator', permissions),
        this.orm.getRepository<Member>(
          route.workspaceId,
          'workspaceMember',
          permissions,
        ),
      ]);
      return bindingBase.manager.transaction(async (manager) => {
        if (
          !manager.queryRunner?.isTransactionActive ||
          manager.queryRunner.isReleased
        )
          throw new ForbiddenException(
            'Active inspection transaction required',
          );
        const scoped = manager as WorkspaceEntityManager;
        const bindings = scoped.getRepository<Binding>(
          bindingBase.target,
          permissions,
          authContext,
        );
        const campaigns = scoped.getRepository<Campaign>(
          campaignBase.target,
          permissions,
          authContext,
        );
        const participations = scoped.getRepository<Participation>(
          participationBase.target,
          permissions,
          authContext,
        );
        const creators = scoped.getRepository<Row>(
          creatorBase.target,
          permissions,
          authContext,
        );
        const members = scoped.getRepository<Member>(
          memberBase.target,
          permissions,
          authContext,
        );
        const member = await members.findOne({
          where: { id: authContext.workspaceMemberId, deletedAt: IsNull() },
          select: { id: true, userId: true },
        });
        if (!member || member.userId !== authContext.user.id)
          throw new ForbiddenException(
            'Operator membership is no longer visible',
          );
        const rows = await bindings.find({
          where: {
            messageThreadId: route.messageThreadId,
            messageChannelId: route.messageChannelId,
            connectedAccountId: route.connectedAccountId,
            providerThreadId: route.providerThreadId,
            creatorSender: route.creatorSender,
            accountRecipient: route.accountRecipient,
            revokedAt: IsNull(),
            deletedAt: IsNull(),
          },
        });
        const choices: Inspection['choices'] = [];
        for (const row of rows) {
          if (row.messageId !== null && row.messageId !== route.messageId)
            continue;
          if (
            ![row.id, row.campaignId, row.participationId, row.creatorId].every(
              isUuid,
            )
          )
            continue;
          const campaign = await campaigns.findOne({
            where: { id: row.campaignId, deletedAt: IsNull() },
            select: {
              id: true,
              replyAgentEnabled: true,
              replyAgentMode: true,
              replyAgentEnabledAt: true,
            },
          });
          const participation = await participations.findOne({
            where: {
              id: row.participationId,
              campaignId: row.campaignId,
              creatorId: row.creatorId,
              deletedAt: IsNull(),
            },
            select: {
              id: true,
              campaignId: true,
              creatorId: true,
              replyAgentPaused: true,
              excludedAt: true,
              stage: true,
            },
          });
          const creator = await creators.findOne({
            where: { id: row.creatorId, deletedAt: IsNull() },
            select: { id: true },
          });
          if (
            campaign?.id === row.campaignId &&
            campaign.replyAgentEnabled === true &&
            campaign.replyAgentMode === 'REVIEW' &&
            campaign.replyAgentEnabledAt instanceof Date &&
            campaign.replyAgentEnabledAt <= route.providerOccurredAt &&
            row.establishedAt instanceof Date &&
            row.establishedAt <= route.providerOccurredAt &&
            participation?.id === row.participationId &&
            participation.campaignId === row.campaignId &&
            participation.creatorId === row.creatorId &&
            participation.replyAgentPaused === false &&
            participation.excludedAt === null &&
            participation.stage !== 'DROPPED' &&
            creator?.id === row.creatorId
          )
            choices.push({
              bindingId: row.id,
              campaignId: row.campaignId,
              participationId: row.participationId,
              creatorId: row.creatorId,
            });
        }
        return { choices };
      });
    }, authContext);
  }
}
