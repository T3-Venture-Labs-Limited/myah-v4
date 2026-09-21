import { ForbiddenException, Injectable } from '@nestjs/common';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { In, IsNull } from 'typeorm';

import { CampaignEnrollmentEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-enrollment.entity';
import { CampaignOccurrenceEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-occurrence.entity';
import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { type CampaignActivityConnectionDTO } from 'src/modules/campaign-execution/dtos/campaign-activity.dto';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

type CampaignCreatorRecord = {
  id: string;
  creatorId: string;
  campaignId: string;
  stage: string | null;
  excludedAt: Date | string | null;
  exclusionReason: string | null;
  outcomeSummary: string | null;
  deletedAt: Date | null;
};

type ActivityFact = {
  campaignCreatorId: string;
  creatorId: string;
  enrollmentHoldReason: string | null;
  occurrenceHoldReason: string | null;
  occurrenceState: string | null;
  plannedAt: Date | string | null;
  currentAttemptState: string | null;
  outboundAttemptState: string | null;
  outboundAt: Date | string | null;
  projectedMessageId: string | null;
  projectedMessageThreadId: string | null;
  inFlightCount: number | string;
  inboundMessageId: string | null;
  inboundAt: Date | string | null;
};

const toIso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

const encodeCursor = (campaignId: string, offset: number): string =>
  Buffer.from(JSON.stringify({ v: 1, campaignId, offset }), 'utf8').toString(
    'base64url',
  );

const decodeCursor = (
  cursor: string | undefined,
  campaignId: string,
): number => {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      value.v !== 1 ||
      value.campaignId !== campaignId ||
      !Number.isSafeInteger(value.offset) ||
      Number(value.offset) < 0
    )
      throw new Error();
    return Number(value.offset);
  } catch {
    throw new Error('Invalid Campaign activity cursor');
  }
};

@Injectable()
export class CampaignActivityReaderService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly messageVisibility: MessageVisibilityPolicyService,
    private readonly flatEntityMapsCache: WorkspaceManyOrAllFlatEntityMapsCacheService,
    @InjectWorkspaceScopedRepository(CampaignEnrollmentEntity)
    private readonly campaignEnrollments: WorkspaceScopedRepository<CampaignEnrollmentEntity>,
    @InjectWorkspaceScopedRepository(CampaignOccurrenceEntity)
    private readonly campaignOccurrences: WorkspaceScopedRepository<CampaignOccurrenceEntity>,
    @InjectWorkspaceScopedRepository(OutboundEmailAttemptEntity)
    private readonly outboundAttempts: WorkspaceScopedRepository<OutboundEmailAttemptEntity>,
  ) {}

  async read(input: {
    campaignId: string;
    first: number;
    after?: string;
    authContext: WorkspaceAuthContext;
  }): Promise<CampaignActivityConnectionDTO> {
    const workspaceId = input.authContext.workspace.id;

    return this.orm.executeInWorkspaceContext(async () => {
      const workspaceContext = getWorkspaceContext();
      const permissions = resolveRolePermissionConfig({
        authContext: input.authContext,
        userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
        apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
      });
      if (!permissions)
        throw new ForbiddenException('Campaign activity permissions required');

      const campaignRepository = await this.orm.getRepository<{ id: string }>(
        workspaceId,
        'campaign',
        permissions,
      );
      const campaign = await campaignRepository.findOne({
        select: { id: true },
        where: { id: input.campaignId },
      });
      if (!campaign) throw new ForbiddenException('Campaign is not readable');

      const creatorRepository =
        await this.orm.getRepository<CampaignCreatorRecord>(
          workspaceId,
          'campaignCreator',
          permissions,
        );
      const campaignCreators = await creatorRepository.find({
        select: {
          id: true,
          creatorId: true,
          campaignId: true,
          stage: true,
          excludedAt: true,
          exclusionReason: true,
          outcomeSummary: true,
        },
        where: { campaignId: input.campaignId, deletedAt: IsNull() },
      });
      if (campaignCreators.length === 0)
        return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };

      const readableCreatorRepository = await this.orm.getRepository<{
        id: string;
        name: string | null;
      }>(workspaceId, 'creator', permissions);
      const readableCreators = await readableCreatorRepository.find({
        select: { id: true, name: true },
        where: { id: In(campaignCreators.map(({ creatorId }) => creatorId)) },
      });
      const readableCreatorById = new Map(
        readableCreators.map((creator) => [creator.id, creator]),
      );
      const readableCampaignCreators = campaignCreators.filter(
        ({ creatorId }) => readableCreatorById.has(creatorId),
      );
      if (readableCampaignCreators.length === 0)
        return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };

      const stageLabels = await this.stageLabels(workspaceId);
      const campaignCreatorIds = readableCampaignCreators.map(({ id }) => id);
      const creatorIds = readableCampaignCreators.map(
        ({ creatorId }) => creatorId,
      );
      const enrollments = await this.campaignEnrollments.find(workspaceId, {
        where: {
          campaignId: input.campaignId,
          campaignCreatorId: In(campaignCreatorIds),
        },
        order: { enrolledAt: 'DESC', id: 'DESC' },
      });
      const enrollmentByCampaignCreatorId = new Map<
        string,
        CampaignEnrollmentEntity
      >();
      for (const enrollment of enrollments)
        if (!enrollmentByCampaignCreatorId.has(enrollment.campaignCreatorId))
          enrollmentByCampaignCreatorId.set(
            enrollment.campaignCreatorId,
            enrollment,
          );
      const enrollmentIds = [...enrollmentByCampaignCreatorId.values()].map(
        ({ id }) => id,
      );
      const timelineRepository =
        await this.orm.getRepository<TimelineActivityWorkspaceEntity>(
          workspaceId,
          'timelineActivity',
          permissions,
        );
      const [occurrences, attempts, replies] = await Promise.all([
        this.campaignOccurrences.find(workspaceId, {
          where: {
            campaignId: input.campaignId,
            enrollmentId: In(enrollmentIds),
            state: In(['PENDING', 'HELD', 'UNKNOWN', 'IN_FLIGHT']),
          },
          order: { dueAt: 'ASC', id: 'ASC' },
        }),
        this.outboundAttempts.find(workspaceId, {
          where: {
            campaignId: input.campaignId,
            enrollmentId: In(enrollmentIds),
          },
          order: { updatedAt: 'DESC', attemptId: 'DESC' },
        }),
        timelineRepository.find({
          where: {
            name: 'campaign.replied',
            targetCreatorId: In(creatorIds),
          },
          order: { happensAt: 'DESC', id: 'DESC' },
        }),
      ]);
      const occurrenceByEnrollmentId = new Map<
        string,
        CampaignOccurrenceEntity
      >();
      for (const occurrence of occurrences)
        if (!occurrenceByEnrollmentId.has(occurrence.enrollmentId))
          occurrenceByEnrollmentId.set(occurrence.enrollmentId, occurrence);
      const currentAttemptByEnrollmentId = new Map<
        string,
        OutboundEmailAttemptEntity
      >();
      const inFlightCountByEnrollmentId = new Map<string, number>();
      for (const attempt of attempts) {
        if (
          attempt.enrollmentId &&
          !currentAttemptByEnrollmentId.has(attempt.enrollmentId)
        )
          currentAttemptByEnrollmentId.set(attempt.enrollmentId, attempt);
        if (
          attempt.enrollmentId &&
          ['PROCESSING', 'UNKNOWN'].includes(attempt.attemptState)
        )
          inFlightCountByEnrollmentId.set(
            attempt.enrollmentId,
            (inFlightCountByEnrollmentId.get(attempt.enrollmentId) ?? 0) + 1,
          );
      }
      const acceptedAttemptByEnrollmentId = new Map<
        string,
        OutboundEmailAttemptEntity
      >();
      for (const attempt of attempts
        .filter(
          (candidate) =>
            candidate.enrollmentId &&
            candidate.attemptState === 'ACCEPTED' &&
            candidate.providerAcceptedAt &&
            candidate.projectedMessageId &&
            candidate.projectedMessageThreadId,
        )
        .sort(
          (left, right) =>
            (right.providerAcceptedAt?.getTime() ?? 0) -
              (left.providerAcceptedAt?.getTime() ?? 0) ||
            right.attemptId.localeCompare(left.attemptId),
        ))
        if (
          attempt.enrollmentId &&
          !acceptedAttemptByEnrollmentId.has(attempt.enrollmentId)
        )
          acceptedAttemptByEnrollmentId.set(attempt.enrollmentId, attempt);
      const replyByCreatorId = new Map<
        string,
        { messageId: string; happensAt: Date }
      >();
      for (const reply of replies) {
        const campaignEvent = (
          reply.properties as {
            campaignEvent?: {
              campaignId?: unknown;
              messageId?: unknown;
              sourceType?: unknown;
            };
          } | null
        )?.campaignEvent;
        if (
          reply.targetCreatorId &&
          !replyByCreatorId.has(reply.targetCreatorId) &&
          campaignEvent?.campaignId === input.campaignId &&
          campaignEvent.sourceType === 'MESSAGE' &&
          typeof campaignEvent.messageId === 'string'
        )
          replyByCreatorId.set(reply.targetCreatorId, {
            messageId: campaignEvent.messageId,
            happensAt: reply.happensAt,
          });
      }
      const facts: ActivityFact[] = readableCampaignCreators.map(
        (campaignCreator) => {
          const enrollment = enrollmentByCampaignCreatorId.get(
            campaignCreator.id,
          );
          const occurrence = enrollment
            ? occurrenceByEnrollmentId.get(enrollment.id)
            : undefined;
          const currentAttempt = enrollment
            ? currentAttemptByEnrollmentId.get(enrollment.id)
            : undefined;
          const acceptedAttempt = enrollment
            ? acceptedAttemptByEnrollmentId.get(enrollment.id)
            : undefined;
          const reply = replyByCreatorId.get(campaignCreator.creatorId);

          return {
            campaignCreatorId: campaignCreator.id,
            creatorId: campaignCreator.creatorId,
            enrollmentHoldReason: enrollment?.holdReason ?? null,
            occurrenceHoldReason: occurrence?.holdReason ?? null,
            occurrenceState: occurrence?.state ?? null,
            plannedAt: occurrence?.dueAt ?? null,
            currentAttemptState: currentAttempt?.attemptState ?? null,
            outboundAttemptState: acceptedAttempt?.attemptState ?? null,
            outboundAt: acceptedAttempt?.providerAcceptedAt ?? null,
            projectedMessageId: acceptedAttempt?.projectedMessageId ?? null,
            projectedMessageThreadId:
              acceptedAttempt?.projectedMessageThreadId ?? null,
            inFlightCount: enrollment
              ? (inFlightCountByEnrollmentId.get(enrollment.id) ?? 0)
              : 0,
            inboundMessageId: reply?.messageId ?? null,
            inboundAt: reply?.happensAt ?? null,
          };
        },
      );
      const factById = new Map(
        facts.map((fact) => [fact.campaignCreatorId, fact]),
      );

      const messageIds = facts.flatMap((fact) =>
        [fact.projectedMessageId, fact.inboundMessageId].filter(
          (id): id is string => Boolean(id),
        ),
      );
      const readableMessages = new Map<string, MessageWorkspaceEntity>();
      if (messageIds.length > 0) {
        const messageRepository =
          await this.orm.getRepository<MessageWorkspaceEntity>(
            workspaceId,
            'message',
            permissions,
          );
        const messages = await messageRepository.find({
          where: { id: In([...new Set(messageIds)]) },
        });
        await this.messageVisibility.applyMessagesVisibility(
          messages,
          input.authContext,
        );
        for (const message of messages)
          readableMessages.set(message.id, message);
      }

      const rows = readableCampaignCreators.map((campaignCreator) => {
        const fact = factById.get(campaignCreator.id);
        const outboundMessage = fact?.projectedMessageId
          ? readableMessages.get(fact.projectedMessageId)
          : undefined;
        const inboundMessage = fact?.inboundMessageId
          ? readableMessages.get(fact.inboundMessageId)
          : undefined;
        const reason =
          campaignCreator.exclusionReason ??
          fact?.occurrenceHoldReason ??
          fact?.enrollmentHoldReason ??
          campaignCreator.outcomeSummary ??
          null;
        const needsAttention = Boolean(
          campaignCreator.excludedAt ||
          reason ||
          fact?.currentAttemptState === 'UNKNOWN' ||
          fact?.currentAttemptState === 'DEFINITELY_UNACCEPTED',
        );
        const threadId =
          inboundMessage?.messageThreadId ??
          outboundMessage?.messageThreadId ??
          null;
        return {
          campaignCreatorId: campaignCreator.id,
          creatorId: campaignCreator.creatorId,
          creatorName:
            readableCreatorById.get(campaignCreator.creatorId)?.name ?? null,
          stage: campaignCreator.stage,
          stageLabel:
            (campaignCreator.stage
              ? stageLabels.get(campaignCreator.stage)
              : undefined) ?? campaignCreator.stage,
          latestOutbound:
            fact?.projectedMessageId && outboundMessage?.messageThreadId
              ? {
                  id: fact.projectedMessageId,
                  threadId: outboundMessage.messageThreadId,
                  happenedAt: toIso(fact.outboundAt) as string,
                  state: fact.outboundAttemptState ?? 'ACCEPTED',
                }
              : null,
          latestInbound:
            fact?.inboundMessageId && inboundMessage?.messageThreadId
              ? {
                  id: fact.inboundMessageId,
                  threadId: inboundMessage.messageThreadId,
                  happenedAt: toIso(fact.inboundAt) as string,
                  state: 'VERIFIED_REPLY',
                }
              : null,
          plannedAt: toIso(fact?.plannedAt ?? null),
          currentAttemptState: fact?.currentAttemptState ?? null,
          reason,
          needsAttention,
          inboxContactId: threadId
            ? encodeMyahInboxContactId({
                workspaceId,
                identity: {
                  kind: 'creator',
                  recordId: campaignCreator.creatorId,
                },
              })
            : null,
          inboxThreadId: threadId,
          excluded: campaignCreator.excludedAt !== null,
          mayStillSend: Number(fact?.inFlightCount ?? 0) > 0,
        };
      });
      rows.sort(
        (left, right) =>
          Number(right.needsAttention) - Number(left.needsAttention) ||
          (left.plannedAt === null
            ? 1
            : right.plannedAt === null
              ? -1
              : left.plannedAt.localeCompare(right.plannedAt)) ||
          (left.creatorName ?? '').localeCompare(right.creatorName ?? '') ||
          left.campaignCreatorId.localeCompare(right.campaignCreatorId),
      );
      const offset = decodeCursor(input.after, input.campaignId);
      const page = rows.slice(offset, offset + input.first);
      const nextOffset = offset + page.length;
      const hasNextPage = nextOffset < rows.length;

      return {
        nodes: page,
        pageInfo: {
          hasNextPage,
          endCursor: hasNextPage
            ? encodeCursor(input.campaignId, nextOffset)
            : null,
        },
      };
    }, input.authContext);
  }

  private async stageLabels(workspaceId: string): Promise<Map<string, string>> {
    try {
      const { flatFieldMetadataMaps } =
        await this.flatEntityMapsCache.getOrRecomputeManyOrAllFlatEntityMaps({
          workspaceId,
          flatMapsKeys: ['flatFieldMetadataMaps'],
        });
      const stageField =
        flatFieldMetadataMaps.byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage.universalIdentifier
        ];
      return new Map(
        (stageField?.options ?? []).map(({ value, label }) => [value, label]),
      );
    } catch {
      return new Map();
    }
  }
}
