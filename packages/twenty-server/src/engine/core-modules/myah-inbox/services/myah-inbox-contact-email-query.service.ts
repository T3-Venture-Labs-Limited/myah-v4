import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import {
  type MyahInboxEmailCard,
  type MyahInboxEmailCardPage,
  type MyahInboxEmailCardProjection,
  type MyahInboxEmailMessagePage,
  type MyahInboxEmailMessageLocation,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-email-card.dto';
import { assertMyahInboxExpectedWorkspace } from 'src/engine/core-modules/myah-inbox/utils/assert-myah-inbox-expected-workspace.util';
import {
  decodeMyahInboxEmailCardCursor,
  encodeMyahInboxEmailCardCursor,
  isMyahInboxEmailTimestamp,
  isMyahInboxEmailAnchorKey,
  type MyahInboxEmailCardCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-email-card-cursor.util';
import {
  buildMyahInboxEmailReadQuery,
  type MyahInboxEmailSqlScope,
  type MyahInboxEmailReadSelection,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-email-read-query.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

import { IsNull } from 'typeorm';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageChannelType } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

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

export type MyahInboxListContactEmailMessagesInput = {
  contactId: string;
  expectedWorkspaceId?: string | null;
  first?: number;
  after?: string;
  authContext: WorkspaceAuthContext;
  user: AuthContextUser;
  workspace: Pick<WorkspaceEntity, 'id'>;
  workspaceMemberId: string;
};

export type MyahInboxEmailReadContext = Omit<
  MyahInboxListContactEmailMessagesInput,
  'first' | 'after'
>;

type EmailReadEnvelope = {
  authorized: boolean;
  orderingUnavailable: boolean;
  rootChanged: boolean;
  cursorValid: boolean;
  fingerprint: string;
  snapshotAt: string;
  cards: MyahInboxEmailCard[];
  latestThreadId: string | null;
  hasOlderCards: boolean;
  card: MyahInboxEmailCard | null;
  page:
    | (Omit<MyahInboxEmailMessagePage, 'olderCursor' | 'newerCursor'> & {
        hasOlder: boolean;
        hasNewer: boolean;
      })
    | null;
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
  receivedAtCursorTimestamp: string;
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

  async listCards(
    input: MyahInboxEmailReadContext & {
      snapshot?: string;
      olderCursor?: string;
    },
  ): Promise<MyahInboxEmailCardPage> {
    this.assertUserRequest(input);
    const scope = {
      workspaceId: input.workspace.id,
      userWorkspaceId: input.authContext.userWorkspaceId,
      contactId: input.contactId,
    };
    const snapshot = input.snapshot
      ? decodeMyahInboxEmailCardCursor(input.snapshot, scope, 'snapshot')
      : undefined;
    const cursor = input.olderCursor
      ? decodeMyahInboxEmailCardCursor(input.olderCursor, scope, 'cards')
      : undefined;
    if (
      cursor &&
      (!snapshot ||
        cursor.snapshotAt !== snapshot.snapshotAt ||
        cursor.fingerprint !== snapshot.fingerprint)
    ) {
      throw new BadRequestException('Invalid Inbox history cursor');
    }
    const row = await this.readEmailEnvelope(input, {
      mode: 'cards',
      cutoff: snapshot?.snapshotAt,
      fingerprint: snapshot?.fingerprint,
      boundary: cursor
        ? {
            timestamp: cursor.timestamp!,
            id: cursor.threadId ? cursor.id! : `legacy:${cursor.id}`,
            threadId: cursor.threadId ?? cursor.id,
          }
        : undefined,
    });
    const token: MyahInboxEmailCardCursor = {
      version: 1,
      ...scope,
      kind: 'snapshot',
      snapshotAt: row.snapshotAt,
      fingerprint: row.fingerprint,
    };
    const first = row.cards[0];
    return {
      cards: row.cards,
      snapshot: encodeMyahInboxEmailCardCursor(token),
      latestThreadId: row.latestThreadId,
      olderCursor:
        row.hasOlderCards && first
          ? encodeMyahInboxEmailCardCursor({
              ...token,
              kind: 'cards',
              timestamp: first.startTimestamp,
              id: first.anchorKey,
              threadId: first.threadId,
            })
          : null,
    };
  }

  async readCard(
    input: MyahInboxEmailReadContext & { threadId: string; anchorKey?: string },
  ): Promise<MyahInboxEmailCardProjection> {
    this.assertUserRequest(input);
    this.assertCardKey(input);
    const row = await this.readEmailEnvelope(input, {
      mode: 'card',
      threadId: input.threadId,
      anchorKey: input.anchorKey,
    });
    if (input.anchorKey && row.card?.anchorKey !== input.anchorKey)
      throw new ForbiddenException('Inbox card is not readable');
    return {
      card: row.card,
      snapshot: encodeMyahInboxEmailCardCursor({
        version: 1,
        kind: 'snapshot',
        workspaceId: input.workspace.id,
        userWorkspaceId: input.authContext.userWorkspaceId,
        contactId: input.contactId,
        snapshotAt: row.snapshotAt,
        fingerprint: row.fingerprint,
      }),
    };
  }

  async listCardMessages(
    input: MyahInboxEmailReadContext & {
      threadId: string;
      anchorKey?: string;
      snapshot: string;
      cursor?: string;
    },
  ): Promise<MyahInboxEmailMessagePage> {
    this.assertCardKey(input);
    const snapshot = this.readSnapshot(input);
    const cursor = input.cursor
      ? decodeMyahInboxEmailCardCursor(input.cursor, snapshot)
      : undefined;
    if (
      cursor &&
      (!['older', 'newer'].includes(cursor.kind) ||
        cursor.threadId !== input.threadId ||
        (cursor.anchorKey &&
          cursor.anchorKey !==
            (input.anchorKey ?? `legacy:${input.threadId}`)) ||
        cursor.snapshotAt !== snapshot.snapshotAt ||
        cursor.fingerprint !== snapshot.fingerprint)
    )
      throw new BadRequestException('Invalid Inbox history cursor');
    const row = await this.readEmailEnvelope(input, {
      mode: 'messages',
      threadId: input.threadId,
      anchorKey: input.anchorKey,
      cutoff: snapshot.snapshotAt,
      fingerprint: snapshot.fingerprint,
      direction: cursor?.kind === 'newer' ? 'newer' : 'older',
      boundary: cursor
        ? { timestamp: cursor.timestamp!, id: cursor.id! }
        : undefined,
    });
    if (
      !row.page ||
      (input.anchorKey && row.page.anchorKey !== input.anchorKey)
    )
      throw new ForbiddenException('Inbox card is not readable');
    if (cursor?.anchorKey && cursor.anchorKey !== row.page.anchorKey)
      throw new BadRequestException('Invalid Inbox history cursor');
    return this.mapMessagePage(row.page, snapshot, cursor);
  }

  async locateMessage(
    input: MyahInboxEmailReadContext & { messageId: string; snapshot: string },
  ): Promise<MyahInboxEmailMessageLocation | null> {
    if (!isValidUuid(input.messageId))
      throw new BadRequestException('Invalid Inbox message');
    const snapshot = this.readSnapshot(input);
    const row = await this.readEmailEnvelope(input, {
      mode: 'location',
      messageId: input.messageId,
      cutoff: snapshot.snapshotAt,
      fingerprint: snapshot.fingerprint,
    });
    return row.card && row.page
      ? {
          card: row.card,
          page: this.mapMessagePage(row.page, snapshot),
          messageId: input.messageId,
        }
      : null;
  }

  private assertCardKey(input: { threadId: string; anchorKey?: string }): void {
    if (!isValidUuid(input.threadId))
      throw new BadRequestException('Invalid Inbox thread');
    if (
      input.anchorKey !== undefined &&
      (!isMyahInboxEmailAnchorKey(input.anchorKey) ||
        (input.anchorKey.startsWith('thread:') &&
          input.anchorKey !== `thread:${input.threadId}`) ||
        (input.anchorKey.startsWith('legacy:') &&
          input.anchorKey !== `legacy:${input.threadId}`))
    )
      throw new BadRequestException('Invalid Inbox card key');
  }

  private readSnapshot(
    input: MyahInboxEmailReadContext & { snapshot: string },
  ): MyahInboxEmailCardCursor {
    this.assertUserRequest(input);
    return decodeMyahInboxEmailCardCursor(
      input.snapshot,
      {
        workspaceId: input.workspace.id,
        userWorkspaceId: input.authContext.userWorkspaceId,
        contactId: input.contactId,
      },
      'snapshot',
    );
  }

  private mapMessagePage(
    page: NonNullable<EmailReadEnvelope['page']>,
    snapshot: MyahInboxEmailCardCursor,
    cursor?: MyahInboxEmailCardCursor,
  ): MyahInboxEmailMessagePage {
    if (!isMyahInboxEmailAnchorKey(page.anchorKey))
      throw new ForbiddenException('Inbox message projection failed closed');
    const messages = [page.root, ...page.messages];
    for (const message of messages) {
      if (!isMyahInboxEmailTimestamp(message.receivedAt))
        throw new BadRequestException(
          'Inbox timestamp projection is unavailable',
        );
      if (
        !['FULL', 'SUBJECT', 'METADATA'].includes(message.visibility) ||
        !['INCOMING', 'OUTGOING'].includes(message.direction)
      )
        throw new ForbiddenException('Inbox message projection failed closed');
    }
    const boundary = (kind: 'older' | 'newer') => {
      const message =
        kind === 'older'
          ? page.messages[0]
          : page.messages[page.messages.length - 1];
      return message
        ? encodeMyahInboxEmailCardCursor({
            ...snapshot,
            kind,
            threadId: page.threadId,
            anchorKey: page.anchorKey,
            timestamp: message.receivedAt,
            id: message.id,
          })
        : cursor
          ? encodeMyahInboxEmailCardCursor({ ...cursor, kind })
          : null;
    };
    return {
      threadId: page.threadId,
      anchorKey: page.anchorKey,
      root: page.root,
      messages: page.messages,
      olderCursor: page.hasOlder ? boundary('older') : null,
      newerCursor: page.hasNewer ? boundary('newer') : null,
    };
  }

  private async readEmailEnvelope(
    input: MyahInboxEmailReadContext,
    selection: MyahInboxEmailReadSelection,
  ): Promise<EmailReadEnvelope> {
    return this.withEmailReadScope(input, async (scope) => {
      const query = buildMyahInboxEmailReadQuery(scope, selection);
      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      const [row] = await dataSource.query<EmailReadEnvelope[]>(
        query.sql,
        query.parameters,
        undefined,
        { shouldBypassPermissionChecks: true },
      );
      if (!row?.authorized)
        throw new ForbiddenException('Inbox member or contact is not readable');
      if (!row.cursorValid)
        throw new BadRequestException('Invalid Inbox history cursor');
      if (row.orderingUnavailable)
        throw new BadRequestException('Inbox history ordering is unavailable');
      if (
        row.rootChanged ||
        (selection.fingerprint && row.fingerprint !== selection.fingerprint)
      )
        throw new BadRequestException('Inbox history changed; reload history');
      if (
        !isMyahInboxEmailTimestamp(row.snapshotAt) ||
        row.cards.some(
          (card) => !isMyahInboxEmailTimestamp(card.startTimestamp),
        )
      )
        throw new BadRequestException(
          'Inbox timestamp projection is unavailable',
        );
      return row;
    });
  }

  private async withEmailReadScope<Result>(
    input: MyahInboxEmailReadContext,
    consume: (scope: MyahInboxEmailSqlScope) => Promise<Result>,
  ): Promise<Result> {
    this.assertUserRequest(input);
    assertMyahInboxExpectedWorkspace(
      input.workspace.id,
      input.expectedWorkspaceId,
    );
    const contact = decodeMyahInboxContactId(
      input.contactId,
      input.workspace.id,
    );
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const rolePermissionConfig = resolveRolePermissionConfig({
          authContext: input.authContext,
          userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
          apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        });
        if (!rolePermissionConfig)
          throw new ForbiddenException('Inbox role permissions are required');
        const parameters: unknown[] = [];
        const ctes: string[] = [];
        const parameter = (value: unknown) => {
          parameters.push(value);
          return `$${parameters.length}`;
        };
        const projection = async (
          name: string,
          object: string,
          alias: string,
          fields: string[],
          where: string,
          optional = false,
          extra?: { expression: string; parameters: Record<string, string> },
          whereParameters: Record<string, string> = {},
        ) => {
          let query: SerializedPermissionQuery;
          try {
            // SAFETY: this is the same native repository, narrowed to its serialization methods.
            const repository =
              (await this.globalWorkspaceOrmManager.getRepository<
                Record<string, unknown>
              >(
                input.workspace.id,
                object,
                rolePermissionConfig,
              )) as unknown as PermissionAwareRepository;
            const builder = repository
              .createQueryBuilder(alias)
              .select(`${alias}.id`, 'id')
              .where(where)
              .setParameters(whereParameters);
            for (const field of fields)
              builder.addSelect(`${alias}."${field}"`, field);
            if (extra)
              builder
                .addSelect(extra.expression, 'visibility')
                .setParameters(extra.parameters);
            query = serializePermissionQuery(builder);
          } catch (error) {
            if (
              !optional ||
              !(error instanceof PermissionsException) ||
              error.code !== PermissionsExceptionCode.PERMISSION_DENIED
            )
              throw error;
            query = {
              sql: `SELECT NULL::uuid AS id${fields.map((field) => `, NULL::${field.endsWith('Id') ? 'uuid' : 'text'} AS "${field}"`).join('')} WHERE FALSE`,
              parameters: [],
            };
          }
          ctes.push(
            `${name} AS (${rebasePostgresParameters(query.sql, parameters.length)})`,
          );
          parameters.push(...query.parameters);
        };
        // All mandatory row predicates are serialized into the same statement, not earlier findOne reads.
        await projection(
          'readable_member',
          'workspaceMember',
          'member',
          [],
          'member.id = :readId',
          false,
          undefined,
          { readId: input.workspaceMemberId },
        );
        const contactObject =
          contact.kind === 'creator'
            ? 'creator'
            : contact.kind === 'email-thread'
              ? 'messageThread'
              : 'myahSocialConversation';
        await projection(
          'readable_contact',
          contactObject,
          'contact',
          [],
          'contact.id = :readId AND contact."deletedAt" IS NULL',
          false,
          undefined,
          { readId: contact.recordId },
        );
        await projection(
          'readable_threads',
          'messageThread',
          'thread',
          contact.kind === 'creator' ? ['creatorId'] : [],
          'thread."deletedAt" IS NULL',
        );
        await projection(
          'readable_messages',
          'message',
          'message',
          ['messageThreadId', 'receivedAt', 'createdAt', 'isDraft'],
          'message."deletedAt" IS NULL',
          false,
          this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
            workspaceId: input.workspace.id,
            userWorkspaceId: input.authContext.userWorkspaceId,
            messageIdExpression: 'message.id',
          }),
        );
        await projection(
          'readable_subject',
          'message',
          'subject',
          ['subject'],
          'subject."deletedAt" IS NULL',
          true,
        );
        await projection(
          'readable_text',
          'message',
          'body',
          ['text'],
          'body."deletedAt" IS NULL',
          true,
        );
        await projection(
          'readable_participants',
          'messageParticipant',
          'participant',
          ['messageId', 'role', 'handle', 'displayName'],
          'participant."deletedAt" IS NULL',
          true,
        );
        await projection(
          'readable_campaign_relation',
          'messageThread',
          'relation',
          ['myahCampaignId'],
          'relation."deletedAt" IS NULL',
          true,
        );
        await projection(
          'readable_campaign',
          'campaign',
          'campaign',
          [],
          'campaign."deletedAt" IS NULL',
          true,
        );
        await projection(
          'readable_campaign_name',
          'campaign',
          'campaign_name',
          ['name'],
          'campaign_name."deletedAt" IS NULL',
          true,
        );
        const recordId = parameter(contact.recordId);
        const eligibleThread =
          contact.kind === 'creator'
            ? `thread."creatorId" = ${recordId}::uuid`
            : contact.kind === 'email-thread'
              ? `thread.id = ${recordId}::uuid`
              : `${recordId}::uuid IS NULL`;
        const workspaceId = parameter(input.workspace.id);
        const schema = getWorkspaceSchemaName(input.workspace.id);
        ctes.push(`authorized_email AS (
        SELECT message.id, message."messageThreadId", message."receivedAt", message."createdAt", message.visibility, association.direction, association."messageChannelId"
        FROM readable_messages message JOIN readable_threads thread ON thread.id = message."messageThreadId"
        JOIN LATERAL (
          SELECT association.direction, association."messageChannelId" FROM "${schema}"."messageChannelMessageAssociation" association
          JOIN core."messageChannel" channel ON channel.id = association."messageChannelId" AND channel."workspaceId" = ${workspaceId}::uuid
          WHERE association."messageId" = message.id AND association."deletedAt" IS NULL AND channel.type::text IN ('EMAIL','EMAIL_GROUP')
          ORDER BY association.id LIMIT 1
        ) association ON TRUE
        WHERE ${eligibleThread} AND message."isDraft" = FALSE AND message.visibility <> 'HIDDEN'
          AND EXISTS (SELECT 1 FROM readable_member) AND EXISTS (SELECT 1 FROM readable_contact)
      )`);
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const [replySchema] = await dataSource.query<
          Array<{ exists: boolean }>
        >(
          `SELECT to_regclass('core."myahCampaignReplyEvidence"') IS NOT NULL AS "exists"`,
          [],
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        ctes.push(`accepted_outreach AS (
SELECT "projectedMessageId", "attemptId", "campaignId", "enrollmentId", "messageChannelId", "providerAcceptedAt"
          FROM core."outboundEmailAttempt"
          WHERE "workspaceId"=${workspaceId}::uuid AND source='CAMPAIGN_SEQUENCE'
            AND "attemptState"='ACCEPTED'
        )`);
        ctes.push(
          replySchema?.exists
            ? `reply_evidence AS (
SELECT ev."inboundMessageId", inbound."messageThreadId", ev.classification,
                  ev."matchedAttemptId", ev."campaignId", ev."enrollmentId", ev."messageChannelId", attempt."projectedMessageId"
                FROM core."myahCampaignReplyEvidence" ev
                JOIN authorized_email inbound ON inbound.id=ev."inboundMessageId"
                  AND inbound."messageChannelId"=ev."messageChannelId" AND inbound.direction='INCOMING'
                LEFT JOIN core."outboundEmailAttempt" attempt ON attempt."attemptId"=ev."matchedAttemptId"
                  AND attempt."workspaceId"=ev."workspaceId" AND attempt."attemptState"='ACCEPTED'
                WHERE ev."workspaceId"=${workspaceId}::uuid
              )`
            : `reply_evidence AS (
                SELECT NULL::uuid AS "inboundMessageId", NULL::uuid AS "messageThreadId",
                  NULL::text AS classification, NULL::uuid AS "matchedAttemptId",
NULL::uuid AS "campaignId", NULL::uuid AS "enrollmentId", NULL::uuid AS "messageChannelId",
                  NULL::uuid AS "projectedMessageId" WHERE FALSE
              )`,
        );
        return consume({
          sql: ctes.join(',\n'),
          parameters,
          responseCardsOnly:
            contact.kind === 'creator' && replySchema?.exists === true,
          legacyCardsOnly: contact.kind === 'email-thread',
        });
      },
      input.authContext,
    );
  }

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

        // SAFETY: native repositories implement the narrow read/serialization surface below.
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
SELECT message.*,
  to_char(
    message."receivedAt" AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) AS "receivedAtCursorTimestamp"
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
          let participants: MyahInboxContactEmailParticipant[];
          try {
            participants =
              typeof row.participants === 'string'
                ? JSON.parse(row.participants)
                : (row.participants ?? []);
          } catch {
            throw new ForbiddenException(
              'Inbox participant projection failed closed',
            );
          }
          if (!Array.isArray(participants))
            throw new ForbiddenException(
              'Inbox participant projection failed closed',
            );
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
              receivedAt: row.receivedAtCursorTimestamp,
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

  private assertUserRequest<
    Input extends MyahInboxListContactEmailMessagesInput,
  >(
    input: Input,
  ): asserts input is Input & {
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
