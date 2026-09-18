import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import gql from 'graphql-tag';

import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { MyahInboxTriageConflictError } from 'src/engine/core-modules/myah-inbox/errors/myah-inbox-triage-conflict.error';
import {
  MyahInboxTriageReceiptRecoveryCronJob,
  MyahInboxTriageReceiptRecoveryJob,
} from 'src/engine/core-modules/myah-inbox/jobs/myah-inbox-triage-receipt-recovery.job';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { normalizeReadCapabilitySql } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-triage-capability.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceManagerService } from 'src/engine/workspace-manager/workspace-manager.service';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';

import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const schema = 'workspace_1wgvd1injqtife6y4rvfbu3h5';

// The dev Apple seed deliberately does not install the public Instagram app.
// This bridge is test-only: it creates the exact application object table names
// and the smallest cacheable metadata surface used by the Inbox capability
// serializer. The identifiers and field names are copied from the public
// myah-instagram-messaging application manifest.
const instagramApplicationId = '4738ebcd-6662-4ecc-a190-374fa0525951';
const instagramApplicationUniversalIdentifier = instagramApplicationId;
const socialConversationObjectId = '11111111-1111-4111-8111-111111111010';
const socialConversationObjectUniversalIdentifier =
  '36817464-855f-42db-9fbb-f8853643f8d6';
const socialMessageObjectId = '11111111-1111-4111-8111-111111111020';
const socialMessageObjectUniversalIdentifier =
  '7241bd44-e474-4904-8636-339276b3feff';

const socialConversationFields = [
  ['11111111-1111-4111-8111-111111111101', 'id', 'UUID'],
  ['11111111-1111-4111-8111-111111111102', 'deletedAt', 'DATE_TIME'],
  ['11111111-1111-4111-8111-111111111103', 'createdAt', 'DATE_TIME'],
  ['11111111-1111-4111-8111-111111111104', 'updatedAt', 'DATE_TIME'],
  ['ca2f533f-5805-4256-8e48-fbf622b5284c', 'label', 'TEXT'],
  ['99cbc07b-138a-4d0a-b9f3-05d0be9e46b3', 'provider', 'SELECT'],
  ['74b47e38-60ec-4f11-8c23-4e622b7d3045', 'lifecycle', 'SELECT'],
  ['d3252d54-709f-4ae6-89bb-2ed4b21fa9a8', 'providerConversationId', 'TEXT'],
  ['39b1ef10-36da-452b-a246-0334eea7d78e', 'recipientUsername', 'TEXT'],
  ['e1a10c6b-f59e-4597-8d7b-3003b97609fb', 'recipientDisplayName', 'TEXT'],
  ['6b26848c-ab3b-45dd-ad62-9d194512b116', 'creatorId', 'UUID'],
  ['49f3eeac-b8a5-4362-827a-7dc597d2dcb4', 'messages', 'TEXT'],
] as const;
const socialMessageFields = [
  ['11111111-1111-4111-8111-111111111201', 'id', 'UUID'],
  ['11111111-1111-4111-8111-111111111202', 'deletedAt', 'DATE_TIME'],
  ['11111111-1111-4111-8111-111111111203', 'createdAt', 'DATE_TIME'],
  ['11111111-1111-4111-8111-111111111204', 'updatedAt', 'DATE_TIME'],
  ['ceb3642e-b4b4-44b7-8297-fa3ac944dc19', 'text', 'TEXT'],
  ['882c38ea-7464-4d2f-9dab-8468e14814ad', 'direction', 'SELECT'],
  ['b421f20f-363c-4ce5-af0a-b4dcede88e9f', 'provider', 'SELECT'],
  ['9132e7f5-8607-4d36-95b2-1dd557ef35e8', 'providerMessageId', 'TEXT'],
  ['f2355fd3-4198-4122-ae4a-ea96318bcd97', 'providerCreatedAt', 'DATE_TIME'],
  ['80670f08-59e0-4f45-9058-e7221d66b95f', 'conversationId', 'UUID'],
] as const;

type WorkspaceCacheService = {
  invalidateAndRecompute: (
    workspaceId: string,
    keys: string[],
  ) => Promise<void>;
};

type WorkspaceOrmManager = {
  getRepository: <T>(
    workspaceId: string,
    objectName: string,
    rolePermissionConfig: unknown,
  ) => Promise<T>;
};

const permissionCacheKeys = [
  'rolesPermissions',
  'userWorkspaceRoleMap',
  'flatRoleMaps',
  'flatRoleTargetMaps',
  'flatObjectPermissionMaps',
  'flatRowLevelPermissionPredicateMaps',
  'flatRowLevelPermissionPredicateGroupMaps',
];

const capabilitySources = [
  ['messageThread', 'message_thread', 'messageThread'],
  ['myahSocialConversation', 'social_conversation', '_myahSocialConversation'],
  ['myahSocialMessage', 'social_message', '_myahSocialMessage'],
] as const;

const contactsQuery = gql`
  query Myah354Contacts(
    $first: Int
    $owner: String
    $states: [MyahInboxState!]
    $snoozeStatus: MyahInboxSnoozeStatus
  ) {
    myahInboxContacts(
      first: $first
      owner: $owner
      states: $states
      snoozeStatus: $snoozeStatus
    ) {
      totalCount
      edges {
        node {
          id
          identityKind
          email {
            threadIds
          }
          triage {
            isAvailable
            inboxOwnerId
            inboxState
            snoozedUntil
            revision
            identityGeneration
          }
        }
      }
    }
  }
`;

const updateTriageMutation = gql`
  mutation Myah354UpdateTriage($input: UpdateMyahInboxContactTriageInput!) {
    updateMyahInboxContactTriage(input: $input) {
      inboxOwnerId
      inboxState
      snoozedUntil
      revision
      identityGeneration
    }
  }
`;

const resolveProviderByName = <T>(name: string): T => {
  const app = global.app as typeof global.app & {
    container: {
      getModules: () => Map<
        string,
        {
          providers: Map<
            unknown,
            { instance?: unknown; metatype?: { name: string } }
          >;
        }
      >;
    };
  };
  const provider = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.values()])
    .find((wrapper) => wrapper.metatype?.name === name);

  if (!provider?.instance) throw new Error(`Missing provider ${name}`);

  return provider.instance as T;
};

const installInstagramMetadataBridge = async (): Promise<void> => {
  await global.testDataSource.transaction(async (manager) => {
    await manager.query(
      `CREATE TABLE IF NOT EXISTS "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialConversation" (
        id uuid PRIMARY KEY, name text, label text,
        provider text NOT NULL DEFAULT 'COMPOSIO_HISTORY',
        lifecycle text NOT NULL DEFAULT 'HISTORICAL', "providerConversationId" text,
        "recipientIgsid" text, "recipientUsername" text,
        "recipientDisplayName" text, "creatorId" uuid,
        "instagramAccountId" uuid, "completedMessageSyncAt" timestamptz,
        "createdBySource" text, "createdByWorkspaceMemberId" uuid,
        "createdByName" text, "createdByContext" jsonb,
        "updatedBySource" text, "updatedByWorkspaceMemberId" uuid,
        "updatedByName" text, "updatedByContext" jsonb,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
      )`,
    );
    await manager.query(
      `CREATE TABLE IF NOT EXISTS "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialMessage" (
        id uuid PRIMARY KEY, text text, direction text NOT NULL DEFAULT 'OUTBOUND',
        "sentVia" text NOT NULL DEFAULT 'MANUAL',
        provider text NOT NULL DEFAULT 'COMPOSIO_HISTORY', "providerMessageId" text,
        "providerCreatedAt" timestamptz, "conversationId" uuid,
        "deliveryState" text NOT NULL DEFAULT 'UNKNOWN',
        "deliveryStateUpdatedAt" timestamptz, "hasAttachments" boolean NOT NULL DEFAULT false,
        "attachmentCount" numeric NOT NULL DEFAULT 0,
        "createdBySource" text, "createdByWorkspaceMemberId" uuid,
        "createdByName" text, "createdByContext" jsonb,
        "updatedBySource" text, "updatedByWorkspaceMemberId" uuid,
        "updatedByName" text, "updatedByContext" jsonb,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
      )`,
    );
    await manager.query(
      `ALTER TABLE "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialConversation"
       ADD COLUMN IF NOT EXISTS name text,
       ADD COLUMN IF NOT EXISTS label text,
       ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'COMPOSIO_HISTORY',
       ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'HISTORICAL',
       ADD COLUMN IF NOT EXISTS "providerConversationId" text,
       ADD COLUMN IF NOT EXISTS "recipientIgsid" text,
       ADD COLUMN IF NOT EXISTS "recipientUsername" text,
       ADD COLUMN IF NOT EXISTS "recipientDisplayName" text,
       ADD COLUMN IF NOT EXISTS "instagramAccountId" uuid,
       ADD COLUMN IF NOT EXISTS "completedMessageSyncAt" timestamptz,
       ADD COLUMN IF NOT EXISTS "createdBySource" text,
       ADD COLUMN IF NOT EXISTS "createdByWorkspaceMemberId" uuid,
       ADD COLUMN IF NOT EXISTS "createdByName" text,
       ADD COLUMN IF NOT EXISTS "createdByContext" jsonb,
       ADD COLUMN IF NOT EXISTS "updatedBySource" text,
       ADD COLUMN IF NOT EXISTS "updatedByWorkspaceMemberId" uuid,
       ADD COLUMN IF NOT EXISTS "updatedByName" text,
       ADD COLUMN IF NOT EXISTS "updatedByContext" jsonb,
       ALTER COLUMN "updatedAt" SET DEFAULT now(),
       ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await manager.query(
      `ALTER TABLE "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialMessage"
       ADD COLUMN IF NOT EXISTS text text,
       ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'OUTBOUND',
       ADD COLUMN IF NOT EXISTS "sentVia" text NOT NULL DEFAULT 'MANUAL',
       ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'COMPOSIO_HISTORY',
       ADD COLUMN IF NOT EXISTS "providerMessageId" text,
       ADD COLUMN IF NOT EXISTS "providerCreatedAt" timestamptz,
       ADD COLUMN IF NOT EXISTS "conversationId" uuid,
       ADD COLUMN IF NOT EXISTS "deliveryState" text NOT NULL DEFAULT 'UNKNOWN',
       ADD COLUMN IF NOT EXISTS "deliveryStateUpdatedAt" timestamptz,
       ADD COLUMN IF NOT EXISTS "hasAttachments" boolean NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS "attachmentCount" numeric NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS "createdBySource" text,
       ADD COLUMN IF NOT EXISTS "createdByWorkspaceMemberId" uuid,
       ADD COLUMN IF NOT EXISTS "createdByName" text,
       ADD COLUMN IF NOT EXISTS "createdByContext" jsonb,
       ADD COLUMN IF NOT EXISTS "updatedBySource" text,
       ADD COLUMN IF NOT EXISTS "updatedByWorkspaceMemberId" uuid,
       ADD COLUMN IF NOT EXISTS "updatedByName" text,
       ADD COLUMN IF NOT EXISTS "updatedByContext" jsonb,
       ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now(),
       ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz,
       ALTER COLUMN "updatedAt" SET DEFAULT now(),
       ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await manager.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "myah354_social_conversation_provider_identity"
       ON "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialConversation" (provider, "instagramAccountId", "providerConversationId")`,
    );
    await manager.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "myah354_social_message_provider_identity"
       ON "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialMessage" (provider, "conversationId", "providerMessageId")`,
    );
    await manager.query(
      `INSERT INTO core.application (
        id, "universalIdentifier", name, "sourceType", "sourcePath", "workspaceId",
        "canBeUninstalled", "availablePackages", "isSdkLayerStale"
      ) VALUES ($1, $2, 'Myah Instagram Messaging test fixture', 'local',
        'test/integration/myah-inbox', $3, false, '{}'::jsonb, false)
      ON CONFLICT ("universalIdentifier", "workspaceId")
      WHERE (("deletedAt" IS NULL) AND ("universalIdentifier" IS NOT NULL)) DO NOTHING`,
      [
        instagramApplicationId,
        instagramApplicationUniversalIdentifier,
        workspaceId,
      ],
    );
    for (const [id, universalIdentifier, name, plural, tableName] of [
      [
        socialConversationObjectId,
        socialConversationObjectUniversalIdentifier,
        'myahSocialConversation',
        'myahSocialConversations',
        '_myahSocialConversation',
      ],
      [
        socialMessageObjectId,
        socialMessageObjectUniversalIdentifier,
        'myahSocialMessage',
        'myahSocialMessages',
        '_myahSocialMessage',
      ],
    ]) {
      await manager.query(
        `INSERT INTO core."objectMetadata" (
          id, "applicationId", "workspaceId", "universalIdentifier", "nameSingular", "namePlural",
          "labelSingular", "labelPlural", "targetTableName", "isActive", "isSystem",
          "isUIReadOnly", "isUIEditable", "isUICreatable", "isAuditLogged", "isSearchable",
          "isLabelSyncedWithName"
        ) VALUES ($1, $2, $3, $4, $5, $6, $5, $6, $7, true, false, false, true, true, true, false, false)
        ON CONFLICT ("workspaceId", "universalIdentifier") DO NOTHING`,
        [
          id,
          instagramApplicationId,
          workspaceId,
          universalIdentifier,
          name,
          plural,
          tableName,
        ],
      );
    }
    for (const [objectId, fields, idPrefix] of [
      [
        socialConversationObjectId,
        socialConversationFields,
        '11111111-1111-4111-8111-1111111113',
      ],
      [
        socialMessageObjectId,
        socialMessageFields,
        '11111111-1111-4111-8111-1111111114',
      ],
    ] as const) {
      for (const [
        index,
        [universalIdentifier, name, type],
      ] of fields.entries()) {
        const id = `${idPrefix}${String(index).padStart(2, '0')}`;
        await manager.query(
          `INSERT INTO core."fieldMetadata" (
            id, "objectMetadataId", "workspaceId", "applicationId", "universalIdentifier",
            type, name, label, "isActive", "isSystem", "isSystemSideEffect", "isUIReadOnly",
            "isUIEditable", "isNullable", "isLabelSyncedWithName"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, true, false, false, false, true, true, false)
          ON CONFLICT ("workspaceId", "universalIdentifier") DO UPDATE
           SET type = EXCLUDED.type, name = EXCLUDED.name, label = EXCLUDED.label,
               settings = NULL, "relationTargetObjectMetadataId" = NULL,
               "relationTargetFieldMetadataId" = NULL`,
          [
            id,
            objectId,
            workspaceId,
            instagramApplicationId,
            universalIdentifier,
            type,
            name,
          ],
        );
      }
    }

    const [appleJaneRoleTarget] = await manager.query(
      `SELECT "roleId" FROM core."roleTarget"
       WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.JANE],
    );
    if (!appleJaneRoleTarget) {
      throw new Error('Apple Jane role target is required for Myah 354');
    }
    const capabilityObjects = await manager.query(
      `SELECT id, "applicationId" FROM core."objectMetadata"
       WHERE "workspaceId" = $1
         AND (
           "universalIdentifier" = ANY($2::uuid[])
           OR "nameSingular" = 'messageThread'
         )`,
      [
        workspaceId,
        [
          socialConversationObjectUniversalIdentifier,
          socialMessageObjectUniversalIdentifier,
        ],
      ],
    );
    if (capabilityObjects.length !== 3) {
      throw new Error('Myah 354 capability metadata bridge was not installed');
    }
    for (const object of capabilityObjects) {
      await manager.query(
        `INSERT INTO core."objectPermission" (
          id, "workspaceId", "universalIdentifier", "applicationId", "roleId",
          "objectMetadataId", "canReadObjectRecords", "canUpdateObjectRecords",
          "canSoftDeleteObjectRecords", "canDestroyObjectRecords"
        ) VALUES ($1, $2, $3, $4, $5, $6, true, false, false, false)
        ON CONFLICT ("objectMetadataId", "roleId") DO UPDATE
          SET "canReadObjectRecords" = true`,
        [
          randomUUID(),
          workspaceId,
          randomUUID(),
          object.applicationId,
          appleJaneRoleTarget.roleId,
          object.id,
        ],
      );
    }
  });

  await resolveProviderByName<WorkspaceCacheService>(
    'WorkspaceCacheService',
  ).invalidateAndRecompute(workspaceId, [
    'flatApplicationMaps',
    'flatObjectMetadataMaps',
    'flatFieldMetadataMaps',
    'flatIndexMaps',
    ...permissionCacheKeys,
    'ORMEntityMetadatas',
    'graphQLResolverNameMap',
  ]);
};

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
};

const waitForBlockedDatabaseQuery = async (
  queryFragment: string,
  maxAttempts = 500,
): Promise<void> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [blocked] = await global.testDataSource.query(
      `SELECT 1
       FROM pg_stat_activity
       WHERE pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'
         AND query LIKE $1
       LIMIT 1`,
      [`%${queryFragment}%`],
    );
    if (blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `Database query did not reach the PostgreSQL lock barrier: ${queryFragment}`,
  );
};

type SourceFixture = {
  creatorA: string;
  creatorB: string;
  threadId: string;
  messageId: string;
  associationId: string;
  additionalAssociationIds: string[];
  additionalThreadIds: string[];
};

const withTransaction = async <T>(
  callback: (manager: WorkspaceEntityManager) => Promise<T>,
): Promise<T> => {
  const runner = global.testDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const result = await callback(runner.manager as WorkspaceEntityManager);
    await runner.commitTransaction();

    return result;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
};

const seedFixture = async (): Promise<SourceFixture> => {
  const creatorA = randomUUID();
  const creatorB = randomUUID();
  const threadId = randomUUID();
  const messageId = randomUUID();
  const associationId = randomUUID();
  const occurredAt = '2099-09-15T10:00:00.000Z';
  const [messageChannel] = await global.testDataSource.query(
    `SELECT id FROM core."messageChannel"
     WHERE "workspaceId" = $1
     ORDER BY id LIMIT 1`,
    [workspaceId],
  );
  if (!messageChannel) {
    throw new Error('Myah 354 requires an Apple email message channel');
  }

  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."creator" (id, name) VALUES ($1, 'Task 6 A'), ($2, 'Task 6 B')`,
    [creatorA, creatorB],
  );
  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" (
       id, "creatorId", "inboxState", "updatedAt", "createdAt"
     ) VALUES ($1, NULL, 'CLOSED', $2::timestamptz, $2::timestamptz)`,
    [threadId, occurredAt],
  );
  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5".message (
       id, "messageThreadId", "headerMessageId", subject, text, "receivedAt",
       "isDraft", "updatedAt", "createdAt"
     ) VALUES ($1, $2, $4, 'MYAH354 HTTP triage', 'MYAH354 HTTP triage',
       $3::timestamptz, false, $3::timestamptz, $3::timestamptz)`,
    [messageId, threadId, occurredAt, `myah354-header-${messageId}`],
  );
  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" (
       id, "messageChannelId", "messageId", "messageExternalId", "messageThreadExternalId",
       direction, "updatedAt", "createdAt"
     ) VALUES ($1, $2, $3, $4, $5, 'INCOMING', $6::timestamptz, $6::timestamptz)`,
    [
      associationId,
      messageChannel.id,
      messageId,
      `myah354-${messageId}`,
      `myah354-thread-${threadId}`,
      occurredAt,
    ],
  );

  return {
    creatorA,
    creatorB,
    threadId,
    messageId,
    associationId,
    additionalAssociationIds: [],
    additionalThreadIds: [],
  };
};

const addThread = async (
  fixture: SourceFixture,
  creatorId: string | null = null,
): Promise<string> => {
  const threadId = randomUUID();
  const occurredAt = '2099-09-15T10:00:00.000Z';

  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" (
       id, "creatorId", "inboxState", "updatedAt", "createdAt"
     ) VALUES ($1, $2, 'CLOSED', $3::timestamptz, $3::timestamptz)`,
    [threadId, creatorId, occurredAt],
  );
  fixture.additionalThreadIds.push(threadId);

  return threadId;
};

const cleanupFixture = async (
  fixture: SourceFixture | undefined,
): Promise<void> => {
  if (!fixture) return;
  const {
    creatorA,
    creatorB,
    threadId,
    messageId,
    associationId,
    additionalAssociationIds,
    additionalThreadIds,
  } = fixture;
  const threadIds = [threadId, ...additionalThreadIds];
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
     WHERE id = ANY($1::uuid[])`,
    [[associationId, ...additionalAssociationIds]],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt" WHERE "sourceRecordId" = ANY($1::uuid[])`,
    [threadIds],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageEmailChannelProvenance"
     WHERE "persistedMessageId"=$1`,
    [messageId],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageParticipant"
     WHERE "messageId" IN (
       SELECT id FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message"
       WHERE "messageThreadId" = ANY($1::uuid[])
     )`,
    [threadIds],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
     WHERE "messageThreadId" = ANY($1::uuid[])`,
    [threadIds],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message"
     WHERE "messageThreadId" = ANY($1::uuid[])`,
    [threadIds],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id = ANY($1::uuid[])`,
    [threadIds],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."creator" WHERE id = ANY($1::uuid[])`,
    [[creatorA, creatorB]],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
     WHERE "contactIdentityKey" = ANY($1::text[])`,
    [
      [
        ...threadIds.map((id) => `email-thread:${id}`),
        `creator:${creatorA}`,
        `creator:${creatorB}`,
      ],
    ],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactIdentity"
     WHERE "contactIdentityKey" = ANY($1::text[])`,
    [
      [
        ...threadIds.map((id) => `email-thread:${id}`),
        `creator:${creatorA}`,
        `creator:${creatorB}`,
      ],
    ],
  );
};

const recordPendingInboundReceipt = async (
  fixture: SourceFixture,
): Promise<string> => {
  const receiptService = new MyahInboxContactTriageReceiptService();

  await withTransaction(async (manager) => {
    (
      manager as unknown as { internalContext: { workspaceId: string } }
    ).internalContext = { workspaceId };
    await receiptService.recordInTransaction(
      {
        channel: 'EMAIL',
        persistedMessageId: fixture.messageId,
        sourceRecordId: fixture.threadId,
        sourceGenerationId: `myah354-drain-${randomUUID()}`,
        mode: 'LIVE',
        direction: 'INBOUND',
        providerOccurredAt: '2099-09-15T11:00:00.000Z',
        originalCreatedAt: '2099-09-15T11:00:00.000Z',
        firstPersistence: true,
      },
      manager,
    );
  });
  const [receipt] = await global.testDataSource.query(
    `SELECT sequence::text
     FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt"
     WHERE "persistedMessageId"=$1`,
    [fixture.messageId],
  );
  if (!receipt) throw new Error('Pending receipt was not recorded');

  return receipt.sequence;
};

const drainPendingReceipt = async (throughSequence: string): Promise<void> => {
  const triage = new MyahInboxContactTriageService();
  const receiptService = new MyahInboxContactTriageReceiptService(
    resolveProviderByName<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    ),
    undefined,
    triage,
  );
  await receiptService.drain({
    workspaceId,
    throughSequence,
    purpose: 'READY_RECOVERY',
  });
};

const applyInboundReceipt = async ({
  fixture,
  entered,
  release,
}: {
  fixture: SourceFixture;
  entered?: ReturnType<typeof deferred>;
  release?: ReturnType<typeof deferred>;
}) => {
  const triage = new MyahInboxContactTriageService();

  return withTransaction(async (manager) => {
    (
      manager as unknown as { internalContext: { workspaceId: string } }
    ).internalContext = {
      workspaceId,
    };
    await manager.query("SELECT set_config('search_path', $1, true)", [schema]);
    // The receipt applies through the production source-lock suffix. Holding
    // the same advisory lock here is re-entrant and supplies a deterministic
    // barrier immediately before that suffix, without a timing sleep.
    await manager.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
      buildMyahInboxSourceKey('EMAIL_THREAD', fixture.threadId),
    ]);
    entered?.resolve();
    if (release) await release.promise;
    await triage.applyReceiptInTransaction(
      {
        sequence: '1',
        channel: 'EMAIL',
        persistedMessageId: randomUUID(),
        sourceRecordId: fixture.threadId,
        sourceGenerationId: 'task-6-race',
        mode: 'LIVE',
        direction: 'INBOUND',
        providerOccurredAt: '2099-09-15T11:00:00.000Z',
        originalCreatedAt: '2099-09-15T11:00:00.000Z',
        normalizedOccurredAt: '2099-09-15T11:00:00.000Z',
        orderKey: `2099-09-15T11:00:00.000Z|EMAIL|${fixture.threadId}`,
      },
      manager,
    );
  });
};

const recordFixtureEmailEvidence = async ({
  fixture,
  firstPersistence,
}: {
  fixture: SourceFixture;
  firstPersistence: boolean;
}): Promise<void> => {
  const receiptService = new MyahInboxContactTriageReceiptService();

  await withTransaction(async (manager) => {
    (
      manager as unknown as { internalContext: { workspaceId: string } }
    ).internalContext = { workspaceId };
    await receiptService.recordInTransaction(
      {
        channel: 'EMAIL',
        persistedMessageId: fixture.messageId,
        sourceRecordId: fixture.threadId,
        sourceGenerationId: 'myah-354-provenance',
        mode: 'LIVE',
        direction: 'INBOUND',
        providerOccurredAt: '2099-09-15T10:00:00.000Z',
        originalCreatedAt: '2099-09-15T10:00:00.000Z',
        firstPersistence,
      },
      manager,
    );
  });
};

const addFixtureEmailAssociation = async ({
  fixture,
  messageChannelId,
}: {
  fixture: SourceFixture;
  messageChannelId: string;
}): Promise<string> => {
  const associationId = randomUUID();

  await global.testDataSource.query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" (
       id, "messageChannelId", "messageId", "messageExternalId", "messageThreadExternalId",
       direction, "updatedAt", "createdAt"
     ) VALUES ($1, $2, $3, $4, $5, 'INCOMING', now(), now())`,
    [
      associationId,
      messageChannelId,
      fixture.messageId,
      `myah354-${fixture.messageId}-${associationId}`,
      `myah354-thread-${fixture.threadId}`,
    ],
  );
  fixture.additionalAssociationIds.push(associationId);

  return associationId;
};

const persistFixtureAssociationAfterSourceLock = async ({
  fixture,
  messageChannelId,
  entered,
  release,
}: {
  fixture: SourceFixture;
  messageChannelId: string;
  entered?: ReturnType<typeof deferred>;
  release?: ReturnType<typeof deferred>;
}): Promise<void> => {
  const associationId = randomUUID();
  fixture.additionalAssociationIds.push(associationId);

  await withTransaction(async (manager) => {
    await manager.query("SELECT set_config('search_path', $1, true)", [schema]);
    await manager.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
      buildMyahInboxSourceKey('EMAIL_THREAD', fixture.threadId),
    ]);
    await manager.query(
      'SELECT id FROM "messageThread" WHERE id=$1 FOR UPDATE',
      [fixture.threadId],
    );
    entered?.resolve();
    if (release) await release.promise;
    await manager.query(
      `INSERT INTO "messageChannelMessageAssociation" (
         id, "messageChannelId", "messageId", "messageExternalId", "messageThreadExternalId",
         direction, "updatedAt", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, 'INCOMING', now(), now())`,
      [
        associationId,
        messageChannelId,
        fixture.messageId,
        `myah354-producer-${associationId}`,
        `myah354-thread-${fixture.threadId}`,
      ],
    );
  });
};

type InstagramProducerFixture = {
  conversationId: string;
  accountRecordId: string;
  providerConversationId: string;
  binding: {
    id: string;
    workspaceId: string;
    workspaceInstagramAccountRecordId: string;
    unipileAccountId: string;
    instagramUserId: string;
    status: 'ACTIVE';
    deactivatedAt: null;
  };
};

const seedInstagramProducerFixture =
  async (): Promise<InstagramProducerFixture> => {
    const conversationId = randomUUID();
    const accountRecordId = randomUUID();
    const providerConversationId = `myah354-chat-${conversationId}`;
    const binding = {
      id: randomUUID(),
      workspaceId,
      workspaceInstagramAccountRecordId: accountRecordId,
      unipileAccountId: `myah354-account-${conversationId}`,
      instagramUserId: `myah354-user-${conversationId}`,
      status: 'ACTIVE' as const,
      deactivatedAt: null,
    };

    await global.testDataSource.query(
      `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialConversation" (
       id, name, label, provider, lifecycle, "providerConversationId",
       "recipientIgsid", "recipientUsername", "recipientDisplayName",
       "instagramAccountId", "updatedAt", "createdAt"
     ) VALUES ($1, 'MYAH354 Instagram', 'MYAH354 Instagram', 'UNIPILE', 'ACTIVE',
       $2, $3, 'myah354-recipient', 'MYAH354 Recipient', $4, now(), now())`,
      [
        conversationId,
        providerConversationId,
        `myah354-recipient-${conversationId}`,
        accountRecordId,
      ],
    );

    return { conversationId, accountRecordId, providerConversationId, binding };
  };

const projectInstagramMessage = async (
  fixture: InstagramProducerFixture,
): Promise<void> => {
  const triage = new MyahInboxContactTriageService();
  const receipt = new MyahInboxContactTriageReceiptService(
    undefined,
    undefined,
    triage,
  );
  const bindingManager = {
    getRepository: () => ({ findOne: async () => fixture.binding }),
  };
  const projection = new UnipileInstagramProjectionService(
    resolveProviderByName<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    ),
    {
      withLock: async (
        _scope: unknown,
        operation: (manager: typeof bindingManager) => Promise<unknown>,
      ) => operation(bindingManager),
    } as never,
    triage,
    receipt,
  );

  await projection.upsertVerifiedMessage({
    workspace: { id: workspaceId },
    binding: fixture.binding as never,
    chat: {
      chatId: fixture.providerConversationId,
      accountId: fixture.binding.unipileAccountId,
      accountType: 'INSTAGRAM',
      type: 'ONE_TO_ONE',
      attendeeProviderId: `myah354-recipient-${fixture.conversationId}`,
      name: 'MYAH354 Recipient',
      timestamp: '2099-09-15T10:00:00.000Z',
    },
    conversationRecordId: fixture.conversationId,
    message: {
      messageId: `myah354-message-${fixture.conversationId}`,
      accountId: fixture.binding.unipileAccountId,
      chatId: fixture.providerConversationId,
      senderId: `myah354-recipient-${fixture.conversationId}`,
      text: 'MYAH354 actual Instagram producer',
      timestamp: '2099-09-15T10:01:00.000Z',
      hasAttachments: false,
      attachmentCount: 0,
      seen: false,
      delivered: false,
      hidden: false,
      deleted: false,
      isEvent: false,
    },
    sourceGenerationId: `myah354-generation-${fixture.conversationId}`,
    triageMode: 'LIVE',
  });
};

const mutateInstagramCreator = async ({
  fixture,
  creatorId,
  entered,
  release,
}: {
  fixture: InstagramProducerFixture;
  creatorId: string | null;
  entered?: ReturnType<typeof deferred>;
  release?: ReturnType<typeof deferred>;
}): Promise<void> => {
  const lifecycle = new MyahInboxContactTriageLifecycleService(
    new MyahInboxContactTriageService(),
  );

  await withTransaction((manager) =>
    lifecycle.withPreparedSourceMutationInTransaction({
      workspaceId,
      sourceType: 'INSTAGRAM_CONVERSATION',
      sourceRecordIds: [fixture.conversationId],
      nextCreatorIds: creatorId ? [creatorId] : [],
      manager,
      mutate: async () => {
        entered?.resolve();
        if (release) await release.promise;
        await manager.query(
          'UPDATE "_myahSocialConversation" SET "creatorId"=$2 WHERE id=$1',
          [fixture.conversationId, creatorId],
        );
      },
    }),
  );
};

const cleanupInstagramProducerFixture = async (
  fixture: InstagramProducerFixture,
): Promise<void> => {
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt" WHERE "sourceRecordId"=$1`,
    [fixture.conversationId],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialMessage" WHERE "conversationId"=$1`,
    [fixture.conversationId],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage" WHERE "contactIdentityKey"=$1`,
    [`instagram-conversation:${fixture.conversationId}`],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactIdentity" WHERE "contactIdentityKey"=$1`,
    [`instagram-conversation:${fixture.conversationId}`],
  );
  await global.testDataSource.query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialConversation" WHERE id=$1`,
    [fixture.conversationId],
  );
};

const persistExistingEmailThroughProducer = async (
  fixture: SourceFixture,
): Promise<void> => {
  const [evidence] = (await global.testDataSource.query(
    `SELECT message."headerMessageId", message.subject, message.text,
            message."receivedAt", message."isDraft",
            association."messageChannelId", association."messageExternalId",
            association."messageThreadExternalId", association.direction
     FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".message
     JOIN "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       ON association."messageId"=message.id
     WHERE message.id=$1 AND association.id=$2`,
    [fixture.messageId, fixture.associationId],
  )) as Array<{
    headerMessageId: string | null;
    subject: string | null;
    text: string | null;
    receivedAt: Date;
    isDraft: boolean;
    messageChannelId: string;
    messageExternalId: string;
    messageThreadExternalId: string;
    direction: string;
  }>;
  if (!evidence) throw new Error('Email producer fixture evidence is missing');
  const messageService = resolveProviderByName<MessagingMessageService>(
    'MessagingMessageService',
  );
  const workspaceOrmManager = resolveProviderByName<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );
  await workspaceOrmManager.executeInWorkspaceContext(
    async () => {
      const workspaceDataSource =
        await workspaceOrmManager.getGlobalWorkspaceDataSource();

      return workspaceDataSource.transaction((manager) =>
        messageService
          .saveMessagesWithinTransaction(
            [
              {
                externalId: evidence.messageExternalId,
                headerMessageId: evidence.headerMessageId,
                subject: evidence.subject,
                text: evidence.text,
                receivedAt: new Date(evidence.receivedAt),
                isDraft: evidence.isDraft,
                messageThreadExternalId: evidence.messageThreadExternalId,
                direction: evidence.direction,
                participants: [],
                attachments: [],
              } as never,
            ],
            evidence.messageChannelId,
            manager as WorkspaceEntityManager,
            workspaceId,
            true,
          )
          .then(() => undefined),
      );
    },
    buildSystemAuthContext(workspaceId),
    { lite: true },
  );
};

const persistExistingEmailThroughSaveEnqueueProducer = async (
  fixture: SourceFixture,
): Promise<void> => {
  const [evidence] = (await global.testDataSource.query(
    `SELECT message."headerMessageId", message.subject, message.text,
            message."receivedAt", message."isDraft",
            association."messageChannelId", association."messageExternalId",
            association."messageThreadExternalId", association.direction
     FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".message
     JOIN "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       ON association."messageId"=message.id
     WHERE message.id=$1 AND association.id=$2`,
    [fixture.messageId, fixture.associationId],
  )) as Array<{
    headerMessageId: string | null;
    subject: string | null;
    text: string | null;
    receivedAt: Date;
    isDraft: boolean;
    messageChannelId: string;
    messageExternalId: string;
    messageThreadExternalId: string;
    direction: string;
  }>;
  if (!evidence) throw new Error('Email producer fixture evidence is missing');

  const saveService =
    resolveProviderByName<MessagingSaveMessagesAndEnqueueContactCreationService>(
      'MessagingSaveMessagesAndEnqueueContactCreationService',
    );
  await saveService.saveMessagesAndEnqueueContactCreation(
    [
      {
        externalId: evidence.messageExternalId,
        headerMessageId: evidence.headerMessageId,
        subject: evidence.subject,
        text: evidence.text,
        receivedAt: new Date(evidence.receivedAt),
        isDraft: evidence.isDraft,
        messageThreadExternalId: evidence.messageThreadExternalId,
        direction: evidence.direction,
        participants: [],
        attachments: [],
      } as never,
    ],
    {
      id: evidence.messageChannelId,
      isContactAutoCreationEnabled: false,
      excludeNonProfessionalEmails: false,
    } as never,
    { handleAliases: [], handle: '' } as never,
    workspaceId,
    { mode: 'LIVE', generationId: `myah354-race-${randomUUID()}` },
  );
};

const retireCreatorWithLifecycle = async ({
  fixture,
  mode,
  entered,
  release,
}: {
  fixture: SourceFixture;
  mode: 'delete' | 'merge';
  entered?: ReturnType<typeof deferred>;
  release?: ReturnType<typeof deferred>;
}): Promise<void> => {
  const lifecycle = new MyahInboxContactTriageLifecycleService(
    new MyahInboxContactTriageService(),
  );

  return withTransaction((manager) =>
    lifecycle.withPreparedCreatorMutationInTransaction({
      workspaceId,
      creatorIds: [
        fixture.creatorA,
        ...(mode === 'merge' ? [fixture.creatorB] : []),
      ],
      manager,
      mutate: async (sources) => {
        entered?.resolve();
        if (release) await release.promise;
        if (mode === 'delete') {
          await lifecycle.rekeyPreparedSourcesToUnmatchedInTransaction({
            sources,
            manager,
          });
        } else {
          await manager.query(
            'UPDATE "messageThread" SET "creatorId"=$2 WHERE "creatorId"=$1',
            [fixture.creatorA, fixture.creatorB],
          );
        }
        await manager.query('DELETE FROM "creator" WHERE id=$1', [
          fixture.creatorA,
        ]);
      },
    }),
  );
};

const mutateThreadCreator = async ({
  fixture,
  creatorId,
  threadId = fixture.threadId,
  entered,
  release,
}: {
  fixture: SourceFixture;
  creatorId: string | null;
  threadId?: string;
  entered?: ReturnType<typeof deferred>;
  release?: ReturnType<typeof deferred>;
}) => {
  const lifecycle = new MyahInboxContactTriageLifecycleService(
    new MyahInboxContactTriageService(),
  );

  return withTransaction((manager) =>
    lifecycle.withPreparedSourceMutationInTransaction({
      workspaceId,
      sourceType: 'EMAIL_THREAD',
      sourceRecordIds: [threadId],
      nextCreatorIds: creatorId ? [creatorId] : [],
      manager,
      mutate: async () => {
        entered?.resolve();
        if (release) await release.promise;
        await manager.query(
          'UPDATE "messageThread" SET "creatorId"=$2 WHERE id=$1',
          [threadId, creatorId],
        );
      },
    }),
  );
};

describe('Myah Inbox contact triage lifecycle (PostgreSQL)', () => {
  let fixture: SourceFixture;

  beforeAll(async () => {
    await installInstagramMetadataBridge();
    const runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const triageSchema = new MyahInboxContactTriageSchemaService();
      await triageSchema.ensureWorkspaceTables(runner, workspaceId);
      await triageSchema.initializeNewWorkspaceInTransaction(
        runner,
        workspaceId,
      );
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  });

  beforeEach(async () => {
    fixture = await seedFixture();
  });

  afterEach(async () => {
    await cleanupFixture(fixture);
  });

  it('provisions actual new-workspace tables and a READY marker through WorkspaceManager post-synchronization', async () => {
    const provisionedWorkspaceId = '20202020-0000-4000-8000-000000000001';
    const provisionedSchema = 'workspace_1wgvd1ht5ajtgz36va8w3nc3l';
    const synchronized = jest.fn().mockResolvedValue(undefined);
    const executeInWorkspaceContext = jest.fn(
      async (callback: () => Promise<void>): Promise<void> => callback(),
    );

    try {
      const service = new WorkspaceManagerService(
        {
          createWorkspaceDBSchema: jest.fn(async () => {
            await global.testDataSource.query(
              'CREATE SCHEMA "workspace_1wgvd1ht5ajtgz36va8w3nc3l"',
            );
            await global.testDataSource.query(
              'CREATE TABLE "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."workspaceMember" (id uuid PRIMARY KEY)',
            );

            return provisionedSchema;
          }),
        } as never,
        {
          findOneOrFail: jest.fn().mockResolvedValue({ id: randomUUID() }),
        } as never,
        {
          createMemberRole: jest.fn().mockResolvedValue({ id: randomUUID() }),
        } as never,
        {
          assignRoleToManyUserWorkspace: jest.fn().mockResolvedValue(undefined),
        } as never,
        {
          synchronizeTwentyStandardApplicationOrThrow: synchronized,
        } as never,
        { update: jest.fn().mockResolvedValue(undefined) } as never,
        {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: randomUUID() })
            .mockResolvedValueOnce({ id: randomUUID() }),
        } as never,
        {
          createTwentyStandardApplication: jest
            .fn()
            .mockResolvedValue(undefined),
          findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
            .fn()
            .mockResolvedValue({
              workspaceCustomFlatApplication: { id: randomUUID() },
            }),
        } as never,
        {
          executeInWorkspaceContext,
          getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
            transaction: async (
              callback: (manager: WorkspaceEntityManager) => Promise<void>,
            ) =>
              global.testDataSource.transaction(async (manager) =>
                callback(
                  Object.assign(manager, {
                    internalContext: { workspaceId: provisionedWorkspaceId },
                  }) as WorkspaceEntityManager,
                ),
              ),
          }),
        } as never,
        new MyahInboxContactTriageSchemaService(),
      );

      await service.init({
        workspace: { id: provisionedWorkspaceId } as never,
        userId: randomUUID(),
      });

      await expect(
        global.testDataSource.query(
          `SELECT status, "baselineFenceSequence"::text AS "baselineFenceSequence",
                  "baselineStartedAt" IS NOT NULL AS "hasBaselineStartedAt"
             FROM "workspace_1wgvd1ht5ajtgz36va8w3nc3l"."myahInboxTriageMigration"`,
        ),
      ).resolves.toEqual([
        {
          status: 'READY',
          baselineFenceSequence: '0',
          hasBaselineStartedAt: true,
        },
      ]);
      await expect(
        global.testDataSource.query(
          `SELECT table_name
             FROM information_schema.tables
            WHERE table_schema=$1
              AND table_name = ANY($2::text[])
            ORDER BY table_name`,
          [
            provisionedSchema,
            [
              'myahInboxContactIdentity',
              'myahInboxContactTriage',
              'myahInboxTriageEmailChannelProvenance',
              'myahInboxTriageMigration',
              'myahInboxTriageTransitionReceipt',
            ],
          ],
        ),
      ).resolves.toEqual([
        { table_name: 'myahInboxContactIdentity' },
        { table_name: 'myahInboxContactTriage' },
        { table_name: 'myahInboxTriageEmailChannelProvenance' },
        { table_name: 'myahInboxTriageMigration' },
        { table_name: 'myahInboxTriageTransitionReceipt' },
      ]);
      expect(synchronized).toHaveBeenCalledWith({
        workspaceId: provisionedWorkspaceId,
        profile: 'myah',
      });
      expect(executeInWorkspaceContext).toHaveBeenCalledTimes(1);
    } finally {
      await global.testDataSource.query(
        'DROP SCHEMA IF EXISTS "workspace_1wgvd1ht5ajtgz36va8w3nc3l" CASCADE',
      );
    }
  });

  it('recovers an injected committed-receipt crash through the registered bounded cron and job transaction', async () => {
    const persistedMessageId = randomUUID();
    const triage = new MyahInboxContactTriageService();
    const statements: string[] = [];
    const workspaceDataSource = {
      manager: global.testDataSource.manager,
      query: async (
        statement: string,
        parameters?: unknown[],
        queryRunner?: {
          query: (sql: string, values?: unknown[]) => Promise<unknown>;
        },
      ) => {
        statements.push(statement);

        return queryRunner
          ? queryRunner.query(statement, parameters)
          : global.testDataSource.query(statement, parameters);
      },
      transaction: async (
        callback: (manager: WorkspaceEntityManager) => Promise<unknown>,
      ) =>
        global.testDataSource.transaction(async (manager) =>
          callback(
            Object.assign(manager, {
              internalContext: { workspaceId },
            }) as WorkspaceEntityManager,
          ),
        ),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
        callback(),
      getGlobalWorkspaceDataSource: async () => workspaceDataSource,
    };
    const receiptService = new MyahInboxContactTriageReceiptService(
      globalWorkspaceOrmManager as never,
      undefined,
      triage,
    );
    const recoveryJob = new MyahInboxTriageReceiptRecoveryJob(
      receiptService,
      globalWorkspaceOrmManager as never,
    );
    const enqueuedWorkspaceIds: string[] = [];
    const enqueueRecovery = jest
      .spyOn(receiptService, 'enqueueRecovery')
      .mockImplementation(async (recoveryWorkspaceId) => {
        enqueuedWorkspaceIds.push(recoveryWorkspaceId);
        await recoveryJob.handle({ workspaceId: recoveryWorkspaceId });
      });
    const cronJob = new MyahInboxTriageReceiptRecoveryCronJob(
      { find: jest.fn().mockResolvedValue([{ id: workspaceId }]) } as never,
      globalWorkspaceOrmManager as never,
      receiptService,
    );

    await withTransaction(async (manager) => {
      (
        manager as unknown as { internalContext: { workspaceId: string } }
      ).internalContext = { workspaceId };
      await receiptService.recordInTransaction(
        {
          channel: 'EMAIL',
          persistedMessageId,
          sourceRecordId: fixture.threadId,
          sourceGenerationId: 'integration:committed-then-crashed',
          mode: 'LIVE',
          direction: 'INBOUND',
          providerOccurredAt: '2099-09-15T14:00:00.000Z',
          originalCreatedAt: '2099-09-15T14:00:00.000Z',
          firstPersistence: true,
        },
        manager,
      );
    });

    const crash = jest
      .spyOn(triage, 'applyReceiptInTransaction')
      .mockRejectedValueOnce(new Error('injected worker crash'));
    await expect(recoveryJob.handle({ workspaceId })).rejects.toThrow(
      'injected worker crash',
    );
    crash.mockRestore();

    await expect(
      global.testDataSource.query(
        `SELECT status, "completedAt" IS NULL AS "notCompleted"
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt"
          WHERE "persistedMessageId"=$1`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([{ status: 'PENDING', notCompleted: true }]);
    await expect(
      global.testDataSource.query(
        `SELECT "contactIdentityKey"
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
          WHERE "contactIdentityKey"=$1`,
        [`email-thread:${fixture.threadId}`],
      ),
    ).resolves.toEqual([]);

    await cronJob.handle();

    expect(enqueuedWorkspaceIds).toEqual([workspaceId]);
    expect(
      statements.some(
        (statement) =>
          statement.includes('"myahInboxTriageTransitionReceipt"') &&
          statement.includes('LIMIT 100'),
      ),
    ).toBe(true);
    await expect(
      global.testDataSource.query(
        `SELECT status, "completedAt" IS NOT NULL AS "completed"
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt"
          WHERE "persistedMessageId"=$1`,
        [persistedMessageId],
      ),
    ).resolves.toEqual([{ status: 'COMPLETE', completed: true }]);
    await expect(
      global.testDataSource.query(
        `SELECT "inboxState"
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
          WHERE "contactIdentityKey"=$1`,
        [`email-thread:${fixture.threadId}`],
      ),
    ).resolves.toEqual([
      expect.objectContaining({ inboxState: 'NEEDS_REPLY' }),
    ]);
    enqueueRecovery.mockRestore();
    // This test deliberately records a synthetic message with no persisted
    // association. Remove that impossible production fixture so its fail-closed
    // empty provenance cannot affect later HTTP capability assertions.
    await global.testDataSource.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageEmailChannelProvenance"
       WHERE "persistedMessageId"=$1`,
      [persistedMessageId],
    );
    await global.testDataSource.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt"
       WHERE "persistedMessageId"=$1`,
      [persistedMessageId],
    );
  });

  it('serializes each Apple Jane capability repository to the canonical unrestricted SQL contract', async () => {
    const workspaceOrmManager = resolveProviderByName<WorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const originalGetRepository =
      workspaceOrmManager.getRepository.bind(workspaceOrmManager);
    const captured = new Map<string, { sql: string; parameters: unknown[] }>();
    const getRepositorySpy = jest
      .spyOn(workspaceOrmManager, 'getRepository')
      .mockImplementation(
        async (workspace, objectName, rolePermissionConfig) => {
          const repository = await originalGetRepository(
            workspace,
            objectName,
            rolePermissionConfig,
          );
          const source = capabilitySources.find(
            ([name]) => name === objectName,
          );
          if (!source) return repository;

          return new Proxy(repository as object, {
            get(target, property, receiver) {
              if (property !== 'createQueryBuilder') {
                return Reflect.get(target, property, receiver);
              }
              return (alias: string) => {
                const builder = Reflect.get(target, property, receiver).call(
                  target,
                  alias,
                );
                return new Proxy(builder, {
                  get(builderTarget, builderProperty, builderReceiver) {
                    if (builderProperty !== 'getQueryAndParameters') {
                      return Reflect.get(
                        builderTarget,
                        builderProperty,
                        builderReceiver,
                      );
                    }
                    return () => {
                      const serialized = Reflect.get(
                        builderTarget,
                        builderProperty,
                        builderReceiver,
                      ).call(builderTarget) as [string, unknown[]];
                      if (!captured.has(objectName)) {
                        captured.set(objectName, {
                          sql: serialized[0],
                          parameters: serialized[1],
                        });
                      }
                      return serialized;
                    };
                  },
                });
              };
            },
          }) as never;
        },
      );
    try {
      await makeGraphqlAPIRequest(
        { query: contactsQuery, variables: { first: 1, states: ['CLOSED'] } },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
    } finally {
      getRepositorySpy.mockRestore();
    }

    for (const [objectName, alias, tableName] of capabilitySources) {
      const serialized = captured.get(objectName);
      expect(serialized?.parameters).toEqual([]);
      expect(normalizeReadCapabilitySql(serialized?.sql ?? '', alias)).toBe(
        normalizeSql(
          `SELECT "${alias}"."id" AS "${alias}_id" FROM "${getWorkspaceSchemaName(workspaceId)}"."${tableName}" "${alias}"`,
        ),
      );
    }
  });

  it('serves selected states and owners over HTTP when all triage capability sources are unrestricted', async () => {
    await applyInboundReceipt({ fixture });

    const response = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: {
          first: 20,
          owner: 'UNASSIGNED',
          states: ['NEEDS_REPLY'],
        },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.myahInboxContacts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: expect.objectContaining({
            email: { threadIds: [fixture.threadId] },
            triage: expect.objectContaining({
              isAvailable: true,
              inboxOwnerId: null,
              inboxState: 'NEEDS_REPLY',
            }),
          }),
        }),
      ]),
    );
  });

  it('accepts an HTTP owner-only patch with explicit-null snooze without clearing a live snooze', async () => {
    await applyInboundReceipt({ fixture });
    const contactResponse = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, states: ['NEEDS_REPLY'] },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    const contact = contactResponse.body.data.myahInboxContacts.edges.find(
      ({ node }: { node: { email: { threadIds: string[] } } }) =>
        node.email.threadIds.includes(fixture.threadId),
    ).node;
    const identityKey = `email-thread:${fixture.threadId}`;
    await global.testDataSource.query(
      `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       SET "inboxState"='SNOOZED', "snoozedUntil"=CURRENT_TIMESTAMP + interval '1 hour',
           "hasStateDecision"=true, revision=revision+1
       WHERE "contactIdentityKey"=$1`,
      [identityKey],
    );
    const [current] = await global.testDataSource.query(
      `SELECT revision, "identityGeneration", "snoozedUntil"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey"=$1`,
      [identityKey],
    );

    const response = await makeGraphqlAPIRequest(
      {
        query: updateTriageMutation,
        variables: {
          input: {
            expectedWorkspaceId: workspaceId,
            contactId: contact.id,
            expectedRevision: Number(current.revision),
            expectedIdentityGeneration: String(current.identityGeneration),
            inboxOwnerId: null,
            snoozedUntil: null,
          },
        },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateMyahInboxContactTriage).toMatchObject({
      inboxState: 'SNOOZED',
      snoozedUntil: new Date(current.snoozedUntil).toISOString(),
    });
  });

  it('commits exactly one of two simultaneous HTTP mutations with identical CAS tokens', async () => {
    await applyInboundReceipt({ fixture });
    const contacts = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, states: ['NEEDS_REPLY'] },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    const contact = contacts.body.data.myahInboxContacts.edges.find(
      ({ node }: { node: { email: { threadIds: string[] } } }) =>
        node.email.threadIds.includes(fixture.threadId),
    ).node;
    const input = {
      expectedWorkspaceId: workspaceId,
      contactId: contact.id,
      expectedRevision: contact.triage.revision,
      expectedIdentityGeneration: contact.triage.identityGeneration,
      inboxState: 'CLOSED',
    };

    const responses = await Promise.all([
      makeGraphqlAPIRequest(
        { query: updateTriageMutation, variables: { input } },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      ),
      makeGraphqlAPIRequest(
        { query: updateTriageMutation, variables: { input } },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      ),
    ]);
    const successes = responses.filter(
      (response) => response.body.errors === undefined,
    );
    const conflicts = responses.filter(
      (response) =>
        response.body.errors?.[0]?.extensions?.subCode ===
        'MYAH_INBOX_TRIAGE_CONFLICT',
    );

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(successes[0].body.data.updateMyahInboxContactTriage).toMatchObject({
      inboxState: 'CLOSED',
      revision: input.expectedRevision + 1,
      identityGeneration: input.expectedIdentityGeneration,
    });
    expect(conflicts[0].body.errors[0].extensions.triage).toMatchObject({
      inboxOwnerId: null,
      inboxState: 'CLOSED',
      revision: input.expectedRevision + 1,
      identityGeneration: input.expectedIdentityGeneration,
    });
    const [persisted] = await global.testDataSource.query(
      `SELECT "inboxState", revision, "identityGeneration"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey"=$1`,
      [`email-thread:${fixture.threadId}`],
    );
    expect(persisted).toMatchObject({
      inboxState: 'CLOSED',
      revision: input.expectedRevision + 1,
      identityGeneration: input.expectedIdentityGeneration,
    });
  });

  it('lets an Email producer finish its association after taking the source lock before an HTTP mutation', async () => {
    await applyInboundReceipt({ fixture });
    const contacts = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, states: ['NEEDS_REPLY'] },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    const contact = contacts.body.data.myahInboxContacts.edges.find(
      ({ node }: { node: { email: { threadIds: string[] } } }) =>
        node.email.threadIds.includes(fixture.threadId),
    ).node;
    const [spareChannel] = await global.testDataSource.query(
      `SELECT channel.id
       FROM core."messageChannel" channel
       WHERE channel."workspaceId"=$1
         AND channel.type::text = ANY($2::text[])
         AND NOT EXISTS (
           SELECT 1
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
           WHERE association."messageChannelId"=channel.id
             AND association."deletedAt" IS NULL
         )
       ORDER BY channel.id
       LIMIT 1`,
      [workspaceId, ['EMAIL', 'EMAIL_GROUP']],
    );
    expect(spareChannel).toBeDefined();
    const producerEntered = deferred();
    const releaseProducer = deferred();
    const producer = persistFixtureAssociationAfterSourceLock({
      fixture,
      messageChannelId: spareChannel.id,
      entered: producerEntered,
      release: releaseProducer,
    });
    await producerEntered.promise;
    const input = {
      expectedWorkspaceId: workspaceId,
      contactId: contact.id,
      expectedRevision: contact.triage.revision,
      expectedIdentityGeneration: contact.triage.identityGeneration,
      inboxState: 'CLOSED',
    };
    const request = makeGraphqlAPIRequest(
      { query: updateTriageMutation, variables: { input } },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );

    try {
      expect(
        await Promise.race([
          waitForBlockedDatabaseQuery('pg_advisory_xact_lock').then(
            () => 'blocked',
          ),
          request.then(() => 'request'),
        ]),
      ).toBe('blocked');
      releaseProducer.resolve();
      const [, response] = await Promise.all([producer, request]);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateMyahInboxContactTriage).toMatchObject({
        inboxState: 'CLOSED',
        revision: input.expectedRevision + 1,
      });
    } finally {
      releaseProducer.resolve();
      await Promise.allSettled([producer, request]);
    }
  });

  it.each([
    ['mutation-first', 'mutation'],
    ['producer-first', 'producer'],
  ] as const)(
    'rejects a stale Email source without deadlocking a disjoint actual Email producer (%s)',
    async (_name, first) => {
      await applyInboundReceipt({ fixture });
      const sourceContacts = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      const staleContact = sourceContacts.body.data.myahInboxContacts.edges.find(
        ({ node }: { node: { email: { threadIds: string[] } } }) =>
          node.email.threadIds.includes(fixture.threadId),
      ).node;
      const disjoint = await seedFixture();
      await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
      await mutateThreadCreator({
        fixture: disjoint,
        creatorId: fixture.creatorA,
      });
      const [before] = (await global.testDataSource.query(
        `SELECT "inboxState", revision, "identityGeneration"
         FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         WHERE "contactIdentityKey"=$1`,
        [`creator:${fixture.creatorA}`],
      )) as Array<{
        inboxState: string;
        revision: number;
        identityGeneration: string;
      }>;
      expect(before).toBeDefined();

      const blocker = global.testDataSource.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query("SELECT set_config('search_path', $1, true)", [
        schema,
      ]);
      if (first === 'mutation') {
        await blocker.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
          buildMyahInboxSourceKey('EMAIL_THREAD', fixture.threadId),
        ]);
      } else {
        await blocker.query(
          'SELECT id FROM "messageThread" WHERE id=$1 FOR UPDATE',
          [disjoint.threadId],
        );
      }
      const input = {
        expectedWorkspaceId: workspaceId,
        contactId: staleContact.id,
        expectedRevision: staleContact.triage.revision,
        expectedIdentityGeneration: staleContact.triage.identityGeneration,
        inboxState: 'CLOSED',
      };
      let requestFinished = false;
      const request = makeGraphqlAPIRequest(
        { query: updateTriageMutation, variables: { input } },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      ).then((response) => {
        requestFinished = true;

        return response;
      });
      let producer: Promise<void> | undefined;

      try {
        if (first === 'mutation') {
          // The mutation is issued while its exact source advisory lock is held.
          // The disjoint producer must still finish before that lock is released.
          producer = persistExistingEmailThroughSaveEnqueueProducer(disjoint);
          await producer;
          expect(requestFinished).toBe(false);
          await blocker.commitTransaction();
        } else {
          producer = persistExistingEmailThroughSaveEnqueueProducer(disjoint);
          await waitForBlockedDatabaseQuery(
            'SELECT id FROM "messageThread" WHERE id = ANY',
          );
          const staleResponse = await request;
          expect(staleResponse.body.data).toBeNull();
          expect(staleResponse.body.errors?.[0]).toMatchObject({
            message: 'Inbox contact source is not readable',
          });
          await blocker.commitTransaction();
        }

        const response = await request;
        expect(response.body.data).toBeNull();
        expect(response.body.errors?.[0]).toMatchObject({
          message: 'Inbox contact source is not readable',
        });
        await producer;
        const [after] = (await global.testDataSource.query(
          `SELECT "inboxState", revision, "identityGeneration"
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
           WHERE "contactIdentityKey"=$1`,
          [`creator:${fixture.creatorA}`],
        )) as Array<{
          inboxState: string;
          revision: number;
          identityGeneration: string;
        }>;
        expect(after).toEqual(before);
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
        await Promise.allSettled([request, ...(producer ? [producer] : [])]);
        await cleanupFixture(disjoint);
      }
    },
  );

  it('holds the source before the permission fence when an HTTP mutation starts before an Email producer', async () => {
    await applyInboundReceipt({ fixture });
    const contacts = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, states: ['NEEDS_REPLY'] },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    const contact = contacts.body.data.myahInboxContacts.edges.find(
      ({ node }: { node: { email: { threadIds: string[] } } }) =>
        node.email.threadIds.includes(fixture.threadId),
    ).node;
    const [spareChannel] = await global.testDataSource.query(
      `SELECT channel.id
       FROM core."messageChannel" channel
       WHERE channel."workspaceId"=$1
         AND channel.type::text = ANY($2::text[])
         AND NOT EXISTS (
           SELECT 1
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
           WHERE association."messageChannelId"=channel.id
             AND association."deletedAt" IS NULL
         )
       ORDER BY channel.id
       LIMIT 1`,
      [workspaceId, ['EMAIL', 'EMAIL_GROUP']],
    );
    expect(spareChannel).toBeDefined();
    const permissionFenceBlocker = global.testDataSource.createQueryRunner();
    await permissionFenceBlocker.connect();
    await permissionFenceBlocker.startTransaction();
    await permissionFenceBlocker.query(
      `LOCK TABLE "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
       IN ROW EXCLUSIVE MODE`,
    );
    const input = {
      expectedWorkspaceId: workspaceId,
      contactId: contact.id,
      expectedRevision: contact.triage.revision,
      expectedIdentityGeneration: contact.triage.identityGeneration,
      inboxState: 'CLOSED',
    };
    const request = makeGraphqlAPIRequest(
      { query: updateTriageMutation, variables: { input } },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    let producer: Promise<void> | undefined;

    try {
      expect(
        await Promise.race([
          waitForBlockedDatabaseQuery(
            'LOCK TABLE "messageChannelMessageAssociation"',
          ).then(() => 'blocked'),
          request.then(() => 'request'),
        ]),
      ).toBe('blocked');
      producer = persistFixtureAssociationAfterSourceLock({
        fixture,
        messageChannelId: spareChannel.id,
      });
      expect(
        await Promise.race([
          waitForBlockedDatabaseQuery('pg_advisory_xact_lock').then(
            () => 'blocked',
          ),
          producer.then(() => 'producer'),
        ]),
      ).toBe('blocked');
      await permissionFenceBlocker.commitTransaction();
      const [response] = await Promise.all([request, producer]);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateMyahInboxContactTriage).toMatchObject({
        inboxState: 'CLOSED',
        revision: input.expectedRevision + 1,
      });
    } finally {
      if (permissionFenceBlocker.isTransactionActive) {
        await permissionFenceBlocker.rollbackTransaction();
      }
      await permissionFenceBlocker.release();
      await Promise.allSettled([request, ...(producer ? [producer] : [])]);
    }
  });

  it('fails a mutation when Email visibility changes after its precheck but before commit', async () => {
    await applyInboundReceipt({ fixture });
    const contacts = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, states: ['NEEDS_REPLY'] },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    const contact = contacts.body.data.myahInboxContacts.edges.find(
      ({ node }: { node: { email: { threadIds: string[] } } }) =>
        node.email.threadIds.includes(fixture.threadId),
    ).node;
    const [channel] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       INNER JOIN core."messageChannel" channel ON channel.id=association."messageChannelId"
       WHERE association.id=$1`,
      [fixture.associationId],
    );
    const [otherAccount] = await global.testDataSource.query(
      `SELECT id FROM core."connectedAccount"
       WHERE "workspaceId"=$1 AND "userWorkspaceId"=$2
       ORDER BY id LIMIT 1`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.TIM],
    );
    const visibilityWriter = global.testDataSource.createQueryRunner();
    await visibilityWriter.connect();
    await visibilityWriter.startTransaction();
    await visibilityWriter.query(
      'LOCK TABLE core."messageChannel" IN ROW EXCLUSIVE MODE',
    );
    const input = {
      expectedWorkspaceId: workspaceId,
      contactId: contact.id,
      expectedRevision: contact.triage.revision,
      expectedIdentityGeneration: contact.triage.identityGeneration,
      inboxState: 'CLOSED',
    };
    const request = makeGraphqlAPIRequest(
      { query: updateTriageMutation, variables: { input } },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );

    try {
      expect(
        await Promise.race([
          waitForBlockedDatabaseQuery(
            'LOCK TABLE core."messageChannel", core."connectedAccount"',
          ).then(() => 'blocked'),
          request.then(() => 'request'),
        ]),
      ).toBe('blocked');
      await visibilityWriter.query(
        `UPDATE core."messageChannel"
         SET visibility='METADATA', "connectedAccountId"=$2
         WHERE id=$1`,
        [channel.id, otherAccount.id],
      );
      await visibilityWriter.commitTransaction();
      const response = await request;

      expect(response.body.data).toBeNull();
      expect(response.body.errors?.[0]).toMatchObject({
        message: 'Triage is unavailable with your current Inbox access',
        extensions: { code: 'FORBIDDEN' },
      });
      const [persisted] = await global.testDataSource.query(
        `SELECT "inboxState", revision
         FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         WHERE "contactIdentityKey"=$1`,
        [`email-thread:${fixture.threadId}`],
      );
      expect(persisted).toMatchObject({
        inboxState: 'NEEDS_REPLY',
        revision: input.expectedRevision,
      });
    } finally {
      if (visibilityWriter.isTransactionActive) {
        await visibilityWriter.rollbackTransaction();
      }
      await visibilityWriter.release();
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility=$2, "connectedAccountId"=$3
         WHERE id=$1`,
        [channel.id, channel.visibility, channel.connectedAccountId],
      );
      await Promise.allSettled([request]);
    }
  });

  it('returns due snoozes as effective NEEDS_REPLY tuples with the HTTP total count', async () => {
    await applyInboundReceipt({ fixture });
    const identityKey = `email-thread:${fixture.threadId}`;
    await global.testDataSource.query(
      `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       SET "inboxState"='SNOOZED', "snoozedUntil"=CURRENT_TIMESTAMP - interval '1 minute',
           "hasStateDecision"=true, revision=revision+1
       WHERE "contactIdentityKey"=$1`,
      [identityKey],
    );

    const response = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, snoozeStatus: 'DUE' },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.myahInboxContacts.totalCount).toBe(1);
    expect(response.body.data.myahInboxContacts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: expect.objectContaining({
            email: { threadIds: [fixture.threadId] },
            triage: expect.objectContaining({
              inboxState: 'NEEDS_REPLY',
              snoozedUntil: null,
            }),
          }),
        }),
      ]),
    );
  });

  it('fails closed over HTTP when unrestricted object reads include another user’s private Email mailbox', async () => {
    const [association] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       INNER JOIN core."messageChannel" channel ON channel.id = association."messageChannelId"
       WHERE association.id = $1`,
      [fixture.associationId],
    );
    const [otherAccount] = await global.testDataSource.query(
      `SELECT id FROM core."connectedAccount"
       WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2
       ORDER BY id LIMIT 1`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.TIM],
    );
    expect(otherAccount).toBeDefined();

    try {
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility = 'METADATA', "connectedAccountId" = $2
         WHERE id = $1`,
        [association.id, otherAccount.id],
      );
      const response = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
      expect(response.body.errors).toEqual([
        expect.objectContaining({
          message: 'Triage is unavailable with your current Inbox access',
          extensions: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      ]);
    } finally {
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility = $2, "connectedAccountId" = $3
         WHERE id = $1`,
        [
          association.id,
          association.visibility,
          association.connectedAccountId,
        ],
      );
    }
  });

  it('rechecks Email visibility in the list snapshot after the capability precheck', async () => {
    await applyInboundReceipt({ fixture });
    const [channel] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       INNER JOIN core."messageChannel" channel ON channel.id = association."messageChannelId"
       WHERE association.id = $1`,
      [fixture.associationId],
    );
    const [otherAccount] = await global.testDataSource.query(
      `SELECT id FROM core."connectedAccount"
       WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2
       ORDER BY id LIMIT 1`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.TIM],
    );
    const blocker = global.testDataSource.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();

    try {
      await blocker.query(
        `LOCK TABLE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         IN ACCESS EXCLUSIVE MODE`,
      );
      const request = makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(
        await Promise.race([
          waitForBlockedDatabaseQuery('WITH request_scope AS').then(
            () => 'blocked',
          ),
          request.then(() => 'request'),
        ]),
      ).toBe('blocked');
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility='METADATA', "connectedAccountId"=$2
         WHERE id=$1`,
        [channel.id, otherAccount.id],
      );
      await blocker.commitTransaction();
      const response = await request;

      expect(response.body.data).toBeNull();
      expect(response.body.errors?.[0]).toMatchObject({
        message: 'Triage is unavailable with your current Inbox access',
        extensions: { code: 'FORBIDDEN' },
      });
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility=$2, "connectedAccountId"=$3
         WHERE id=$1`,
        [channel.id, channel.visibility, channel.connectedAccountId],
      );
    }
  });

  it('uses maximum per-message access when a private mailbox imports before a shared mailbox', async () => {
    await applyInboundReceipt({ fixture });
    const [privateChannel] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       INNER JOIN core."messageChannel" channel ON channel.id = association."messageChannelId"
       WHERE association.id = $1`,
      [fixture.associationId],
    );
    const [sharedChannel] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM core."messageChannel" channel
       WHERE channel."workspaceId" = $1
         AND channel.type::text = ANY($2::text[])
         AND channel.id <> $3
         AND NOT EXISTS (
           SELECT 1
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
           WHERE association."messageChannelId" = channel.id
             AND association."deletedAt" IS NULL
         )
       ORDER BY channel.id
       LIMIT 1`,
      [workspaceId, ['EMAIL', 'EMAIL_GROUP'], privateChannel.id],
    );
    const [otherAccount] = await global.testDataSource.query(
      `SELECT id FROM core."connectedAccount"
       WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2
       ORDER BY id LIMIT 1`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.TIM],
    );
    expect(sharedChannel).toBeDefined();
    expect(otherAccount).toBeDefined();

    try {
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility='METADATA', "connectedAccountId"=$2
         WHERE id=$1`,
        [privateChannel.id, otherAccount.id],
      );
      await recordFixtureEmailEvidence({ fixture, firstPersistence: false });
      const privateOnly = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(privateOnly.body.errors?.[0]).toMatchObject({
        message: 'Triage is unavailable with your current Inbox access',
        extensions: { code: 'FORBIDDEN' },
      });

      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility='SHARE_EVERYTHING'
         WHERE id=$1`,
        [sharedChannel.id],
      );
      await addFixtureEmailAssociation({
        fixture,
        messageChannelId: sharedChannel.id,
      });
      await recordFixtureEmailEvidence({ fixture, firstPersistence: false });

      const sharedToo = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(sharedToo.body.errors).toBeUndefined();
      expect(sharedToo.body.data.myahInboxContacts.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            node: expect.objectContaining({
              email: { threadIds: [fixture.threadId] },
            }),
          }),
        ]),
      );
    } finally {
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility=$2, "connectedAccountId"=$3
         WHERE id=$1`,
        [
          privateChannel.id,
          privateChannel.visibility,
          privateChannel.connectedAccountId,
        ],
      );
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility=$2, "connectedAccountId"=$3
         WHERE id=$1`,
        [
          sharedChannel.id,
          sharedChannel.visibility,
          sharedChannel.connectedAccountId,
        ],
      );
    }
  });

  it('retains shared provenance when a private mailbox imports second and live rows are cleaned up', async () => {
    await applyInboundReceipt({ fixture });
    const [sharedChannel] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
       INNER JOIN core."messageChannel" channel ON channel.id = association."messageChannelId"
       WHERE association.id = $1`,
      [fixture.associationId],
    );
    const [privateChannel] = await global.testDataSource.query(
      `SELECT channel.id, channel.visibility, channel."connectedAccountId"
       FROM core."messageChannel" channel
       WHERE channel."workspaceId" = $1
         AND channel.type::text = ANY($2::text[])
         AND channel.id <> $3
         AND NOT EXISTS (
           SELECT 1
           FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation" association
           WHERE association."messageChannelId" = channel.id
             AND association."deletedAt" IS NULL
         )
       ORDER BY channel.id
       LIMIT 1`,
      [workspaceId, ['EMAIL', 'EMAIL_GROUP'], sharedChannel.id],
    );
    const [otherAccount] = await global.testDataSource.query(
      `SELECT id FROM core."connectedAccount"
       WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2
       ORDER BY id LIMIT 1`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.TIM],
    );
    expect(privateChannel).toBeDefined();
    expect(otherAccount).toBeDefined();

    try {
      await global.testDataSource.query(
        `UPDATE core."messageChannel" SET visibility='SHARE_EVERYTHING' WHERE id=$1`,
        [sharedChannel.id],
      );
      await recordFixtureEmailEvidence({ fixture, firstPersistence: false });
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility='METADATA', "connectedAccountId"=$2
         WHERE id=$1`,
        [privateChannel.id, otherAccount.id],
      );
      await addFixtureEmailAssociation({
        fixture,
        messageChannelId: privateChannel.id,
      });
      await recordFixtureEmailEvidence({ fixture, firstPersistence: false });

      const bothLive = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(bothLive.body.errors).toBeUndefined();

      await global.testDataSource.query(
        `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
         WHERE "messageId"=$1`,
        [fixture.messageId],
      );
      await global.testDataSource.query(
        `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".message WHERE id=$1`,
        [fixture.messageId],
      );
      const retainedShared = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(retainedShared.body.errors).toBeUndefined();

      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility='METADATA', "connectedAccountId"=$2
         WHERE id=$1`,
        [sharedChannel.id, otherAccount.id],
      );
      const allPrivate = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: { first: 20, states: ['NEEDS_REPLY'] },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(allPrivate.body.errors?.[0]).toMatchObject({
        message: 'Triage is unavailable with your current Inbox access',
        extensions: { code: 'FORBIDDEN' },
      });
    } finally {
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility=$2, "connectedAccountId"=$3
         WHERE id=$1`,
        [
          sharedChannel.id,
          sharedChannel.visibility,
          sharedChannel.connectedAccountId,
        ],
      );
      await global.testDataSource.query(
        `UPDATE core."messageChannel"
         SET visibility=$2, "connectedAccountId"=$3
         WHERE id=$1`,
        [
          privateChannel.id,
          privateChannel.visibility,
          privateChannel.connectedAccountId,
        ],
      );
    }
  });

  it('returns the exact GraphQL conflict tuple for a stale triage update', async () => {
    await applyInboundReceipt({ fixture });
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
    const contacts = await makeGraphqlAPIRequest(
      {
        query: contactsQuery,
        variables: { first: 20, states: ['NEEDS_REPLY'] },
      },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    expect(contacts.body.errors).toBeUndefined();
    const contact = contacts.body.data.myahInboxContacts.edges.find(
      ({ node }: { node: { email: { threadIds: string[] } } }) =>
        node.email.threadIds.includes(fixture.threadId),
    ).node;
    expect(contact.identityKind).toBe('CREATOR');
    const [currentTriage] = await global.testDataSource.query(
      `SELECT revision, "identityGeneration"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey" = $1`,
      [`creator:${fixture.creatorA}`],
    );
    const input = {
      expectedWorkspaceId: workspaceId,
      contactId: contact.id,
      expectedRevision: Number(currentTriage.revision),
      expectedIdentityGeneration: String(currentTriage.identityGeneration),
      inboxState: 'CLOSED',
    };
    await global.testDataSource.query(
      `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       SET "inboxState" = 'CLOSED', revision = revision + 1
       WHERE "contactIdentityKey" = $1`,
      [`creator:${fixture.creatorA}`],
    );

    const stale = await makeGraphqlAPIRequest(
      { query: updateTriageMutation, variables: { input } },
      APPLE_JANE_ADMIN_ACCESS_TOKEN,
    );
    expect(stale.status).toBe(200);
    expect(stale.body.data).toBeNull();
    expect(stale.body.errors).toEqual([
      expect.objectContaining({
        message: 'This contact changed.',
        extensions: expect.objectContaining({
          code: 'CONFLICT',
          subCode: 'MYAH_INBOX_TRIAGE_CONFLICT',
          triage: expect.objectContaining({
            inboxOwnerId: null,
            inboxState: 'CLOSED',
            snoozedUntil: null,
            revision: input.expectedRevision + 1,
            identityGeneration: input.expectedIdentityGeneration,
          }),
        }),
      }),
    ]);
  });

  it('sanitizes a soft-deleted canonical owner in HTTP reads and stale conflicts', async () => {
    await applyInboundReceipt({ fixture });
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
    const [owner] = await global.testDataSource.query(
      `SELECT id, "deletedAt" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."workspaceMember"
       WHERE id <> $1 AND "deletedAt" IS NULL
       ORDER BY id LIMIT 1`,
      [USER_WORKSPACE_DATA_SEED_IDS.JANE],
    );
    expect(owner).toBeDefined();

    try {
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         SET "inboxOwnerId" = $2
         WHERE "contactIdentityKey" = $1`,
        [`creator:${fixture.creatorA}`, owner.id],
      );
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."workspaceMember"
         SET "deletedAt" = now() WHERE id = $1`,
        [owner.id],
      );
      const contacts = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: {
            first: 20,
            owner: 'UNASSIGNED',
            states: ['NEEDS_REPLY'],
          },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      const contact = contacts.body.data.myahInboxContacts.edges.find(
        ({ node }: { node: { email: { threadIds: string[] } } }) =>
          node.email.threadIds.includes(fixture.threadId),
      ).node;
      expect(contact.triage.inboxOwnerId).toBeNull();
      const [current] = await global.testDataSource.query(
        `SELECT revision, "identityGeneration"
         FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         WHERE "contactIdentityKey" = $1`,
        [`creator:${fixture.creatorA}`],
      );
      expect(Number(current.revision)).toBe(contact.triage.revision);
      const input = {
        expectedWorkspaceId: workspaceId,
        contactId: contact.id,
        expectedRevision: Number(current.revision),
        expectedIdentityGeneration: String(current.identityGeneration),
        inboxState: 'CLOSED',
      };
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         SET revision = revision + 1
         WHERE "contactIdentityKey" = $1`,
        [`creator:${fixture.creatorA}`],
      );
      const stale = await makeGraphqlAPIRequest(
        { query: updateTriageMutation, variables: { input } },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(stale.body.errors?.[0]?.extensions).toMatchObject({
        code: 'CONFLICT',
        subCode: 'MYAH_INBOX_TRIAGE_CONFLICT',
        triage: { inboxOwnerId: null },
      });
    } finally {
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."workspaceMember"
         SET "deletedAt" = $2 WHERE id = $1`,
        [owner.id, owner.deletedAt],
      );
    }
  });

  it('returns the generic unavailable denial before selected-filter validation when a source read is restricted', async () => {
    const roleId = randomUUID();
    const [roleTarget] = await global.testDataSource.query(
      `SELECT id, "roleId" FROM core."roleTarget"
       WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2`,
      [workspaceId, USER_WORKSPACE_DATA_SEED_IDS.JANE],
    );
    const [originalRole] = await global.testDataSource.query(
      `SELECT "applicationId" FROM core.role WHERE id = $1`,
      [roleTarget.roleId],
    );
    const capabilityObjects = await global.testDataSource.query(
      `SELECT id, "applicationId", "nameSingular" FROM core."objectMetadata"
       WHERE "workspaceId" = $1
         AND "nameSingular" = ANY($2::text[])`,
      [
        workspaceId,
        ['messageThread', 'myahSocialConversation', 'myahSocialMessage'],
      ],
    );
    const cacheService = resolveProviderByName<WorkspaceCacheService>(
      'WorkspaceCacheService',
    );

    try {
      await global.testDataSource.query(
        `INSERT INTO core.role (
          id, "workspaceId", "universalIdentifier", "applicationId", label,
          "canReadAllObjectRecords", "canUpdateAllObjectRecords",
          "canSoftDeleteAllObjectRecords", "canDestroyAllObjectRecords"
        ) VALUES ($1, $2, $3, $4, $5, false, false, false, false)`,
        [
          roleId,
          workspaceId,
          randomUUID(),
          originalRole.applicationId,
          `MYAH-354 restricted source ${roleId}`,
        ],
      );
      for (const object of capabilityObjects.filter(
        ({ nameSingular }: { nameSingular: string }) =>
          nameSingular !== 'myahSocialMessage',
      )) {
        await global.testDataSource.query(
          `INSERT INTO core."objectPermission" (
            id, "workspaceId", "universalIdentifier", "applicationId", "roleId",
            "objectMetadataId", "canReadObjectRecords", "canUpdateObjectRecords",
            "canSoftDeleteObjectRecords", "canDestroyObjectRecords"
          ) VALUES ($1, $2, $3, $4, $5, $6, true, false, false, false)`,
          [
            randomUUID(),
            workspaceId,
            randomUUID(),
            object.applicationId,
            roleId,
            object.id,
          ],
        );
      }
      await global.testDataSource.query(
        `UPDATE core."roleTarget" SET "roleId" = $1 WHERE id = $2`,
        [roleId, roleTarget.id],
      );
      await cacheService.invalidateAndRecompute(
        workspaceId,
        permissionCacheKeys,
      );

      const response = await makeGraphqlAPIRequest(
        {
          query: contactsQuery,
          variables: {
            first: 1,
            owner: 'not-a-uuid-that-must-not-be-validated-first',
            states: ['CLOSED'],
          },
        },
        APPLE_JANE_ADMIN_ACCESS_TOKEN,
      );
      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
      expect(response.body.errors).toEqual([
        expect.objectContaining({
          message: 'Triage is unavailable with your current Inbox access',
          extensions: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      ]);
    } finally {
      await global.testDataSource.query(
        `UPDATE core."roleTarget" SET "roleId" = $1 WHERE id = $2`,
        [roleTarget.roleId, roleTarget.id],
      );
      await global.testDataSource.query(`DELETE FROM core.role WHERE id = $1`, [
        roleId,
      ]);
      await cacheService.invalidateAndRecompute(
        workspaceId,
        permissionCacheKeys,
      );
    }
  });

  it.each([
    [
      'link then unlink',
      (fixture: SourceFixture) => fixture.creatorA,
      null,
      true,
      (fixture: SourceFixture) => fixture.creatorA,
    ],
    [
      'unlink then link',
      null,
      (fixture: SourceFixture) => fixture.creatorA,
      false,
      (fixture: SourceFixture) => fixture.creatorA,
    ],
  ] as const)(
    'serializes direct %s with the source advisory lock rather than deadlocking',
    async (
      _name,
      firstCreator,
      secondCreator,
      expectsDriftConflict,
      expectedCreator,
    ) => {
      const entered = deferred();
      const release = deferred();
      const resolveCreator = (
        value: string | null | ((fixture: SourceFixture) => string),
      ) => (typeof value === 'function' ? value(fixture) : value);
      const first = mutateThreadCreator({
        fixture,
        creatorId: resolveCreator(firstCreator),
        entered,
        release,
      });
      await entered.promise;
      let secondFinished = false;
      const second = mutateThreadCreator({
        fixture,
        creatorId: resolveCreator(secondCreator),
      }).then(
        () => {
          secondFinished = true;

          return { error: null };
        },
        (error: unknown) => {
          secondFinished = true;

          return { error };
        },
      );

      await Promise.resolve();
      expect(secondFinished).toBe(false);
      release.resolve();
      const [, secondOutcome] = await Promise.all([first, second]);
      if (expectsDriftConflict) {
        expect(secondOutcome.error).toBeInstanceOf(ConflictException);
      } else {
        expect(secondOutcome.error).toBeNull();
      }

      const [source] = (await global.testDataSource.query(
        `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
        [fixture.threadId],
      )) as Array<{ creatorId: string | null }>;
      expect(source.creatorId).toBe(resolveCreator(expectedCreator));
    },
  );

  it('serializes an actual Email producer after a lifecycle source mutation', async () => {
    const mutationEntered = deferred();
    const releaseMutation = deferred();
    const mutation = mutateThreadCreator({
      fixture,
      creatorId: fixture.creatorA,
      entered: mutationEntered,
      release: releaseMutation,
    });
    await mutationEntered.promise;
    const producer = persistExistingEmailThroughProducer(fixture);

    try {
      await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
      releaseMutation.resolve();
      await Promise.all([mutation, producer]);
    } finally {
      releaseMutation.resolve();
      await Promise.allSettled([mutation, producer]);
    }
  });

  it('retains the source while an actual Email producer wins before a lifecycle mutation', async () => {
    const blocker = global.testDataSource.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query("SELECT set_config('search_path', $1, true)", [schema]);
    await blocker.query(
      'SELECT id FROM "messageThread" WHERE id=$1 FOR UPDATE',
      [fixture.threadId],
    );
    const producer = persistExistingEmailThroughProducer(fixture);
    let mutation: Promise<void> | undefined;

    try {
      await waitForBlockedDatabaseQuery(
        'SELECT id FROM "messageThread" WHERE id = ANY',
      );
      mutation = mutateThreadCreator({
        fixture,
        creatorId: fixture.creatorA,
      });
      await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
      await blocker.commitTransaction();
      await Promise.all([producer, mutation]);
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await Promise.allSettled([producer, ...(mutation ? [mutation] : [])]);
    }

    const [source] = (await global.testDataSource.query(
      `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
      [fixture.threadId],
    )) as Array<{ creatorId: string | null }>;
    expect(source.creatorId).toBe(fixture.creatorA);
  });

  it('serializes an actual Instagram producer after a lifecycle source mutation', async () => {
    const instagram = await seedInstagramProducerFixture();
    const mutationEntered = deferred();
    const releaseMutation = deferred();
    const mutation = mutateInstagramCreator({
      fixture: instagram,
      creatorId: fixture.creatorA,
      entered: mutationEntered,
      release: releaseMutation,
    });
    await mutationEntered.promise;
    const producer = projectInstagramMessage(instagram);

    try {
      await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
      releaseMutation.resolve();
      await Promise.all([mutation, producer]);
      const [messageCount] = await global.testDataSource.query(
        `SELECT count(*)::int AS count
         FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialMessage"
         WHERE "conversationId"=$1`,
        [instagram.conversationId],
      );
      expect(messageCount.count).toBe(1);
    } finally {
      releaseMutation.resolve();
      await Promise.allSettled([mutation, producer]);
      await cleanupInstagramProducerFixture(instagram);
    }
  });

  it('retains the source while an actual Instagram producer wins before a lifecycle mutation', async () => {
    const instagram = await seedInstagramProducerFixture();
    const blocker = global.testDataSource.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query("SELECT set_config('search_path', $1, true)", [schema]);
    await blocker.query(
      'SELECT id FROM "_myahSocialConversation" WHERE id=$1 FOR UPDATE',
      [instagram.conversationId],
    );
    const producer = projectInstagramMessage(instagram);
    let mutation: Promise<void> | undefined;

    try {
      await waitForBlockedDatabaseQuery('_myahSocialConversation');
      mutation = mutateInstagramCreator({
        fixture: instagram,
        creatorId: fixture.creatorA,
      });
      await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
      await blocker.commitTransaction();
      await Promise.all([producer, mutation]);

      const [source] = (await global.testDataSource.query(
        `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahSocialConversation" WHERE id=$1`,
        [instagram.conversationId],
      )) as Array<{ creatorId: string | null }>;
      expect(source.creatorId).toBe(fixture.creatorA);
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await Promise.allSettled([producer, ...(mutation ? [mutation] : [])]);
      await cleanupInstagramProducerFixture(instagram);
    }
  });

  it.each(['delete', 'merge'] as const)(
    'prevents a late Creator %s from missing a newly attached source',
    async (mode) => {
      const attachmentEntered = deferred();
      const releaseAttachment = deferred();
      const attachment = mutateThreadCreator({
        fixture,
        creatorId: fixture.creatorA,
        entered: attachmentEntered,
        release: releaseAttachment,
      });
      await attachmentEntered.promise;
      const retirement = retireCreatorWithLifecycle({ fixture, mode });

      try {
        await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
        releaseAttachment.resolve();
        await Promise.all([attachment, retirement]);
      } finally {
        releaseAttachment.resolve();
        await Promise.allSettled([attachment, retirement]);
      }

      const [source] = (await global.testDataSource.query(
        `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
        [fixture.threadId],
      )) as Array<{ creatorId: string | null }>;
      expect(source.creatorId).toBe(mode === 'merge' ? fixture.creatorB : null);
    },
  );

  it.each(['delete', 'merge'] as const)(
    'rejects a late source attachment after Creator %s wins the anchor',
    async (mode) => {
      const retirementEntered = deferred();
      const releaseRetirement = deferred();
      const retirement = retireCreatorWithLifecycle({
        fixture,
        mode,
        entered: retirementEntered,
        release: releaseRetirement,
      });
      await retirementEntered.promise;
      const attachment = mutateThreadCreator({
        fixture,
        creatorId: fixture.creatorA,
      });

      try {
        await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
        releaseRetirement.resolve();
        await retirement;
        await expect(attachment).rejects.toThrow();
      } finally {
        releaseRetirement.resolve();
        await Promise.allSettled([retirement, attachment]);
      }

      const [source] = (await global.testDataSource.query(
        `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
        [fixture.threadId],
      )) as Array<{ creatorId: string | null }>;
      expect(source.creatorId).toBeNull();
    },
  );

  it('serializes an actual receipt drain after a lifecycle source mutation', async () => {
    const throughSequence = await recordPendingInboundReceipt(fixture);
    const mutationEntered = deferred();
    const releaseMutation = deferred();
    const mutation = mutateThreadCreator({
      fixture,
      creatorId: fixture.creatorA,
      entered: mutationEntered,
      release: releaseMutation,
    });
    await mutationEntered.promise;
    const drain = drainPendingReceipt(throughSequence);

    try {
      await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
      releaseMutation.resolve();
      await Promise.all([mutation, drain]);
    } finally {
      releaseMutation.resolve();
      await Promise.allSettled([mutation, drain]);
    }

    const [tuple] = await global.testDataSource.query(
      `SELECT "inboxState" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey"=$1`,
      [`creator:${fixture.creatorA}`],
    );
    expect(tuple.inboxState).toBe('NEEDS_REPLY');
  });

  it('retains the receipt result when the actual drain wins before a lifecycle mutation', async () => {
    const throughSequence = await recordPendingInboundReceipt(fixture);
    const blocker = global.testDataSource.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query("SELECT set_config('search_path', $1, true)", [schema]);
    await blocker.query(
      'SELECT id FROM "messageThread" WHERE id=$1 FOR UPDATE',
      [fixture.threadId],
    );
    const drain = drainPendingReceipt(throughSequence);
    let mutation: Promise<void> | undefined;

    try {
      await waitForBlockedDatabaseQuery(
        'SELECT id, "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE',
      );
      mutation = mutateThreadCreator({
        fixture,
        creatorId: fixture.creatorA,
      });
      await waitForBlockedDatabaseQuery('pg_advisory_xact_lock');
      await blocker.commitTransaction();
      await Promise.all([drain, mutation]);
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await Promise.allSettled([drain, ...(mutation ? [mutation] : [])]);
    }

    const [tuple] = await global.testDataSource.query(
      `SELECT "inboxState" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey"=$1`,
      [`creator:${fixture.creatorA}`],
    );
    expect(tuple.inboxState).toBe('NEEDS_REPLY');
  });

  it('prelocks a complete reverse-order receipt batch identity union before a disjoint Creator relink', async () => {
    const secondFixture = await seedFixture();
    const [lowerCreatorId, higherCreatorId] = [
      fixture.creatorA,
      fixture.creatorB,
    ].sort();
    const relinkThreadId = await addThread(fixture);
    const firstReceiptApplied = deferred();
    const releaseDrain = deferred();
    let drain: Promise<number> | undefined;
    let relink: Promise<void> | undefined;

    try {
      await mutateThreadCreator({
        fixture,
        creatorId: higherCreatorId,
      });
      await mutateThreadCreator({
        fixture,
        threadId: secondFixture.threadId,
        creatorId: lowerCreatorId,
      });
      await mutateThreadCreator({
        fixture,
        threadId: relinkThreadId,
        creatorId: lowerCreatorId,
      });
      const higherSequence = await recordPendingInboundReceipt(fixture);
      const lowerSequence = await recordPendingInboundReceipt(secondFixture);
      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxTriageTransitionReceipt"
         SET "normalizedOccurredAt"=CASE WHEN "persistedMessageId"=$1 THEN '2099-09-15T11:00:00.000Z'::timestamptz ELSE '2099-09-15T11:01:00.000Z'::timestamptz END,
             "orderKey"=CASE WHEN "persistedMessageId"=$1 THEN '2099-09-15T11:00:00.000Z|EMAIL|first' ELSE '2099-09-15T11:01:00.000Z|EMAIL|second' END
         WHERE "persistedMessageId" = ANY($2::uuid[])`,
        [fixture.messageId, [fixture.messageId, secondFixture.messageId]],
      );

      const triage = new MyahInboxContactTriageService();
      const applyReceipt = triage.applyReceiptInTransaction.bind(triage);
      jest
        .spyOn(triage, 'applyReceiptInTransaction')
        .mockImplementation(async (receipt, manager) => {
          await applyReceipt(receipt, manager);
          if (receipt.sourceRecordId === fixture.threadId) {
            firstReceiptApplied.resolve();
            await releaseDrain.promise;
          }
        });
      const receiptService = new MyahInboxContactTriageReceiptService(
        resolveProviderByName<GlobalWorkspaceOrmManager>(
          'GlobalWorkspaceOrmManager',
        ),
        undefined,
        triage,
      );
      drain = receiptService.drain({
        workspaceId,
        throughSequence: (BigInt(higherSequence) > BigInt(lowerSequence)
          ? higherSequence
          : lowerSequence
        ).toString(),
        purpose: 'READY_RECOVERY',
      });
      await firstReceiptApplied.promise;

      relink = mutateThreadCreator({
        fixture,
        threadId: relinkThreadId,
        creatorId: higherCreatorId,
      });
      await waitForBlockedDatabaseQuery('myahInboxContactIdentity');
      releaseDrain.resolve();
      await Promise.all([drain, relink]);
    } finally {
      releaseDrain.resolve();
      await Promise.allSettled([
        ...(drain ? [drain] : []),
        ...(relink ? [relink] : []),
      ]);
      await cleanupFixture(secondFixture);
    }
  });

  it('rolls back the source mutation and its triage reconciliation together', async () => {
    const triage = new MyahInboxContactTriageService();

    await expect(
      withTransaction(async (manager) => {
        await manager.query("SELECT set_config('search_path', $1, true)", [
          schema,
        ]);
        await manager.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
          buildMyahInboxSourceKey('EMAIL_THREAD', fixture.threadId),
        ]);
        await manager.query(
          'UPDATE "messageThread" SET "creatorId"=$2 WHERE id=$1',
          [fixture.threadId, fixture.creatorA],
        );
        await triage.ensureSourceContactInTransaction({
          workspaceId,
          sourceType: 'EMAIL_THREAD',
          sourceRecordId: fixture.threadId,
          previousCreatorId: null,
          manager,
        });
        throw new Error('inject rollback after triage reconciliation');
      }),
    ).rejects.toThrow('inject rollback');

    const [source] = (await global.testDataSource.query(
      `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
      [fixture.threadId],
    )) as Array<{ creatorId: string | null }>;
    const triageRows = await global.testDataSource.query(
      `SELECT "contactIdentityKey" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey" = ANY($1::text[])`,
      [[`email-thread:${fixture.threadId}`, `creator:${fixture.creatorA}`]],
    );
    const identityRows = await global.testDataSource.query(
      `SELECT "contactIdentityKey" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactIdentity"
       WHERE "contactIdentityKey" = ANY($1::text[])`,
      [[`email-thread:${fixture.threadId}`, `creator:${fixture.creatorA}`]],
    );
    expect(source.creatorId).toBeNull();
    expect(triageRows).toEqual([]);
    expect(identityRows).toEqual([]);
  });

  it.each([
    ['receipt then link', 'link', true],
    ['link then receipt', 'link', false],
    ['receipt then unlink', 'unlink', true],
    ['unlink then receipt', 'unlink', false],
  ] as const)(
    'serializes %s exactly once through the receipt and lifecycle source lock',
    async (_name, relationship, receiptFirst) => {
      if (relationship === 'unlink') {
        await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
      }
      const targetCreatorId = relationship === 'link' ? fixture.creatorA : null;
      const entered = deferred();
      const release = deferred();
      const first = receiptFirst
        ? applyInboundReceipt({ fixture, entered, release })
        : mutateThreadCreator({
            fixture,
            creatorId: targetCreatorId,
            entered,
            release,
          });
      await entered.promise;
      let secondFinished = false;
      const second = (
        receiptFirst
          ? mutateThreadCreator({ fixture, creatorId: targetCreatorId })
          : applyInboundReceipt({ fixture })
      ).then(() => {
        secondFinished = true;
      });

      await Promise.resolve();
      expect(secondFinished).toBe(false);
      release.resolve();
      await Promise.all([first, second]);

      const identity = targetCreatorId
        ? `creator:${targetCreatorId}`
        : `email-thread:${fixture.threadId}`;
      const [tuple] = await global.testDataSource.query(
        `SELECT "inboxState", revision, "lastInboundOccurredAt", "identityGeneration"
         FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         WHERE "contactIdentityKey"=$1`,
        [identity],
      );
      expect(tuple.inboxState).toBe('NEEDS_REPLY');
      expect(tuple.lastInboundOccurredAt).toBeTruthy();
      expect(Number(tuple.revision)).toBeGreaterThan(0);
      expect(tuple.identityGeneration).toBeDefined();
    },
  );

  it('executes a Creator merge through the bridge and reconciles the relinked source', async () => {
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
    const triage = new MyahInboxContactTriageService();
    const lifecycle = new MyahInboxContactTriageLifecycleService(triage);

    await withTransaction((manager) =>
      lifecycle.withPreparedCreatorMutationInTransaction({
        workspaceId,
        creatorIds: [fixture.creatorA, fixture.creatorB],
        manager,
        mutate: async () => {
          await manager.query("SELECT set_config('search_path', $1, true)", [
            schema,
          ]);
          await manager.query(
            'UPDATE "messageThread" SET "creatorId"=$2 WHERE "creatorId"=$1',
            [fixture.creatorA, fixture.creatorB],
          );
          await manager.query('DELETE FROM "creator" WHERE id=$1', [
            fixture.creatorA,
          ]);
        },
      }),
    );

    const [source] = (await global.testDataSource.query(
      `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
      [fixture.threadId],
    )) as Array<{ creatorId: string | null }>;
    const [triageRow] = await global.testDataSource.query(
      `SELECT "identityGeneration" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey"=$1`,
      [`creator:${fixture.creatorB}`],
    );
    expect(source.creatorId).toBe(fixture.creatorB);
    expect(triageRow.identityGeneration).toBeDefined();
  });

  it.each(['soft', 'hard'] as const)(
    'rekeys attached sources before a real Creator %s delete through the bridge',
    async (kind) => {
      await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
      const triage = new MyahInboxContactTriageService();
      const lifecycle = new MyahInboxContactTriageLifecycleService(triage);

      await withTransaction((manager) =>
        lifecycle.withPreparedCreatorMutationInTransaction({
          workspaceId,
          creatorIds: [fixture.creatorA],
          manager,
          mutate: async (sources) => {
            await lifecycle.rekeyPreparedSourcesToUnmatchedInTransaction({
              sources,
              manager,
            });
            await manager.query("SELECT set_config('search_path', $1, true)", [
              schema,
            ]);
            await manager.query(
              kind === 'soft'
                ? 'UPDATE "creator" SET "deletedAt"=now() WHERE id=$1'
                : 'DELETE FROM "creator" WHERE id=$1',
              [fixture.creatorA],
            );
          },
        }),
      );

      const [source] = (await global.testDataSource.query(
        `SELECT "creatorId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageThread" WHERE id=$1`,
        [fixture.threadId],
      )) as Array<{ creatorId: string | null }>;
      const [fallback] = await global.testDataSource.query(
        `SELECT "identityGeneration" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         WHERE "contactIdentityKey"=$1`,
        [`email-thread:${fixture.threadId}`],
      );
      expect(source.creatorId).toBeNull();
      expect(fallback.identityGeneration).toBeDefined();
    },
  );

  it.each(['soft', 'hard'] as const)(
    'copies the shared tuple to every fallback before a multi-source Creator %s delete',
    async (kind) => {
      const secondThreadId = await addThread(fixture);
      await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
      await mutateThreadCreator({
        fixture,
        threadId: secondThreadId,
        creatorId: fixture.creatorA,
      });
      const triage = new MyahInboxContactTriageService();
      const lifecycle = new MyahInboxContactTriageLifecycleService(triage);
      const inboundOccurredAt = '2099-09-15T12:00:00.000Z';
      const snoozedUntil = '2099-09-16T12:00:00.000Z';

      await global.testDataSource.query(
        `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         SET "inboxState"='SNOOZED', "snoozedUntil"=$2::timestamptz,
             "hasStateDecision"=true, "stateDecisionAt"=$2::timestamptz,
             "lastInboundOccurredAt"=$3::timestamptz,
             "lastInboundOrderKey"='preserved-inbound-order',
             "triageChangedAt"=$3::timestamptz
         WHERE "contactIdentityKey"=$1`,
        [`creator:${fixture.creatorA}`, snoozedUntil, inboundOccurredAt],
      );

      await withTransaction((manager) =>
        lifecycle.withPreparedCreatorMutationInTransaction({
          workspaceId,
          creatorIds: [fixture.creatorA],
          manager,
          mutate: async (sources) => {
            await lifecycle.rekeyPreparedSourcesToUnmatchedInTransaction({
              sources,
              manager,
            });
            await manager.query(
              kind === 'soft'
                ? 'UPDATE "creator" SET "deletedAt"=now() WHERE id=$1'
                : 'DELETE FROM "creator" WHERE id=$1',
              [fixture.creatorA],
            );
          },
        }),
      );

      const fallbacks = (await global.testDataSource.query(
        `SELECT "contactIdentityKey", "inboxState", "snoozedUntil",
                revision, "identityGeneration", "lastInboundOccurredAt",
                "lastInboundOrderKey"
         FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
         WHERE "contactIdentityKey" = ANY($1::text[])
         ORDER BY "contactIdentityKey"`,
        [
          [
            `email-thread:${fixture.threadId}`,
            `email-thread:${secondThreadId}`,
          ],
        ],
      )) as Array<{
        inboxState: string;
        snoozedUntil: string;
        revision: string;
        identityGeneration: string;
        lastInboundOccurredAt: string;
        lastInboundOrderKey: string;
      }>;

      expect(fallbacks).toHaveLength(2);
      for (const fallback of fallbacks) {
        expect(fallback).toMatchObject({
          inboxState: 'SNOOZED',
          lastInboundOrderKey: 'preserved-inbound-order',
        });
        expect(Number(fallback.revision)).toBe(1);
        expect(Number(fallback.identityGeneration)).toBeGreaterThan(1);
        expect(new Date(fallback.snoozedUntil).toISOString()).toBe(
          snoozedUntil,
        );
        expect(new Date(fallback.lastInboundOccurredAt).toISOString()).toBe(
          inboundOccurredAt,
        );
      }
    },
  );

  it('invalidates a pre-unlink CAS after link, unlink, and relink ABA', async () => {
    const triage = new MyahInboxContactTriageService();
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
    const [before] = (await global.testDataSource.query(
      `SELECT revision, "identityGeneration" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahInboxContactTriage"
       WHERE "contactIdentityKey"=$1`,
      [`creator:${fixture.creatorA}`],
    )) as Array<{ revision: string; identityGeneration: string }>;

    await mutateThreadCreator({ fixture, creatorId: null });
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });

    let conflict: MyahInboxTriageConflictError | undefined;
    try {
      await withTransaction(async (manager) => {
        await manager.query("SELECT set_config('search_path', $1, true)", [
          schema,
        ]);
        return triage.updateTupleInTransaction({
          contactIdentityKey: `creator:${fixture.creatorA}`,
          expectedRevision: Number(before.revision),
          expectedIdentityGeneration: before.identityGeneration,
          patch: { inboxState: 'CLOSED' },
          manager,
        });
      });
    } catch (error) {
      conflict = error as MyahInboxTriageConflictError;
    }
    expect(conflict).toBeInstanceOf(MyahInboxTriageConflictError);
    expect(
      (conflict?.extensions as { triage: { identityGeneration: string } })
        .triage.identityGeneration,
    ).not.toBe(before.identityGeneration);
  });

  it('holds Creator anchors before a concurrent source relink and completes both sides', async () => {
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
    const triage = new MyahInboxContactTriageService();
    const lifecycle = new MyahInboxContactTriageLifecycleService(triage);
    const entered = deferred();
    const release = deferred();
    const merge = withTransaction((manager) =>
      lifecycle.withPreparedCreatorMutationInTransaction({
        workspaceId,
        creatorIds: [fixture.creatorB, fixture.creatorA],
        manager,
        mutate: async () => {
          entered.resolve();
          await release.promise;
        },
      }),
    );
    await entered.promise;
    let relinkFinished = false;
    const relink = mutateThreadCreator({
      fixture,
      creatorId: fixture.creatorB,
    }).then(() => {
      relinkFinished = true;
    });

    await Promise.resolve();
    expect(relinkFinished).toBe(false);
    release.resolve();
    await Promise.all([merge, relink]);
  });

  it('completes a source-lock-first relink before the concurrent Creator merge', async () => {
    await mutateThreadCreator({ fixture, creatorId: fixture.creatorA });
    const triage = new MyahInboxContactTriageService();
    const lifecycle = new MyahInboxContactTriageLifecycleService(triage);
    const entered = deferred();
    const release = deferred();
    const relink = mutateThreadCreator({
      fixture,
      creatorId: fixture.creatorB,
      entered,
      release,
    });
    await entered.promise;
    let mergeFinished = false;
    const merge = withTransaction((manager) =>
      lifecycle
        .withPreparedCreatorMutationInTransaction({
          workspaceId,
          creatorIds: [fixture.creatorA, fixture.creatorB],
          manager,
          mutate: async () => undefined,
        })
        .then(() => {
          mergeFinished = true;
        }),
    );

    await Promise.resolve();
    expect(mergeFinished).toBe(false);
    release.resolve();
    await Promise.all([relink, merge]);
  });
});
