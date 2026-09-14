import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_DEFAULT_PAGE_SIZE,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  type MyahInboxInstagramMessage,
  type MyahInboxInstagramMessageConnection,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-instagram-message-page.dto';
import {
  decodeMyahInboxInstagramMessageCursor,
  encodeMyahInboxInstagramMessageCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

type PermissionAwareQueryBuilder = {
  select: (selection: string, alias?: string) => PermissionAwareQueryBuilder;
  addSelect: (selection: string, alias?: string) => PermissionAwareQueryBuilder;
  where: (condition: string) => PermissionAwareQueryBuilder;
  validatePermissionsBeforeSerialization: () => void;
  getQueryAndParameters: () => [string, unknown[]];
};

type PermissionAwareRepository = {
  createQueryBuilder: (alias: string) => PermissionAwareQueryBuilder;
};

type SerializedPermissionQuery = { sql: string; parameters: unknown[] };

type InstagramMessageRaw = Omit<
  MyahInboxInstagramMessage,
  'providerCreatedAt' | 'createdAt'
> & {
  providerCreatedAt: Date | string | null;
  createdAt: Date | string;
  effectiveTimestamp: Date | string;
  effectiveCursorTimestamp: string;
};

export type MyahInboxListInstagramMessagesInput = {
  conversationId: string;
  first?: number;
  after?: string;
  authContext: WorkspaceAuthContext;
  user: AuthContextUser;
  workspace: Pick<WorkspaceEntity, 'id'>;
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

@Injectable()
export class MyahInboxInstagramMessageQueryService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async listMessages(
    input: MyahInboxListInstagramMessagesInput,
  ): Promise<MyahInboxInstagramMessageConnection> {
    if (!isValidUuid(input.conversationId)) {
      throw new BadRequestException('Invalid Instagram conversation');
    }
    const cursor = input.after
      ? decodeMyahInboxInstagramMessageCursor(input.after, {
          workspaceId: input.workspace.id,
          conversationId: input.conversationId,
        })
      : undefined;
    const first = Math.min(
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
          // SAFETY: repository query builders serialize Twenty's resolved role rules before raw SQL execution.
          (await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(
            input.workspace.id,
            name,
            rolePermissionConfig,
          )) as unknown as PermissionAwareRepository;
        const [conversationRepository, messageRepository] = await Promise.all([
          repository('myahSocialConversation'),
          repository('myahSocialMessage'),
        ]);
        const conversation = serializePermissionQuery(
          conversationRepository
            .createQueryBuilder('conversation')
            .select('conversation.id', 'id')
            .where('conversation."deletedAt" IS NULL'),
        );
        const messages = serializePermissionQuery(
          messageRepository
            .createQueryBuilder('message')
            .select('message.id', 'id')
            .addSelect('message.conversationId', 'conversationId')
            .addSelect('message.text', 'text')
            .addSelect('message.direction', 'direction')
            .addSelect('message.sentVia', 'sentVia')
            .addSelect('message.provider', 'provider')
            .addSelect('message.deliveryState', 'deliveryState')
            .addSelect('message.providerCreatedAt', 'providerCreatedAt')
            .addSelect('message.createdAt', 'createdAt')
            .addSelect('message.hasAttachments', 'hasAttachments')
            .addSelect('message.attachmentCount', 'attachmentCount')
            .where('message."deletedAt" IS NULL'),
        );
        const parameters: unknown[] = [input.conversationId];
        const add = (value: unknown) => {
          parameters.push(value);
          return `$${parameters.length}`;
        };
        const conversationSql = rebasePostgresParameters(
          conversation.sql,
          parameters.length,
        );
        parameters.push(...conversation.parameters);
        const messagesSql = rebasePostgresParameters(
          messages.sql,
          parameters.length,
        );
        parameters.push(...messages.parameters);
        const cursorCondition = cursor
          ? `AND (COALESCE(message."providerCreatedAt", message."createdAt"), message.id) < (${add(cursor.effectiveTimestamp)}, ${add(cursor.messageId)}::uuid)`
          : '';
        const limit = add(first + 1);
        const sql = `WITH readable_conversation AS (${conversationSql}), readable_messages AS (${messagesSql})
SELECT message.id, message.text, message.direction, message."sentVia", message.provider,
  message."deliveryState", message."providerCreatedAt", message."createdAt",
  message."hasAttachments", message."attachmentCount",
  COALESCE(message."providerCreatedAt", message."createdAt") AS "effectiveTimestamp",
  to_char(
    COALESCE(message."providerCreatedAt", message."createdAt") AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) AS "effectiveCursorTimestamp"
FROM readable_messages message
INNER JOIN readable_conversation conversation ON conversation.id = message."conversationId"
WHERE conversation.id = $1::uuid
${cursorCondition}
ORDER BY COALESCE(message."providerCreatedAt", message."createdAt") DESC, message.id DESC
LIMIT ${limit}`;
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const rows = await dataSource.query<InstagramMessageRaw[]>(
          sql,
          parameters,
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        const pageRows = rows.slice(0, first);
        const edges = pageRows.map((row) => ({
          cursor: encodeMyahInboxInstagramMessageCursor({
            workspaceId: input.workspace.id,
            conversationId: input.conversationId,
            effectiveTimestamp: row.effectiveCursorTimestamp,
            messageId: row.id,
          }),
          node: {
            id: row.id,
            text: row.text,
            direction: row.direction,
            sentVia: row.sentVia,
            provider: row.provider,
            deliveryState: row.deliveryState,
            providerCreatedAt: row.providerCreatedAt
              ? toIsoString(row.providerCreatedAt)
              : null,
            createdAt: toIsoString(row.createdAt),
            hasAttachments: row.hasAttachments,
            attachmentCount: row.attachmentCount,
          },
        }));
        return {
          edges,
          pageInfo: {
            hasNextPage: rows.length > first,
            endCursor: edges[edges.length - 1]?.cursor ?? null,
          },
        };
      },
      input.authContext,
    );
  }
}
