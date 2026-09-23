import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { EntityMetadataNotFoundError } from 'typeorm/error/EntityMetadataNotFoundError';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import {
  MessageChannelType,
  MessageChannelVisibility,
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
import { type MyahInboxContactConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-connection.dto';
import { type MyahInboxContactsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-filter.input';
import {
  MyahInboxContactIdentityKind,
  MyahInboxContactLatestChannel,
  MyahInboxInstagramChannelState,
  type MyahInboxContactInstagramConversation,
  type MyahInboxContactSummary,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-summary.dto';
import {
  MyahInboxSnoozeStatus,
  MyahInboxState,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { MyahInboxTriageCapabilityService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-triage-capability.service';
import {
  decodeMyahInboxContactCursor,
  encodeMyahInboxContactCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';
import {
  decodeMyahInboxContactId,
  encodeMyahInboxContactId,
  type MyahInboxContactIdentityKind as ContactIdentityKind,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  MessageVisibilityAccess,
  MessageVisibilityPolicyService,
} from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

type MyahInboxListContactsInput = MyahInboxContactsInput & {
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

type ContactRaw = {
  totalCount?: number | string;
  identityKind: ContactIdentityKind;
  identityRecordId: string;
  orderingKey: string;
  lastActivityAt: Date | string;
  activityCursorTimestamp: string;
  latestChannel: MyahInboxContactLatestChannel;
  initialChannel: MyahInboxContactLatestChannel;
  initialEmailThreadId: string | null;
  initialInstagramConversationId: string | null;
  displayName: string | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorInstagramUsername: string | null;
  preview: string | null;
  sender: string | null;
  emailThreadIds: string[] | null;
  latestEmailThreadId: string | null;
  emailNeedsAttention: boolean;
  instagramNeedsAttention: boolean;
  triageIsAvailable: boolean;
  triageCapabilityAvailable?: boolean;
  triageInboxOwnerId: string | null;
  triageInboxState: MyahInboxState | null;
  triageSnoozedUntil: Date | string | null;
  triageRevision: number | string | null;
  triageIdentityGeneration: string | null;
  instagramConversations:
    | MyahInboxContactInstagramConversation[]
    | string
    | null;
};

type SerializedPermissionQuery = {
  sql: string;
  parameters: unknown[];
};

const rebasePostgresParameters = (sql: string, offset: number): string =>
  sql.replace(/\$(\d+)/g, (_, index: string) => `$${Number(index) + offset}`);

const serializePermissionQuery = (
  queryBuilder: PermissionAwareQueryBuilder,
): SerializedPermissionQuery => {
  queryBuilder.validatePermissionsBeforeSerialization();
  const [sql, parameters] = queryBuilder.getQueryAndParameters();

  return { sql, parameters };
};

const isEntityMetadataNotFoundError = (error: unknown): boolean =>
  error instanceof EntityMetadataNotFoundError ||
  (error instanceof Error && error.name === 'EntityMetadataNotFoundError');

const serializeOptionalPermissionQuery = (
  repository: PermissionAwareRepository | null,
  build: (repository: PermissionAwareRepository) => PermissionAwareQueryBuilder,
  emptySql: string,
): SerializedPermissionQuery => {
  if (!repository) {
    return { sql: emptySql, parameters: [] };
  }

  try {
    return serializePermissionQuery(build(repository));
  } catch (error) {
    if (isEntityMetadataNotFoundError(error)) {
      return { sql: emptySql, parameters: [] };
    }

    throw error;
  }
};

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

const parseInstagramConversations = (
  value: ContactRaw['instagramConversations'],
): MyahInboxContactInstagramConversation[] => {
  if (!value) {
    return [];
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as MyahInboxContactInstagramConversation[];
  } catch (error) {
    throw new Error(
      `Invalid Instagram conversation projection JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const toGraphqlIdentityKind = (
  kind: ContactIdentityKind,
): MyahInboxContactIdentityKind => {
  switch (kind) {
    case 'creator':
      return MyahInboxContactIdentityKind.CREATOR;
    case 'email-thread':
      return MyahInboxContactIdentityKind.EMAIL_THREAD;
    case 'instagram-conversation':
      return MyahInboxContactIdentityKind.INSTAGRAM_CONVERSATION;
  }
};

@Injectable()
export class MyahInboxContactQueryService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
    private readonly triageCapabilityService?: MyahInboxTriageCapabilityService,
  ) {}

  async listContacts(
    input: MyahInboxListContactsInput,
  ): Promise<MyahInboxContactConnection> {
    this.assertUserRequest(input);

    const hasTriageFilter = this.hasTriageFilter(input);
    let canUseContactTriage: boolean | undefined;

    if (hasTriageFilter) {
      canUseContactTriage =
        await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => this.canUseContactTriage(input.authContext),
        );

      if (!canUseContactTriage) {
        throw new ForbiddenException(
          'Triage is unavailable with your current Inbox access',
        );
      }
    }

    this.assertValidFilterIds(input);

    const cursor = input.after
      ? decodeMyahInboxContactCursor(input.after, input.workspace.id)
      : undefined;
    const exactContact = input.contactId
      ? decodeMyahInboxContactId(input.contactId, input.workspace.id)
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
        canUseContactTriage ??= await this.canUseContactTriage(
          input.authContext,
        );

        const repository = async (name: string) =>
          // SAFETY: native workspace repositories expose this narrowed serialization port.
          (await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(
            input.workspace.id,
            name,
            rolePermissionConfig,
          )) as unknown as PermissionAwareRepository;
        const optionalRepository = async (
          name: string,
        ): Promise<PermissionAwareRepository | null> => {
          try {
            return await repository(name);
          } catch (error) {
            if (isEntityMetadataNotFoundError(error)) {
              return null;
            }

            throw error;
          }
        };
        const [
          messageRepository,
          messageParticipantRepository,
          messageThreadRepository,
          creatorRepository,
          campaignRepository,
          workspaceMemberRepository,
          socialConversationRepository,
          socialMessageRepository,
        ] = await Promise.all([
          repository('message'),
          repository('messageParticipant'),
          repository('messageThread'),
          repository('creator'),
          repository('campaign'),
          repository('workspaceMember'),
          optionalRepository('myahSocialConversation'),
          optionalRepository('myahSocialMessage'),
        ]);

        await this.assertReadableRelations({
          input,
          campaignRepository,
          workspaceMemberRepository,
        });

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
            messageParticipantRepository
              .createQueryBuilder('participant')
              .select('participant.id', 'id')
              .addSelect('participant."messageId"', 'messageId')
              .addSelect('participant.role', 'role')
              .addSelect('participant.handle', 'handle')
              .addSelect('participant."displayName"', 'displayName')
              .where('participant."deletedAt" IS NULL'),
          ),
          serializePermissionQuery(
            messageThreadRepository
              .createQueryBuilder('message_thread')
              .select('message_thread.id', 'id')
              .addSelect('message_thread."creatorId"', 'creatorId')
              .addSelect('message_thread."myahCampaignId"', 'campaignId')
              .addSelect('message_thread."inboxOwnerId"', 'inboxOwnerId')
              .addSelect('message_thread."inboxState"', 'state')
              .addSelect('message_thread."snoozedUntil"', 'snoozedUntil')
              .where('message_thread."deletedAt" IS NULL'),
          ),
          serializePermissionQuery(
            creatorRepository
              .createQueryBuilder('creator')
              .select('creator.id', 'id')
              .addSelect('creator.name', 'name')
              .addSelect('creator."instagramUsername"', 'instagramUsername')
              .where('creator."deletedAt" IS NULL'),
          ),
          serializePermissionQuery(
            workspaceMemberRepository
              .createQueryBuilder('workspace_member')
              .select('workspace_member.id', 'id')
              .where('workspace_member."deletedAt" IS NULL'),
          ),
          serializeOptionalPermissionQuery(
            socialConversationRepository,
            (repository) =>
              repository
                .createQueryBuilder('social_conversation')
                .select('social_conversation.id', 'id')
                .addSelect('social_conversation."creatorId"', 'creatorId')
                .addSelect(
                  'social_conversation."providerConversationId"',
                  'providerConversationId',
                )
                .addSelect('social_conversation.provider', 'provider')
                .addSelect('social_conversation.lifecycle', 'lifecycle')
                .addSelect(
                  'social_conversation."recipientUsername"',
                  'recipientUsername',
                )
                .addSelect(
                  'social_conversation."recipientDisplayName"',
                  'recipientDisplayName',
                )
                .addSelect('social_conversation."createdAt"', 'createdAt')
                .addSelect('social_conversation."updatedAt"', 'updatedAt')
                .where('social_conversation."deletedAt" IS NULL'),
            `SELECT NULL::uuid AS id, NULL::uuid AS "creatorId", NULL::text AS "providerConversationId", NULL::text AS provider, NULL::text AS lifecycle, NULL::text AS "recipientUsername", NULL::text AS "recipientDisplayName", NULL::timestamptz AS "createdAt", NULL::timestamptz AS "updatedAt" WHERE FALSE`,
          ),
          serializeOptionalPermissionQuery(
            socialMessageRepository,
            (repository) =>
              repository
                .createQueryBuilder('social_message')
                .select('social_message.id', 'id')
                .addSelect('social_message."conversationId"', 'conversationId')
                .addSelect('social_message.text', 'text')
                .addSelect('social_message.direction', 'direction')
                .addSelect(
                  'social_message."providerCreatedAt"',
                  'providerCreatedAt',
                )
                .addSelect('social_message."createdAt"', 'createdAt')
                .where('social_message."deletedAt" IS NULL'),
            `SELECT NULL::uuid AS id, NULL::uuid AS "conversationId", NULL::text AS text, NULL::text AS direction, NULL::timestamptz AS "providerCreatedAt", NULL::timestamptz AS "createdAt" WHERE FALSE`,
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
        const [
          readableMessagesSql,
          readableParticipantsSql,
          readableThreadsSql,
          readableCreatorsSql,
          readableWorkspaceMembersSql,
          readableSocialConversationsSql,
          readableSocialMessagesSql,
        ] = permissionQueries.map(appendPermissionQuery);
        const addParameter = (value: unknown): string => {
          parameters.push(value);

          return `$${parameters.length}`;
        };
        const workspaceSchemaName = getWorkspaceSchemaName(input.workspace.id);

        const canonicalTriageScope = `migration.status = 'READY' AND ${canUseContactTriage ? 'triage_capability."isAvailable"' : 'FALSE'}`;
        const canonicalTriageAvailable = `${canonicalTriageScope} AND triage.revision IS NOT NULL`;
        const emailChannelWorkspace = addParameter(input.workspace.id);
        const emailChannelTypes = addParameter([
          MessageChannelType.EMAIL,
          MessageChannelType.EMAIL_GROUP,
        ]);
        const hidden = addParameter(MessageVisibilityAccess.HIDDEN);
        const full = addParameter(MessageVisibilityAccess.FULL);
        const subject = addParameter(MessageVisibilityAccess.SUBJECT);
        const metadata = addParameter(MessageVisibilityAccess.METADATA);
        const restricted = addParameter(
          FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        );
        const fromRole = addParameter(MessageParticipantRole.FROM);
        const eligibleConditions = ['TRUE'];

        if (input.owner === 'ME') {
          eligibleConditions.push(
            `source."effectiveInboxOwnerId" = ${addParameter(input.workspaceMemberId)}`,
          );
        } else if (input.owner === 'UNASSIGNED') {
          eligibleConditions.push('source."effectiveInboxOwnerId" IS NULL');
        } else if (input.owner) {
          eligibleConditions.push(
            `source."effectiveInboxOwnerId" = ${addParameter(input.owner)}`,
          );
        }
        if (input.campaignId) {
          eligibleConditions.push(
            `source."campaignId" = ${addParameter(input.campaignId)}`,
          );
        }
        if (input.states?.length) {
          eligibleConditions.push(
            `source."effectiveState" = ANY(${addParameter(input.states)})`,
          );
        }
        if (input.snoozeStatus === MyahInboxSnoozeStatus.ACTIVE) {
          eligibleConditions.push(
            `source."effectiveState" = ${addParameter(MyahInboxState.SNOOZED)}`,
            'source."effectiveSnoozedUntil" > CURRENT_TIMESTAMP',
          );
        } else if (input.snoozeStatus === MyahInboxSnoozeStatus.DUE) {
          eligibleConditions.push(
            'source."persistedSnoozedUntil" <= CURRENT_TIMESTAMP',
          );
        }
        const search = input.search?.trim();

        if (search) {
          eligibleConditions.push(
            `(source."searchText" ILIKE ${addParameter(`%${search}%`)})`,
          );
        }
        if (exactContact) {
          eligibleConditions.push(
            `source."identityKind" = ${addParameter(exactContact.kind)}`,
            `source."identityRecordId" = ${addParameter(exactContact.recordId)}`,
          );
        }

        let cursorCondition = '';

        if (cursor) {
          const cursorActivityAt = addParameter(cursor.activityAt);
          const cursorOrderingKey = addParameter(cursor.orderingKey);

          cursorCondition = `WHERE (
              contact."lastActivityAt" < ${cursorActivityAt}
              OR (
                contact."lastActivityAt" = ${cursorActivityAt}
                AND contact."orderingKey" < ${cursorOrderingKey}
              )
            )`;
        }
        const limit = addParameter(pageSize + 1);
        const sql = `WITH request_scope AS (
  SELECT $1::uuid AS "workspaceId", $2::uuid AS "userWorkspaceId"
),
readable_messages AS (${readableMessagesSql}),
readable_participants AS (${readableParticipantsSql}),
readable_threads AS (${readableThreadsSql}),
readable_creators AS (${readableCreatorsSql}),
readable_workspace_members AS (${readableWorkspaceMembersSql}),
readable_social_conversations AS (${readableSocialConversationsSql}),
readable_social_messages AS (${readableSocialMessagesSql}),
visible_email_messages AS (
  SELECT
    message.id,
    message."messageThreadId",
    message."receivedAt",
    message.subject,
    message.text,
    message.visibility,
    email_association.direction,
    sender.handle AS sender
  FROM readable_messages message
  INNER JOIN LATERAL (
    SELECT association.direction
    FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" association
    INNER JOIN core."messageChannel" channel
      ON channel.id = association."messageChannelId"
     AND channel."workspaceId" = ${emailChannelWorkspace}
    WHERE association."messageId" = message.id
      AND association."deletedAt" IS NULL
      AND channel.type::text = ANY(${emailChannelTypes}::text[])
    ORDER BY (association.direction = 'INCOMING') DESC, association.id
    LIMIT 1
  ) email_association ON TRUE
  LEFT JOIN LATERAL (
    SELECT participant.handle
    FROM readable_participants participant
    WHERE participant."messageId" = message.id
      AND participant.role = ${fromRole}
    ORDER BY participant.id ASC
    LIMIT 1
  ) sender ON TRUE
  WHERE message."receivedAt" IS NOT NULL
    AND message.visibility <> ${hidden}
),
latest_email_by_thread AS (
  SELECT DISTINCT ON (message."messageThreadId")
    message.id,
    message."messageThreadId",
    message."receivedAt" AS "activityAt",
    CASE
      WHEN message.visibility = ${full} THEN message.text
      WHEN message.visibility = ${subject} THEN message.subject
      WHEN message.visibility = ${metadata} THEN ${restricted}
      ELSE NULL
    END AS preview,
    message.sender,
    CASE
      WHEN message.visibility IN (${full}, ${subject}) THEN message.subject
      ELSE NULL
    END AS "searchSubject",
    CASE
      WHEN message.visibility = ${full} THEN message.text
      ELSE NULL
    END AS "searchBody"
  FROM visible_email_messages message
  ORDER BY message."messageThreadId", message."receivedAt" DESC, message.id DESC
),
latest_inbound_email_by_thread AS (
  SELECT DISTINCT ON (message."messageThreadId")
    message."messageThreadId",
    message."receivedAt" AS "inboundAt"
  FROM visible_email_messages message
  WHERE message.direction = 'INCOMING'
  ORDER BY message."messageThreadId", message."receivedAt" DESC, message.id DESC
),
latest_instagram_by_conversation AS (
  SELECT DISTINCT ON (message."conversationId")
    message.id,
    message."conversationId",
    COALESCE(message."providerCreatedAt", message."createdAt") AS "activityAt",
    message.text AS preview,
    message.direction
  FROM readable_social_messages message
  ORDER BY message."conversationId", COALESCE(message."providerCreatedAt", message."createdAt") DESC, message.id DESC
),
latest_inbound_instagram_by_conversation AS (
  SELECT DISTINCT ON (message."conversationId")
    message."conversationId",
    COALESCE(message."providerCreatedAt", message."createdAt") AS "inboundAt"
  FROM readable_social_messages message
  WHERE message.direction = 'INBOUND'
  ORDER BY message."conversationId", COALESCE(message."providerCreatedAt", message."createdAt") DESC, message.id DESC
),
email_source_rows AS (
  SELECT
    CASE WHEN creator.id IS NULL THEN 'email-thread' ELSE 'creator' END AS "identityKind",
    COALESCE(creator.id, thread.id) AS "identityRecordId",
    'EMAIL' AS "sourceKind",
    CONCAT('EMAIL:', thread.id) AS "sourceOrderingKey",
    latest."activityAt",
    inbound."inboundAt",
    latest.preview,
    latest.sender,
    thread.id AS "emailThreadId",
    thread."campaignId",
    thread."inboxOwnerId",
    thread.state::text AS state,
    thread."snoozedUntil",
    creator.name AS "creatorName",
    creator.id AS "creatorId",
    creator."instagramUsername" AS "creatorInstagramUsername",
    NULL::uuid AS "instagramConversationId",
    NULL::text AS "providerConversationId",
    NULL::text AS "instagramProvider",
    NULL::text AS "instagramLifecycle",
    NULL::text AS "recipientUsername",
    NULL::text AS "recipientDisplayName",
    NULL::text AS "instagramDirection",
    CONCAT_WS(' ', creator.name, latest."searchSubject", latest."searchBody", latest.sender) AS "searchText"
  FROM readable_threads thread
  INNER JOIN latest_email_by_thread latest
    ON latest."messageThreadId" = thread.id
  LEFT JOIN latest_inbound_email_by_thread inbound
    ON inbound."messageThreadId" = thread.id
  LEFT JOIN readable_creators creator ON creator.id = thread."creatorId"
),
instagram_source_rows AS (
  SELECT
    CASE WHEN creator.id IS NULL THEN 'instagram-conversation' ELSE 'creator' END AS "identityKind",
    COALESCE(creator.id, conversation.id) AS "identityRecordId",
    'INSTAGRAM' AS "sourceKind",
    CONCAT('INSTAGRAM:', conversation.id) AS "sourceOrderingKey",
    COALESCE(latest."activityAt", conversation."updatedAt", conversation."createdAt") AS "activityAt",
    inbound."inboundAt",
    latest.preview,
    COALESCE(conversation."recipientUsername", conversation."recipientDisplayName") AS sender,
    NULL::uuid AS "emailThreadId",
    NULL::uuid AS "campaignId",
    NULL::uuid AS "inboxOwnerId",
    NULL::text AS state,
    NULL::timestamptz AS "snoozedUntil",
    creator.name AS "creatorName",
    creator.id AS "creatorId",
    creator."instagramUsername" AS "creatorInstagramUsername",
    conversation.id AS "instagramConversationId",
    conversation."providerConversationId",
    conversation.provider::text AS "instagramProvider",
    conversation.lifecycle::text AS "instagramLifecycle",
    conversation."recipientUsername",
    conversation."recipientDisplayName",
    latest.direction::text AS "instagramDirection",
    CONCAT_WS(' ', creator.name, conversation."recipientUsername", conversation."recipientDisplayName", latest.preview) AS "searchText"
  FROM readable_social_conversations conversation
  LEFT JOIN latest_instagram_by_conversation latest
    ON latest."conversationId" = conversation.id
  LEFT JOIN latest_inbound_instagram_by_conversation inbound
    ON inbound."conversationId" = conversation.id
  LEFT JOIN readable_creators creator ON creator.id = conversation."creatorId"
),
all_source_rows AS (
  SELECT * FROM email_source_rows
  UNION ALL
  SELECT * FROM instagram_source_rows
),
triage_migration AS (
  SELECT COALESCE(
    (SELECT status FROM "${workspaceSchemaName}"."myahInboxTriageMigration" WHERE id=true),
    'MIGRATING'
  ) AS status
),
triage_capability AS (
  -- This runs inside the list statement snapshot, rather than carrying a
  -- boolean from a prior capability query into the protected tuple projection.
  SELECT NOT EXISTS (
    SELECT 1
    FROM "${workspaceSchemaName}"."messageChannelMessageAssociation" association
    INNER JOIN "${workspaceSchemaName}".message message
      ON message.id = association."messageId"
     AND message."deletedAt" IS NULL
    INNER JOIN core."messageChannel" channel
      ON channel.id = association."messageChannelId"
     AND channel."workspaceId" = $1
    LEFT JOIN core."connectedAccount" connected_account
      ON connected_account.id = channel."connectedAccountId"
     AND connected_account."workspaceId" = $1
    WHERE association."deletedAt" IS NULL
      AND channel.type::text = ANY(${emailChannelTypes}::text[])
    GROUP BY association."messageId"
    HAVING NOT BOOL_OR(
      channel.visibility = '${MessageChannelVisibility.SHARE_EVERYTHING}'
      OR connected_account."userWorkspaceId" = $2
    )
  ) AND NOT EXISTS (
    SELECT 1
    FROM "${workspaceSchemaName}"."myahInboxTriageEmailChannelProvenance" provenance
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(provenance."messageChannelIds") AS channel_id(id)
      INNER JOIN core."messageChannel" channel
        ON channel.id = channel_id.id
       AND channel."workspaceId" = $1
      LEFT JOIN core."connectedAccount" connected_account
        ON connected_account.id = channel."connectedAccountId"
       AND connected_account."workspaceId" = $1
      WHERE channel.visibility = '${MessageChannelVisibility.SHARE_EVERYTHING}'
         OR connected_account."userWorkspaceId" = $2
    )
  ) AS "isAvailable"
),
canonical_triage_rows AS (
  SELECT
    source.*,
    ${canonicalTriageAvailable} AS "triageIsAvailable",
    CASE WHEN ${canonicalTriageScope} THEN triage_owner.id ELSE source."inboxOwnerId" END AS "effectiveInboxOwnerId",
    CASE
      WHEN ${canonicalTriageScope}
        AND triage."inboxState" = 'SNOOZED'
        AND triage."snoozedUntil" <= CURRENT_TIMESTAMP
        THEN 'NEEDS_REPLY'
      WHEN ${canonicalTriageScope} THEN triage."inboxState"
      ELSE source.state
    END AS "effectiveState",
    CASE
      WHEN ${canonicalTriageScope}
        AND triage."inboxState" = 'SNOOZED'
        AND triage."snoozedUntil" > CURRENT_TIMESTAMP
        THEN triage."snoozedUntil"
      WHEN NOT (${canonicalTriageScope}) THEN source."snoozedUntil"
      ELSE NULL::timestamptz
    END AS "effectiveSnoozedUntil",
    CASE WHEN ${canonicalTriageScope} THEN triage."snoozedUntil" ELSE source."snoozedUntil" END AS "persistedSnoozedUntil",
    CASE WHEN ${canonicalTriageAvailable} THEN triage_owner.id ELSE NULL::uuid END AS "triageInboxOwnerId",
    CASE WHEN ${canonicalTriageAvailable} THEN triage.revision ELSE NULL::integer END AS "triageRevision",
    CASE WHEN ${canonicalTriageAvailable} THEN triage."identityGeneration"::text ELSE NULL::text END AS "triageIdentityGeneration"
  FROM all_source_rows source
  CROSS JOIN triage_migration migration
  CROSS JOIN triage_capability
  LEFT JOIN "${workspaceSchemaName}"."myahInboxContactTriage" triage
    ON triage."contactIdentityKey" = CONCAT(source."identityKind", ':', source."identityRecordId")
  LEFT JOIN readable_workspace_members triage_owner
    ON triage_owner.id = triage."inboxOwnerId"
),
effective_source_rows AS (
  SELECT
    source.*,
    CASE WHEN source."triageIsAvailable" THEN source."effectiveState" ELSE NULL::text END AS "triageInboxState",
    CASE WHEN source."triageIsAvailable" THEN source."effectiveSnoozedUntil" ELSE NULL::timestamptz END AS "triageSnoozedUntil"
  FROM canonical_triage_rows source
),
eligible_contacts AS (
  SELECT DISTINCT source."identityKind", source."identityRecordId"
  FROM effective_source_rows source
  WHERE ${eligibleConditions.join('\n    AND ')}
),
latest_source AS (
  SELECT DISTINCT ON (source."identityKind", source."identityRecordId") source.*
  FROM effective_source_rows source
  INNER JOIN eligible_contacts eligible
    ON eligible."identityKind" = source."identityKind"
   AND eligible."identityRecordId" = source."identityRecordId"
  ORDER BY source."identityKind", source."identityRecordId", source."activityAt" DESC, source."sourceOrderingKey" DESC
),
latest_inbound_source AS (
  SELECT DISTINCT ON (source."identityKind", source."identityRecordId") source.*
  FROM effective_source_rows source
  INNER JOIN eligible_contacts eligible
    ON eligible."identityKind" = source."identityKind"
   AND eligible."identityRecordId" = source."identityRecordId"
  WHERE source."inboundAt" IS NOT NULL
  ORDER BY source."identityKind", source."identityRecordId", source."inboundAt" DESC, source."sourceOrderingKey" DESC
),
email_aggregation AS (
  SELECT
    source."identityKind",
    source."identityRecordId",
    ARRAY_AGG(DISTINCT source."emailThreadId" ORDER BY source."emailThreadId") FILTER (WHERE source."emailThreadId" IS NOT NULL) AS "emailThreadIds",
    (ARRAY_AGG(source."emailThreadId" ORDER BY source."activityAt" DESC, source."sourceOrderingKey" DESC)
      FILTER (WHERE source."emailThreadId" IS NOT NULL))[1] AS "latestEmailThreadId",
    BOOL_OR(
      source."effectiveState" = 'NEEDS_REPLY'
      OR (
        source."effectiveState" = 'SNOOZED'
        AND source."effectiveSnoozedUntil" <= CURRENT_TIMESTAMP
      )
    ) FILTER (WHERE source."emailThreadId" IS NOT NULL) AS "emailNeedsAttention"
  FROM effective_source_rows source
  GROUP BY source."identityKind", source."identityRecordId"
),
instagram_aggregation AS (
  SELECT
    source."identityKind",
    source."identityRecordId",
    JSONB_AGG(JSONB_BUILD_OBJECT(
      'id', source."instagramConversationId",
      'providerConversationId', source."providerConversationId",
      'provider', source."instagramProvider",
      'lifecycle', source."instagramLifecycle",
      'recipientUsername', source."recipientUsername",
      'recipientDisplayName', source."recipientDisplayName",
      'lastActivityAt', source."activityAt",
      'latestDirection', source."instagramDirection"
    ) ORDER BY source."activityAt" DESC, source."sourceOrderingKey" DESC)
      FILTER (WHERE source."instagramConversationId" IS NOT NULL) AS "instagramConversations",
    BOOL_OR(source."instagramDirection" = 'INBOUND')
      FILTER (WHERE source."instagramConversationId" IS NOT NULL) AS "instagramNeedsAttention"
  FROM effective_source_rows source
  GROUP BY source."identityKind", source."identityRecordId"
),
contact AS (
  SELECT
    latest."identityKind",
    latest."identityRecordId",
    CONCAT(latest."identityKind", ':', latest."identityRecordId") AS "orderingKey",
    latest."activityAt" AS "lastActivityAt",
    latest."sourceKind" AS "latestChannel",
    COALESCE(inbound."sourceKind", latest."sourceKind") AS "initialChannel",
    CASE
      WHEN COALESCE(inbound."sourceKind", latest."sourceKind") = 'EMAIL'
        THEN COALESCE(inbound."emailThreadId", latest."emailThreadId")
      ELSE NULL::uuid
    END AS "initialEmailThreadId",
    CASE
      WHEN COALESCE(inbound."sourceKind", latest."sourceKind") = 'INSTAGRAM'
        AND JSONB_ARRAY_LENGTH(COALESCE(instagram."instagramConversations", '[]'::jsonb)) = 1
        AND COALESCE(inbound."instagramConversationId", latest."instagramConversationId") =
          (instagram."instagramConversations"->0->>'id')::uuid
        THEN COALESCE(inbound."instagramConversationId", latest."instagramConversationId")
      ELSE NULL::uuid
    END AS "initialInstagramConversationId",
    COALESCE(
      latest."creatorName",
      latest."recipientDisplayName",
      CASE WHEN latest."recipientUsername" IS NOT NULL THEN CONCAT('@', latest."recipientUsername") END,
      latest.sender,
      'Unmatched contact'
    ) AS "displayName",
    latest."creatorId",
    latest."creatorName",
    latest."creatorInstagramUsername",
    latest.preview,
    latest.sender,
    latest."triageIsAvailable",
    latest."triageInboxOwnerId",
    latest."triageInboxState",
    latest."triageSnoozedUntil",
    latest."triageRevision",
    latest."triageIdentityGeneration",
    COALESCE(email."emailThreadIds", ARRAY[]::uuid[]) AS "emailThreadIds",
    email."latestEmailThreadId",
    COALESCE(email."emailNeedsAttention", FALSE) AS "emailNeedsAttention",
    COALESCE(instagram."instagramNeedsAttention", FALSE) AS "instagramNeedsAttention",
    COALESCE(instagram."instagramConversations", '[]'::jsonb) AS "instagramConversations"
  FROM latest_source latest
  LEFT JOIN latest_inbound_source inbound
    ON inbound."identityKind" = latest."identityKind"
   AND inbound."identityRecordId" = latest."identityRecordId"
  LEFT JOIN email_aggregation email
    ON email."identityKind" = latest."identityKind"
   AND email."identityRecordId" = latest."identityRecordId"
  LEFT JOIN instagram_aggregation instagram
    ON instagram."identityKind" = latest."identityKind"
   AND instagram."identityRecordId" = latest."identityRecordId"
),
filtered_total AS (
  SELECT COUNT(*) AS "totalCount" FROM contact
),
paged_contacts AS (
  SELECT contact.*
  FROM contact
  ${cursorCondition}
  ORDER BY contact."lastActivityAt" DESC, contact."orderingKey" DESC
  LIMIT ${limit}
)
SELECT paged_contacts.*, filtered_total."totalCount",
  triage_capability."isAvailable" AS "triageCapabilityAvailable",
  to_char(
    paged_contacts."lastActivityAt" AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) AS "activityCursorTimestamp"
FROM filtered_total
CROSS JOIN triage_capability
LEFT JOIN paged_contacts ON TRUE
ORDER BY paged_contacts."lastActivityAt" DESC NULLS LAST, paged_contacts."orderingKey" DESC NULLS LAST`;
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

        // The private triage relations are provisioned by the 2.20 command,
        // whose marker row is written last. Without them the triage CTEs above
        // cannot be referenced at all, so fail closed with the same generic
        // response instead of surfacing a raw SQL error during a partial
        // upgrade. The identifier is derived from the internal workspace UUID
        // and bound as a parameter here.
        const [triageRelations] = (await dataSource.query(
          'SELECT to_regclass($1) IS NOT NULL AS "exists"',
          [`${workspaceSchemaName}."myahInboxTriageMigration"`],
          undefined,
          { shouldBypassPermissionChecks: true },
        )) as Array<{ exists: boolean }>;

        if (!triageRelations?.exists) {
          throw new ForbiddenException(
            'Triage is unavailable with your current Inbox access',
          );
        }

        const rows = await dataSource.query<ContactRaw[]>(
          sql,
          parameters,
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        if (hasTriageFilter && rows[0]?.triageCapabilityAvailable === false) {
          throw new ForbiddenException(
            'Triage is unavailable with your current Inbox access',
          );
        }
        const contactRows = rows.filter((row) => row.identityRecordId != null);
        const hasNextPage = contactRows.length > pageSize;
        const pageRows = contactRows.slice(0, pageSize);
        const edges = pageRows.map((row) =>
          this.toEdge(row, input.workspace.id),
        );

        return {
          totalCount: Number(rows[0]?.totalCount ?? 0),
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

  async getContact(
    input: Omit<MyahInboxListContactsInput, 'first' | 'after'> & {
      contactId: string;
    },
  ): Promise<MyahInboxContactSummary> {
    const connection = await this.listContacts({
      ...input,
      first: 1,
      after: undefined,
    });
    const contact = connection.edges[0]?.node;

    if (!contact) {
      throw new ForbiddenException('Inbox contact is not readable');
    }

    return contact;
  }

  private toEdge(row: ContactRaw, workspaceId: string) {
    const lastActivityAt = toIsoString(row.lastActivityAt);
    const conversations = parseInstagramConversations(
      row.instagramConversations,
    ).map((conversation) => ({
      ...conversation,
      lastActivityAt: toIsoString(conversation.lastActivityAt),
    }));
    const emailThreadIds = row.emailThreadIds ?? [];
    const emailNeedsAttention = Boolean(row.emailNeedsAttention);
    const instagramNeedsAttention = Boolean(row.instagramNeedsAttention);
    const node: MyahInboxContactSummary = {
      id: encodeMyahInboxContactId({
        workspaceId,
        identity: {
          kind: row.identityKind,
          recordId: row.identityRecordId,
        },
      }),
      identityKind: toGraphqlIdentityKind(row.identityKind),
      displayName: row.displayName ?? 'Unmatched contact',
      creator: row.creatorId
        ? { id: row.creatorId, name: row.creatorName }
        : null,
      instagramUsername: row.creatorInstagramUsername,
      lastActivityAt,
      latestChannel: row.latestChannel,
      initialSelection: {
        channel: row.initialChannel,
        emailThreadId: row.initialEmailThreadId,
        instagramConversationId: row.initialInstagramConversationId,
      },
      preview: row.preview,
      sender: row.sender,
      needsAttention: row.triageIsAvailable
        ? row.triageInboxState === MyahInboxState.NEEDS_REPLY
        : emailNeedsAttention || instagramNeedsAttention,
      triage: {
        isAvailable: Boolean(row.triageIsAvailable),
        inboxOwnerId: row.triageInboxOwnerId ?? null,
        inboxState: row.triageInboxState ?? null,
        snoozedUntil: row.triageSnoozedUntil
          ? toIsoString(row.triageSnoozedUntil)
          : null,
        revision:
          row.triageRevision === null ? null : Number(row.triageRevision),
        identityGeneration: row.triageIdentityGeneration ?? null,
      },
      email: {
        isAvailable: emailThreadIds.length > 0,
        threadCount: emailThreadIds.length,
        threadIds: emailThreadIds,
        latestThreadId: row.latestEmailThreadId,
        needsAttention: emailNeedsAttention,
      },
      instagram: {
        isAvailable: conversations.length > 0,
        state:
          conversations.length === 0
            ? MyahInboxInstagramChannelState.UNAVAILABLE
            : conversations.length === 1
              ? MyahInboxInstagramChannelState.READY
              : MyahInboxInstagramChannelState.AMBIGUOUS,
        needsAttention: instagramNeedsAttention,
        conversations,
      },
    };

    return {
      cursor: encodeMyahInboxContactCursor({
        workspaceId,
        activityAt: row.activityCursorTimestamp,
        orderingKey: row.orderingKey,
      }),
      node,
    };
  }

  private async assertReadableRelations({
    input,
    campaignRepository,
    workspaceMemberRepository,
  }: {
    input: MyahInboxListContactsInput;
    campaignRepository: PermissionAwareRepository;
    workspaceMemberRepository: PermissionAwareRepository;
  }): Promise<void> {
    const currentWorkspaceMember = await workspaceMemberRepository.findOne({
      where: { id: input.workspaceMemberId },
      select: { id: true },
    });

    if (!currentWorkspaceMember) {
      throw new ForbiddenException('Inbox workspace member is not readable');
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

    if (input.owner && input.owner !== 'ME' && input.owner !== 'UNASSIGNED') {
      const owner = await workspaceMemberRepository.findOne({
        where: { id: input.owner },
        select: { id: true },
      });

      if (!owner) {
        throw new ForbiddenException('Inbox owner is not readable');
      }
    }
  }

  private hasTriageFilter(input: MyahInboxContactsInput): boolean {
    return (
      isDefined(input.owner) ||
      Boolean(input.states?.length || input.snoozeStatus)
    );
  }

  private async canUseContactTriage(
    authContext: WorkspaceAuthContext,
  ): Promise<boolean> {
    if (!this.triageCapabilityService) return false;
    try {
      await this.triageCapabilityService.assertRead({ authContext });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  private assertUserRequest(
    input: MyahInboxListContactsInput,
  ): asserts input is MyahInboxListContactsInput & {
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

  private assertValidFilterIds(input: MyahInboxContactsInput): void {
    const hasInvalidCampaignId =
      isDefined(input.campaignId) && !isValidUuid(input.campaignId);
    const hasInvalidOwnerId =
      isDefined(input.owner) &&
      input.owner !== 'ME' &&
      input.owner !== 'UNASSIGNED' &&
      !isValidUuid(input.owner);

    if (hasInvalidCampaignId || hasInvalidOwnerId) {
      throw new BadRequestException('Invalid Myah inbox relation filter');
    }
  }
}
