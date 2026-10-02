import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { IsNull, type ObjectLiteral } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

type Campaign = ObjectLiteral & {
  id: string;
  deletedAt: Date | null;
  lifecycleStatus: string;
  replyAgentEnabled: boolean;
  replyAgentMode: 'REVIEW' | 'AUTONOMOUS';
  replyAgentRevision: number;
  replyAgentEnabledAt: Date | null;
  replyAgentEnabledByUserWorkspaceId: string | null;
  replyAgentChangedAt: Date | null;
  replyAgentChangedByWorkspaceMemberId: string | null;
};
type Member = ObjectLiteral & {
  id: string;
  userId: string;
  deletedAt: Date | null;
};

type ChangeInput = {
  authContext: UserWorkspaceAuthContext;
  expectedWorkspaceId: string;
  campaignId: string;
  expectedRevision: number;
  intent: 'ENABLE' | 'DISABLE';
};

type ReviewStatus = {
  campaignId: string;
  enabled: boolean;
  mode: 'REVIEW';
  revision: number;
  enabledByUserWorkspaceId: string | null;
};

const CONTROL_COLUMNS = [
  'replyAgentEnabled',
  'replyAgentMode',
  'replyAgentRevision',
  'replyAgentEnabledAt',
  'replyAgentEnabledByUserWorkspaceId',
  'replyAgentChangedAt',
  'replyAgentChangedByWorkspaceMemberId',
];

/** Dormant domain writer. Do not register until eligible automatic proposal work exists. */
@Injectable()
export class CampaignReviewEnablementService {
  constructor(private readonly orm: GlobalWorkspaceOrmManager) {}

  async change(input: ChangeInput): Promise<ReviewStatus> {
    const { authContext, expectedWorkspaceId, campaignId } = input;
    if (
      authContext?.type !== 'user' ||
      !authContext.userWorkspaceId ||
      !isUuid(authContext.userWorkspaceId) ||
      !authContext.workspaceMemberId ||
      !authContext.user?.id ||
      authContext.workspaceMember?.id !== authContext.workspaceMemberId ||
      authContext.workspaceMember.userId !== authContext.user.id ||
      ![expectedWorkspaceId, campaignId].every(isUuid) ||
      expectedWorkspaceId !== authContext.workspace?.id
    )
      throw new ForbiddenException('Campaign Review requires a workspace user');
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !['ENABLE', 'DISABLE'].includes(input.intent)
    )
      throw new BadRequestException('Invalid Campaign Review control');

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
        throw new ForbiddenException(
          'Campaign Review workspace context changed',
        );
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException(
          'Campaign Review requires current role permissions',
        );
      const [campaignBase, memberBase] = await Promise.all([
        this.orm.getRepository<Campaign>(
          expectedWorkspaceId,
          'campaign',
          permissions,
        ),
        this.orm.getRepository<Member>(
          expectedWorkspaceId,
          'workspaceMember',
          permissions,
        ),
      ]);
      return campaignBase.manager.transaction(async (manager) => {
        if (
          !manager.queryRunner?.isTransactionActive ||
          manager.queryRunner.isReleased
        )
          throw new ConflictException(
            'Campaign Review requires an active transaction',
          );
        const workspaceManager = manager as WorkspaceEntityManager;
        const campaignRepo = workspaceManager.getRepository<Campaign>(
          campaignBase.target,
          permissions,
          authContext,
        );
        const memberRepo = workspaceManager.getRepository<Member>(
          memberBase.target,
          permissions,
          authContext,
        );
        // Permissioned read and row lock precede the revision-guarded write.
        const campaign = await campaignRepo.findOne({
          where: { id: campaignId, deletedAt: IsNull() },
          select: {
            id: true,
            deletedAt: true,
            lifecycleStatus: true,
            replyAgentEnabled: true,
            replyAgentMode: true,
            replyAgentRevision: true,
            replyAgentEnabledAt: true,
            replyAgentEnabledByUserWorkspaceId: true,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !campaign ||
          campaign.id !== campaignId ||
          !['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'].includes(
            campaign.lifecycleStatus,
          ) ||
          campaign.replyAgentMode !== 'REVIEW' ||
          typeof campaign.replyAgentEnabled !== 'boolean' ||
          !Number.isSafeInteger(campaign.replyAgentRevision) ||
          campaign.replyAgentRevision < 0
        )
          throw new ConflictException('Campaign Review is unavailable');
        const member = await memberRepo.findOne({
          where: { id: authContext.workspaceMemberId, deletedAt: IsNull() },
          select: { id: true, userId: true },
        });
        if (!member || member.userId !== authContext.user.id)
          throw new ForbiddenException(
            'Operator membership is no longer visible',
          );
        if (!campaignRepo.objectRecordsPermissions)
          throw new ForbiddenException(
            'Campaign update permission unavailable',
          );
        validateOperationIsPermittedOrThrow({
          entityName: 'campaign',
          operationType: 'update',
          objectsPermissions: campaignRepo.objectRecordsPermissions,
          flatObjectMetadataMaps: context.flatObjectMetadataMaps,
          flatFieldMetadataMaps: context.flatFieldMetadataMaps,
          objectIdByNameSingular: context.objectIdByNameSingular,
          selectedColumns: ['id'],
          allFieldsSelected: false,
          updatedColumns: CONTROL_COLUMNS,
        });
        if (campaign.replyAgentRevision !== input.expectedRevision)
          throw new ConflictException('Campaign Review generation changed');
        const enabled = input.intent === 'ENABLE';
        if (campaign.replyAgentEnabled === enabled)
          throw new ConflictException('Campaign Review intent already applied');
        if (
          !enabled &&
          (!campaign.replyAgentEnabledAt ||
            !isUuid(campaign.replyAgentEnabledByUserWorkspaceId ?? ''))
        )
          throw new ConflictException(
            'Campaign Review authority is unavailable',
          );
        const now = new Date();
        const principal = enabled ? authContext.userWorkspaceId : null;
        const update = await campaignRepo.update(
          {
            id: campaignId,
            deletedAt: IsNull(),
            replyAgentRevision: input.expectedRevision,
            replyAgentEnabled: !enabled,
            replyAgentMode: 'REVIEW',
          },
          {
            replyAgentEnabled: enabled,
            replyAgentMode: 'REVIEW',
            replyAgentRevision: input.expectedRevision + 1,
            replyAgentEnabledAt: enabled ? now : null,
            replyAgentEnabledByUserWorkspaceId: principal,
            replyAgentChangedAt: now,
            replyAgentChangedByWorkspaceMemberId: authContext.workspaceMemberId,
          },
          undefined,
          undefined,
          ['id'],
        );
        if (update.affected !== 1)
          throw new ConflictException('Campaign Review generation changed');
        return {
          campaignId,
          enabled,
          mode: 'REVIEW' as const,
          revision: input.expectedRevision + 1,
          enabledByUserWorkspaceId: principal,
        };
      });
    }, authContext);
  }
}
