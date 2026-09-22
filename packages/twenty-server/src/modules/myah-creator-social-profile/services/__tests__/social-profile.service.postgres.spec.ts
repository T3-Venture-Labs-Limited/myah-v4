import { randomUUID } from 'node:crypto';

import { Client, type QueryResultRow } from 'pg';
import { DataSource, EntitySchema } from 'typeorm';

import { CreateCreatorDataOperationReceiptsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911010-create-creator-data-operation-receipts';
import { MigrateMyahCreatorSocialProfilesService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-profiles.service';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CreatorDataOperationService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation.service';
import { CreatorDataOperationWriterService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation-writer.service';
import { SocialProfileService } from 'src/modules/myah-creator-social-profile/services/social-profile.service';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

const isolatedDatabaseUrl = process.env.MYAH_409_ISOLATED_PG_DATABASE_URL;
const describeIsolated = isolatedDatabaseUrl ? describe : describe.skip;
const databasePrefix = 'myah_409_social_profiles_';
const identifierPattern = /^[a-z0-9_]+$/;
const primaryApplicationName = 'myah409-social-profile-primary';
const fixtureApplicationName = 'myah409-social-profile-fixture';
const idBlockerApplicationName = 'myah409-social-profile-id-blocker';
const locatorBlockerApplicationName = 'myah409-social-profile-locator-blocker';

const executeFixtureSql = <Row extends QueryResultRow>(
  client: Client,
  statement: string,
  values?: unknown[],
) => client.query<Row>(statement, values as never);

const allowedRoleId = 'myah-409-social-profile-writer';
const deniedRoleId = 'myah-409-social-profile-denied';
const allowedUserWorkspaceId = '40900000-0000-4000-8000-000000000001';
const deniedUserWorkspaceId = '40900000-0000-4000-8000-000000000002';
const socialProfileFieldNames = [
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'name',
  'platform',
  'handle',
  'profileUrl',
  'normalizedLocator',
  'platformAccountId',
  'followerCount',
  'followerCountObservedAt',
  'followerCountSource',
  'creatorId',
];

const socialProfileEntity = (workspaceSchema: string) =>
  new EntitySchema({
    name: 'socialProfile',
    schema: workspaceSchema,
    tableName: 'socialProfile',
    columns: {
      id: { type: 'uuid', primary: true },
      createdAt: { type: 'timestamptz', createDate: true },
      updatedAt: { type: 'timestamptz', updateDate: true },
      deletedAt: { type: 'timestamptz', deleteDate: true, nullable: true },
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

const buildWorkspaceCache = (dataSource: GlobalWorkspaceDataSource) => {
  const objectId = MYAH_STANDARD_OBJECTS.socialProfile.universalIdentifier;
  const fields = Object.fromEntries(
    socialProfileFieldNames.map((name) => [
      `${objectId}-${name}`,
      {
        id: `${objectId}-${name}`,
        universalIdentifier: `${objectId}-${name}`,
        name,
        type:
          name === 'id' || name === 'creatorId'
            ? 'UUID'
            : name === 'followerCount'
              ? 'NUMBER'
              : name.endsWith('At')
                ? 'DATE_TIME'
                : name === 'platform'
                  ? 'SELECT'
                  : 'TEXT',
        objectMetadataId: objectId,
        isActive: true,
        isSystem: false,
        settings: null,
      },
    ]),
  );
  const objectPermissions = {
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
    restrictedFields: {},
    rowLevelPermissionPredicates: [],
    rowLevelPermissionPredicateGroups: [],
  };

  return {
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [objectId]: {
          id: objectId,
          universalIdentifier: objectId,
          nameSingular: 'socialProfile',
          isSystem: false,
          fieldIds: Object.keys(fields),
        },
      },
      universalIdentifierById: { [objectId]: objectId },
      universalIdentifiersByApplicationId: {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: fields,
      universalIdentifierById: Object.fromEntries(
        Object.keys(fields).map((id) => [id, id]),
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
      [allowedRoleId]: { [objectId]: objectPermissions },
      [deniedRoleId]: {
        [objectId]: {
          ...objectPermissions,
          canReadObjectRecords: false,
          canUpdateObjectRecords: false,
        },
      },
    },
    userWorkspaceRoleMap: {
      [allowedUserWorkspaceId]: allowedRoleId,
      [deniedUserWorkspaceId]: deniedRoleId,
    },
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
    ORMEntityMetadatas: dataSource.entityMetadatas,
  };
};

describeIsolated('SocialProfileService (isolated PostgreSQL)', () => {
  let client: Client;
  let coreDataSource: DataSource;
  let dataSource: GlobalWorkspaceDataSource;
  let secondDataSource: GlobalWorkspaceDataSource;
  let service: SocialProfileService;
  let secondService: SocialProfileService;
  let operationService: CreatorDataOperationService;
  let operationWriter: CreatorDataOperationWriterService;
  let migrationService: MigrateMyahCreatorSocialProfilesService;
  let workspaceId: string;
  let secondWorkspaceId: string;
  let workspaceSchema: string;
  let secondWorkspaceSchema: string;
  let creatorId: string;
  let secondCreatorId: string;

  const waitForAdvisoryWait = async (
    holderApplicationName: string,
  ): Promise<void> => {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const result = await client.query<{ count: string }>(
        `SELECT count(DISTINCT waiting.pid)::text AS count
         FROM pg_locks waiting
         JOIN pg_locks holding
           ON holding.locktype = waiting.locktype
          AND holding.database IS NOT DISTINCT FROM waiting.database
          AND holding.classid IS NOT DISTINCT FROM waiting.classid
          AND holding.objid IS NOT DISTINCT FROM waiting.objid
          AND holding.objsubid IS NOT DISTINCT FROM waiting.objsubid
          AND holding.pid <> waiting.pid
         JOIN pg_stat_activity waiting_activity ON waiting_activity.pid = waiting.pid
         JOIN pg_stat_activity holding_activity ON holding_activity.pid = holding.pid
         WHERE waiting.locktype = 'advisory'
           AND waiting.granted = false
           AND holding.granted = true
           AND waiting_activity.application_name = $1
           AND holding_activity.application_name = $2`,
        [primaryApplicationName, holderApplicationName],
      );

      if (Number(result.rows[0]?.count ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(
      `Timed out waiting for ${primaryApplicationName} to wait on ${holderApplicationName}`,
    );
  };

  beforeAll(async () => {
    if (process.env.PG_DATABASE_URL !== undefined) {
      throw new Error(
        'PG_DATABASE_URL must be absent for the MYAH-409 isolated regression',
      );
    }

    const endpoint = new URL(isolatedDatabaseUrl!);

    if (
      !['postgres:', 'postgresql:'].includes(endpoint.protocol) ||
      !['127.0.0.1', 'localhost'].includes(endpoint.hostname) ||
      endpoint.port !== '5432' ||
      !endpoint.pathname.slice(1).startsWith(databasePrefix) ||
      endpoint.username !== 'postgres' ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error(
        'MYAH-409 isolated PostgreSQL endpoint is not allowlisted',
      );
    }

    client = new Client({
      connectionString: isolatedDatabaseUrl,
      statement_timeout: 5000,
      application_name: fixtureApplicationName,
    });
    await client.connect();

    const identity = await client.query<{
      database: string;
      user: string;
      recovery: boolean;
    }>(
      'SELECT current_database() AS database, current_user AS user, pg_is_in_recovery() AS recovery',
    );

    if (
      identity.rows[0]?.database !== endpoint.pathname.slice(1) ||
      identity.rows[0]?.user !== 'postgres' ||
      identity.rows[0]?.recovery
    ) {
      throw new Error(
        'MYAH-409 isolated PostgreSQL identity is not allowlisted',
      );
    }

    const metadata = await client.query<{
      workspaceId: string;
      nameSingular: string;
    }>(
      `SELECT "workspaceId", "nameSingular"
       FROM core."objectMetadata"
       WHERE "universalIdentifier" = $1`,
      [MYAH_STANDARD_OBJECTS.socialProfile.universalIdentifier],
    );

    expect(metadata.rows).toHaveLength(2);
    expect(
      metadata.rows.every(
        ({ nameSingular }) => nameSingular === 'socialProfile',
      ),
    ).toBe(true);
    [workspaceId, secondWorkspaceId] = metadata.rows
      .map(({ workspaceId }) => workspaceId)
      .sort();
    workspaceSchema = getWorkspaceSchemaName(workspaceId);
    secondWorkspaceSchema = getWorkspaceSchemaName(secondWorkspaceId);

    if (
      !identifierPattern.test(workspaceSchema) ||
      !identifierPattern.test(secondWorkspaceSchema)
    ) {
      throw new Error('Generated MYAH-409 workspace schema is invalid');
    }

    creatorId = randomUUID();
    secondCreatorId = randomUUID();
    await executeFixtureSql(
      client,
      `INSERT INTO "${workspaceSchema}".creator (id, name) VALUES ($1, $2)`,
      [creatorId, 'MYAH-409 isolated Creator'],
    );
    await executeFixtureSql(
      client,
      `INSERT INTO "${secondWorkspaceSchema}".creator (id, name) VALUES ($1, $2)`,
      [secondCreatorId, 'MYAH-409 second isolated Creator'],
    );

    coreDataSource = new DataSource({
      type: 'postgres',
      url: isolatedDatabaseUrl,
      entities: [],
      extra: { max: 2 },
    });
    await coreDataSource.initialize();
    const receiptTable = await client.query<{ exists: string | null }>(
      `SELECT to_regclass('core."creatorDataOperationReceipt"')::text AS exists`,
    );
    if (!receiptTable.rows[0]?.exists) {
      const queryRunner = coreDataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await new CreateCreatorDataOperationReceiptsFastInstanceCommand().up(
          queryRunner,
        );
      } finally {
        await queryRunner.release();
      }
    }
    operationService = new CreatorDataOperationService(coreDataSource);
    operationWriter = new CreatorDataOperationWriterService();
    migrationService = new MigrateMyahCreatorSocialProfilesService(
      coreDataSource,
      operationService,
      operationWriter,
    );
    dataSource = new GlobalWorkspaceDataSource(
      {
        type: 'postgres',
        url: isolatedDatabaseUrl,
        schema: workspaceSchema,
        entities: [socialProfileEntity(workspaceSchema)],
        extra: { max: 5, application_name: primaryApplicationName },
      },
      { emitDatabaseBatchEvent: jest.fn() } as never,
      coreDataSource,
    );
    secondDataSource = new GlobalWorkspaceDataSource(
      {
        type: 'postgres',
        url: isolatedDatabaseUrl,
        schema: secondWorkspaceSchema,
        entities: [socialProfileEntity(secondWorkspaceSchema)],
        extra: { max: 5, application_name: 'myah409-social-profile-second' },
      },
      { emitDatabaseBatchEvent: jest.fn() } as never,
      coreDataSource,
    );
    await Promise.all([dataSource.initialize(), secondDataSource.initialize()]);

    const ormManager = new GlobalWorkspaceOrmManager(
      {
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
        getGlobalWorkspaceDataSourceReplica: jest
          .fn()
          .mockResolvedValue(dataSource),
      } as never,
      {
        getOrRecompute: jest
          .fn()
          .mockResolvedValue(buildWorkspaceCache(dataSource)),
      } as never,
    );
    const secondOrmManager = new GlobalWorkspaceOrmManager(
      {
        getGlobalWorkspaceDataSource: jest
          .fn()
          .mockResolvedValue(secondDataSource),
        getGlobalWorkspaceDataSourceReplica: jest
          .fn()
          .mockResolvedValue(secondDataSource),
      } as never,
      {
        getOrRecompute: jest
          .fn()
          .mockResolvedValue(buildWorkspaceCache(secondDataSource)),
      } as never,
    );

    service = new SocialProfileService(ormManager);
    secondService = new SocialProfileService(secondOrmManager);
  }, 30_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (secondDataSource?.isInitialized) await secondDataSource.destroy();
    if (coreDataSource?.isInitialized) await coreDataSource.destroy();
    if (client) await client.end();
  });

  const authContext = (
    userWorkspaceId = allowedUserWorkspaceId,
    targetWorkspaceId = workspaceId,
  ): UserWorkspaceAuthContext =>
    ({
      type: 'user',
      workspace: { id: targetWorkspaceId },
      userWorkspaceId,
      user: { id: userWorkspaceId },
      workspaceMemberId: userWorkspaceId,
      workspaceMember: { id: userWorkspaceId },
    }) as never;
  const locator = (label: string) =>
    `m409${label.replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  it('denies writes for a resolved role without SocialProfile permission', async () => {
    await expect(
      service.upsert(
        {
          creatorId,
          platform: 'instagram',
          handle: locator('denied'),
        },
        authContext(deniedUserWorkspaceId),
      ),
    ).rejects.toBeInstanceOf(PermissionsException);
  });

  it('keeps the same external identity isolated across two provisioned workspaces', async () => {
    const handle = locator('workspace');
    const platformAccountId = `ig-${randomUUID()}`;
    const [first, second] = await Promise.all([
      service.upsert(
        { creatorId, platform: 'instagram', handle, platformAccountId },
        authContext(),
      ),
      secondService.upsert(
        {
          creatorId: secondCreatorId,
          platform: 'instagram',
          handle,
          platformAccountId,
        },
        authContext(allowedUserWorkspaceId, secondWorkspaceId),
      ),
    ]);

    expect(first.id).not.toBe(second.id);
    const [firstCount, secondCount] = await Promise.all([
      executeFixtureSql<{ count: string }>(
        client,
        `SELECT count(*)::text AS count FROM "${workspaceSchema}"."socialProfile"
         WHERE "platformAccountId" = $1 AND "deletedAt" IS NULL`,
        [platformAccountId],
      ),
      executeFixtureSql<{ count: string }>(
        client,
        `SELECT count(*)::text AS count FROM "${secondWorkspaceSchema}"."socialProfile"
         WHERE "platformAccountId" = $1 AND "deletedAt" IS NULL`,
        [platformAccountId],
      ),
    ]);
    expect(firstCount.rows[0]?.count).toBe('1');
    expect(secondCount.rows[0]?.count).toBe('1');
  });

  it('provisions additive metadata, relation fields, physical columns and identity indexes', async () => {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'socialProfile'`,
      [workspaceSchema],
    );
    const columnNames = columns.rows.map(({ column_name }) => column_name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        'creatorId',
        'platform',
        'handle',
        'profileUrl',
        'normalizedLocator',
        'platformAccountId',
        'followerCount',
        'followerCountObservedAt',
        'followerCountSource',
      ]),
    );

    const indexes = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = $1 AND tablename = 'socialProfile'`,
      [workspaceSchema],
    );
    const indexDefinitions = indexes.rows.map(({ indexdef }) => indexdef);

    expect(
      indexDefinitions.some(
        (definition) =>
          definition.includes('UNIQUE INDEX') &&
          definition.includes('"platformAccountId"') &&
          definition.includes('"deletedAt" IS NULL'),
      ),
    ).toBe(true);
    expect(
      indexDefinitions.some(
        (definition) =>
          definition.includes('UNIQUE INDEX') &&
          definition.includes('"normalizedLocator"') &&
          definition.includes('"deletedAt" IS NULL'),
      ),
    ).toBe(true);

    const relationAndLegacyFields = await client.query<{
      objectName: string;
      fieldName: string;
    }>(
      `SELECT o."nameSingular" AS "objectName", f.name AS "fieldName"
       FROM core."fieldMetadata" f
       JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
       WHERE o."workspaceId" = $1
         AND ((o."nameSingular" = 'creator' AND f.name IN ('socialProfiles', 'instagramUsername'))
           OR (o."nameSingular" = 'socialProfile' AND f.name = 'creator'))`,
      [workspaceId],
    );

    expect(relationAndLegacyFields.rows).toEqual(
      expect.arrayContaining([
        { objectName: 'creator', fieldName: 'socialProfiles' },
        { objectName: 'socialProfile', fieldName: 'creator' },
        { objectName: 'creator', fieldName: 'instagramUsername' },
      ]),
    );
  });

  it('serializes locator-only writes against an ID-bearing profile', async () => {
    const handle = locator('id-bearing');
    const platformAccountId = `ig-${randomUUID()}`;
    const initial = await service.upsert(
      { creatorId, platform: 'instagram', handle, platformAccountId },
      authContext(),
    );

    const results = await Promise.all([
      service.upsert(
        {
          creatorId,
          platform: 'instagram',
          handle: `@${handle.toUpperCase()}`,
        },
        authContext(),
      ),
      service.upsert(
        {
          creatorId,
          platform: 'instagram',
          profileUrl: `https://instagram.com/${handle}`,
        },
        authContext(),
      ),
    ]);

    expect(results.map(({ id }) => id)).toEqual([initial.id, initial.id]);
    const rows = await executeFixtureSql<{ count: string }>(
      client,
      `SELECT count(*)::text AS count FROM "${workspaceSchema}"."socialProfile"
       WHERE platform = 'INSTAGRAM' AND "platformAccountId" = $1 AND "deletedAt" IS NULL`,
      [platformAccountId],
    );
    expect(rows.rows[0]?.count).toBe('1');
  });

  it('locks the persisted locator before renaming an ID-bearing profile', async () => {
    const oldHandle = locator('oldlocator');
    const newHandle = locator('newlocator');
    const platformAccountId = `ig-${randomUUID()}`;
    const initial = await service.upsert(
      {
        creatorId,
        platform: 'instagram',
        handle: oldHandle,
        platformAccountId,
      },
      authContext(),
    );
    const persistedLocatorLockKey = `${workspaceId}:INSTAGRAM:locator:handle:${oldHandle}`;
    let transactionOpen = false;

    await client.query('BEGIN');
    transactionOpen = true;
    try {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [persistedLocatorLockKey],
      );
      let settled = false;
      const rename = service
        .upsert(
          {
            creatorId,
            platform: 'instagram',
            handle: newHandle,
            platformAccountId,
          },
          authContext(),
        )
        .finally(() => {
          settled = true;
        });

      await waitForAdvisoryWait(fixtureApplicationName);
      expect(settled).toBe(false);
      await client.query('COMMIT');
      transactionOpen = false;

      await expect(rename).resolves.toMatchObject({
        id: initial.id,
        normalizedLocator: `handle:${newHandle}`,
      });
    } finally {
      if (transactionOpen) await client.query('ROLLBACK');
    }
  });

  it('locks the current locator after a queued stable-ID rename observes a newer locator', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const oldHandle = `a${suffix}`;
    const currentHandle = `m${suffix}`;
    const finalHandle = `z${suffix}`;
    const platformAccountId = `ig-${randomUUID()}`;
    const initial = await service.upsert(
      {
        creatorId,
        platform: 'instagram',
        handle: oldHandle,
        platformAccountId,
      },
      authContext(),
    );
    const idLockKey = `${workspaceId}:INSTAGRAM:id:${platformAccountId}`;
    const finalLocatorLockKey = `${workspaceId}:INSTAGRAM:locator:handle:${finalHandle}`;
    const idBlocker = new Client({
      connectionString: isolatedDatabaseUrl,
      application_name: idBlockerApplicationName,
    });
    const locatorBlocker = new Client({
      connectionString: isolatedDatabaseUrl,
      application_name: locatorBlockerApplicationName,
    });
    let idTransactionOpen = false;
    let locatorTransactionOpen = false;
    let rename: Promise<unknown> | undefined;
    let locatorWrite: Promise<unknown> | undefined;

    await Promise.all([idBlocker.connect(), locatorBlocker.connect()]);
    try {
      await idBlocker.query('BEGIN');
      idTransactionOpen = true;
      await idBlocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [idLockKey],
      );
      await locatorBlocker.query('BEGIN');
      locatorTransactionOpen = true;
      await locatorBlocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [finalLocatorLockKey],
      );

      rename = service.upsert(
        {
          creatorId,
          platform: 'instagram',
          handle: finalHandle,
          platformAccountId,
        },
        authContext(),
      );
      await waitForAdvisoryWait(idBlockerApplicationName);

      await executeFixtureSql(
        idBlocker,
        `UPDATE "${workspaceSchema}"."socialProfile"
         SET handle = $2, "profileUrl" = $3, "normalizedLocator" = $4, name = $5
         WHERE id = $1`,
        [
          initial.id,
          currentHandle,
          `https://www.instagram.com/${currentHandle}/`,
          `handle:${currentHandle}`,
          `@${currentHandle} on INSTAGRAM`,
        ],
      );
      await idBlocker.query('COMMIT');
      idTransactionOpen = false;
      await waitForAdvisoryWait(locatorBlockerApplicationName);

      let locatorSettled = false;
      locatorWrite = service
        .upsert(
          { creatorId, platform: 'instagram', handle: currentHandle },
          authContext(),
        )
        .finally(() => {
          locatorSettled = true;
        });
      await waitForAdvisoryWait(primaryApplicationName);
      expect(locatorSettled).toBe(false);

      await locatorBlocker.query('COMMIT');
      locatorTransactionOpen = false;
      await expect(rename).resolves.toMatchObject({
        id: initial.id,
        normalizedLocator: `handle:${finalHandle}`,
      });
      await locatorWrite;
    } finally {
      if (idTransactionOpen) await idBlocker.query('ROLLBACK');
      if (locatorTransactionOpen) await locatorBlocker.query('ROLLBACK');
      await Promise.allSettled(
        [rename, locatorWrite].filter(
          (promise): promise is Promise<unknown> => promise !== undefined,
        ),
      );
      await Promise.all([idBlocker.end(), locatorBlocker.end()]);
    }
  });

  it('serializes ID enrichment of a locator-only profile', async () => {
    const handle = locator('locator-only');
    const platformAccountId = `ig-${randomUUID()}`;
    const initial = await service.upsert(
      { creatorId, platform: 'instagram', handle },
      authContext(),
    );

    const results = await Promise.all([
      service.upsert(
        { creatorId, platform: 'instagram', handle, platformAccountId },
        authContext(),
      ),
      service.upsert(
        {
          creatorId,
          platform: 'instagram',
          profileUrl: `https://www.instagram.com/${handle}/`,
          platformAccountId,
        },
        authContext(),
      ),
    ]);

    expect(results.map(({ id }) => id)).toEqual([initial.id, initial.id]);
    const rows = await executeFixtureSql<{
      id: string;
      platformAccountId: string | null;
    }>(
      client,
      `SELECT id, "platformAccountId" FROM "${workspaceSchema}"."socialProfile"
       WHERE platform = 'INSTAGRAM' AND "normalizedLocator" = $1 AND "deletedAt" IS NULL`,
      [`handle:${handle}`],
    );
    expect(rows.rows).toEqual([{ id: initial.id, platformAccountId }]);
  });

  it('atomically recovers import results after response loss and preserves user edits', async () => {
    const attemptKey = randomUUID();
    const operationKey = `row-${randomUUID()}`;
    const sourceDigest = 'a'.repeat(64);
    const actor = {
      source: 'IMPORT' as const,
      workspaceMemberId: null,
      name: 'MYAH-409 integration',
    };
    const write = jest.fn(async (manager, schemaName) => {
      const importedCreatorId = await operationWriter.createCreator(
        manager,
        schemaName,
        { name: 'MYAH-409 imported Creator' },
        actor,
      );
      const profileId = await operationWriter.preserveSocialProfile(
        manager,
        schemaName,
        importedCreatorId,
        { platform: 'instagram', handle: locator('receipt') },
        actor,
      );
      const note = await operationWriter.createSupplementaryNote(
        manager,
        schemaName,
        importedCreatorId,
        'Imported context',
        '- **notes**: retained',
        actor,
      );

      return {
        creatorId: importedCreatorId,
        socialProfileIds: [profileId],
        noteId: note.noteId,
        noteTargetId: note.noteTargetId,
      };
    });
    const operation = {
      workspaceId,
      kind: 'SPREADSHEET_IMPORT' as const,
      actorWorkspaceMemberId: null,
      attemptKey,
      operationKey,
      sourceDigest,
      write,
    };
    const committed = await operationService.execute(operation);

    // pi-lens-ignore: sql-injection, no-sql-in-code -- schema is derived from an allowlisted isolated workspace UUID.
    await client.query(
      `UPDATE "${workspaceSchema}"."creator" SET name='User edited' WHERE id=$1`,
      [committed.creatorId],
    );
    const replayed = await operationService.execute(operation);

    expect(replayed).toEqual({ ...committed, replayed: true });
    expect(write).toHaveBeenCalledTimes(1);
    const counts = await client.query<{
      creators: string;
      profiles: string;
      notes: string;
      targets: string;
      receipts: string;
      creatorName: string;
    }>(
      `SELECT
        (SELECT count(*) FROM "${workspaceSchema}"."creator" WHERE id=$1)::text AS creators,
        (SELECT count(*) FROM "${workspaceSchema}"."socialProfile" WHERE id=ANY($2::uuid[]))::text AS profiles,
        (SELECT count(*) FROM "${workspaceSchema}"."note" WHERE id=$3)::text AS notes,
        (SELECT count(*) FROM "${workspaceSchema}"."noteTarget" WHERE id=$4)::text AS targets,
        (SELECT count(*) FROM core."creatorDataOperationReceipt" WHERE id=$5)::text AS receipts,
        (SELECT name FROM "${workspaceSchema}"."creator" WHERE id=$1) AS "creatorName"`,
      [
        committed.creatorId,
        committed.socialProfileIds,
        committed.noteId,
        committed.noteTargetId,
        committed.receiptId,
      ],
    );
    expect(counts.rows[0]).toEqual({
      creators: '1',
      profiles: '1',
      notes: '1',
      targets: '1',
      receipts: '1',
      creatorName: 'User edited',
    });
    await expect(
      operationService.execute({ ...operation, sourceDigest: 'b'.repeat(64) }),
    ).rejects.toThrow(
      'Creator data operation identity was reused with different input',
    );
  });

  it('rolls back partial rows and serializes concurrent repeated operations', async () => {
    const rollbackCreatorId = randomUUID();
    const failedOperationKey = `row-${randomUUID()}`;

    await expect(
      operationService.execute({
        workspaceId,
        kind: 'SPREADSHEET_IMPORT',
        actorWorkspaceMemberId: null,
        attemptKey: randomUUID(),
        operationKey: failedOperationKey,
        sourceDigest: 'c'.repeat(64),
        write: async (manager, schemaName) => {
          // pi-lens-ignore: sql-injection, no-sql-in-code -- schema is supplied by the canonical workspace operation service.
          await manager.query(
            `INSERT INTO "${schemaName}"."creator" (id, name) VALUES ($1, 'rollback')`,
            [rollbackCreatorId],
          );
          throw new Error('forced row failure');
        },
      }),
    ).rejects.toThrow('forced row failure');
    const rollbackCounts = await client.query<{
      creators: string;
      receipts: string;
    }>(
      `SELECT
        (SELECT count(*) FROM "${workspaceSchema}"."creator" WHERE id=$1)::text AS creators,
        (SELECT count(*) FROM core."creatorDataOperationReceipt"
         WHERE "workspaceId"=$2 AND "operationKey"=$3)::text AS receipts`,
      [rollbackCreatorId, workspaceId, failedOperationKey],
    );
    expect(rollbackCounts.rows[0]).toEqual({ creators: '0', receipts: '0' });

    const attemptKey = randomUUID();
    const operationKey = `row-${randomUUID()}`;
    const write = jest.fn(async (manager, schemaName) => ({
      creatorId: await operationWriter.createCreator(
        manager,
        schemaName,
        { name: 'Concurrent imported Creator' },
        { source: 'IMPORT', workspaceMemberId: null, name: 'MYAH-409' },
      ),
      socialProfileIds: [],
      noteId: null,
      noteTargetId: null,
    }));
    const results = await Promise.all([
      operationService.execute({
        workspaceId,
        kind: 'SPREADSHEET_IMPORT',
        actorWorkspaceMemberId: null,
        attemptKey,
        operationKey,
        sourceDigest: 'd'.repeat(64),
        write,
      }),
      operationService.execute({
        workspaceId,
        kind: 'SPREADSHEET_IMPORT',
        actorWorkspaceMemberId: null,
        attemptKey,
        operationKey,
        sourceDigest: 'd'.repeat(64),
        write,
      }),
    ]);

    expect(write).toHaveBeenCalledTimes(1);
    expect(results[0].receiptId).toBe(results[1].receiptId);
    expect(results.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
  });

  it('skips restricted legacy profiles and preserves allowed context without merging pre-existing Notes', async () => {
    const legacyCreatorId = randomUUID();
    const preExistingNoteId = randomUUID();
    const preExistingTargetId = randomUUID();
    const instagramHandle = locator('legacy-instagram');
    const tiktokHandle = locator('legacy-tiktok').slice(0, 20);

    // pi-lens-ignore: sql-injection, no-sql-in-code -- schema is derived from an allowlisted isolated workspace UUID.
    await client.query(
      `INSERT INTO "${workspaceSchema}"."creator" (
        id, name, "instagramUsername", "instagramFollowerCount",
        "tiktokUsername", "tiktokFollowerCount", notes, "instagramBio"
      ) VALUES ($1, 'Legacy Creator', $2, 1200, $3, 500, 'inline note', 'legacy bio')`,
      [legacyCreatorId, instagramHandle, tiktokHandle],
    );
    // pi-lens-ignore: sql-injection, no-sql-in-code -- schema is derived from an allowlisted isolated workspace UUID.
    await client.query(
      `INSERT INTO "${workspaceSchema}"."note" (id, title, "bodyV2Markdown")
       VALUES ($1, 'Existing note', 'do not merge')`,
      [preExistingNoteId],
    );
    // pi-lens-ignore: sql-injection, no-sql-in-code -- schema is derived from an allowlisted isolated workspace UUID.
    await client.query(
      `INSERT INTO "${workspaceSchema}"."noteTarget" (id, "noteId", "targetCreatorId")
       VALUES ($1, $2, $3)`,
      [preExistingTargetId, preExistingNoteId, legacyCreatorId],
    );

    const dryRun = await migrationService.migrate({
      workspaceId,
      workspaceDataSource: dataSource,
      dryRun: true,
    });
    const before = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM core."creatorDataOperationReceipt"
       WHERE "workspaceId"=$1 AND "kind"='LEGACY_MIGRATION' AND "creatorId"=$2`,
      [workspaceId, legacyCreatorId],
    );

    expect(dryRun.plannedProfiles).toBe(0);
    expect(dryRun.plannedNotes).toBeGreaterThanOrEqual(1);
    expect(dryRun.skippedRestrictedValues).toBeGreaterThanOrEqual(4);
    expect(before.rows[0]?.count).toBe('0');

    const committed = await migrationService.migrate({
      workspaceId,
      workspaceDataSource: dataSource,
      dryRun: false,
    });
    const replayed = await migrationService.migrate({
      workspaceId,
      workspaceDataSource: dataSource,
      dryRun: false,
    });

    expect(committed.committedRows).toBeGreaterThanOrEqual(1);
    expect(committed.failures).toBe(0);
    expect(committed.reconciliationMismatches).toBe(0);
    expect(replayed.replayedRows).toBeGreaterThanOrEqual(1);
    const migrated = await client.query<{
      profiles: string;
      notes: string;
      receipts: string;
    }>(
      `SELECT
        (SELECT count(*) FROM "${workspaceSchema}"."socialProfile"
         WHERE "creatorId"=$1 AND "deletedAt" IS NULL)::text AS profiles,
        (SELECT count(*) FROM "${workspaceSchema}"."noteTarget"
         WHERE "targetCreatorId"=$1 AND "deletedAt" IS NULL)::text AS notes,
        (SELECT count(*) FROM core."creatorDataOperationReceipt"
         WHERE "workspaceId"=$2 AND "kind"='LEGACY_MIGRATION' AND "creatorId"=$1)::text AS receipts`,
      [legacyCreatorId, workspaceId],
    );
    expect(migrated.rows[0]).toEqual({
      profiles: '0',
      notes: '2',
      receipts: '1',
    });
  });

  it('rejects contradictory account ID and locator matches', async () => {
    const firstHandle = locator('conflict-a');
    const secondHandle = locator('conflict-b');
    const firstAccountId = `ig-${randomUUID()}`;

    await service.upsert(
      {
        creatorId,
        platform: 'instagram',
        handle: firstHandle,
        platformAccountId: firstAccountId,
      },
      authContext(),
    );
    await service.upsert(
      {
        creatorId,
        platform: 'instagram',
        handle: secondHandle,
        platformAccountId: `ig-${randomUUID()}`,
      },
      authContext(),
    );

    await expect(
      service.upsert(
        {
          creatorId,
          platform: 'instagram',
          handle: secondHandle,
          platformAccountId: firstAccountId,
        },
        authContext(),
      ),
    ).rejects.toThrow('different social profiles');
  });
});
