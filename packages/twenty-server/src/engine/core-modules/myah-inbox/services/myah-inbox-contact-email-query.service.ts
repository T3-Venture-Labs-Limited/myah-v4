import { ForbiddenException, Injectable } from '@nestjs/common';

import { IsNull } from 'typeorm';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageChannelType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_DEFAULT_PAGE_SIZE,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { type MyahInboxContactEmailMessageConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-email-message-connection.dto';
import { type MyahInboxContactEmailParticipant } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-email-message.dto';
import {
  decodeMyahInboxContactEmailCursor,
  encodeMyahInboxContactEmailCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';
import { decodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  MessageVisibilityAccess,
  MessageVisibilityPolicyService,
} from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

type MyahInboxListContactEmailMessagesInput = {
  contactId: string;
  first?: number;
  after?: string;
  authContext: WorkspaceAuthContext;
  user: AuthContextUser;
  workspace: Pick<WorkspaceEntity, 'id'>;
  workspaceMemberId: string;
};

type ContextRecord = {
  id: string;
};

type PermissionAwareQueryBuilder = {
  select: (selection: string, alias?: string) => PermissionAwareQueryBuilder;
  addSelect: (selection: string, alias?: string) => PermissionAwareQueryBuilder;
  where: (condition: string) => PermissionAwareQueryBuilder;
  setParameters: (
    parameters: Record<string, string>,
  ) => PermissionAwareQueryBuilder;
  validatePermissionsBeforeSerialization: () => void;
  getQueryAndParameters: () => [string, unknown[]];
};

type PermissionAwareRepository = {
  findOne: (options: unknown) => Promise<ContextRecord | null>;
  createQueryBuilder: (alias: string) => PermissionAwareQueryBuilder;
};

type EmailMessageRaw = {
  id: string;
  messageThreadId: string;
  receivedAt: Date | string;
  subject: string | null;
  text: string | null;
  visibility: MessageVisibilityAccess;
  direction: 'INCOMING' | 'OUTGOING';
  participants: MyahInboxContactEmailParticipant[] | string | null;
};

type SerializedPermissionQuery = {
  sql: string;
  parameters: unknown[];
};

const serializePermissionQuery = (
  queryBuilder: PermissionAwareQueryBuilder,
): SerializedPermissionQuery => {
  queryBuilder.validatePermissionsBeforeSerialization();
  const [sql, parameters] = queryBuilder.getQueryAndParameters();

  return { sql, parameters };
};

const rebasePostgresParameters = (sql: string, offset: number): string =>
  sql.replace(/\$(\d+)/g, (_, index: string) => `$${Number(index) + offset}`);

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

const emptyConnection = (): MyahInboxContactEmailMessageConnection => ({
  edges: [],
  pageInfo: { hasNextPage: false, endCursor: null },
});

@Injectable()
export class MyahInboxContactEmailQueryService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
  ) {}

  async listMessages(
    input: MyahInboxListContactEmailMessagesInput,
  ): Promise<MyahInboxContactEmailMessageConnection> {
    this.assertUserRequest(input);
    const contact = decodeMyahInboxContactId(
      input.contactId,
      input.workspace.id,
    );
    const cursor = input.after
      ? decodeMyahInboxContactEmailCursor(input.after, input.workspace.id)
      : undefined;
    const pageSize = Math.min(
      input.first ?? MYAH_INBOX_DEFAULT_PAGE_SIZE,
      MYAH_INBOX_MAX_PAGE_SIZE,
    );

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

        const repository = async (name: string) =>
          (await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(
            input.workspace.id,
            name,
            rolePermissionConfig,
          )) as unknown as PermissionAwareRepository;
        const workspaceMemberRepository = await repository('workspaceMember');
        const currentWorkspaceMember = await workspaceMemberRepository.findOne({
          where: { id: input.workspaceMemberId },
          select: { id: true },
        });

        if (!currentWorkspaceMember) {
          throw new ForbiddenException(
            'Inbox workspace member is not readable',
          );
        }

        if (contact.kind === 'instagram-conversation') {
          const socialConversationRepository = await repository(
            'myahSocialConversation',
          );
          const conversation = await socialConversationRepository.findOne({
            where: { id: contact.recordId, deletedAt: IsNull() },
            select: { id: true },
          });

          if (!conversation) {
            throw new ForbiddenException('Inbox contact is not readable');
          }

          return emptyConnection();
        }

        const [messageRepository, participantRepository, threadRepository] =
          await Promise.all([
            repository('message'),
            repository('messageParticipant'),
            repository('messageThread'),
          ]);
        const contactRepository =
          contact.kind === 'creator'
            ? await repository('creator')
            : threadRepository;
        const readableContact = await contactRepository.findOne({
          where: { id: contact.recordId, deletedAt: IsNull() },
          select: { id: true },
        });

        if (!readableContact) {
          throw new ForbiddenException('Inbox contact is not readable');
        }

        const visibility =
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'message.id',
          });
        const permissionQueries = [
          serializePermissionQuery(
            messageRepository
              .createQueryBuilder('message')
              .select('message.id', 'id')
              .addSelect('message."messageThreadId"', 'messageThreadId')
              .addSelect('message."receivedAt"', 'receivedAt')
              .addSelect('message.subject', 'subject')
              .addSelect('message.text', 'text')
              .addSelect(visibility.expression, 'visibility')
              .where('message."deletedAt" IS NULL')
              .setParameters(visibility.parameters),
          ),
          serializePermissionQuery(
            participantRepository
              .createQueryBuilder('participant')
              .select('participant.id', 'id')
              .addSelect('participant."messageId"', 'messageId')
              .addSelect('participant.role', 'role')
              .addSelect('participant.handle', 'handle')
              .addSelect('participant."displayName"', 'displayName')
              .where('participant."deletedAt" IS NULL'),
          ),
          serializePermissionQuery(
            threadRepository
              .createQueryBuilder('thread')
              .select('thread.id', 'id')
              .addSelect('thread."creatorId"', 'creatorId')
              .where('thread."deletedAt" IS NULL'),
          ),
        ];
        const parameters: unknown[] = [
          input.workspace.id,
          input.authContext.userWorkspaceId,
        ];
        const appendPermissionQuery = (
          query: SerializedPermissionQuery,
        ): string => {
          const sql = rebasePostgresParameters(query.sql, parameters.length);

          parameters.push(...query.parameters);

          return sql;
        };
        const [readableMessages, readableParticipants, readableThreads] =
          permissionQueries.map(appendPermissionQuery);
        const addParameter = (value: unknown): string => {
          parameters.push(value);

          return `$${parameters.length}`;
        };
        const workspaceSchemaName = getWorkspaceSchemaName(input.workspace.id);
        const channelWorkspace = addParameter(input.workspace.id);
        const channelTypes = addParameter([
          MessageChannelType.EMAIL,
          MessageChannelType.EMAIL_GROUP,
        ]);
        const hidden = addParameter(MessageVisibilityAccess.HIDDEN);
        const contactRecordId = addParameter(contact.recordId);
        const eligibleThreadCondition =
          contact.kind === 'creator'
            ? `thread."creatorId" = ${contactRecordId}`
            : `thread.id = ${contactRecordId}`;
        let cursorCondition = '';

        if (cursor) {
          const cursorReceivedAt = addParameter(cursor.receivedAt);
          const cursorMessageId = addParameter(cursor.messageId);

          cursorCondition = `AND (
      message."receivedAt" > ${cursorReceivedAt}
      OR (
        message."receivedAt" = ${cursorReceivedAt}
        AND message.id > ${cursorMessageId}
      )
    )`;
        }
        const limit = addParameter(pageSize + 1);
        const sql = `WITH request_scope AS (
  SELECT $1::uuid AS "workspaceId", $2::uuid AS "userWorkspaceId"
),
readable_messages AS (${readableMessages}),
readable_participants AS (${readableParticipants}),
readable_threads AS (${readableThreads}),
eligible_threads AS (
  SELECT thread.id
  FROM readable_threads thread
  WHERE ${eligibleThreadCondition}
),
email_messages AS (
  SELECT
    message.id,
    message."messageThreadId",
    message."receivedAt",
    message.subject,
    message.text,
    message.visibility,
    association.direction,
    COALESCE(participants.value, '[]'::jsonb) AS participants
  FROM readable_messages message
  INNER JOIN eligible_threads thread
    ON thread.id = message."messageThreadId"
  INNER JOIN LATERAL (
    SELECT email_association.direction
    FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" email_association
    INNER JOIN core."messageChannel" channel
      ON channel.id = email_association."messageChannelId"
     AND channel."workspaceId" = ${channelWorkspace}
    WHERE email_association."messageId" = message.id
      AND email_association."deletedAt" IS NULL
      AND channel.type::text = ANY(${channelTypes}::text[])
    ORDER BY email_association.id ASC
    LIMIT 1
  ) association ON TRUE
  LEFT JOIN LATERAL (
    SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
      'role', participant.role,
      'handle', participant.handle,
      'displayName', participant."displayName"
    ) ORDER BY participant.id ASC) AS value
    FROM readable_participants participant
    WHERE participant."messageId" = message.id
  ) participants ON TRUE
  WHERE message."receivedAt" IS NOT NULL
    AND message.visibility <> ${hidden}
    ${cursorCondition}
)
SELECT message.*
FROM email_messages message
ORDER BY message."receivedAt" ASC, message.id ASC
LIMIT ${limit}`;
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const rows = await dataSource.query<EmailMessageRaw[]>(
          sql,
          parameters,
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        const hasNextPage = rows.length > pageSize;
        const pageRows = rows.slice(0, pageSize);
        const edges = pageRows.map((row) => {
          if (row.visibility === MessageVisibilityAccess.HIDDEN) {
            throw new ForbiddenException(
              'Inbox visibility projection failed closed',
            );
          }
          if (row.direction !== 'INCOMING' && row.direction !== 'OUTGOING') {
            throw new ForbiddenException(
              'Inbox email direction projection failed closed',
            );
          }
          const receivedAt = toIsoString(row.receivedAt);
          const participants = !row.participants
            ? []
            : typeof row.participants === 'string'
              ? (JSON.parse(
                  row.participants,
                ) as MyahInboxContactEmailParticipant[])
              : row.participants;
          const subject =
            row.visibility === MessageVisibilityAccess.FULL ||
            row.visibility === MessageVisibilityAccess.SUBJECT
              ? row.subject
              : FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
          const text =
            row.visibility === MessageVisibilityAccess.FULL
              ? row.text
              : FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;

          return {
            cursor: encodeMyahInboxContactEmailCursor({
              workspaceId: input.workspace.id,
              receivedAt,
              messageId: row.id,
            }),
            node: {
              id: row.id,
              messageThreadId: row.messageThreadId,
              subject,
              text,
              receivedAt,
              direction: row.direction,
              visibility: row.visibility,
              participants,
              attachmentFileIds: [],
            },
          };
        });

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

  private assertUserRequest(
    input: MyahInboxListContactEmailMessagesInput,
  ): asserts input is MyahInboxListContactEmailMessagesInput & {
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
}
