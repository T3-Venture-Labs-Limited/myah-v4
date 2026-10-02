import { Client } from 'pg';
import { DataSource, EntitySchema } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { type SocialProfileRecord } from 'src/modules/myah-creator-social-profile/types/social-profile-record.type';

// Diagnostic only: no service mutation, no fixture setup, and every PG connection
// defaults to read-only. The cache below is derived from the owned database's
// metadata and Tim's role, not from the in-memory fixture in postgres.spec.ts.
const databaseUrl = process.env.MYAH_409_ISOLATED_PG_DATABASE_URL;
const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-9e3b-46d4-a556-88b9ddc2b035';
const targetId = 'c90a05d6-2eef-4046-9d90-395de47e75f4';
const expectedDatabase = 'myah_409_social_profiles_20260923_205615f0f1';
const schema = getWorkspaceSchemaName(workspaceId);
const readOnly = { options: '-c default_transaction_read_only=on' };

it('reads the task profile through the permission-aware repository under the seeded Tim role', async () => {
  expect(process.env.PG_DATABASE_URL).toBeUndefined();
  expect(databaseUrl).toBeDefined();
  const endpoint = new URL(databaseUrl!);
  expect(endpoint.protocol).toMatch(/^postgres(ql)?:$/);
  expect(['127.0.0.1', 'localhost']).toContain(endpoint.hostname);
  expect(endpoint.port).toBe('5432');
  expect(endpoint.pathname).toBe(`/${expectedDatabase}`);
  expect(endpoint.username).toBe('postgres');
  expect(endpoint.search).toBe('');
  expect(endpoint.hash).toBe('');

  const client = new Client({ connectionString: databaseUrl, ...readOnly });
  let core: DataSource | undefined;
  let workspace: GlobalWorkspaceDataSource | undefined;
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS db, current_user AS usr, pg_is_in_recovery() AS recovery, current_setting('default_transaction_read_only') AS readonly",
    );
    expect(identity.rows).toEqual([
      {
        db: expectedDatabase,
        usr: 'postgres',
        recovery: false,
        readonly: 'on',
      },
    ]);
    const physical = await client.query(
      `SELECT "platformAccountId" IS NULL AS "idNull", "followerCount" IS NULL AS "countNull"
       FROM workspace_1wgvd1injqtife6y4rvfbu3h5."socialProfile" WHERE id=$1`,
      [targetId],
    );
    expect(physical.rows).toEqual([{ idNull: true, countNull: true }]);
    const roleRows = await client.query(
      `SELECT r.id AS "roleId", r."canReadAllObjectRecords" AS "readAll",
              r."canUpdateAllObjectRecords" AS "updateAll", o.id AS "objectId",
              o."universalIdentifier" AS "objectUniversalId", op."canReadObjectRecords" AS "readOverride",
              op."canUpdateObjectRecords" AS "updateOverride"
       FROM core."userWorkspace" uw
       JOIN core."roleTarget" rt ON rt."userWorkspaceId"=uw.id
       JOIN core.role r ON r.id=rt."roleId"
       JOIN core."objectMetadata" o ON o."workspaceId"=uw."workspaceId" AND o."nameSingular"='socialProfile'
       LEFT JOIN core."objectPermission" op ON op."objectMetadataId"=o.id AND op."roleId"=r.id
       WHERE uw.id=$1 AND uw."workspaceId"=$2`,
      [userWorkspaceId, workspaceId],
    );
    expect(roleRows.rows).toHaveLength(1);
    const role = roleRows.rows[0];
    const fields = await client.query(
      `SELECT id, "universalIdentifier", name, type, "isActive", "isSystem", settings,
              "relationTargetObjectMetadataId", "relationTargetFieldMetadataId"
       FROM core."fieldMetadata" WHERE "objectMetadataId"=$1`,
      [role.objectId],
    );
    const creatorMetadata = await client.query(
      `SELECT id, "universalIdentifier" FROM core."objectMetadata"
       WHERE "workspaceId"=$1 AND "nameSingular"='creator'`,
      [workspaceId],
    );
    expect(creatorMetadata.rows).toHaveLength(1);
    const creator = creatorMetadata.rows[0];
    const restrictions = await client.query(
      `SELECT f.name, p."canReadFieldValue" AS "canRead", p."canUpdateFieldValue" AS "canUpdate"
       FROM core."fieldPermission" p JOIN core."fieldMetadata" f ON f.id=p."fieldMetadataId"
       WHERE p."roleId"=$1 AND p."objectMetadataId"=$2`,
      [role.roleId, role.objectId],
    );
    const rls = await client.query(
      `SELECT count(*)::int AS count FROM core."rowLevelPermissionPredicate"
       WHERE "roleId"=$1 AND "objectMetadataId"=$2`,
      [role.roleId, role.objectId],
    );
    expect(rls.rows[0]?.count).toBe(0);
    const fieldById = Object.fromEntries(
      fields.rows.map((field) => [
        field.id,
        { ...field, objectMetadataId: role.objectId },
      ]),
    );
    expect(
      fields.rows.find(({ name }) => name === 'platformAccountId')?.type,
    ).toBe('TEXT');
    expect(restrictions.rows.every((r) => r.canRead !== false)).toBe(true);
    const restrictedFields = Object.fromEntries(
      restrictions.rows.map((r) => [
        r.name,
        { canRead: r.canRead, canUpdate: r.canUpdate },
      ]),
    );
    const objectPermissions = {
      canReadObjectRecords: role.readOverride ?? role.readAll,
      canUpdateObjectRecords: role.updateOverride ?? role.updateAll,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      restrictedFields,
      rowLevelPermissionPredicates: [],
      rowLevelPermissionPredicateGroups: [],
    };
    expect(objectPermissions.canReadObjectRecords).toBe(true);

    const entity = new EntitySchema({
      name: 'socialProfile',
      schema,
      tableName: 'socialProfile',
      columns: {
        id: { type: 'uuid', primary: true },
        createdAt: { type: 'timestamptz' },
        updatedAt: { type: 'timestamptz' },
        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
        name: { type: 'text' },
        platform: { type: 'text' },
        handle: { type: 'text', nullable: true },
        profileUrl: { type: 'text', nullable: true },
        normalizedLocator: { type: 'text', nullable: true },
        platformAccountId: { type: 'text', nullable: true },
        followerCount: { type: 'float', nullable: true },
        followerCountObservedAt: { type: 'timestamptz', nullable: true },
        followerCountSource: { type: 'text', nullable: true },
        creatorId: { type: 'uuid', nullable: true },
      },
    });
    core = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [],
      extra: readOnly,
    });
    await core.initialize();
    workspace = new GlobalWorkspaceDataSource(
      {
        type: 'postgres',
        url: databaseUrl,
        schema,
        entities: [entity],
        extra: readOnly,
      },
      { emitDatabaseBatchEvent: jest.fn() } as never,
      core,
    );
    await workspace.initialize();
    const cache = {
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          [role.objectUniversalId]: {
            id: role.objectId,
            universalIdentifier: role.objectUniversalId,
            nameSingular: 'socialProfile',
            isSystem: false,
            fieldIds: fields.rows.map((f) => f.id),
          },
          [creator.universalIdentifier]: {
            id: creator.id,
            universalIdentifier: creator.universalIdentifier,
            nameSingular: 'creator',
            isSystem: false,
            fieldIds: [],
          },
        },
        universalIdentifierById: {
          [role.objectId]: role.objectUniversalId,
          [creator.id]: creator.universalIdentifier,
        },
        universalIdentifiersByApplicationId: {},
      },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: Object.fromEntries(
          fields.rows.map((f) => [f.universalIdentifier, fieldById[f.id]]),
        ),
        universalIdentifierById: Object.fromEntries(
          fields.rows.map((f) => [f.id, f.universalIdentifier]),
        ),
        universalIdentifiersByApplicationId: {},
      },
      flatIndexMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      featureFlagsMap: {},
      rolesPermissions: {
        [role.roleId]: { [role.objectId]: objectPermissions },
      },
      userWorkspaceRoleMap: { [userWorkspaceId]: role.roleId },
      apiKeyRoleMap: {},
      flatRowLevelPermissionPredicateMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      flatRowLevelPermissionPredicateGroupMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      ORMEntityMetadatas: workspace.entityMetadatas,
    };
    const orm = new GlobalWorkspaceOrmManager(
      {
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(workspace),
      } as never,
      { getOrRecompute: jest.fn().mockResolvedValue(cache) } as never,
    );
    const authContext = {
      type: 'user',
      workspace: { id: workspaceId },
      userWorkspaceId,
      user: { id: userWorkspaceId },
      workspaceMemberId: userWorkspaceId,
      workspaceMember: { id: userWorkspaceId },
    } as UserWorkspaceAuthContext;
    const shape = await orm.executeInWorkspaceContext(async () => {
      const queryRunner = workspace!.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const permissionOptions = resolveRolePermissionConfig({
          authContext,
          userWorkspaceRoleMap: cache.userWorkspaceRoleMap,
          apiKeyRoleMap: cache.apiKeyRoleMap,
        });
        expect(permissionOptions).toEqual({ intersectionOf: [role.roleId] });
        const repository = workspace!
          .createEntityManager(queryRunner)
          .getRepository<SocialProfileRecord>(
            'socialProfile',
            permissionOptions!,
            authContext,
          );
        const row = await repository.findOneBy({ id: targetId });
        return {
          found: Boolean(row),
          hasOwn: row
            ? Object.prototype.hasOwnProperty.call(row, 'platformAccountId')
            : false,
          nullValue: row?.platformAccountId === null,
          emptyString: row?.platformAccountId === '',
          valueType: typeof row?.platformAccountId,
          countNull: row?.followerCount === null,
        };
      } finally {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    }, authContext);
    expect(shape).toEqual({
      found: true,
      hasOwn: true,
      nullValue: false,
      emptyString: true,
      valueType: 'string',
      countNull: true,
    });
  } finally {
    if (workspace?.isInitialized) await workspace.destroy();
    if (core?.isInitialized) await core.destroy();
    await client.end();
  }
});
