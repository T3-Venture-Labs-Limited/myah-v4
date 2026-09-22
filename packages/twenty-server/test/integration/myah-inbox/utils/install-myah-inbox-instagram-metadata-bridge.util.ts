import { randomUUID } from 'node:crypto';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;

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

const permissionCacheKeys = [
  'rolesPermissions',
  'userWorkspaceRoleMap',
  'flatRoleMaps',
  'flatRoleTargetMaps',
  'flatObjectPermissionMaps',
  'flatRowLevelPermissionPredicateMaps',
  'flatRowLevelPermissionPredicateGroupMaps',
];

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

export const installMyahInboxInstagramMetadataBridge =
  async (): Promise<void> => {
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
        throw new Error(
          'Myah 354 capability metadata bridge was not installed',
        );
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
