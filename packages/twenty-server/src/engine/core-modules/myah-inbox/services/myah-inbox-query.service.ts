import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { ILike, IsNull } from 'typeorm';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import {
  MessageChannelType,
  MessageParticipantRole,
} from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_DEFAULT_PAGE_SIZE,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { type MyahInboxThreadConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import {
  MyahInboxSnoozeStatus,
  MyahInboxState,
  type MyahInboxThreadsInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { type MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  type MyahInboxThreadRaw,
  loadMyahInboxContextRecords,
  toMyahInboxThreadEdge,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-thread-context.mapper';
import { decodeMyahInboxCursor } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-cursor.util';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

export type MyahInboxListThreadsInput = MyahInboxThreadsInput & {
  authContext: WorkspaceAuthContext;
  user: AuthContextUser;
  workspace: Pick<WorkspaceEntity, 'id'>;
  workspaceMemberId: string;
};

type ContextRecord = {
  id: string;
  name?: string | { firstName?: string; lastName?: string } | null;
};

type CreatorContextRecord = {
  id: string;
  name: string | null;
  deletedAt: Date | null;
};

const MYAH_INBOX_EMAIL_CHANNEL_TYPES = [
  MessageChannelType.EMAIL,
  MessageChannelType.EMAIL_GROUP,
];

const getEmailChannelAssociationCondition = ({
  workspaceSchemaName,
  messageIdExpression,
  associationAlias,
  channelAlias,
}: {
  workspaceSchemaName: string;
  messageIdExpression: string;
  associationAlias: string;
  channelAlias: string;
}): string => `EXISTS (
  SELECT 1
  FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" ${associationAlias}
  INNER JOIN core."messageChannel" ${channelAlias}
    ON ${channelAlias}.id = ${associationAlias}."messageChannelId"
    AND ${channelAlias}."workspaceId" = :inboxEmailChannelWorkspaceId
  WHERE ${associationAlias}."messageId" = ${messageIdExpression}
    AND ${associationAlias}."deletedAt" IS NULL
    AND ${channelAlias}.type IN (:...inboxEmailChannelTypes)
)`;

@Injectable()
export class MyahInboxQueryService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
  ) {}

  async listThreads(
    input: MyahInboxListThreadsInput,
  ): Promise<MyahInboxThreadConnection> {
    this.assertUserRequest(input);
    this.assertValidFilterIds(input);

    const pageSize = Math.min(
      input.first ?? MYAH_INBOX_DEFAULT_PAGE_SIZE,
      MYAH_INBOX_MAX_PAGE_SIZE,
    );
    const cursor = input.after ? decodeMyahInboxCursor(input.after) : undefined;

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const rolePermissionConfig = resolveRolePermissionConfig({
          authContext: input.authContext,
          userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
          apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        });

        if (!rolePermissionConfig) {
          throw new ForbiddenException('Inbox role permissions are required');
        }

        const [
          messageThreadRepository,
          creatorRepository,
          campaignRepository,
          workspaceMemberRepository,
        ] = await Promise.all([
          this.globalWorkspaceOrmManager.getRepository<Record<string, unknown>>(
            input.workspace.id,
            'messageThread',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<CreatorContextRecord>(
            input.workspace.id,
            'creator',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<ContextRecord>(
            input.workspace.id,
            'campaign',
            rolePermissionConfig,
          ),
          this.globalWorkspaceOrmManager.getRepository<ContextRecord>(
            input.workspace.id,
            'workspaceMember',
            rolePermissionConfig,
          ),
        ]);

        const currentWorkspaceMember = await workspaceMemberRepository.findOne({
          where: { id: input.workspaceMemberId },
          select: { id: true },
        });

        if (!currentWorkspaceMember) {
          throw new ForbiddenException(
            'Inbox workspace member is not readable',
          );
        }

        if (input.campaignId) {
          const campaign = await campaignRepository.findOne({
            where: { id: input.campaignId },
            select: { id: true },
          });

          if (!campaign) {
            throw new ForbiddenException('Inbox Campaign is not readable');
          }
        }

        if (
          input.owner &&
          input.owner !== 'ME' &&
          input.owner !== 'UNASSIGNED'
        ) {
          const owner = await workspaceMemberRepository.findOne({
            where: { id: input.owner },
            select: { id: true },
          });

          if (!owner) {
            throw new ForbiddenException('Inbox owner is not readable');
          }
        }

        const workspaceSchemaName = getWorkspaceSchemaName(input.workspace.id);
        const candidateVisibility =
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'candidateMessage.id',
          });
        const latestMessageVisibility =
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'latest_message.id',
          });
        const latestMessageJoinCondition = `latest_message.id = (
        SELECT candidateMessage.id
        FROM "${workspaceSchemaName}"."message" candidateMessage
        WHERE candidateMessage."messageThreadId" = message_thread.id
          AND candidateMessage."deletedAt" IS NULL
          AND ${getEmailChannelAssociationCondition({
            workspaceSchemaName,
            messageIdExpression: 'candidateMessage.id',
            associationAlias: 'candidateAssociation',
            channelAlias: 'candidateChannel',
          })}
          AND candidateMessage."receivedAt" IS NOT NULL
          AND ${candidateVisibility.expression} <> :messageVisibilityHidden
        ORDER BY candidateMessage."receivedAt" DESC, candidateMessage.id DESC LIMIT 1
      )`;
        const queryBuilder = messageThreadRepository
          .createQueryBuilder('message_thread')
          .select('message_thread.id', 'id')
          .addSelect('latest_message."receivedAt"', 'lastActivityAt')
          .addSelect(latestMessageVisibility.expression, 'messageVisibility')
          .addSelect(
            `CASE
            WHEN ${latestMessageVisibility.expression} IN (:messageVisibilityFull, :messageVisibilitySubject)
              THEN latest_message.subject
            WHEN ${latestMessageVisibility.expression} = :messageVisibilityMetadata
              THEN :restrictedMessageContent
            ELSE NULL
          END`,
            'subject',
          )
          .addSelect(
            `CASE
            WHEN ${latestMessageVisibility.expression} = :messageVisibilityFull
              THEN latest_message.text
            WHEN ${latestMessageVisibility.expression} IN (:messageVisibilitySubject, :messageVisibilityMetadata)
              THEN :restrictedMessageContent
            ELSE NULL
          END`,
            'lastMessagePreview',
          )
          .addSelect(
            `(SELECT messageParticipant.handle
            FROM "${workspaceSchemaName}"."messageParticipant" messageParticipant
            WHERE messageParticipant."messageId" = latest_message.id
              AND messageParticipant."deletedAt" IS NULL
              AND messageParticipant.role = :fromParticipantRole
            ORDER BY messageParticipant.id ASC
            LIMIT 1)`,
            'lastMessageSender',
          )
          .addSelect('message_thread."inboxState"', 'state')
          .addSelect('message_thread."snoozedUntil"', 'snoozedUntil')
          .addSelect('message_thread."creatorId"', 'creatorId')
          .addSelect('message_thread."myahCampaignId"', 'campaignId')
          .addSelect('message_thread."inboxOwnerId"', 'inboxOwnerId')
          .innerJoin(
            'message_thread.messages',
            'latest_message',
            latestMessageJoinCondition,
          )
          .where('message_thread."deletedAt" IS NULL')
          .andWhere('latest_message."deletedAt" IS NULL')
          .setParameters({
            ...candidateVisibility.parameters,
            ...latestMessageVisibility.parameters,
            restrictedMessageContent:
              FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
            fromParticipantRole: MessageParticipantRole.FROM,
            inboxEmailChannelWorkspaceId: input.workspace.id,
            inboxEmailChannelTypes: MYAH_INBOX_EMAIL_CHANNEL_TYPES,
          });

        if (input.threadId) {
          queryBuilder.andWhere('message_thread.id = :threadId', {
            threadId: input.threadId,
          });
        }

        if (input.owner === 'ME') {
          queryBuilder.andWhere(
            'message_thread."inboxOwnerId" = :inboxOwnerId',
            { inboxOwnerId: input.workspaceMemberId },
          );
        } else if (input.owner === 'UNASSIGNED') {
          queryBuilder.andWhere('message_thread."inboxOwnerId" IS NULL');
        } else if (input.owner) {
          queryBuilder.andWhere(
            'message_thread."inboxOwnerId" = :inboxOwnerId',
            { inboxOwnerId: input.owner },
          );
        }

        if (input.campaignId) {
          queryBuilder.andWhere(
            'message_thread."myahCampaignId" = :campaignId',
            { campaignId: input.campaignId },
          );
        }

        if (input.states?.length) {
          queryBuilder.andWhere('message_thread."inboxState" IN (:...states)', {
            states: input.states,
          });
        }

        if (input.snoozeStatus === MyahInboxSnoozeStatus.ACTIVE) {
          queryBuilder
            .andWhere('message_thread."inboxState" = :snoozedState', {
              snoozedState: MyahInboxState.SNOOZED,
            })
            .andWhere('message_thread."snoozedUntil" > CURRENT_TIMESTAMP');
        } else if (input.snoozeStatus === MyahInboxSnoozeStatus.DUE) {
          queryBuilder
            .andWhere('message_thread."inboxState" = :snoozedState', {
              snoozedState: MyahInboxState.SNOOZED,
            })
            .andWhere('message_thread."snoozedUntil" <= CURRENT_TIMESTAMP');
        }

        const search = input.search?.trim();

        if (search) {
          let searchCreatorIds: string[] = [];

          try {
            searchCreatorIds = (
              await creatorRepository.find({
                where: {
                  name: ILike(`%${search}%`),
                  deletedAt: IsNull(),
                },
                select: { id: true, name: true },
              })
            ).map(({ id }) => id);
          } catch (error) {
            if (
              !(
                error instanceof PermissionsException &&
                error.code === PermissionsExceptionCode.PERMISSION_DENIED
              )
            ) {
              throw error;
            }
          }

          queryBuilder.andWhere(
            `(
            (${latestMessageVisibility.expression} IN (:messageVisibilityFull, :messageVisibilitySubject)
              AND latest_message.subject ILIKE :search)
            OR (${latestMessageVisibility.expression} = :messageVisibilityFull
              AND latest_message.text ILIKE :search)
            OR EXISTS (
              SELECT 1
              FROM "${workspaceSchemaName}"."messageParticipant" search_sender
              WHERE search_sender."messageId" = latest_message.id
                AND search_sender."deletedAt" IS NULL
                AND search_sender.role = :fromParticipantRole
                AND (
                  search_sender."displayName" ILIKE :search
                  OR search_sender.handle ILIKE :search
                )
            )
            OR message_thread."creatorId" = ANY(:searchCreatorIds)
          )`,
            {
              search: `%${search}%`,
              searchCreatorIds,
            },
          );
        }

        if (cursor) {
          queryBuilder.andWhere(
            `(
            latest_message."receivedAt" < :cursorReceivedAt
            OR (
              latest_message."receivedAt" = :cursorReceivedAt
              AND message_thread.id < :cursorThreadId
            )
          )`,
            {
              cursorReceivedAt: cursor.receivedAt,
              cursorThreadId: cursor.threadId,
            },
          );
        }

        const rows = await queryBuilder
          .orderBy('latest_message."receivedAt"', 'DESC')
          .addOrderBy('message_thread.id', 'DESC')
          .limit(pageSize + 1)
          .getRawMany<MyahInboxThreadRaw>();
        const hasNextPage = rows.length > pageSize;
        const pageRows = rows.slice(0, pageSize);
        const contextRecords = await loadMyahInboxContextRecords({
          rows: pageRows,
          creatorRepository,
          campaignRepository,
          workspaceMemberRepository,
        });
        const edges = pageRows.map((thread) =>
          toMyahInboxThreadEdge(thread, contextRecords),
        );

        return {
          edges,
          pageInfo: {
            hasNextPage,
            endCursor: edges[edges.length - 1]?.cursor ?? null,
          },
        };
      },
      input.authContext,
    );
  }

  async getThreadSummary(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
  ): Promise<MyahInboxThreadSummary> {
    const connection = await this.listThreads({
      ...input,
      first: 1,
      threadId: input.threadId,
    });
    const summary = connection.edges[0]?.node;

    if (!summary) {
      throw new ForbiddenException('Inbox thread is not readable');
    }

    return summary;
  }
  private assertUserRequest(
    input: MyahInboxListThreadsInput,
  ): asserts input is MyahInboxListThreadsInput & {
    authContext: Extract<WorkspaceAuthContext, { type: 'user' }>;
  } {
    if (
      !isUserAuthContext(input.authContext) ||
      !isDefined(input.authContext.user) ||
      !isDefined(input.user) ||
      input.authContext.user.id !== input.user.id ||
      input.authContext.workspace.id !== input.workspace.id ||
      input.authContext.workspaceMemberId !== input.workspaceMemberId
    ) {
      throw new ForbiddenException(
        'The Myah Inbox requires matching authenticated user context',
      );
    }
  }

  private assertValidFilterIds(
    input: MyahInboxThreadsInput & { threadId?: string },
  ): void {
    const hasInvalidThreadId =
      isDefined(input.threadId) && !isValidUuid(input.threadId);
    const hasInvalidCampaignId =
      isDefined(input.campaignId) && !isValidUuid(input.campaignId);
    const hasInvalidOwnerId =
      isDefined(input.owner) &&
      input.owner !== 'ME' &&
      input.owner !== 'UNASSIGNED' &&
      !isValidUuid(input.owner);

    if (hasInvalidThreadId || hasInvalidCampaignId || hasInvalidOwnerId) {
      throw new BadRequestException('Invalid Myah inbox relation filter');
    }
  }
}
