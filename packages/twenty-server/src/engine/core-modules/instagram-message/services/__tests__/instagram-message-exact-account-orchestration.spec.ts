import { randomUUID } from 'crypto';

import { Client } from 'pg';
import {
  DataSource,
  EntitySchema,
  type EntitySchemaColumnOptions,
} from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramMessageAuthorityReaderService } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

// Seed historical receipt authority without invoking the fresh provider-aware producer.
class LegacyReceiptAuthorityReaderFixture extends InstagramMessageAuthorityReaderService {
  async readHistoricalAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    draftId: string;
    expectedRevision: number;
  }) {
    const workspace = await this.getWorkspace(input.workspaceId);
    const accountBinding = await this.getActiveAccountBinding(
      input.workspaceId,
    );
    const draft = await this.loadDraft(workspace, input.draftId);
    if (Number(draft.revision) !== input.expectedRevision)
      throw new Error('draft revision changed');
    return this.buildAuthority({
      workspace,
      accountBinding,
      draft,
      approvalContext: {
        initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: input.draftId,
      },
    });
  }
}

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const draftId = '00000000-0000-4000-8000-000000000003';
const creatorId = '00000000-0000-4000-8000-000000000004';
const conversationId = '00000000-0000-4000-8000-000000000005';
const canonicalAccountId = '00000000-0000-4000-8000-000000000006';
const fixtureAccountId = '00000000-0000-4000-8000-000000000007';
const bindingId = '00000000-0000-4000-8000-000000000008';
const approvalBindingId = '00000000-0000-4000-8000-000000000009';
const receiptId = '00000000-0000-4000-8000-000000000010';

const objectMetadata = [
  ['2d357469-831a-4629-ad4b-47335900e883', 'account-metadata'],
  ['85762d24-541b-407f-9d6a-cdf89552c665', 'draft-metadata'],
  ['36817464-855f-42db-9fbb-f8853643f8d6', 'conversation-metadata'],
  ['5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator-metadata'],
].map(([universalIdentifier, id]) => ({ universalIdentifier, id }));

const authorityDraft = {
  id: draftId,
  body: 'Reply from the exact account',
  revision: 1,
  kind: 'REPLY' as const,
  creatorId,
  recipientUsername: 'creator.name',
  recipientProviderId: 'creator-igsid',
  conversationId,
  sentAt: null,
  creatorInstagramUsername: '@Creator.Name',
  creatorInstagramUrl: null,
  creatorInstagramLinkPrimaryLinkUrl: null,
  providerConversationId: 'provider-chat',
  conversationRecipientIgsid: 'creator-igsid',
  conversationRecipientUsername: 'creator.name',
  conversationProvider: 'UNIPILE',
  conversationLifecycle: 'ACTIVE',
  conversationInstagramAccountId: canonicalAccountId,
  conversationCreatorId: creatorId,
};

const buildHarness = () => {
  const queryRunner = {
    isReleased: false,
    query: jest.fn(async (sql: string) =>
      sql.includes('"_myahInstagramReplyDraft"') ? [authorityDraft] : [],
    ),
    release: jest.fn(),
  };
  const dataSource = Object.create(
    GlobalWorkspaceDataSource.prototype,
  ) as GlobalWorkspaceDataSource;
  Object.defineProperty(dataSource, 'createQueryRunner', {
    value: jest.fn(() => queryRunner),
  });

  const accounts = [
    { id: fixtureAccountId, status: 'ACTIVE', unipileAccountId: 'fixture' },
    {
      id: canonicalAccountId,
      status: 'ACTIVE',
      unipileAccountId: 'canonical-provider-account',
    },
  ];
  const repositories = {
    myahInstagramReplyDraft: {
      findOne: jest.fn().mockResolvedValue({
        id: draftId,
        revision: 1,
        kind: 'REPLY',
        creatorId: null,
        conversationId,
      }),
    },
    myahSocialConversation: {
      findOne: jest.fn().mockResolvedValue({
        id: conversationId,
        instagramAccountId: canonicalAccountId,
      }),
    },
    myahInstagramAccount: {
      findOne: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          accounts.find(({ id }) => id === where.id) ?? null,
      ),
    },
  };
  const binding = {
    id: bindingId,
    workspaceId,
    workspaceInstagramAccountRecordId: canonicalAccountId,
    unipileAccountId: 'canonical-provider-account',
    instagramUserId: 'brand-igsid',
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const accountBindingRepository = {
    find: jest.fn().mockResolvedValue([binding]),
  };
  const providerClient = {
    getChat: jest.fn(() => {
      throw new Error('provider reads must not run before budget BLOCKED');
    }),
    listChats: jest.fn(() => {
      throw new Error('provider reads must not run before budget BLOCKED');
    }),
    sendMessage: jest.fn(() => {
      throw new Error('provider writes must not run before budget BLOCKED');
    }),
    startChat: jest.fn(() => {
      throw new Error('provider writes must not run before budget BLOCKED');
    }),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
    getRepository: jest.fn(async (_workspaceId, objectName) => {
      return repositories[objectName as keyof typeof repositories];
    }),
  };
  const authorityReader = new LegacyReceiptAuthorityReaderFixture(
    { findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }) } as never,
    globalWorkspaceOrmManager as never,
    accountBindingRepository as never,
    { find: jest.fn().mockResolvedValue(objectMetadata) } as never,
    providerClient as never,
  );
  const recordAccess = new InstagramMessageRecordAccessService(
    globalWorkspaceOrmManager as never,
    accountBindingRepository as never,
  );
  const budgetService = {
    reserve: jest.fn().mockResolvedValue({
      status: 'BLOCKED',
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      hourlyUsed: 10,
      hourlyLimit: 10,
      hourlyRemaining: 0,
      dailyUsed: 10,
      dailyLimit: 100,
      dailyRemaining: 90,
      blockedWindows: ['HOURLY'],
      nextEligibleAt: new Date('2026-09-05T13:00:00.000Z'),
    }),
    markProviderAttempted: jest.fn(),
    releasePreDispatch: jest.fn(),
    releaseStartTarget: jest.fn(),
    releaseStartTargetForReceipt: jest.fn(),
  };
  const actionApprovalService = {
    getApprovedBinding: jest.fn(),
    findExecutionReceiptForBinding: jest.fn().mockResolvedValue(null),
    reserveExecutionForBinding: jest.fn().mockResolvedValue({
      created: true,
      receipt: { id: receiptId, state: ActionExecutionReceiptState.PROCESSING },
    }),
    recordProviderAccepted: jest.fn(),
    recordProviderTerminalState: jest.fn(),
  };
  const sendService = new InstagramMessageSendService(
    actionApprovalService as never,
    authorityReader,
    { withLock: jest.fn(async (_input, operation) => operation()) } as never,
    budgetService as never,
    providerClient as never,
    { projectReceiptWithWriter: jest.fn() } as never,
    { project: jest.fn() } as never,
    { assertCanSend: jest.fn().mockResolvedValue(undefined) } as never,
    recordAccess,
  );

  return {
    accounts,
    actionApprovalService,
    authorityReader,
    budgetService,
    dataSource,
    providerClient,
    queryRunner,
    repositories,
    sendService,
  };
};

describe('Instagram historical v2 exact-account non-sending orchestration', () => {
  it('retains a second account fixture, selects the canonical reply account, and stops at budget BLOCKED before provider I/O', async () => {
    const harness = buildHarness();

    expect(() => harness.dataSource.query('SELECT 1')).toThrow(
      PermissionsException,
    );

    const authority = await harness.authorityReader.readHistoricalAuthority({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      draftId,
      expectedRevision: 1,
    });
    harness.actionApprovalService.getApprovedBinding.mockResolvedValue(
      authority.expectedActionBinding,
    );

    await expect(
      harness.sendService.executeApproved({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        approvalBindingId,
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: draftId,
        rolePermissionConfig: { unionOf: ['role-id'] },
      }),
    ).resolves.toMatchObject({
      status: 'BLOCKED',
      receiptId,
    });

    expect(harness.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixtureAccountId }),
      ]),
    );
    expect(
      harness.repositories.myahInstagramAccount.findOne,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: canonicalAccountId }),
      }),
    );
    expect(harness.budgetService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        instagramAccountRecordId: canonicalAccountId,
      }),
    );
    expect(harness.queryRunner.query).toHaveBeenCalled();
    expect(harness.providerClient.getChat).not.toHaveBeenCalled();
    expect(harness.providerClient.listChats).not.toHaveBeenCalled();
    expect(harness.providerClient.sendMessage).not.toHaveBeenCalled();
    expect(harness.providerClient.startChat).not.toHaveBeenCalled();
  });
});

const isolatedPostgresUrl = process.env.MYAH314_ISOLATED_POSTGRES_URL;
const describeIsolatedPostgres = isolatedPostgresUrl ? describe : describe.skip;
const isolatedPostgresPrincipal = 'myah314_runner';
const isolatedPostgresDatabase = 'myah314_exact_account';
const callerRoleId = 'myah314-exact-account-role';
const isolatedRolePermissionConfig = { unionOf: [callerRoleId] };
const identifierPattern = /^[a-z0-9_]+$/;

// Fixture schemas are UUID-derived and validated before this wrapper permits DDL.
const executeFixtureSql = (
  client: Client,
  statement: string,
  values?: unknown[],
) => client.query(statement, values as never);

const postgresEntity = (
  name: string,
  schema: string,
  tableName: string,
  columns: Record<string, EntitySchemaColumnOptions>,
) =>
  new EntitySchema({
    name,
    schema,
    tableName,
    columns,
  });

const workspaceEntitySchemas = (schema: string) => [
  postgresEntity(
    'myahInstagramReplyDraft',
    schema,
    '_myahInstagramReplyDraft',
    {
      id: { type: 'uuid', primary: true },
      body: { type: 'text', nullable: true },
      revision: { type: 'integer' },
      kind: { type: 'text' },
      creatorId: { type: 'uuid', nullable: true },
      recipientUsername: { type: 'text', nullable: true },
      recipientProviderId: { type: 'text', nullable: true },
      conversationId: { type: 'uuid', nullable: true },
      sentAt: { type: 'timestamptz', nullable: true },
      deletedAt: { type: 'timestamptz', nullable: true },
    },
  ),
  postgresEntity('myahSocialConversation', schema, '_myahSocialConversation', {
    id: { type: 'uuid', primary: true },
    providerConversationId: { type: 'text', nullable: true },
    recipientIgsid: { type: 'text', nullable: true },
    recipientUsername: { type: 'text', nullable: true },
    instagramAccountId: { type: 'uuid', nullable: true },
    provider: { type: 'text' },
    lifecycle: { type: 'text' },
    deletedAt: { type: 'timestamptz', nullable: true },
  }),
  postgresEntity('myahInstagramAccount', schema, '_myahInstagramAccount', {
    id: { type: 'uuid', primary: true },
    username: { type: 'text' },
    status: { type: 'text' },
    unipileAccountId: { type: 'text', nullable: true },
    deletedAt: { type: 'timestamptz', nullable: true },
  }),
];

const flatMaps = (
  entityMetadatas: DataSource['entityMetadatas'],
  objectDefinitions: {
    name: string;
    universalIdentifier: string;
    fields: string[];
  }[],
) => {
  const objects = Object.fromEntries(
    objectDefinitions.map(({ name, universalIdentifier, fields }) => [
      universalIdentifier,
      {
        id: universalIdentifier,
        universalIdentifier,
        nameSingular: name,
        isSystem: false,
        fieldIds: fields.map((field) => `${universalIdentifier}-${field}`),
      },
    ]),
  );
  const fields = Object.fromEntries(
    objectDefinitions.flatMap(({ universalIdentifier, fields }) =>
      fields.map((name) => [
        `${universalIdentifier}-${name}`,
        {
          id: `${universalIdentifier}-${name}`,
          universalIdentifier: `${universalIdentifier}-${name}`,
          name,
          type:
            name === 'id' || name.endsWith('Id')
              ? 'UUID'
              : name === 'username'
                ? 'SELECT'
                : 'TEXT',
          objectMetadataId: universalIdentifier,
          isActive: true,
          isSystem: false,
          settings: null,
        },
      ]),
    ),
  );
  return {
    flatObjectMetadataMaps: {
      byUniversalIdentifier: objects,
      universalIdentifierById: Object.fromEntries(
        Object.keys(objects).map((id) => [id, id]),
      ),
      universalIdentifiersByApplicationId: {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: fields,
      universalIdentifierById: Object.fromEntries(
        Object.keys(fields).map((id) => [id, id]),
      ),
      universalIdentifiersByApplicationId: {},
    },
    entityMetadatas,
  };
};

describeIsolatedPostgres(
  'Instagram exact-account application permission PostgreSQL regression',
  () => {
    let client: Client;
    let coreDataSource: DataSource;
    let globalWorkspaceDataSource: GlobalWorkspaceDataSource;
    let globalWorkspaceOrmManager: GlobalWorkspaceOrmManager;
    let workspaceSchema: string;
    let coreSchema: string;
    let isolatedWorkspaceId: string;
    let canonicalDraftId: string;
    let deniedDraftId: string;
    let canonicalInstagramAccountId: string;
    let deniedInstagramAccountId: string;
    let authorityReader: LegacyReceiptAuthorityReaderFixture;
    let recordAccess: InstagramMessageRecordAccessService;
    let sendService: InstagramMessageSendService;
    let providerClient: Record<string, jest.Mock>;
    let budgetService: { reserve: jest.Mock };
    let actionApprovalService: Record<string, jest.Mock>;

    beforeAll(async () => {
      jest.useRealTimers();
      if (process.env.PG_DATABASE_URL !== undefined)
        throw new Error(
          'PG_DATABASE_URL must be absent for the isolated regression',
        );
      const endpoint = new URL(isolatedPostgresUrl!);
      if (
        !['postgres:', 'postgresql:'].includes(endpoint.protocol) ||
        endpoint.hostname !== '127.0.0.1' ||
        endpoint.port !== '15433' ||
        endpoint.pathname !== `/${isolatedPostgresDatabase}` ||
        endpoint.username !== isolatedPostgresPrincipal ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error(
          'MYAH-314 isolated PostgreSQL endpoint is not allowlisted',
        );
      client = new Client({
        connectionString: isolatedPostgresUrl,
        statement_timeout: 5000,
      });
      await client.connect();
      const identity = await client.query<{ database: string; user: string }>(
        'SELECT current_database() AS database, current_user AS user',
      );
      if (
        identity.rows[0]?.database !== isolatedPostgresDatabase ||
        identity.rows[0]?.user !== isolatedPostgresPrincipal
      )
        throw new Error(
          'MYAH-314 isolated PostgreSQL identity is not allowlisted',
        );

      isolatedWorkspaceId = randomUUID();
      canonicalDraftId = randomUUID();
      deniedDraftId = randomUUID();
      canonicalInstagramAccountId = randomUUID();
      deniedInstagramAccountId = randomUUID();
      workspaceSchema = getWorkspaceSchemaName(isolatedWorkspaceId);
      coreSchema = `myah314_exact_core_${randomUUID().split('-').join('')}`;
      if (
        !identifierPattern.test(workspaceSchema) ||
        !identifierPattern.test(coreSchema)
      )
        throw new Error('Generated fixture schema is invalid');
      await executeFixtureSql(
        client,
        `CREATE SCHEMA "${workspaceSchema}"; CREATE SCHEMA "${coreSchema}";
      CREATE TABLE "${workspaceSchema}"."_myahInstagramReplyDraft" ("id" uuid PRIMARY KEY, "body" text, "revision" integer NOT NULL, "kind" text NOT NULL, "creatorId" uuid, "recipientUsername" text, "recipientProviderId" text, "conversationId" uuid, "sentAt" timestamptz, "deletedAt" timestamptz);
      CREATE TABLE "${workspaceSchema}"."_myahSocialConversation" ("id" uuid PRIMARY KEY, "providerConversationId" text, "recipientIgsid" text, "recipientUsername" text, "instagramAccountId" uuid, "provider" text NOT NULL, "lifecycle" text NOT NULL, "deletedAt" timestamptz);
      CREATE TABLE "${workspaceSchema}"."_myahInstagramAccount" ("id" uuid PRIMARY KEY, "username" text NOT NULL, "status" text NOT NULL, "unipileAccountId" text, "deletedAt" timestamptz);
      CREATE TABLE "${workspaceSchema}"."creator" ("id" uuid PRIMARY KEY, "instagramUsername" text, "instagramUrl" text, "instagramLinkPrimaryLinkUrl" text, "deletedAt" timestamptz);
      CREATE TABLE "${coreSchema}"."workspaceFixture" ("id" uuid PRIMARY KEY);
      CREATE TABLE "${coreSchema}"."objectMetadataFixture" ("id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "universalIdentifier" text NOT NULL);
      CREATE TABLE "${coreSchema}"."bindingFixture" ("id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "workspaceInstagramAccountRecordId" uuid NOT NULL, "unipileAccountId" text NOT NULL, "instagramUserId" text NOT NULL, "status" text NOT NULL, "deactivatedAt" timestamptz);`,
      );
      const creator = randomUUID();
      const canonicalConversation = randomUUID();
      const deniedConversation = randomUUID();
      const binding = randomUUID();
      const metadataRows = [
        '2d357469-831a-4629-ad4b-47335900e883',
        '85762d24-541b-407f-9d6a-cdf89552c665',
        '36817464-855f-42db-9fbb-f8853643f8d6',
        '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
      ].map((universalIdentifier) => [
        randomUUID(),
        isolatedWorkspaceId,
        universalIdentifier,
      ]);
      await executeFixtureSql(
        client,
        `INSERT INTO "${coreSchema}"."workspaceFixture" VALUES ($1)`,
        [isolatedWorkspaceId],
      );
      await executeFixtureSql(
        client,
        `INSERT INTO "${coreSchema}"."objectMetadataFixture" VALUES ${metadataRows.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`).join(', ')}`,
        metadataRows.flat(),
      );
      await executeFixtureSql(
        client,
        `INSERT INTO "${coreSchema}"."bindingFixture" VALUES ($1,$2,$3,$4,$5,'ACTIVE',NULL)`,
        [
          binding,
          isolatedWorkspaceId,
          canonicalInstagramAccountId,
          'canonical-provider-account',
          'brand-igsid',
        ],
      );
      await executeFixtureSql(
        client,
        `INSERT INTO "${workspaceSchema}"."creator" VALUES ($1,'@Creator.Name',NULL,NULL,NULL)`,
        [creator],
      );
      await executeFixtureSql(
        client,
        `INSERT INTO "${workspaceSchema}"."_myahInstagramAccount" VALUES ($1,'canonical-account','ACTIVE','canonical-provider-account',NULL),($2,'denied-account','ACTIVE','denied-provider-account',NULL)`,
        [canonicalInstagramAccountId, deniedInstagramAccountId],
      );
      await executeFixtureSql(
        client,
        `INSERT INTO "${workspaceSchema}"."_myahSocialConversation" VALUES ($1,'provider-canonical-chat','creator-igsid','creator.name',$2,'UNIPILE','ACTIVE',NULL),($3,'provider-denied-chat','creator-igsid','creator.name',$4,'UNIPILE','ACTIVE',NULL)`,
        [
          canonicalConversation,
          canonicalInstagramAccountId,
          deniedConversation,
          deniedInstagramAccountId,
        ],
      );
      await executeFixtureSql(
        client,
        `INSERT INTO "${workspaceSchema}"."_myahInstagramReplyDraft" VALUES ($1,'Reply from canonical',1,'REPLY',$2,'creator.name','creator-igsid',$3,NULL,NULL),($4,'Reply from denied',1,'REPLY',$2,'creator.name','creator-igsid',$5,NULL,NULL)`,
        [
          canonicalDraftId,
          creator,
          canonicalConversation,
          deniedDraftId,
          deniedConversation,
        ],
      );

      coreDataSource = new DataSource({
        type: 'postgres',
        url: isolatedPostgresUrl,
        schema: coreSchema,
        entities: [
          postgresEntity('workspaceFixture', coreSchema, 'workspaceFixture', {
            id: { type: 'uuid', primary: true },
          }),
          postgresEntity(
            'objectMetadataFixture',
            coreSchema,
            'objectMetadataFixture',
            {
              id: { type: 'uuid', primary: true },
              workspaceId: { type: 'uuid' },
              universalIdentifier: { type: 'text' },
            },
          ),
          postgresEntity('bindingFixture', coreSchema, 'bindingFixture', {
            id: { type: 'uuid', primary: true },
            workspaceId: { type: 'uuid' },
            workspaceInstagramAccountRecordId: { type: 'uuid' },
            unipileAccountId: { type: 'text' },
            instagramUserId: { type: 'text' },
            status: { type: 'text' },
            deactivatedAt: { type: 'timestamptz', nullable: true },
          }),
        ],
      });
      await coreDataSource.initialize();
      globalWorkspaceDataSource = new GlobalWorkspaceDataSource(
        {
          type: 'postgres',
          url: isolatedPostgresUrl,
          schema: workspaceSchema,
          entities: workspaceEntitySchemas(workspaceSchema),
        },
        { emit: jest.fn() } as never,
        coreDataSource,
      );
      await globalWorkspaceDataSource.initialize();
      const definitions = [
        {
          name: 'myahInstagramReplyDraft',
          universalIdentifier: '85762d24-541b-407f-9d6a-cdf89552c665',
          fields: [
            'id',
            'revision',
            'kind',
            'creatorId',
            'conversationId',
            'deletedAt',
          ],
        },
        {
          name: 'myahSocialConversation',
          universalIdentifier: '36817464-855f-42db-9fbb-f8853643f8d6',
          fields: [
            'id',
            'instagramAccountId',
            'provider',
            'lifecycle',
            'deletedAt',
          ],
        },
        {
          name: 'myahInstagramAccount',
          universalIdentifier: '2d357469-831a-4629-ad4b-47335900e883',
          fields: ['id', 'username', 'status', 'unipileAccountId', 'deletedAt'],
        },
      ];
      const maps = flatMaps(
        globalWorkspaceDataSource.entityMetadatas,
        definitions,
      );
      const permissions = Object.fromEntries(
        definitions.map(({ universalIdentifier }) => [
          universalIdentifier,
          {
            canReadObjectRecords: true,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        ]),
      );
      const cache = {
        getOrRecompute: jest.fn().mockResolvedValue({
          ...maps,
          flatIndexMaps: {
            byUniversalIdentifier: {},
            universalIdentifierById: {},
            universalIdentifiersByApplicationId: {},
          },
          featureFlagsMap: {},
          rolesPermissions: { [callerRoleId]: permissions },
          userWorkspaceRoleMap: { [userWorkspaceId]: callerRoleId },
          apiKeyRoleMap: {},
          flatRowLevelPermissionPredicateMaps: {
            byUniversalIdentifier: {
              accountUsernameCanonical: {
                id: 'accountUsernameCanonical',
                roleId: callerRoleId,
                objectMetadataId: '2d357469-831a-4629-ad4b-47335900e883',
                fieldMetadataId:
                  '2d357469-831a-4629-ad4b-47335900e883-username',
                operand: 'IS',
                value: ['canonical-account'],
                workspaceMemberFieldMetadataId: null,
                workspaceMemberSubFieldName: null,
                rowLevelPermissionPredicateGroupId: null,
                subFieldName: null,
                deletedAt: null,
              },
            },
            universalIdentifierById: {},
            universalIdentifiersByApplicationId: {},
          },
          flatRowLevelPermissionPredicateGroupMaps: {
            byUniversalIdentifier: {},
            universalIdentifierById: {},
            universalIdentifiersByApplicationId: {},
          },
          ORMEntityMetadatas: globalWorkspaceDataSource.entityMetadatas,
        }),
      };
      globalWorkspaceOrmManager = new GlobalWorkspaceOrmManager(
        {
          getGlobalWorkspaceDataSource: jest
            .fn()
            .mockResolvedValue(globalWorkspaceDataSource),
          getGlobalWorkspaceDataSourceReplica: jest
            .fn()
            .mockResolvedValue(globalWorkspaceDataSource),
        } as never,
        cache as never,
      );
    }, 30000);

    beforeEach(() => {
      providerClient = Object.fromEntries(
        ['getChat', 'listChats', 'sendMessage', 'startChat'].map((method) => [
          method,
          jest.fn(() => {
            throw new Error(`provider ${method} must not run`);
          }),
        ]),
      );
      budgetService = {
        reserve: jest.fn().mockResolvedValue({
          status: 'BLOCKED',
          code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
          hourlyUsed: 1,
          hourlyLimit: 1,
          hourlyRemaining: 0,
          dailyUsed: 1,
          dailyLimit: 1,
          dailyRemaining: 0,
          blockedWindows: ['HOURLY'],
          nextEligibleAt: new Date('2026-09-05T13:00:00.000Z'),
        }),
      };
      actionApprovalService = {
        getApprovedBinding: jest.fn(),
        findExecutionReceiptForBinding: jest.fn().mockResolvedValue(null),
        reserveExecutionForBinding: jest.fn().mockResolvedValue({
          created: true,
          receipt: {
            id: receiptId,
            state: ActionExecutionReceiptState.PROCESSING,
          },
        }),
        recordProviderAccepted: jest.fn(),
        recordProviderTerminalState: jest.fn(),
      };
      const bindings = new WorkspaceScopedRepository(
        coreDataSource.getRepository('bindingFixture') as never,
      );
      authorityReader = new LegacyReceiptAuthorityReaderFixture(
        coreDataSource.getRepository('workspaceFixture') as never,
        globalWorkspaceOrmManager,
        bindings as never,
        coreDataSource.getRepository('objectMetadataFixture') as never,
        providerClient as never,
      );
      recordAccess = new InstagramMessageRecordAccessService(
        globalWorkspaceOrmManager,
        bindings as never,
      );
      sendService = new InstagramMessageSendService(
        actionApprovalService as never,
        authorityReader,
        {
          withLock: jest.fn(async (_input, operation) => operation()),
        } as never,
        budgetService as never,
        providerClient as never,
        { projectReceiptWithWriter: jest.fn() } as never,
        { project: jest.fn() } as never,
        { assertCanSend: jest.fn().mockResolvedValue(undefined) } as never,
        recordAccess,
      );
    });

    const callerAuthContext = (): UserWorkspaceAuthContext => ({
      type: 'user',
      workspace: { id: isolatedWorkspaceId } as never,
      userWorkspaceId,
      workspaceMemberId: randomUUID(),
      workspaceMember: { id: randomUUID() } as never,
      user: { id: randomUUID() } as never,
    });

    it('uses real role-filtered PostgreSQL repository data, rebuilds canonical authority, and stops at BLOCKED before provider I/O', async () => {
      expect(() => globalWorkspaceDataSource.query('SELECT 1')).toThrow(
        PermissionsException,
      );
      const authority = await authorityReader.readHistoricalAuthority({
        workspaceId: isolatedWorkspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        draftId: canonicalDraftId,
        expectedRevision: 1,
      });
      actionApprovalService.getApprovedBinding.mockResolvedValue(
        authority.expectedActionBinding,
      );
      await globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        await expect(
          sendService.executeApproved({
            workspaceId: isolatedWorkspaceId,
            initiatorUserWorkspaceId: userWorkspaceId,
            approvalBindingId,
            threadId: null,
            interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
            interactionContextId: canonicalDraftId,
            rolePermissionConfig: isolatedRolePermissionConfig,
          }),
        ).resolves.toMatchObject({ status: 'BLOCKED', receiptId });
      }, callerAuthContext());
      expect(budgetService.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          instagramAccountRecordId: canonicalInstagramAccountId,
        }),
      );
      expect(
        actionApprovalService.reserveExecutionForBinding.mock
          .invocationCallOrder[0],
      ).toBeLessThan(budgetService.reserve.mock.invocationCallOrder[0]);
      expect(
        (
          await executeFixtureSql(
            client,
            `SELECT id FROM "${workspaceSchema}"."_myahInstagramAccount" WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL AND "unipileAccountId" IS NOT NULL`,
          )
        ).rows,
      ).toHaveLength(2);
      Object.values(providerClient).forEach((method) =>
        expect(method).not.toHaveBeenCalled(),
      );
    });

    it('returns account unavailable when the role-readable denied draft points to the real policy-hidden account', async () => {
      const exists = await executeFixtureSql(
        client,
        `SELECT id FROM "${workspaceSchema}"."_myahInstagramAccount" WHERE id = $1 AND "status" = 'ACTIVE' AND "deletedAt" IS NULL AND "unipileAccountId" IS NOT NULL`,
        [deniedInstagramAccountId],
      );
      expect(exists.rows).toHaveLength(1);
      await globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        await expect(
          recordAccess.assertCanExecuteDraft({
            workspaceId: isolatedWorkspaceId,
            draftId: deniedDraftId,
            rolePermissionConfig: isolatedRolePermissionConfig,
          }),
        ).rejects.toThrow('Instagram account is unavailable');
      }, callerAuthContext());
      expect(budgetService.reserve).not.toHaveBeenCalled();
      expect(
        actionApprovalService.reserveExecutionForBinding,
      ).not.toHaveBeenCalled();
      Object.values(providerClient).forEach((method) =>
        expect(method).not.toHaveBeenCalled(),
      );
    });

    afterAll(async () => {
      try {
        if (globalWorkspaceDataSource?.isInitialized)
          await globalWorkspaceDataSource.destroy();
        if (coreDataSource?.isInitialized) await coreDataSource.destroy();
      } finally {
        if (client) {
          try {
            if (
              typeof workspaceSchema === 'string' &&
              identifierPattern.test(workspaceSchema)
            )
              await executeFixtureSql(
                client,
                `DROP SCHEMA IF EXISTS "${workspaceSchema}" CASCADE`,
              );
            if (
              typeof coreSchema === 'string' &&
              identifierPattern.test(coreSchema)
            )
              await executeFixtureSql(
                client,
                `DROP SCHEMA IF EXISTS "${coreSchema}" CASCADE`,
              );
          } finally {
            await client.end();
          }
        }
      }
    });
  },
);
