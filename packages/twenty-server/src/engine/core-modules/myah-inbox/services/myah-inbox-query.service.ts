import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { In, IsNull } from 'typeorm';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_DEFAULT_PAGE_SIZE,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  type MyahInboxThreadConnection,
  type MyahInboxThreadEdge,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import {
  MyahInboxQueue,
  MyahInboxState,
  type MyahInboxThreadsInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import {
  type MyahInboxThreadContext,
  type MyahInboxThreadSummary,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
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
  MessageVisibilityAccess,
  MessageVisibilityPolicyService,
} from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

export type MyahInboxListThreadsInput = MyahInboxThreadsInput & {
  authContext: WorkspaceAuthContext;
  user: AuthContextUser;
  workspace: Pick<WorkspaceEntity, 'id'>;
  workspaceMemberId: string;
  threadId?: string;
};

export type MyahInboxThreadProposalHistoryEntry = {
  receivedAt: string;
  sender: string | null;
  subject: string | null;
  text: string | null;
};

export type MyahInboxThreadProposalContext = {
  thread: MyahInboxThreadSummary;
  history: MyahInboxThreadProposalHistoryEntry[];
};

type MyahInboxCursor = {
  receivedAt: string;
  threadId: string;
};

type MyahInboxThreadRaw = {
  id: string;
  lastActivityAt: Date | string;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  messageVisibility: MessageVisibilityAccess;
  state: MyahInboxState;
  snoozedUntil: Date | string | null;
  creatorId: string | null;
  campaignId: string | null;
  inboxOwnerId: string | null;
};

type MyahInboxThreadProposalHistoryRaw = Omit<
  MyahInboxThreadProposalHistoryEntry,
  'receivedAt'
> & {
  receivedAt: Date | string;
};

type ContextRecord = {
  id: string;
  name?: string | { firstName?: string; lastName?: string } | null;
};

type ContextRecords = {
  creatorById: Map<string, ContextRecord>;
  campaignById: Map<string, ContextRecord>;
  workspaceMemberById: Map<string, ContextRecord>;
};

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
    const cursor = input.after ? this.decodeCursor(input.after) : undefined;

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
          this.globalWorkspaceOrmManager.getRepository<ContextRecord>(
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
          });

        if (input.threadId) {
          queryBuilder.andWhere('message_thread.id = :threadId', {
            threadId: input.threadId,
          });
        }

        if (input.queue === MyahInboxQueue.CREATOR_LINKED) {
          queryBuilder.andWhere('message_thread."creatorId" IS NOT NULL');
        } else if (input.queue === MyahInboxQueue.UNMATCHED) {
          queryBuilder.andWhere('message_thread."creatorId" IS NULL');
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

        const search = input.search?.trim();

        if (search) {
          queryBuilder.andWhere(
            `(
              (${latestMessageVisibility.expression} IN (:messageVisibilityFull, :messageVisibilitySubject)
                AND latest_message.subject ILIKE :search)
              OR (${latestMessageVisibility.expression} = :messageVisibilityFull
                AND latest_message.text ILIKE :search)
            )`,
            { search: `%${search}%` },
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
        const contextRecords = await this.loadContextRecords({
          rows: pageRows,
          creatorRepository,
          campaignRepository,
          workspaceMemberRepository,
        });
        const edges = pageRows.map((thread) =>
          this.toEdge(thread, contextRecords),
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

  async getThreadProposalContext(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
  ): Promise<MyahInboxThreadProposalContext> {
    const thread = await this.getThreadSummary(input);
    const history = await this.loadThreadProposalHistory(input);

    return { thread, history };
  }

  private async loadThreadProposalHistory(
    input: Omit<MyahInboxListThreadsInput, 'threadId'> & { threadId: string },
  ): Promise<MyahInboxThreadProposalHistoryEntry[]> {
    this.assertUserRequest(input);
    this.assertValidFilterIds(input);

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

        const messageRepository =
          await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(input.workspace.id, 'message', rolePermissionConfig);
        const visibility =
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'message.id',
          });
        const workspaceSchemaName = getWorkspaceSchemaName(input.workspace.id);
        const rows = await messageRepository
          .createQueryBuilder('message')
          .select('message."receivedAt"', 'receivedAt')
          .addSelect('message.subject', 'subject')
          .addSelect('message.text', 'text')
          .addSelect(
            `(SELECT messageParticipant.handle
              FROM "${workspaceSchemaName}"."messageParticipant" messageParticipant
              WHERE messageParticipant."messageId" = message.id
                AND messageParticipant."deletedAt" IS NULL
                AND messageParticipant.role = :fromParticipantRole
              ORDER BY messageParticipant.id ASC
              LIMIT 1)`,
            'sender',
          )
          .where('message."messageThreadId" = :threadId', {
            threadId: input.threadId,
          })
          .andWhere('message."deletedAt" IS NULL')
          .andWhere('message."receivedAt" IS NOT NULL')
          .andWhere(`${visibility.expression} = :messageVisibilityFull`)
          .setParameters({
            ...visibility.parameters,
            fromParticipantRole: MessageParticipantRole.FROM,
          })
          .orderBy('message."receivedAt"', 'DESC')
          .addOrderBy('message.id', 'DESC')
          .limit(MYAH_INBOX_MAX_PAGE_SIZE)
          .getRawMany<MyahInboxThreadProposalHistoryRaw>();

        return rows.reverse().map((message) => ({
          ...message,
          receivedAt:
            message.receivedAt instanceof Date
              ? message.receivedAt.toISOString()
              : message.receivedAt,
        }));
      },
      input.authContext,
    );
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

  private async loadOptionalContextRecords(
    repository: {
      find: (options: unknown) => Promise<ContextRecord[]>;
    },
    ids: string[],
  ): Promise<ContextRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    try {
      return await repository.find({
        where: { id: In(ids), deletedAt: IsNull() },
        select: { id: true, name: true },
      });
    } catch (error) {
      if (
        error instanceof PermissionsException &&
        error.code === PermissionsExceptionCode.PERMISSION_DENIED
      ) {
        return [];
      }

      throw error;
    }
  }

  private async loadContextRecords({
    rows,
    creatorRepository,
    campaignRepository,
    workspaceMemberRepository,
  }: {
    rows: MyahInboxThreadRaw[];
    creatorRepository: {
      find: (options: unknown) => Promise<ContextRecord[]>;
    };
    campaignRepository: {
      find: (options: unknown) => Promise<ContextRecord[]>;
    };
    workspaceMemberRepository: {
      find: (options: unknown) => Promise<ContextRecord[]>;
    };
  }): Promise<ContextRecords> {
    const creatorIds = [
      ...new Set(rows.map(({ creatorId }) => creatorId).filter(isDefined)),
    ];
    const campaignIds = [
      ...new Set(rows.map(({ campaignId }) => campaignId).filter(isDefined)),
    ];
    const workspaceMemberIds = [
      ...new Set(
        rows.map(({ inboxOwnerId }) => inboxOwnerId).filter(isDefined),
      ),
    ];
    const [creators, campaigns, workspaceMembers] = await Promise.all([
      this.loadOptionalContextRecords(creatorRepository, creatorIds),
      this.loadOptionalContextRecords(campaignRepository, campaignIds),
      workspaceMemberIds.length === 0
        ? []
        : workspaceMemberRepository.find({
            where: { id: In(workspaceMemberIds), deletedAt: IsNull() },
          }),
    ]);

    return {
      creatorById: new Map(creators.map((record) => [record.id, record])),
      campaignById: new Map(campaigns.map((record) => [record.id, record])),
      workspaceMemberById: new Map(
        workspaceMembers.map((record) => [record.id, record]),
      ),
    };
  }

  private toEdge(
    row: MyahInboxThreadRaw,
    contexts: ContextRecords,
  ): MyahInboxThreadEdge {
    if (row.messageVisibility === MessageVisibilityAccess.HIDDEN) {
      throw new ForbiddenException('Inbox visibility projection failed closed');
    }

    const lastActivityAt =
      row.lastActivityAt instanceof Date
        ? row.lastActivityAt.toISOString()
        : row.lastActivityAt;
    const subject =
      row.messageVisibility === MessageVisibilityAccess.FULL ||
      row.messageVisibility === MessageVisibilityAccess.SUBJECT
        ? row.subject
        : FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
    const lastMessagePreview =
      row.messageVisibility === MessageVisibilityAccess.FULL
        ? row.lastMessagePreview
        : FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;

    return {
      cursor: this.encodeCursor({
        receivedAt: lastActivityAt,
        threadId: row.id,
      }),
      node: {
        id: row.id,
        lastActivityAt,
        subject,
        lastMessagePreview,
        lastMessageSender: row.lastMessageSender,
        state: row.state,
        snoozedUntil:
          row.snoozedUntil instanceof Date
            ? row.snoozedUntil.toISOString()
            : row.snoozedUntil,
        creator: row.creatorId
          ? this.toContext(contexts.creatorById.get(row.creatorId))
          : null,
        campaign: row.campaignId
          ? this.toContext(contexts.campaignById.get(row.campaignId))
          : null,
        inboxOwner: row.inboxOwnerId
          ? this.toContext(contexts.workspaceMemberById.get(row.inboxOwnerId))
          : null,
      } satisfies MyahInboxThreadSummary,
    };
  }

  private toContext(
    record: ContextRecord | undefined,
  ): MyahInboxThreadContext | null {
    if (!record) {
      return null;
    }

    const name =
      typeof record.name === 'string'
        ? record.name
        : [record.name?.firstName, record.name?.lastName]
            .filter(isDefined)
            .join(' ') || null;

    return { id: record.id, name };
  }

  private encodeCursor(cursor: MyahInboxCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(cursor: string): MyahInboxCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<MyahInboxCursor>;

      const receivedAt = new Date(decoded.receivedAt ?? '');

      if (
        Number.isNaN(receivedAt.getTime()) ||
        typeof decoded.threadId !== 'string' ||
        !isValidUuid(decoded.threadId)
      ) {
        throw new Error('cursor fields are invalid');
      }

      return {
        receivedAt: receivedAt.toISOString(),
        threadId: decoded.threadId,
      };
    } catch {
      throw new BadRequestException('Invalid Myah inbox cursor');
    }
  }
}
