import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { IsNull, type ObjectLiteral } from 'typeorm';
import { MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS } from 'twenty-shared/metadata';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { type CampaignReplyPauseInterval } from 'src/modules/campaign-partnership/types/campaign-reply-authority.type';

type Campaign = ObjectLiteral & {
  id: string;
  deletedAt: Date | null;
  lifecycleStatus: string;
  replyAgentEnabled: boolean;
  replyAgentMode: 'REVIEW' | 'AUTONOMOUS';
  replyAgentRevision: number;
  replyAgentEnabledAt: Date | null;
};
type Participation = ObjectLiteral & {
  id: string;
  campaignId: string;
  creatorId: string;
  deletedAt: Date | null;
  stage: string | null;
  excludedAt: Date | null;
  replyAgentPaused: boolean;
  replyAgentRevision: number;
  replyAgentMaterialGeneration: number;
  replyAgentPauseHistory: CampaignReplyPauseInterval[] | null;
};
type VisibleRow = ObjectLiteral & { id: string; deletedAt: Date | null };
type VisibleMember = VisibleRow & { userId: string };

type ChangeInput = {
  authContext: UserWorkspaceAuthContext;
  expectedWorkspaceId: string;
  campaignId: string;
  participationId: string;
  expectedCampaignRevision: number;
  expectedParticipationRevision: number;
  /** Fresh material context observed at Resume confirmation, not a send authorization. */
  expectedMaterialGeneration?: number;
  intent: 'PAUSE' | 'RESUME';
  /** Disclosure captured from the visible Campaign control at confirmation time. */
  expectedMode?: 'REVIEW' | 'AUTONOMOUS';
};

type ControlStatus = {
  campaignId: string;
  participationId: string;
  mode: 'REVIEW' | 'AUTONOMOUS';
  paused: boolean;
  campaignRevision: number;
  participationRevision: number;
  materialGeneration: number;
  /** Intent only: caller must schedule a fresh gated reassessment, never replay old work. */
  reassessLatest: boolean;
};

const CONTROL_COLUMNS = [
  'replyAgentPaused',
  'replyAgentRevision',
  'replyAgentPauseHistory',
  'replyAgentChangedAt',
  'replyAgentChangedByWorkspaceMemberId',
];

/** Intentionally not registered until the MYAH-410 workspace admission is verified. */
@Injectable()
export class CampaignParticipationReplyControlService {
  constructor(private readonly orm: GlobalWorkspaceOrmManager) {}

  async change(input: ChangeInput): Promise<ControlStatus> {
    const { authContext, campaignId, participationId, expectedWorkspaceId } =
      input;
    if (
      authContext?.type !== 'user' ||
      !authContext.userWorkspaceId ||
      !authContext.workspaceMemberId ||
      !authContext.user?.id ||
      authContext.workspaceMember?.id !== authContext.workspaceMemberId ||
      authContext.workspaceMember.userId !== authContext.user.id ||
      ![expectedWorkspaceId, campaignId, participationId].every(isUuid) ||
      expectedWorkspaceId !== authContext.workspace?.id
    )
      throw new ForbiddenException(
        'Participation control requires a workspace user',
      );
    if (
      !Number.isSafeInteger(input.expectedCampaignRevision) ||
      input.expectedCampaignRevision < 0 ||
      !Number.isSafeInteger(input.expectedParticipationRevision) ||
      input.expectedParticipationRevision < 0 ||
      !['PAUSE', 'RESUME'].includes(input.intent) ||
      (input.intent === 'RESUME' &&
        (!['REVIEW', 'AUTONOMOUS'].includes(input.expectedMode ?? '') ||
          !Number.isSafeInteger(input.expectedMaterialGeneration) ||
          (input.expectedMaterialGeneration ?? -1) < 0))
    )
      throw new BadRequestException(
        'Invalid participation control generation or disclosure',
      );

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
          'Participation control workspace context changed',
        );
      const permissions = resolveRolePermissionConfig({
        authContext,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
        apiKeyRoleMap: context.apiKeyRoleMap,
      });
      if (!permissions || 'shouldBypassPermissionChecks' in permissions)
        throw new ForbiddenException(
          'Participation control requires current role permissions',
        );
      const [campaignBase, participationBase, creatorBase, memberBase] =
        await Promise.all([
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
          this.orm.getRepository<VisibleRow>(
            expectedWorkspaceId,
            'creator',
            permissions,
          ),
          this.orm.getRepository<VisibleMember>(
            expectedWorkspaceId,
            'workspaceMember',
            permissions,
          ),
        ]);
      return participationBase.manager.transaction(async (manager) => {
        if (
          !manager.queryRunner?.isTransactionActive ||
          manager.queryRunner.isReleased
        )
          throw new ConflictException(
            'Participation control requires an active transaction',
          );
        const workspaceManager = manager as WorkspaceEntityManager;
        const campaignRepo = workspaceManager.getRepository<Campaign>(
          campaignBase.target,
          permissions,
          authContext,
        );
        const participationRepo = workspaceManager.getRepository<Participation>(
          participationBase.target,
          permissions,
          authContext,
        );
        const creatorRepo = workspaceManager.getRepository<VisibleRow>(
          creatorBase.target,
          permissions,
          authContext,
        );
        const memberRepo = workspaceManager.getRepository<VisibleMember>(
          memberBase.target,
          permissions,
          authContext,
        );

        // Stable order shared by callers: Campaign then exact participation. Never
        // lock a role-invisible row through a bypass repository.
        const campaign = await campaignRepo.findOne({
          where: { id: campaignId, deletedAt: IsNull() },
          select: {
            id: true,
            deletedAt: true,
            lifecycleStatus: true,
            replyAgentEnabled: true,
            replyAgentEnabledAt: true,
            replyAgentMode: true,
            replyAgentRevision: true,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !campaign ||
          campaign.replyAgentEnabled !== true ||
          !campaign.replyAgentEnabledAt ||
          !['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'].includes(
            campaign.lifecycleStatus,
          ) ||
          !['REVIEW', 'AUTONOMOUS'].includes(campaign.replyAgentMode) ||
          !Number.isSafeInteger(campaign.replyAgentRevision)
        )
          throw new ConflictException(
            'Campaign agent is disabled or unavailable',
          );
        if (
          campaign.replyAgentRevision !== input.expectedCampaignRevision ||
          (input.intent === 'RESUME' &&
            input.expectedMode !== campaign.replyAgentMode)
        )
          throw new ConflictException(
            'Campaign mode or generation changed; disclose current mode',
          );
        const participation = await participationRepo.findOne({
          where: { id: participationId, campaignId, deletedAt: IsNull() },
          select: {
            id: true,
            campaignId: true,
            creatorId: true,
            deletedAt: true,
            stage: true,
            excludedAt: true,
            replyAgentPaused: true,
            replyAgentRevision: true,
            replyAgentMaterialGeneration: true,
            replyAgentPauseHistory: true,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !participation ||
          participation.id !== participationId ||
          participation.campaignId !== campaignId ||
          !isUuid(participation.creatorId)
        )
          throw new ForbiddenException(
            'Participation is not visible in this Campaign',
          );
        const [creator, member] = await Promise.all([
          creatorRepo.findOne({
            where: { id: participation.creatorId, deletedAt: IsNull() },
            select: { id: true },
          }),
          memberRepo.findOne({
            where: { id: authContext.workspaceMemberId, deletedAt: IsNull() },
            select: { id: true, userId: true },
          }),
        ]);
        if (!creator || !member || member.userId !== authContext.user.id)
          throw new ForbiddenException(
            'Creator or operator membership is no longer visible',
          );

        // Same permission engine as the workspace repository's update. Check even
        // no-ops, so permission loss cannot reveal or reuse old control authority.
        if (!participationRepo.objectRecordsPermissions)
          throw new ForbiddenException(
            'Participation update permission unavailable',
          );
        validateOperationIsPermittedOrThrow({
          entityName: 'campaignCreator',
          operationType: 'update',
          objectsPermissions: participationRepo.objectRecordsPermissions,
          flatObjectMetadataMaps: context.flatObjectMetadataMaps,
          flatFieldMetadataMaps: context.flatFieldMetadataMaps,
          objectIdByNameSingular: context.objectIdByNameSingular,
          selectedColumns: ['id'],
          allFieldsSelected: false,
          updatedColumns: CONTROL_COLUMNS,
        });
        // Both the material comparison and pause update occur under the same
        // participation row lock. A later writer must use this lock too; there
        // is intentionally no unproven event producer or stale-draft release.
        if (
          !Number.isSafeInteger(participation.replyAgentMaterialGeneration) ||
          participation.replyAgentMaterialGeneration < 0 ||
          (input.intent === 'RESUME' &&
            participation.replyAgentMaterialGeneration !==
              input.expectedMaterialGeneration)
        )
          throw new ConflictException(
            'Material context changed; refresh resume disclosure',
          );
        const history = participation.replyAgentPauseHistory ?? [];
        if (
          !Array.isArray(history) ||
          !Number.isSafeInteger(participation.replyAgentRevision) ||
          typeof participation.replyAgentPaused !== 'boolean'
        )
          throw new ConflictException('Participation controls are unavailable');
        const desiredPaused = input.intent === 'PAUSE';
        const latest = history[history.length - 1];
        if (
          input.intent === 'RESUME' &&
          (participation.excludedAt != null ||
            !MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.some(
              ({ value }) => value === participation.stage,
            ) ||
            participation.stage === 'DROPPED')
        )
          throw new ConflictException(
            'A participation exclusion or terminal stage prevents resume',
          );
        if (
          participation.replyAgentRevision !==
          input.expectedParticipationRevision
        ) {
          if (
            participation.replyAgentRevision !==
              input.expectedParticipationRevision + 1 ||
            participation.replyAgentPaused !== desiredPaused ||
            !latest ||
            (desiredPaused
              ? latest.pausedRevision !== participation.replyAgentRevision ||
                latest.pausedByWorkspaceMemberId !==
                  authContext.workspaceMemberId ||
                latest.resumedAt !== null
              : latest.resumedRevision !== participation.replyAgentRevision ||
                latest.resumedByWorkspaceMemberId !==
                  authContext.workspaceMemberId)
          )
            throw new ConflictException('Participation controls changed');
          return this.status(campaign, participation, false);
        }
        if (participation.replyAgentPaused === desiredPaused)
          throw new ConflictException(
            'Control intent already applied at a different generation',
          );
        if (
          input.intent === 'RESUME' &&
          (!latest ||
            latest.resumedAt !== null ||
            latest.pausedRevision !== participation.replyAgentRevision)
        )
          throw new ConflictException(
            'Pause history does not match current state',
          );
        if (input.intent === 'PAUSE' && latest?.resumedAt === null)
          throw new ConflictException('Pause history has an open interval');
        const now = new Date();
        const nextRevision = participation.replyAgentRevision + 1;
        const nextHistory: CampaignReplyPauseInterval[] = desiredPaused
          ? [
              ...history,
              {
                pausedAt: now,
                pausedByWorkspaceMemberId: authContext.workspaceMemberId,
                pausedRevision: nextRevision,
                resumedAt: null,
                resumedByWorkspaceMemberId: null,
                resumedRevision: null,
              },
            ]
          : [
              ...history.slice(0, -1),
              {
                ...latest,
                resumedAt: now,
                resumedByWorkspaceMemberId: authContext.workspaceMemberId,
                resumedRevision: nextRevision,
              },
            ];
        // SAFETY: RAW_JSON history is a full value replacement; TypeORM's deep-partial
        // typing recursively treats its Date and string entries as entity columns.
        const update = await participationRepo.update(
          {
            id: participationId,
            campaignId,
            replyAgentRevision: input.expectedParticipationRevision,
            replyAgentMaterialGeneration:
              participation.replyAgentMaterialGeneration,
          },
          {
            replyAgentPaused: desiredPaused,
            replyAgentRevision: nextRevision,
            replyAgentPauseHistory: nextHistory,
            replyAgentChangedAt: now,
            replyAgentChangedByWorkspaceMemberId: authContext.workspaceMemberId,
          } as unknown as QueryDeepPartialEntity<Participation>,
        );
        if (update.affected !== 1)
          throw new ConflictException(
            'Participation control generation changed',
          );
        return this.status(
          campaign,
          {
            ...participation,
            replyAgentPaused: desiredPaused,
            replyAgentRevision: nextRevision,
          },
          !desiredPaused,
        );
      });
    }, authContext);
  }

  private status(
    campaign: Campaign,
    participation: Participation,
    reassessLatest: boolean,
  ): ControlStatus {
    return {
      campaignId: campaign.id,
      participationId: participation.id,
      mode: campaign.replyAgentMode,
      paused: participation.replyAgentPaused,
      campaignRevision: campaign.replyAgentRevision,
      participationRevision: participation.replyAgentRevision,
      materialGeneration: participation.replyAgentMaterialGeneration,
      reassessLatest,
    };
  }
}
