import { ForbiddenException } from '@nestjs/common';

import { DataSource, EntitySchema } from 'typeorm';
import { EntityMetadataNotFoundError } from 'typeorm/error/EntityMetadataNotFoundError';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const rolePermissionConfig = { unionOf: ['role-id'] };

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
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

const workspace = { id: '00000000-0000-4000-8000-000000000001' };
const authContext = {
  type: 'user',
  workspace,
  userWorkspaceId: '00000000-0000-4000-8000-000000000002',
  workspaceMemberId: '00000000-0000-4000-8000-000000000003',
  user: { id: 'user-id' },
} as unknown as UserWorkspaceAuthContext;

const sources = [
  ['messageThread', 'message_thread', 'messageThread'],
  ['myahSocialConversation', 'social_conversation', '_myahSocialConversation'],
  ['myahSocialMessage', 'social_message', '_myahSocialMessage'],
] as const;

const restrictionId = '00000000-0000-4000-8000-000000000004';
const workspaceSchemaName = getWorkspaceSchemaName(workspace.id);

// Captured from the TypeORM serializer used by WorkspaceRepository. The schema
// is workspace-scoped; no workspace predicate or parameter is expected.
const canonicalUnrestrictedReadFixtures = Object.fromEntries(
  sources.map(([objectName, alias, tableName]) => [
    objectName,
    `SELECT "${alias}"."id" AS "${alias}_id" FROM "${workspaceSchemaName}"."${tableName}" "${alias}"`,
  ]),
) as Record<(typeof sources)[number][0], string>;

type CapabilityService = {
  assertRead: (input: {
    authContext: UserWorkspaceAuthContext;
  }) => Promise<void>;
  assertWrite: (input: {
    authContext: UserWorkspaceAuthContext;
  }) => Promise<void>;
};
type CapabilityServiceConstructor = new (...args: never[]) => CapabilityService;

const loadService = (): CapabilityServiceConstructor | undefined => {
  try {
    return require('../myah-inbox-triage-capability.service')
      .MyahInboxTriageCapabilityService as CapabilityServiceConstructor;
  } catch {
    return undefined;
  }
};

const dataSource = new DataSource({
  type: 'postgres',
  host: 'unused',
  port: 5432,
  username: 'unused',
  password: 'unused',
  database: 'unused',
  entities: sources.map(
    ([objectName, , tableName]) =>
      new EntitySchema({
        name: objectName,
        schema: workspaceSchemaName,
        tableName,
        columns: {
          id: { type: 'uuid', primary: true },
          deletedAt: { type: 'timestamptz', nullable: true },
          ownerId: { type: 'uuid', nullable: true },
        },
      }),
  ),
});

const buildHarness = (
  restrictedObject?: (typeof sources)[number][0],
  validationErrors?: Partial<Record<(typeof sources)[number][0], Error>>,
  duplicateDeletedAtPredicate = false,
  hasHiddenParticipatingEmail = false,
) => {
  const getRepository = jest.fn(
    async (_workspaceId: string, object: string) => {
      const repository = dataSource.getRepository(object);

      return {
        createQueryBuilder: jest.fn((alias: string) => {
          const builder = repository.createQueryBuilder(alias);
          (
            builder as typeof builder & {
              validatePermissionsBeforeSerialization: () => void;
            }
          ).validatePermissionsBeforeSerialization = jest.fn(() => {
            const validationError =
              validationErrors?.[object as (typeof sources)[number][0]];

            if (validationError) {
              throw validationError;
            }
            if (duplicateDeletedAtPredicate) {
              builder.andWhere(`("${alias}"."deletedAt" IS NULL)`);
            }
            if (object === restrictedObject) {
              builder.andWhere(`${alias}."ownerId" = :ownerId`, {
                ownerId: restrictionId,
              });
            }
          });

          return builder;
        }),
      };
    },
  );
  const Service = loadService();

  expect(Service).toBeDefined();

  const query = jest.fn().mockResolvedValue([{ hasHiddenParticipatingEmail }]);
  const getGlobalWorkspaceDataSource = jest.fn().mockResolvedValue({ query });

  return {
    getRepository,
    getGlobalWorkspaceDataSource,
    query,
    service: new Service!({
      getRepository,
      getGlobalWorkspaceDataSource,
    } as never),
  };
};

describe('MyahInboxTriageCapabilityService', () => {
  beforeAll(async () => {
    await (
      dataSource as unknown as { buildMetadatas: () => Promise<void> }
    ).buildMetadatas();
  });

  it('accepts canonical unrestricted production serializer fixtures without UPDATE permission', async () => {
    for (const [objectName, alias] of sources) {
      const [sql, parameters] = dataSource
        .getRepository(objectName)
        .createQueryBuilder(alias)
        .select(`${alias}.id`)
        .where(`${alias}."deletedAt" IS NULL`)
        .getQueryAndParameters();

      expect(sql.replace(` WHERE ${alias}."deletedAt" IS NULL`, '')).toBe(
        canonicalUnrestrictedReadFixtures[objectName],
      );
      expect(parameters).toEqual([]);
    }

    const harness = buildHarness();

    await expect(
      harness.service.assertRead({ authContext }),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.assertWrite({ authContext }),
    ).resolves.toBeUndefined();
    expect(harness.getRepository).toHaveBeenCalledTimes(6);
    expect(canonicalUnrestrictedReadFixtures).toEqual({
      messageThread: expect.stringContaining('"messageThread"'),
      myahSocialConversation: expect.stringContaining(
        '"_myahSocialConversation"',
      ),
      myahSocialMessage: expect.stringContaining('"_myahSocialMessage"'),
    });
  });

  it('accepts duplicate explicit and TypeORM DeleteDateColumn predicates without changing capability scope', async () => {
    const harness = buildHarness(undefined, undefined, true);

    await expect(
      harness.service.assertRead({ authContext }),
    ).resolves.toBeUndefined();
  });

  it('still rejects a visibility predicate and parameter after normalizing duplicate deletedAt predicates', async () => {
    const harness = buildHarness('messageThread', undefined, true);

    await expect(harness.service.assertRead({ authContext })).rejects.toEqual(
      expect.any(ForbiddenException),
    );
  });

  it.each(sources)(
    'rejects the production serializer restricted READ fixture for %s',
    async (object, alias) => {
      const [sql, parameters] = dataSource
        .getRepository(object)
        .createQueryBuilder(alias)
        .select(`${alias}.id`)
        .where(`${alias}."deletedAt" IS NULL`)
        .andWhere(`${alias}."ownerId" = :ownerId`, { ownerId: restrictionId })
        .getQueryAndParameters();

      expect(sql).toBe(
        `${canonicalUnrestrictedReadFixtures[object]} WHERE ${alias}."deletedAt" IS NULL AND ${alias}."ownerId" = $1`,
      );
      expect(parameters).toEqual([restrictionId]);

      const harness = buildHarness(object);

      await expect(harness.service.assertRead({ authContext })).rejects.toEqual(
        expect.any(ForbiddenException),
      );
    },
  );

  it('fails closed when another user owns a private participating Email channel despite unrestricted object reads', async () => {
    const harness = buildHarness(undefined, undefined, false, true);

    await expect(
      harness.service.assertRead({ authContext }),
    ).rejects.toMatchObject({
      message: 'Triage is unavailable with your current Inbox access',
      status: 403,
    });
    expect(harness.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
  });

  it('uses the message-level maximum channel access rule, so a mixed private and shared association remains fully readable', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.assertRead({ authContext }),
    ).resolves.toBeUndefined();

    expect(harness.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
    expect(harness.query.mock.calls[0][0]).toContain(
      'GROUP BY association."messageId"',
    );
    expect(harness.query.mock.calls[0][0]).toContain('HAVING NOT BOOL_OR(');
    expect(harness.query.mock.calls[0][0]).toContain(
      '"myahInboxTriageEmailChannelProvenance"',
    );
  });

  it('translates production permission denial during serialization to generic triage unavailability', async () => {
    const harness = buildHarness(undefined, {
      messageThread: new PermissionsException(
        'source object read denied',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    });

    await expect(
      harness.service.assertRead({ authContext }),
    ).rejects.toMatchObject({
      message: 'Triage is unavailable with your current Inbox access',
      status: 403,
    });
  });

  it('translates the production missing-source-metadata error to generic triage unavailability', async () => {
    const harness = buildHarness(undefined, {
      myahSocialConversation: new EntityMetadataNotFoundError(
        'myahSocialConversation',
      ),
    });

    await expect(
      harness.service.assertRead({ authContext }),
    ).rejects.toMatchObject({
      message: 'Triage is unavailable with your current Inbox access',
      status: 403,
    });
  });

  it('rethrows unexpected serialization failures', async () => {
    const unexpectedError = new Error('workspace repository unavailable');
    const harness = buildHarness(undefined, {
      messageThread: unexpectedError,
    });

    await expect(harness.service.assertRead({ authContext })).rejects.toBe(
      unexpectedError,
    );
  });

  it('rejects non-user auth before resolving any source repository', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.assertRead({
        authContext: { ...authContext, type: 'apiKey' } as never,
      }),
    ).rejects.toEqual(expect.any(ForbiddenException));
    expect(harness.getRepository).not.toHaveBeenCalled();
  });
});
