import { Client } from 'pg';
import { DataSource, EntitySchema } from 'typeorm';
import { GraphQLString } from 'graphql';

import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/repository/workspace-select-query-builder';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  decodeMyahInboxInstagramMessageCursor,
  encodeMyahInboxInstagramMessageCursor,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-cursor.util';

const rolePermissionConfig = { unionOf: ['role-id'] };
const mockResolveRolePermissionConfig = jest.fn(
  (): unknown => rolePermissionConfig,
);

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: mockResolveRolePermissionConfig,
  }),
);

// This opt-in fixture only accepts the dedicated local PostgreSQL container.
const postgresUrl = process.env.MYAH_INBOX_TEST_POSTGRES_URL;
const describePostgres = postgresUrl ? describe : describe.skip;

const workspaceId = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000002';
const otherConversationId = '00000000-0000-4000-8000-000000000003';
const workspace = { id: workspaceId } as WorkspaceEntity;
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: '00000000-0000-4000-8000-000000000004',
  workspaceMemberId: '00000000-0000-4000-8000-000000000005',
  user: { id: 'user-id' },
} as unknown as UserWorkspaceAuthContext;

type InstagramService = {
  listMessages: (input: Record<string, unknown>) => Promise<{
    edges: { cursor: string; node: { id: string } }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }>;
};

type InstagramServiceConstructor = new (...args: never[]) => InstagramService;

const loadService = (): InstagramServiceConstructor | undefined => {
  try {
    return require('../myah-inbox-instagram-message-query.service')
      .MyahInboxInstagramMessageQueryService as InstagramServiceConstructor;
  } catch {
    return undefined;
  }
};

const messageId = (sequence: number) =>
  `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;

const row = (
  sequence: number,
  effectiveTimestamp: string,
  providerCreatedAt: string | null = effectiveTimestamp,
) => ({
  id: messageId(sequence),
  text: `message-${sequence}`,
  direction: 'INBOUND',
  sentVia: 'UNIPILE',
  provider: 'UNIPILE',
  deliveryState: 'RECEIVED',
  providerCreatedAt,
  createdAt: effectiveTimestamp,
  hasAttachments: false,
  attachmentCount: 0,
  effectiveTimestamp,
  effectiveCursorTimestamp: effectiveTimestamp,
});

const createNativePermissionContext = (
  objectName: string,
  fieldNames: string[],
  restrictedFields: Record<string, { canRead: boolean }> = {},
  canReadObjectRecords = true,
) => {
  const objectId = `${objectName}-object`;
  const fieldMetadata = Object.fromEntries(
    fieldNames.map((name) => [
      `${objectName}-${name}`,
      {
        id: `${objectName}-${name}`,
        name,
        type: name === 'workspaceId' ? 'UUID' : 'TEXT',
        objectMetadataId: objectId,
        isActive: true,
        isSystem: false,
        settings: null,
      },
    ]),
  );
  const fieldsByName = Object.fromEntries(
    fieldNames.map((name) => [name, `${objectName}-${name}`]),
  );
  const workspaceIdFieldId = fieldsByName.workspaceId;

  return {
    internalContext: {
      workspaceId,
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          [objectId]: {
            id: objectId,
            nameSingular: objectName,
            isSystem: false,
            fieldIds: Object.values(fieldsByName),
          },
        },
        universalIdentifierById: { [objectId]: objectId },
        universalIdentifiersByApplicationId: {},
      },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: fieldMetadata,
        universalIdentifierById: Object.fromEntries(
          Object.entries(fieldsByName).map(([, id]) => [id, id]),
        ),
        universalIdentifiersByApplicationId: {},
      },
      flatRowLevelPermissionPredicateMaps: {
        byUniversalIdentifier: workspaceIdFieldId
          ? {
              [`${objectName}-workspace-filter`]: {
                id: `${objectName}-workspace-filter`,
                roleId: 'role-id',
                objectMetadataId: objectId,
                fieldMetadataId: workspaceIdFieldId,
                operand: 'IS',
                value: workspaceId,
                workspaceMemberFieldMetadataId: null,
                workspaceMemberSubFieldName: null,
                rowLevelPermissionPredicateGroupId: null,
                subFieldName: null,
                deletedAt: null,
              },
            }
          : {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      flatRowLevelPermissionPredicateGroupMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      flatIndexMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      objectIdByNameSingular: { [objectName]: objectId },
      userWorkspaceRoleMap: { [userAuthContext.userWorkspaceId]: 'role-id' },
      apiKeyRoleMap: {},
    },
    permissions: {
      [objectId]: {
        canReadObjectRecords,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields,
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      },
    },
  };
};

const nativeEntity = (
  name: string,
  fields: string[],
  tableName = `${name}_fixture`,
) =>
  new EntitySchema({
    name,
    tableName,
    schema: 'pg_temp',
    columns: Object.fromEntries(
      fields.map((field) => [
        field,
        {
          type: field === 'attachmentCount' ? 'integer' : 'text',
          primary: field === 'id',
          nullable: field !== 'id',
        },
      ]),
    ),
  });

const conversationFields = ['id', 'workspaceId', 'deletedAt'];
const messageFields = [
  'id',
  'conversationId',
  'text',
  'direction',
  'sentVia',
  'provider',
  'deliveryState',
  'providerCreatedAt',
  'createdAt',
  'hasAttachments',
  'attachmentCount',
  'workspaceId',
  'deletedAt',
];

const buildHarness = (pages: unknown[][]) => {
  const query = jest.fn();
  const builders: Record<string, jest.Mock> = {};
  const createQueryBuilder = (objectName: string) => {
    const builder = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      validatePermissionsBeforeSerialization: jest.fn(),
      getQueryAndParameters: jest
        .fn()
        .mockReturnValue([`SELECT * FROM readable_${objectName}`, []]),
    };
    builder.select.mockReturnValue(builder);
    builder.addSelect.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builders[objectName] = builder.validatePermissionsBeforeSerialization;

    return builder;
  };
  const getRepository = jest.fn(async (_workspaceId, objectName: string) => ({
    createQueryBuilder: jest.fn(() => createQueryBuilder(objectName)),
  }));
  query.mockImplementation(async () => pages.shift() ?? []);
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getRepository,
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
  };
  const Service = loadService();

  expect(Service).toBeDefined();

  return {
    builders,
    getRepository,
    query,
    service: new Service!(globalWorkspaceOrmManager as never),
  };
};

const request = (overrides: Record<string, unknown> = {}) => ({
  conversationId,
  first: 100,
  authContext: userAuthContext,
  user: userAuthContext.user,
  workspace,
  ...overrides,
});

describe('MyahInboxInstagramMessageQueryService', () => {
  beforeEach(() => {
    mockResolveRolePermissionConfig.mockReturnValue(rolePermissionConfig);
  });

  it('pages more than 100 permission-serialized messages by effective provider/local time with no gaps or duplicates', async () => {
    const newestPage = Array.from({ length: 101 }, (_, index) =>
      row(
        202 - index,
        new Date(
          Date.parse('2026-09-05T23:59:00.000Z') - index * 60_000,
        ).toISOString(),
      ),
    );
    const oldestPage = Array.from({ length: 2 }, (_, index) =>
      row(index + 1, `2026-09-01T00:0${index}:00.000Z`),
    );
    const harness = buildHarness([newestPage, oldestPage]);

    const first = await harness.service.listMessages(request());
    const second = await harness.service.listMessages(
      request({ after: first.pageInfo.endCursor }),
    );
    const mergedIds = [...first.edges, ...second.edges].map(
      ({ node }) => node.id,
    );

    expect(first.edges).toHaveLength(100);
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(second.edges).toHaveLength(2);
    expect(new Set(mergedIds).size).toBe(102);
    expect(harness.query.mock.calls[0][0]).toContain(
      'ORDER BY COALESCE(message."providerCreatedAt", message."createdAt") DESC, message.id DESC',
    );
    expect(harness.query.mock.calls[1][0]).toContain(
      'COALESCE(message."providerCreatedAt", message."createdAt"), message.id) <',
    );
    expect(harness.builders.myahSocialConversation).toHaveBeenCalledTimes(1);
    expect(harness.builders.myahSocialMessage).toHaveBeenCalledTimes(1);
  });

  it('normalizes PostgreSQL Date timestamps before GraphQL String serialization', async () => {
    const timestamp = new Date('2026-09-05T12:00:00.000Z');
    const dateRow = {
      ...row(12, timestamp.toISOString(), null),
      providerCreatedAt: timestamp,
      createdAt: timestamp,
      effectiveTimestamp: timestamp,
    };
    const harness = buildHarness([[dateRow]]);

    const page = await harness.service.listMessages(request({ first: 1 }));
    const message = page.edges[0].node as unknown as {
      providerCreatedAt: unknown;
      createdAt: unknown;
    };

    expect(GraphQLString.serialize(message.providerCreatedAt)).toBe(
      '2026-09-05T12:00:00.000Z',
    );
    expect(GraphQLString.serialize(message.createdAt)).toBe(
      '2026-09-05T12:00:00.000Z',
    );
  });

  it('uses createdAt fallback and ID ties in the opaque cursor', async () => {
    const tiedTimestamp = '2026-09-05T12:00:00.000Z';
    const harness = buildHarness([
      [row(12, tiedTimestamp, null), row(11, tiedTimestamp)],
    ]);

    const page = await harness.service.listMessages(request({ first: 2 }));

    expect(
      decodeMyahInboxInstagramMessageCursor(page.edges[0].cursor, {
        workspaceId,
        conversationId,
      }),
    ).toEqual({ effectiveTimestamp: tiedTimestamp, messageId: messageId(12) });
    expect(page.edges.map(({ node }) => node.id)).toEqual([
      messageId(12),
      messageId(11),
    ]);
  });

  it('rejects cursor conversation mismatches before issuing a readable query', async () => {
    const harness = buildHarness([[]]);
    const cursor = encodeMyahInboxInstagramMessageCursor({
      workspaceId,
      conversationId: otherConversationId,
      effectiveTimestamp: '2026-09-05T12:00:00.000Z',
      messageId: messageId(1),
    });

    await expect(
      harness.service.listMessages(request({ after: cursor })),
    ).rejects.toThrow('Invalid Myah inbox Instagram message cursor');
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('denies reads without a resolved role permission configuration', async () => {
    mockResolveRolePermissionConfig.mockReturnValue(null);
    const harness = buildHarness([[]]);

    await expect(harness.service.listMessages(request())).rejects.toThrow(
      'Inbox role permissions are required',
    );
    expect(harness.query).not.toHaveBeenCalled();
  });
});

describePostgres(
  'MyahInboxInstagramMessageQueryService (rolled-back PostgreSQL)',
  () => {
    let client: Client;
    let fixtureDataSource: DataSource;

    beforeEach(() => {
      mockResolveRolePermissionConfig.mockReturnValue(rolePermissionConfig);
    });

    beforeAll(async () => {
      const endpoint = new URL(postgresUrl!);
      if (
        endpoint.hostname !== '127.0.0.1' ||
        endpoint.port !== '15432' ||
        endpoint.pathname !== '/default' ||
        endpoint.search ||
        endpoint.hash ||
        !['postgres:', 'postgresql:'].includes(endpoint.protocol)
      ) {
        throw new Error(
          'Instagram Inbox test database endpoint is not allowlisted',
        );
      }
      client = new Client({
        connectionString: postgresUrl,
        statement_timeout: 5000,
      });
      await client.connect();
      const database = await client.query<{ database: string; user: string }>(
        'SELECT current_database() AS database, current_user AS user',
      );
      if (database.rows[0]?.database !== 'default' || !database.rows[0]?.user) {
        throw new Error('Instagram Inbox test database is not allowlisted');
      }
      await client.query('BEGIN');
      fixtureDataSource = new DataSource({
        type: 'postgres',
        entities: [
          nativeEntity(
            'myahSocialConversation',
            conversationFields,
            'ig_conversation_fixture',
          ),
          nativeEntity(
            'myahSocialMessage',
            messageFields,
            'ig_message_fixture',
          ),
        ],
      });
      await (
        fixtureDataSource as unknown as {
          buildMetadatas: () => Promise<void>;
        }
      ).buildMetadatas();
      await client.query(`CREATE TEMP TABLE ig_conversation_fixture (
      id uuid, "workspaceId" uuid, readable boolean DEFAULT TRUE, "deletedAt" timestamptz
    ) ON COMMIT DROP;
    CREATE TEMP TABLE ig_message_fixture (
      id uuid, "workspaceId" uuid, "conversationId" uuid, text text, direction text,
      "sentVia" text, provider text, "deliveryState" text, "providerCreatedAt" timestamptz,
      "createdAt" timestamptz, "hasAttachments" boolean, "attachmentCount" integer,
      readable boolean DEFAULT TRUE, "deletedAt" timestamptz
    ) ON COMMIT DROP;
    INSERT INTO ig_conversation_fixture VALUES
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',TRUE,NULL),
      ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',TRUE,NULL),
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000099',TRUE,NULL);
    INSERT INTO ig_message_fixture
      SELECT ('00000000-0000-4000-8000-' || lpad((i + 100)::text,12,'0'))::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid,
        '00000000-0000-4000-8000-000000000002'::uuid, 'message-' || i, 'INBOUND',
        'UNIPILE', 'UNIPILE', 'RECEIVED',
        CASE WHEN i = 50 THEN NULL ELSE '2026-09-05T12:00:00Z'::timestamptz - i * interval '1 minute' END,
        '2026-09-01T00:00:00Z'::timestamptz + i * interval '1 minute', FALSE, 0, TRUE, NULL
      FROM generate_series(1,105) i;
    INSERT INTO ig_message_fixture VALUES
      ('00000000-0000-4000-8000-000000009800','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','microsecond-boundary-newer','INBOUND','UNIPILE','UNIPILE','RECEIVED','2026-09-05T10:21:00.000900Z','2026-09-01T00:00:00Z',FALSE,0,TRUE,NULL),
      ('00000000-0000-4000-8000-000000009799','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','microsecond-boundary-older','INBOUND','UNIPILE','UNIPILE','RECEIVED','2026-09-05T10:21:00.000800Z','2026-09-01T00:00:00Z',FALSE,0,TRUE,NULL),
      ('00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','tie-high','INBOUND','UNIPILE','UNIPILE','RECEIVED','2026-09-06T00:00:00Z','2026-09-01T00:00:00Z',FALSE,0,TRUE,NULL),
      ('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','tie-low','INBOUND','UNIPILE','UNIPILE','RECEIVED','2026-09-06T00:00:00Z','2026-09-01T00:00:00Z',FALSE,0,TRUE,NULL),
      ('00000000-0000-4000-8000-000000008889','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','other-conversation','INBOUND','UNIPILE','UNIPILE','RECEIVED',now(),now(),FALSE,0,TRUE,NULL),
      ('00000000-0000-4000-8000-000000008888','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000002','other-workspace','INBOUND','UNIPILE','UNIPILE','RECEIVED',now(),now(),FALSE,0,TRUE,NULL);`);
    }, 15000);
    afterAll(async () => {
      if (!client) return;
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    });

    const fixture = (denied = new Set<string>()) => {
      let statements = 0;
      const manager = {
        executeInWorkspaceContext: async (run: () => Promise<unknown>) => run(),
        getRepository: async (_workspaceId: string, object: string) => ({
          createQueryBuilder: (alias: string) => {
            const builder = fixtureDataSource
              .getRepository(object)
              .createQueryBuilder(alias);
            return Object.assign(builder, {
              validatePermissionsBeforeSerialization: () => {
                if (denied.has(`${object}.object`)) {
                  throw new PermissionsException(
                    'Fixture object denied',
                    PermissionsExceptionCode.PERMISSION_DENIED,
                  );
                }
                for (const selection of builder.expressionMap.selects) {
                  const parts = selection.selection
                    .replace(/"/g, '')
                    .split('.');
                  const field = parts[parts.length - 1];
                  if (field && denied.has(`${object}.${field}`)) {
                    throw new PermissionsException(
                      'Fixture field denied',
                      PermissionsExceptionCode.PERMISSION_DENIED,
                    );
                  }
                }
                builder.andWhere(`${alias}.readable = TRUE`);
                builder.andWhere(
                  `${alias}."workspaceId" = '00000000-0000-4000-8000-000000000001'::uuid`,
                );
              },
            });
          },
        }),
        getGlobalWorkspaceDataSource: async () => ({
          query: async (sql: string, parameters: unknown[]) => {
            statements++;
            return (await client.query(sql, parameters)).rows;
          },
        }),
      };
      const Service = loadService();
      return {
        service: new Service!(manager as never),
        statements: () => statements,
      };
    };

    it('executes the service selections through native WorkspaceSelectQueryBuilders with mapped fields, object/field denials, and row predicates', async () => {
      const permissionDataSource = new DataSource({
        type: 'postgres',
        url: postgresUrl,
        entities: [
          nativeEntity('myahSocialConversation', conversationFields),
          nativeEntity('myahSocialMessage', messageFields),
        ],
      });
      await (
        permissionDataSource as unknown as {
          buildMetadatas: () => Promise<void>;
        }
      ).buildMetadatas();

      const createManager = (
        denied: { object?: string; field?: string } = {},
      ) => {
        const contexts = {
          myahSocialConversation: createNativePermissionContext(
            'myahSocialConversation',
            conversationFields,
            {},
            denied.object !== 'myahSocialConversation',
          ),
          myahSocialMessage: createNativePermissionContext(
            'myahSocialMessage',
            messageFields,
            denied.field === 'text'
              ? { 'myahSocialMessage-text': { canRead: false } }
              : {},
            denied.object !== 'myahSocialMessage',
          ),
        };
        const query = jest.fn().mockResolvedValue([]);

        return {
          query,
          manager: {
            executeInWorkspaceContext: async (run: () => Promise<unknown>) =>
              run(),
            getRepository: async (_workspace: string, object: string) => {
              const context = contexts[object as keyof typeof contexts];
              const repository = permissionDataSource.getRepository(object);

              return {
                createQueryBuilder: (alias: string) =>
                  new WorkspaceSelectQueryBuilder(
                    repository.createQueryBuilder(alias),
                    context.permissions as never,
                    context.internalContext as never,
                    false,
                    userAuthContext,
                    {} as never,
                  ),
              };
            },
            getGlobalWorkspaceDataSource: async () => ({ query }),
          },
        };
      };

      try {
        const readable = createManager();
        const Service = loadService();
        const service = new Service!(readable.manager as never);

        await expect(service.listMessages(request())).resolves.toEqual({
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        });
        const sql = readable.query.mock.calls[0][0] as string;
        expect(sql).toContain('"message"."workspaceId"');
        expect(sql).toContain('"conversation"."workspaceId"');

        for (const denied of [
          { object: 'myahSocialConversation' },
          { object: 'myahSocialMessage' },
          { field: 'text' },
        ]) {
          const blocked = createManager(denied);
          const blockedService = new Service!(blocked.manager as never);

          await expect(
            blockedService.listMessages(request()),
          ).rejects.toBeInstanceOf(PermissionsException);
          expect(blocked.query).not.toHaveBeenCalled();
        }
      } finally {
        if (permissionDataSource.isInitialized) {
          await permissionDataSource.destroy();
        }
      }
    }, 15000);

    it('executes real PostgreSQL CTE pagination, Date hydration, fallback/ties, workspace filtering, and validator denials', async () => {
      const target = fixture();
      const first = await target.service.listMessages(request());
      const second = await target.service.listMessages(
        request({ after: first.pageInfo.endCursor }),
      );
      const expected = await client.query<{ id: string }>(
        `SELECT id FROM pg_temp.ig_message_fixture
      WHERE "workspaceId" = $1::uuid AND "conversationId" = $2::uuid AND readable
      ORDER BY COALESCE("providerCreatedAt", "createdAt") DESC, id DESC`,
        [workspaceId, conversationId],
      );
      const ids = [...first.edges, ...second.edges].map(({ node }) => node.id);
      expect(first.edges).toHaveLength(100);
      expect(second.edges).toHaveLength(9);
      expect(ids).toEqual(expected.rows.map(({ id }) => id));
      expect(new Set(ids).size).toBe(109);
      expect(ids).not.toContain('00000000-0000-4000-8000-000000008889');
      expect(ids).not.toContain('00000000-0000-4000-8000-000000008888');
      expect(ids.slice(0, 2)).toEqual([
        '00000000-0000-4000-8000-000000009001',
        '00000000-0000-4000-8000-000000009000',
      ]);
      expect(
        decodeMyahInboxInstagramMessageCursor(first.pageInfo.endCursor!, {
          workspaceId,
          conversationId,
        }),
      ).toEqual({
        effectiveTimestamp: '2026-09-05T10:21:00.000900Z',
        messageId: '00000000-0000-4000-8000-000000009800',
      });
      expect(ids).toContain('00000000-0000-4000-8000-000000009799');
      const fallback = [...first.edges, ...second.edges].find(
        ({ node }) => node.id === '00000000-0000-4000-8000-000000000150',
      )!.node as unknown as {
        providerCreatedAt: string | null;
        createdAt: string;
      };
      expect(fallback).toEqual(
        expect.objectContaining({
          providerCreatedAt: null,
          createdAt: '2026-09-01T00:50:00.000Z',
        }),
      );
      expect(GraphQLString.serialize(fallback.createdAt)).toBe(
        fallback.createdAt,
      );
      expect(target.statements()).toBe(2);
      for (const denial of [
        'myahSocialConversation.object',
        'myahSocialMessage.text',
      ]) {
        const denied = fixture(new Set([denial]));
        await expect(
          denied.service.listMessages(request()),
        ).rejects.toBeInstanceOf(PermissionsException);
        expect(denied.statements()).toBe(0);
      }
      await client.query(`UPDATE pg_temp.ig_message_fixture SET readable = FALSE
      WHERE id = '00000000-0000-4000-8000-000000000205'::uuid`);
      const filtered = await fixture().service.listMessages(request());
      expect(filtered.edges.map(({ node }) => node.id)).not.toContain(
        '00000000-0000-4000-8000-000000000205',
      );
    });
  },
);
