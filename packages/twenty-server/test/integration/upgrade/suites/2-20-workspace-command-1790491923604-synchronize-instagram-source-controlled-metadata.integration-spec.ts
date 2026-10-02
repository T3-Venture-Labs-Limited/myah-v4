import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import Redis from 'ioredis';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

/**
 * Real-PostgreSQL proof for OpenSpec myah-403 sections 3.1-3.6: the atomic
 * adoption of the former Instagram SDK application's underscored physical
 * tables into the source-controlled, natively-owned Instagram metadata
 * graph. Follows the same execFileAsync-against-built-dist pattern as
 * `2-20-workspace-command-1789313971536-seeded-metadata.integration-spec.ts`.
 *
 * The legacy graph fixture is *not* mocked: it reassigns ownership of the
 * already-provisioned native Instagram objects/fields/indexes (created by
 * the real dev-seeder run of this same metadata builder) to a fixture
 * "legacy Instagram application" row and physically renames their real
 * Postgres tables to the historical underscored names, then inserts one
 * real record per table. This reproduces the true historical drift the
 * production command exists to repair: the SDK app's manifest object names
 * were already native, but the physical tables were never migrated.
 */

const COMMAND_NAME =
  'upgrade:2-20:synchronize-instagram-source-controlled-metadata';
const execFileAsync = promisify(execFile);

const LEGACY_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '4738ebcd-6662-4ecc-a190-374fa0525951';
const LEGACY_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER =
  '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991';

const INSTAGRAM_OBJECTS = [
  {
    key: 'myahInstagramAccount',
    universalIdentifier:
      MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
    nativeTableName: 'myahInstagramAccount',
    legacyTableName: '_myahInstagramAccount',
  },
  {
    key: 'myahSocialConversation',
    universalIdentifier:
      MYAH_STANDARD_OBJECTS.myahSocialConversation.universalIdentifier,
    nativeTableName: 'myahSocialConversation',
    legacyTableName: '_myahSocialConversation',
  },
  {
    key: 'myahSocialMessage',
    universalIdentifier:
      MYAH_STANDARD_OBJECTS.myahSocialMessage.universalIdentifier,
    nativeTableName: 'myahSocialMessage',
    legacyTableName: '_myahSocialMessage',
  },
  {
    key: 'myahInstagramReplyDraft',
    universalIdentifier:
      MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft.universalIdentifier,
    nativeTableName: 'myahInstagramReplyDraft',
    legacyTableName: '_myahInstagramReplyDraft',
  },
] as const;

const EXPECTED_FIELD_COUNT = 93; // 91 own fields across the 4 objects + 2 Creator reverse fields
const EXPECTED_INDEX_COUNT = 5;

const WORKSPACE_ID = SEED_YCOMBINATOR_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);

/** Expected physical unique-constraint shape: table -> sorted column sets. */
const EXPECTED_UNIQUE_INDEX_COLUMN_SETS: Record<string, string[][]> = {
  myahInstagramAccount: [
    ['connectedAccountId'],
    ['igUserId'],
    ['unipileAccountId'],
  ],
  myahSocialConversation: [
    ['instagramAccountId', 'providerConversationId', 'provider'].sort(),
  ],
  myahSocialMessage: [
    ['conversationId', 'providerMessageId', 'provider'].sort(),
  ],
};

const runCommand = (workspaceId: string) =>
  execFileAsync(
    process.execPath,
    ['dist/command/command.js', COMMAND_NAME, '--workspace-id', workspaceId],
    { cwd: process.cwd(), env: process.env },
  );

/**
 * The fixture below mutates `core."objectMetadata"`/`"fieldMetadata"`/
 * `"indexMetadata"` directly through raw SQL to reproduce the legacy
 * ownership graph precisely (see the module doc comment). Direct SQL writes
 * bypass the normal metadata-service write path that flushes the workspace
 * flat-entity-map cache, so the cache must be flushed explicitly before
 * invoking the command under test; otherwise the command's
 * `workspaceCacheService.getOrRecompute` call observes stale, pre-fixture
 * ownership and incorrectly takes the complete-native no-op path.
 */
const flushWorkspaceCache = async (): Promise<void> => {
  const client = new Redis(process.env.REDIS_URL as string);

  try {
    await client.del(
      Object.keys(CACHE_KEY_SEGMENTS_BY_METADATA_NAME).flatMap((metadataName) =>
        buildRedisCacheKeys(metadataName),
      ),
    );
  } finally {
    client.disconnect();
  }
};

/**
 * Redis key convention used by `WorkspaceCacheService`/`CacheStorageService`
 * (see `buildCacheKey` + `WORKSPACE_CACHE_KEYS_V2` +
 * `CacheStorageService.getKey`): in `NODE_ENV=test`, every key is prefixed
 * with the `integration-tests` namespace, then the `engine:workspace`
 * namespace, then the per-cache-key-name segment, then the workspace id.
 * `workspaceCacheService.flush` deletes both the data key and its
 * companion `:hash` key.
 */
const CACHE_KEY_SEGMENTS_BY_METADATA_NAME: Record<string, string> = {
  objectMetadata: 'flat-maps:object-metadata',
  fieldMetadata: 'flat-maps:field-metadata',
  index: 'flat-maps:index',
};

const buildRedisCacheKeys = (metadataName: string): [string, string] => {
  const segment = CACHE_KEY_SEGMENTS_BY_METADATA_NAME[metadataName];
  const base = `integration-tests:engine:workspace:${segment}:${WORKSPACE_ID}`;

  // Matches `WorkspaceCacheService.recomputeDataFromProvider`/
  // `deleteFromRedis`: the data payload and its freshness hash are stored
  // under `${baseKey}:data` and `${baseKey}:hash` respectively (there is no
  // bare, unsuffixed key).
  return [`${base}:data`, `${base}:hash`];
};

/**
 * Presence proof for the Redis flat-entity-map cache keys the command's
 * post-commit `workspaceCacheService.flush` call is expected to delete.
 *
 * We deliberately never write fake payloads into these keys: the same
 * keys are read by the command's own `workspaceCacheService.getOrRecompute`
 * call early in `synchronizeWorkspace` (before any of the adoption
 * preflight/ambiguity checks), so seeding a fake JSON blob there would be
 * read back as real (corrupt) metadata instead of triggering a clean
 * recompute, and would invalidate every other assertion in the test.
 * Instead, each test flushes Redis (`flushWorkspaceCache`) immediately
 * before invoking the command, and this helper is read only *after* the
 * run: `getOrRecompute` unconditionally (re)populates these keys as soon
 * as `synchronizeWorkspace` starts building `fromAllFlatEntityMaps`, so
 * their state afterward is genuinely diagnostic --
 *   - present  => the run reached its skip/no-op or preflight-failure path
 *                 (population happened, but the post-commit `flush()` that
 *                 only exists on the success path never ran), or
 *   - absent   => the run committed the adoption and its own `flush()`
 *                 call explicitly deleted them.
 */
const getRedisCacheKeyPresence = async (): Promise<
  Record<string, { data: boolean; hash: boolean }>
> => {
  const client = new Redis(process.env.REDIS_URL as string);

  try {
    const result: Record<string, { data: boolean; hash: boolean }> = {};

    for (const metadataName of Object.keys(
      CACHE_KEY_SEGMENTS_BY_METADATA_NAME,
    )) {
      const [dataKey, hashKey] = buildRedisCacheKeys(metadataName);

      result[metadataName] = {
        data: (await client.exists(dataKey)) === 1,
        hash: (await client.exists(hashKey)) === 1,
      };
    }

    return result;
  } finally {
    client.disconnect();
  }
};

const ALL_CACHE_KEYS_ABSENT = {
  objectMetadata: { data: false, hash: false },
  fieldMetadata: { data: false, hash: false },
  index: { data: false, hash: false },
};

const ALL_CACHE_KEYS_PRESENT = {
  objectMetadata: { data: true, hash: true },
  fieldMetadata: { data: true, hash: true },
  index: { data: true, hash: true },
};

type ObjectRow = { id: string; applicationId: string };

const getStandardApplicationId = async (): Promise<string> => {
  const [row] = await global.testDataSource.query<{ id: string }[]>(
    `SELECT a.id FROM core.application a
       JOIN core."objectMetadata" om ON om."applicationId" = a.id
      WHERE om."workspaceId" = $1 AND om."universalIdentifier" = $2`,
    [
      WORKSPACE_ID,
      MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
    ],
  );

  return row.id;
};

const getInstagramObjectRows = async (): Promise<Record<string, ObjectRow>> => {
  const rows = await global.testDataSource.query<
    { id: string; applicationId: string; universalIdentifier: string }[]
  >(
    `SELECT id, "applicationId", "universalIdentifier"
       FROM core."objectMetadata"
      WHERE "workspaceId" = $1 AND "universalIdentifier" = ANY($2::uuid[])`,
    [WORKSPACE_ID, INSTAGRAM_OBJECTS.map((o) => o.universalIdentifier)],
  );
  const byUniversalIdentifier: Record<string, ObjectRow> = {};

  for (const row of rows) {
    byUniversalIdentifier[row.universalIdentifier] = {
      id: row.id,
      applicationId: row.applicationId,
    };
  }

  return byUniversalIdentifier;
};

const createLegacyApplication = async (
  universalIdentifier = LEGACY_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
): Promise<string> => {
  const id = randomUUID();

  await global.testDataSource.query(
    `INSERT INTO core.application
      (id, "universalIdentifier", name, description, version, "sourceType", "sourcePath", "workspaceId")
     VALUES ($1, $2, $3, $4, $5, 'local', 'myah-408-legacy-instagram-fixture', $6)`,
    [
      id,
      universalIdentifier,
      universalIdentifier ===
      LEGACY_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER
        ? 'Brand Brain (legacy fixture)'
        : 'Myah Instagram Messaging (legacy fixture)',
      'Integration-test fixture reproducing the pre-cutover legacy Instagram installation',
      '1.0.0',
      WORKSPACE_ID,
    ],
  );

  return id;
};

const deleteApplication = async (applicationId: string): Promise<void> => {
  await global.testDataSource.query(
    `DELETE FROM core.application WHERE id = $1`,
    [applicationId],
  );
};

const reassignInstagramOwnership = async (
  targetApplicationId: string,
  objectIds: string[],
): Promise<void> => {
  await global.testDataSource.query(
    `UPDATE core."objectMetadata" SET "applicationId" = $1
      WHERE "workspaceId" = $2 AND id = ANY($3::uuid[])`,
    [targetApplicationId, WORKSPACE_ID, objectIds],
  );
  await global.testDataSource.query(
    `UPDATE core."fieldMetadata" SET "applicationId" = $1
      WHERE "workspaceId" = $2
        AND ("objectMetadataId" = ANY($3::uuid[])
             OR "relationTargetObjectMetadataId" = ANY($3::uuid[]))`,
    [targetApplicationId, WORKSPACE_ID, objectIds],
  );
  await global.testDataSource.query(
    `UPDATE core."indexMetadata" SET "applicationId" = $1
      WHERE "workspaceId" = $2 AND "objectMetadataId" = ANY($3::uuid[])`,
    [targetApplicationId, WORKSPACE_ID, objectIds],
  );
};

const deleteExplicitInstagramIndexMetadata = async (
  objectIds: string[],
): Promise<void> => {
  await global.testDataSource.query(
    `DELETE FROM core."indexMetadata"
      WHERE "workspaceId" = $1 AND "objectMetadataId" = ANY($2::uuid[])`,
    [WORKSPACE_ID, objectIds],
  );
};

const countOwnedMetadata = async (
  applicationId: string,
  objectIds: string[],
): Promise<{ objects: number; fields: number; indexes: number }> => {
  const [[{ count: objects }], [{ count: fields }], [{ count: indexes }]] =
    await Promise.all([
      global.testDataSource.query<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM core."objectMetadata"
          WHERE "workspaceId" = $1 AND "applicationId" = $2 AND id = ANY($3::uuid[])`,
        [WORKSPACE_ID, applicationId, objectIds],
      ),
      global.testDataSource.query<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM core."fieldMetadata"
          WHERE "workspaceId" = $1 AND "applicationId" = $2
            AND ("objectMetadataId" = ANY($3::uuid[]) OR "relationTargetObjectMetadataId" = ANY($3::uuid[]))`,
        [WORKSPACE_ID, applicationId, objectIds],
      ),
      global.testDataSource.query<{ count: string }[]>(
        `SELECT count(*)::text AS count FROM core."indexMetadata"
          WHERE "workspaceId" = $1 AND "applicationId" = $2 AND "objectMetadataId" = ANY($3::uuid[])`,
        [WORKSPACE_ID, applicationId, objectIds],
      ),
    ]);

  return {
    objects: Number(objects),
    fields: Number(fields),
    indexes: Number(indexes),
  };
};

const renameTables = async (
  fromKey: 'nativeTableName' | 'legacyTableName',
  toKey: 'nativeTableName' | 'legacyTableName',
  only?: readonly string[],
): Promise<void> => {
  for (const object of INSTAGRAM_OBJECTS) {
    if (only !== undefined && !only.includes(object.key)) {
      continue;
    }

    // Workspace schema and fixed Instagram table identifiers are not user input.
    // pi-lens-ignore: sql-injection, property_identifier
    await global.testDataSource.query(
      `ALTER TABLE "${SCHEMA}"."${object[fromKey]}" RENAME TO "${object[toKey]}"`,
    );
  }

  if (fromKey === 'nativeTableName') {
    await renamePhysicalNames('nativeTableName', 'legacyTableName', only);
  }
};

const physicalIndexName = (tableName: string, columns: string[]) => {
  const hash = createHash('sha256');

  [tableName, ...columns, '"deletedAt" IS NULL'].forEach((part) =>
    hash.update(part),
  );

  return `IDX_UNIQUE_${hash.digest('hex').slice(0, 27)}`;
};

const renamePhysicalNames = async (
  fromKey: 'nativeTableName' | 'legacyTableName',
  toKey: 'nativeTableName' | 'legacyTableName',
  only?: readonly string[],
): Promise<void> => {
  for (const object of INSTAGRAM_OBJECTS) {
    if (only !== undefined && !only.includes(object.key)) continue;

    const enums = await global.testDataSource.query<
      { column_name: string; type_name: string }[]
    >(
      `SELECT a.attname AS column_name, ty.typname AS type_name
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_type ty ON ty.oid = a.atttypid
        WHERE n.nspname = $1 AND c.relname = $2 AND ty.typtype = 'e'
          AND a.attnum > 0 AND NOT a.attisdropped`,
      [SCHEMA, object[toKey]],
    );

    for (const { column_name, type_name } of enums) {
      const oldName = `${object[fromKey]}_${column_name}_enum`;
      const newName = `${object[toKey]}_${column_name}_enum`;

      if (type_name === oldName) {
        // pi-lens-ignore: sql-injection, property_identifier -- catalog column on an allowlisted table; quoted identifiers.
        await global.testDataSource.query(
          `ALTER TYPE "${SCHEMA}"."${oldName}" RENAME TO "${newName}"`,
        );
      } else if (type_name !== newName) {
        throw new Error(`Unexpected fixture enum type ${type_name}`);
      }
    }

    const indexes = await global.testDataSource.query<
      { index_name: string; columns: string[] }[]
    >(
      `SELECT ic.relname AS index_name, to_json(array_agg(a.attname ORDER BY x.n)) AS columns
         FROM pg_index ix JOIN pg_class c ON c.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_class ic ON ic.oid = ix.indexrelid
         CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n)
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = x.attnum
        WHERE n.nspname = $1 AND c.relname = $2 AND ix.indisunique
          AND pg_get_expr(ix.indpred, ix.indrelid) = '("deletedAt" IS NULL)'
        GROUP BY ic.relname`,
      [SCHEMA, object[toKey]],
    );

    for (const { index_name, columns } of indexes) {
      const oldName = physicalIndexName(object[fromKey], columns);
      const newName = physicalIndexName(object[toKey], columns);

      if (index_name === oldName) {
        const nativeTwin = indexes.find(
          (index) => index.index_name === newName,
        );

        if (nativeTwin !== undefined) {
          if (JSON.stringify(nativeTwin.columns) !== JSON.stringify(columns)) {
            throw new Error(`Conflicting fixture unique index ${newName}`);
          }
          // pi-lens-ignore: sql-injection, property_identifier -- exact fixture index and verified same-table twin.
          await global.testDataSource.query(
            `DROP INDEX "${SCHEMA}"."${oldName}"`,
          );
        } else {
          // pi-lens-ignore: sql-injection, property_identifier -- computed deterministic index identifiers, quoted schema.
          await global.testDataSource.query(
            `ALTER INDEX "${SCHEMA}"."${oldName}" RENAME TO "${newName}"`,
          );
        }
      } else if (index_name !== newName) {
        throw new Error(`Unexpected fixture unique index ${index_name}`);
      }
    }
  }
};

const restoreInstagramTables = async (): Promise<void> => {
  const [legacyTables, nativeTables] = await Promise.all([
    existingTables(INSTAGRAM_OBJECTS.map((object) => object.legacyTableName)),
    existingTables(INSTAGRAM_OBJECTS.map((object) => object.nativeTableName)),
  ]);

  for (const object of INSTAGRAM_OBJECTS) {
    if (
      legacyTables.includes(object.legacyTableName) &&
      nativeTables.includes(object.nativeTableName)
    ) {
      // pi-lens-ignore: sql-injection, property_identifier -- fixed fixture identifiers.
      await global.testDataSource.query(
        `DROP TABLE "${SCHEMA}"."${object.nativeTableName}"`,
      );
    }
    if (legacyTables.includes(object.legacyTableName)) {
      // pi-lens-ignore: sql-injection, property_identifier -- fixed fixture identifiers.
      await global.testDataSource.query(
        `ALTER TABLE "${SCHEMA}"."${object.legacyTableName}" RENAME TO "${object.nativeTableName}"`,
      );
    }
  }

  await renamePhysicalNames('legacyTableName', 'nativeTableName');
};

const existingTables = async (
  tableNames: readonly string[],
): Promise<string[]> => {
  const rows = await global.testDataSource.query<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [SCHEMA, tableNames],
  );

  return rows.map((r) => r.table_name).sort();
};

/**
 * Structured pg_catalog proof of the five physical partial-unique indexes
 * (not the five `indexMetadata` rows): joins `pg_index`/`pg_attribute` to
 * recover the exact ordered column set and partial predicate of every
 * unique index whose predicate is non-null (i.e. every custom unique index
 * this OpenSpec section requires, excluding the four ordinary primary-key
 * indexes which have no predicate).
 */
const getPhysicalPartialUniqueIndexes = async (
  tableNames: readonly string[],
): Promise<
  { table: string; indexName: string; columns: string[]; whereClause: string }[]
> => {
  const rows = await global.testDataSource.query<
    {
      table_name: string;
      index_name: string;
      columns: string[];
      where_clause: string;
    }[]
  >(
    `SELECT
        t.relname AS table_name,
        ic.relname AS index_name,
        to_json(array_agg(a.attname ORDER BY x.n)) AS columns,
        pg_get_expr(ix.indpred, ix.indrelid) AS where_clause
       FROM pg_index ix
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_class ic ON ic.oid = ix.indexrelid
       JOIN pg_namespace ns ON ns.oid = t.relnamespace
       CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n)
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
      WHERE ns.nspname = $1
        AND t.relname = ANY($2::text[])
        AND ix.indisunique = true
        AND ix.indpred IS NOT NULL
      GROUP BY t.relname, ic.relname, ix.indexrelid, ix.indpred, ix.indrelid
      ORDER BY t.relname, ix.indexrelid`,
    [SCHEMA, tableNames],
  );

  return rows.map((row) => ({
    table: row.table_name,
    indexName: row.index_name,
    columns: row.columns,
    whereClause: row.where_clause,
  }));
};

const expectPhysicalNames = async (legacy: boolean): Promise<void> => {
  const tableNames = INSTAGRAM_OBJECTS.map((object) =>
    legacy ? object.legacyTableName : object.nativeTableName,
  );
  const enumRows = await global.testDataSource.query<
    { table_name: string; column_name: string; type_name: string }[]
  >(
    `SELECT c.relname AS table_name, a.attname AS column_name, t.typname AS type_name
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_type t ON t.oid = a.atttypid
      WHERE n.nspname = $1 AND c.relname = ANY($2::text[])
        AND t.typtype = 'e' AND a.attnum > 0 AND NOT a.attisdropped`,
    [SCHEMA, tableNames],
  );

  expect(enumRows).toHaveLength(18);
  for (const row of enumRows) {
    expect(row.type_name).toBe(`${row.table_name}_${row.column_name}_enum`);
  }

  const indexes = await getPhysicalPartialUniqueIndexes(tableNames);

  expect(indexes).toHaveLength(EXPECTED_INDEX_COUNT);
  for (const index of indexes) {
    expect(index.indexName).toBe(physicalIndexName(index.table, index.columns));
  }
};

const expectHistoricalPhysicalNames = () => expectPhysicalNames(true);
const expectNativePhysicalNames = () => expectPhysicalNames(false);

const expectFivePhysicalUniqueConstraints = async (
  tableNames: readonly string[] = [
    'myahInstagramAccount',
    'myahSocialConversation',
    'myahSocialMessage',
  ],
): Promise<void> => {
  const rawIndexes = await getPhysicalPartialUniqueIndexes(tableNames);
  // Table names may be passed either as native or legacy (underscored)
  // physical names; normalize to the native key used by
  // EXPECTED_UNIQUE_INDEX_COLUMN_SETS so the assertion is name-agnostic.
  const indexes = rawIndexes.map((index) => ({
    ...index,
    table: index.table.replace(/^_/, ''),
  }));

  expect(indexes).toHaveLength(EXPECTED_INDEX_COUNT);

  for (const [table, expectedColumnSets] of Object.entries(
    EXPECTED_UNIQUE_INDEX_COLUMN_SETS,
  )) {
    const actualColumnSets = indexes
      .filter((index) => index.table === table)
      .map((index) => [...index.columns].sort())
      .sort();

    expect(actualColumnSets).toEqual([...expectedColumnSets].sort());
  }

  for (const index of indexes) {
    expect(index.whereClause).toBe('("deletedAt" IS NULL)');
  }
};

/**
 * Rollback-scoped duplicate-insert proof that the physical unique
 * constraints are actually *enforced*, not merely declared: opens a fresh
 * connection, starts a transaction, attempts to insert a second row that
 * collides on the unique column(s) of an already-inserted fixture row, and
 * asserts Postgres rejects it with a unique-violation before rolling the
 * whole probe transaction back (so nothing it does is ever committed).
 */
const expectUniqueConstraintEnforced = async (
  tableName: string,
  insertColumns: string[],
  insertValues: unknown[],
): Promise<void> => {
  const queryRunner = global.testDataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const columnList = insertColumns.map((c) => `"${c}"`).join(', ');
    const placeholders = insertColumns.map((_, i) => `$${i + 2}`).join(', ');

    await expect(
      // pi-lens-ignore: sql-injection, property_identifier -- workspace schema, fixed table name, and a fixed allowlisted column list are not user input.
      queryRunner.query(
        `INSERT INTO "${SCHEMA}"."${tableName}" (id, ${columnList}) VALUES ($1, ${placeholders})`,
        [randomUUID(), ...insertValues],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i);
  } finally {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  }
};

const FIXTURE_CONNECTED_ACCOUNT_ID = 'myah408-fixture-connected-account-id';
const FIXTURE_PROVIDER_CONVERSATION_ID =
  'myah408-fixture-provider-conversation-id';
const FIXTURE_PROVIDER_MESSAGE_ID = 'myah408-fixture-provider-message-id';

const insertOneRecordPerLegacyTable = async (): Promise<{
  accountId: string;
  conversationId: string;
  messageId: string;
  replyDraftId: string;
  connectedAccountId: string;
  providerConversationId: string;
  providerMessageId: string;
}> => {
  const accountId = randomUUID();
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const replyDraftId = randomUUID();
  const connectedAccountId = `${FIXTURE_CONNECTED_ACCOUNT_ID}-${accountId}`;
  const providerConversationId = `${FIXTURE_PROVIDER_CONVERSATION_ID}-${conversationId}`;
  const providerMessageId = `${FIXTURE_PROVIDER_MESSAGE_ID}-${messageId}`;

  // Workspace schema and the four fixed legacy table identifiers are not
  // user input; only bind-parameter values below come from the caller.
  // pi-lens-ignore: sql-injection, property_identifier
  await global.testDataSource.query(
    `INSERT INTO "${SCHEMA}"."_myahInstagramAccount" (id, label, "connectedAccountId")
     VALUES ($1, 'MYAH-408 fixture account', $2)`,
    [accountId, connectedAccountId],
  );
  // pi-lens-ignore: sql-injection, property_identifier
  await global.testDataSource.query(
    `INSERT INTO "${SCHEMA}"."_myahSocialConversation"
       (id, label, "instagramAccountId", provider, "providerConversationId")
     VALUES ($1, 'MYAH-408 fixture conversation', $2, 'UNIPILE', $3)`,
    [conversationId, accountId, providerConversationId],
  );
  // pi-lens-ignore: sql-injection, property_identifier
  await global.testDataSource.query(
    `INSERT INTO "${SCHEMA}"."_myahSocialMessage"
       (id, text, "conversationId", provider, "providerMessageId")
     VALUES ($1, 'MYAH-408 fixture message', $2, 'UNIPILE', $3)`,
    [messageId, conversationId, providerMessageId],
  );
  // pi-lens-ignore: sql-injection, property_identifier
  await global.testDataSource.query(
    `INSERT INTO "${SCHEMA}"."_myahInstagramReplyDraft" (id, title, "conversationId")
     VALUES ($1, 'MYAH-408 fixture draft', $2)`,
    [replyDraftId, conversationId],
  );

  fixtureRecordIds = [accountId, conversationId, messageId, replyDraftId];

  return {
    accountId,
    conversationId,
    messageId,
    replyDraftId,
    connectedAccountId,
    providerConversationId,
    providerMessageId,
  };
};

let fixtureRecordIds: string[] = [];

const deleteAllFixtureRecords = async (): Promise<void> => {
  if (fixtureRecordIds.length === 0) {
    return;
  }

  for (const object of INSTAGRAM_OBJECTS) {
    // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
    await global.testDataSource.query(
      `DELETE FROM "${SCHEMA}"."${object.nativeTableName}" WHERE id = ANY($1::uuid[])`,
      [fixtureRecordIds],
    );
  }
  fixtureRecordIds = [];
};

const getWorkspaceMetadataVersion = async (): Promise<number> => {
  const [row] = await global.testDataSource.query<
    { metadataVersion: number }[]
  >(`SELECT "metadataVersion" FROM core.workspace WHERE id = $1`, [
    WORKSPACE_ID,
  ]);

  return row.metadataVersion;
};

const getApplicationFingerprint = async (
  applicationId: string,
): Promise<string | undefined> => {
  const [row] = await global.testDataSource.query<{ fingerprint: string }[]>(
    `SELECT md5((to_jsonb(a) - 'updatedAt' - 'createdAt')::text) AS fingerprint
       FROM core.application a
      WHERE a.id = $1`,
    [applicationId],
  );

  return row?.fingerprint;
};

/** Fingerprint helper matching the repository's own established pattern in
 * `2-20-workspace-command-1789313971536-seeded-metadata.integration-spec.ts`
 * (`md5((to_jsonb(row)-'updatedAt'-'createdAt')::text)`), applied to the
 * exact set of metadata rows this OpenSpec section protects from any
 * replacement/deletion action: Brand Brain's three standard-owned objects
 * plus Person/Company/Opportunity. The happy path separately fingerprints
 * its inserted legacy Brand Brain application fixture. */
const CRM_SENTINEL_OBJECT_NAMES = [
  'brandBrainPage',
  'brandBrainLink',
  'brandBrainUpdateProposal',
  'person',
  'company',
  'opportunity',
] as const;

type CrmObjectFingerprint = {
  nameSingular: string;
  applicationId: string;
  fingerprint: string;
};

const getCrmObjectMetadataSentinel = async (): Promise<
  CrmObjectFingerprint[]
> => {
  const rows = await global.testDataSource.query<CrmObjectFingerprint[]>(
    `SELECT "nameSingular", "applicationId",
            md5((to_jsonb(om) - 'updatedAt' - 'createdAt')::text) AS fingerprint
       FROM core."objectMetadata" om
      WHERE "workspaceId" = $1 AND "nameSingular" = ANY($2::text[])
      ORDER BY "nameSingular"`,
    [WORKSPACE_ID, CRM_SENTINEL_OBJECT_NAMES],
  );

  return rows;
};

type CrmRecordSentinel = { id: string; fingerprint: string };

const getCrmRecordSentinel = async (
  tableName: 'person' | 'company' | 'opportunity',
): Promise<CrmRecordSentinel> => {
  const [row] = await global.testDataSource.query<CrmRecordSentinel[]>(
    // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed CRM table identifiers are not user input.
    `SELECT id,
            md5((to_jsonb(r) - 'updatedAt' - 'createdAt' - 'searchVector')::text) AS fingerprint
       FROM "${SCHEMA}".${tableName} r
      ORDER BY "createdAt" ASC
      LIMIT 1`,
  );

  return row;
};

const getCrmSentinel = async (): Promise<{
  objects: CrmObjectFingerprint[];
  person: CrmRecordSentinel;
  company: CrmRecordSentinel;
  opportunity: CrmRecordSentinel;
  personCount: number;
  companyCount: number;
  opportunityCount: number;
}> => {
  const [
    objects,
    person,
    company,
    opportunity,
    [{ count: personCount }],
    [{ count: companyCount }],
    [{ count: opportunityCount }],
  ] = await Promise.all([
    getCrmObjectMetadataSentinel(),
    getCrmRecordSentinel('person'),
    getCrmRecordSentinel('company'),
    getCrmRecordSentinel('opportunity'),
    global.testDataSource.query<{ count: string }[]>(
      // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
      `SELECT count(*)::text AS count FROM "${SCHEMA}".person`,
    ),
    global.testDataSource.query<{ count: string }[]>(
      // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
      `SELECT count(*)::text AS count FROM "${SCHEMA}".company`,
    ),
    global.testDataSource.query<{ count: string }[]>(
      // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
      `SELECT count(*)::text AS count FROM "${SCHEMA}".opportunity`,
    ),
  ]);

  return {
    objects,
    person,
    company,
    opportunity,
    personCount: Number(personCount),
    companyCount: Number(companyCount),
    opportunityCount: Number(opportunityCount),
  };
};

/** Guaranteed-cleanup disposable Postgres event trigger that raises an
 * exception the moment the *last* of the four `ALTER TABLE ... RENAME`
 * statements in `transferLegacyInstagramGraph` completes, so the entire
 * enclosing database transaction (including the three renames that already
 * succeeded) rolls back deterministically -- no race, no production test
 * hook, no modification to the command under test. */
const EVENT_TRIGGER_FUNCTION_NAME = 'myah408_raise_on_reply_draft_rename';
const EVENT_TRIGGER_NAME = 'myah408_reply_draft_rename_guard';

const installMidTransactionFailureTrigger = async (): Promise<void> => {
  await global.testDataSource.query(`
    CREATE OR REPLACE FUNCTION ${EVENT_TRIGGER_FUNCTION_NAME}()
    RETURNS event_trigger AS $$
    DECLARE
      obj record;
    BEGIN
      FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
        IF obj.command_tag = 'ALTER TABLE'
           AND obj.object_identity LIKE '%myahInstagramReplyDraft%' THEN
          RAISE EXCEPTION
            'myah408 injected mid-transaction failure after rename of %',
            obj.object_identity;
        END IF;
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await global.testDataSource.query(`
    CREATE EVENT TRIGGER ${EVENT_TRIGGER_NAME}
      ON ddl_command_end
      WHEN TAG IN ('ALTER TABLE')
      EXECUTE FUNCTION ${EVENT_TRIGGER_FUNCTION_NAME}();
  `);
};

const uninstallMidTransactionFailureTrigger = async (): Promise<void> => {
  await global.testDataSource.query(
    `DROP EVENT TRIGGER IF EXISTS ${EVENT_TRIGGER_NAME}`,
  );
  await global.testDataSource.query(
    `DROP FUNCTION IF EXISTS ${EVENT_TRIGGER_FUNCTION_NAME}()`,
  );
};

/** Raises only when the transfer reaches its final index-ownership UPDATE.
 * The command renames all four tables and updates object/field ownership
 * before that statement, so this is a distinct proof that all earlier work
 * shares the transfer transaction and rolls back together. */
const INDEX_OWNERSHIP_TRIGGER_FUNCTION_NAME =
  'myah411_raise_on_index_ownership_update';
const INDEX_OWNERSHIP_TRIGGER_NAME = 'myah411_index_ownership_update_guard';

const installIndexOwnershipUpdateFailureTrigger = async (): Promise<void> => {
  await global.testDataSource.query(`
    CREATE OR REPLACE FUNCTION ${INDEX_OWNERSHIP_TRIGGER_FUNCTION_NAME}()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION
        'myah411 injected failure after Instagram table and object/field ownership updates';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await global.testDataSource.query(`
    CREATE TRIGGER ${INDEX_OWNERSHIP_TRIGGER_NAME}
      BEFORE UPDATE OF "applicationId" ON core."indexMetadata"
      FOR EACH STATEMENT
      EXECUTE FUNCTION ${INDEX_OWNERSHIP_TRIGGER_FUNCTION_NAME}();
  `);
};

const uninstallIndexOwnershipUpdateFailureTrigger = async (): Promise<void> => {
  await global.testDataSource.query(
    `DROP TRIGGER IF EXISTS ${INDEX_OWNERSHIP_TRIGGER_NAME} ON core."indexMetadata"`,
  );
  await global.testDataSource.query(
    `DROP FUNCTION IF EXISTS ${INDEX_OWNERSHIP_TRIGGER_FUNCTION_NAME}()`,
  );
};

describe('2.20 workspace command 1790491923604 synchronize Instagram source-controlled metadata (postgres)', () => {
  let standardApplicationId: string;

  beforeAll(async () => {
    standardApplicationId = await getStandardApplicationId();
  });

  describe('legacy adoption happy path', () => {
    let legacyApplicationId: string | undefined;
    let legacyBrandBrainApplicationId: string | undefined;

    afterEach(async () => {
      await restoreInstagramTables();
      // Guaranteed convergence back to the pre-test baseline: rename any
      // remaining legacy tables back to native and restore native ownership
      // in case an assertion failed mid-test, then remove the fixture app.
      const legacy = await existingTables(
        INSTAGRAM_OBJECTS.map((o) => o.legacyTableName),
      );

      for (const object of INSTAGRAM_OBJECTS) {
        if (legacy.includes(object.legacyTableName)) {
          await global.testDataSource.query(
            // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
            `ALTER TABLE "${SCHEMA}"."${object.legacyTableName}" RENAME TO "${object.nativeTableName}"`,
          );
        }
      }

      const objectRows = await getInstagramObjectRows();
      const objectIds = Object.values(objectRows).map((r) => r.id);

      await reassignInstagramOwnership(standardApplicationId, objectIds);
      await deleteAllFixtureRecords();

      if (legacyApplicationId !== undefined) {
        await deleteApplication(legacyApplicationId);
        legacyApplicationId = undefined;
      }
      if (legacyBrandBrainApplicationId !== undefined) {
        await deleteApplication(legacyBrandBrainApplicationId);
        legacyBrandBrainApplicationId = undefined;
      }
    });

    it('renames tables, transfers ownership, preserves data/constraints and exact CRM sentinels, bumps metadata version by exactly one with post-commit cache invalidation, and drifts neither on second run', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);

      expect(objectIds).toHaveLength(4);

      const crmBefore = await getCrmSentinel();
      const versionBefore = await getWorkspaceMetadataVersion();

      legacyApplicationId = await createLegacyApplication();
      legacyBrandBrainApplicationId = await createLegacyApplication(
        LEGACY_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      );
      const legacyBrandBrainApplicationBefore = await getApplicationFingerprint(
        legacyBrandBrainApplicationId,
      );
      expect(legacyBrandBrainApplicationBefore).toBeDefined();
      // The historical SDK represented account uniqueness at field level;
      // its five explicit target index rows do not exist before adoption.
      await deleteExplicitInstagramIndexMetadata(objectIds);
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      await renameTables('nativeTableName', 'legacyTableName');

      const fixtureRecords = await insertOneRecordPerLegacyTable();

      // Preflight sanity: historical field-level uniqueness keeps the five
      // physical constraints while the new explicit index metadata is absent.
      expect(
        await existingTables(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName)),
      ).toEqual([]);
      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName).sort());
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: 0,
      });
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);
      await expectHistoricalPhysicalNames();

      await flushWorkspaceCache();

      const firstRun = await runCommand(WORKSPACE_ID);

      // The old command renamed tables without renaming their PostgreSQL types
      // and unique indexes; query the catalog before trusting its exit status.
      await expectNativePhysicalNames();
      expect(firstRun.stderr).not.toContain(
        `Error in workspace ${WORKSPACE_ID}`,
      );

      // Tables renamed back to native; no residual underscored tables.
      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName).sort());
      expect(
        await existingTables(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName)),
      ).toEqual([]);

      // Ownership fully transferred back to the Twenty Standard application;
      // zero residual rows remain owned by the legacy application.
      expect(
        await countOwnedMetadata(standardApplicationId, objectIds),
      ).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 0,
        fields: 0,
        indexes: 0,
      });

      // The five physical unique constraints survive the rename intact, on
      // the native tables now, verified via pg_catalog (not indexMetadata).
      await expectFivePhysicalUniqueConstraints();
      await expectNativePhysicalNames();

      // ... and are genuinely enforced: a rollback-scoped duplicate insert
      // against each of the three unique-constrained tables is rejected.
      await expectUniqueConstraintEnforced(
        'myahInstagramAccount',
        ['connectedAccountId'],
        [fixtureRecords.connectedAccountId],
      );
      await expectUniqueConstraintEnforced(
        'myahSocialConversation',
        ['provider', 'instagramAccountId', 'providerConversationId'],
        [
          'UNIPILE',
          fixtureRecords.accountId,
          fixtureRecords.providerConversationId,
        ],
      );
      await expectUniqueConstraintEnforced(
        'myahSocialMessage',
        ['provider', 'conversationId', 'providerMessageId'],
        [
          'UNIPILE',
          fixtureRecords.conversationId,
          fixtureRecords.providerMessageId,
        ],
      );

      // Data preserved: exactly the one fixture record per table survives.
      const [accountCount, conversationCount, messageCount, replyDraftCount] =
        await Promise.all(
          INSTAGRAM_OBJECTS.map(async (object) => {
            const [{ count }] = await global.testDataSource.query<
              { count: string }[]
            >(
              // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
              `SELECT count(*)::text AS count FROM "${SCHEMA}"."${object.nativeTableName}"`,
            );

            return Number(count);
          }),
        );

      expect([
        accountCount,
        conversationCount,
        messageCount,
        replyDraftCount,
      ]).toEqual([1, 1, 1, 1]);

      const [conversationRow] = await global.testDataSource.query<
        { id: string; instagramAccountId: string }[]
      >(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `SELECT id, "instagramAccountId" FROM "${SCHEMA}"."myahSocialConversation" WHERE id = $1`,
        [fixtureRecords.conversationId],
      );

      expect(conversationRow.instagramAccountId).toBe(fixtureRecords.accountId);

      // Exact CRM sentinel proof: Brand Brain's three object rows plus
      // Person/Company/Opportunity metadata AND one concrete record per CRM
      // object are byte-identical (full-row fingerprint, not just counts).
      // `migrateLegacyMyahApplication: false` must not perform any
      // replacement or deletion action against unrelated CRM/Brand Brain
      // metadata.
      expect(await getCrmSentinel()).toEqual(crmBefore);
      expect(
        await getApplicationFingerprint(legacyBrandBrainApplicationId),
      ).toBe(legacyBrandBrainApplicationBefore);

      // Metadata version increments by exactly one, and the command's own
      // post-commit `workspaceCacheService.flush` call deletes the Redis
      // flat-entity-map cache entries that its own earlier
      // `getOrRecompute` call (re)populated while building
      // `fromAllFlatEntityMaps` -- direct proof of cache invalidation via
      // the repository's own cache-key convention, not an inference from
      // behavior: if `flush()` had not run, these keys would still be
      // present (as the failure-path tests below demonstrate).
      const versionAfterFirstRun = await getWorkspaceMetadataVersion();

      expect(versionAfterFirstRun).toBe(versionBefore + 1);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_ABSENT);

      // Second run: the graph is already complete and natively owned, so
      // this must take the complete-native no-op path without drift in
      // version or extra invalidation cycles.
      await flushWorkspaceCache();

      const secondRun = await runCommand(WORKSPACE_ID);

      expect(secondRun.stderr).not.toContain(
        `Error in workspace ${WORKSPACE_ID}`,
      );
      expect(await getWorkspaceMetadataVersion()).toBe(versionAfterFirstRun);
      expect(
        await countOwnedMetadata(standardApplicationId, objectIds),
      ).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName).sort());
      // No-op path recomputes (populates) the cache once via
      // `getOrRecompute` to evaluate the skip condition, then never calls
      // `flush()` because there is nothing to commit: the keys are present
      // afterward, proving zero redundant invalidation/version churn on a
      // second run over an already-native graph.
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
    }, 180_000);
  });

  describe('fail-closed preflight scenarios', () => {
    let legacyApplicationId: string | undefined;

    afterEach(async () => {
      await restoreInstagramTables();
      const legacy = await existingTables(
        INSTAGRAM_OBJECTS.map((o) => o.legacyTableName),
      );

      for (const object of INSTAGRAM_OBJECTS) {
        if (legacy.includes(object.legacyTableName)) {
          await global.testDataSource.query(
            // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
            `ALTER TABLE "${SCHEMA}"."${object.legacyTableName}" RENAME TO "${object.nativeTableName}"`,
          );
        }
      }

      // Drop any stray collision table left behind by the collision test.
      await global.testDataSource.query(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `DROP TABLE IF EXISTS "${SCHEMA}"."myah408_stray_collision"`,
      );

      const objectRows = await getInstagramObjectRows();
      const objectIds = Object.values(objectRows).map((r) => r.id);

      await reassignInstagramOwnership(standardApplicationId, objectIds);
      await deleteAllFixtureRecords();
      await global.testDataSource.query(
        `DELETE FROM core."fieldMetadata" WHERE "workspaceId" = $1 AND name = 'myah408ResidualField'`,
        [WORKSPACE_ID],
      );

      if (legacyApplicationId !== undefined) {
        await deleteApplication(legacyApplicationId);
        legacyApplicationId = undefined;
      }
    });

    it('fails closed and leaves tables, ownership, records, constraints, version and cache unchanged when the legacy table set is incomplete (missing source)', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      // Rename only 3 of the 4 tables: the reply-draft source table is
      // missing, simulating an incomplete legacy install.
      await renameTables('nativeTableName', 'legacyTableName', [
        'myahInstagramAccount',
        'myahSocialConversation',
        'myahSocialMessage',
      ]);

      const { accountId } = await (async () => {
        const accountId = randomUUID();

        // pi-lens-ignore: sql-injection, property_identifier
        await global.testDataSource.query(
          `INSERT INTO "${SCHEMA}"."_myahInstagramAccount" (id, label, "connectedAccountId")
           VALUES ($1, 'MYAH-408 fixture account', $2)`,
          [accountId, FIXTURE_CONNECTED_ACCOUNT_ID],
        );
        fixtureRecordIds = [accountId];

        return { accountId };
      })();

      const versionBefore = await getWorkspaceMetadataVersion();

      await flushWorkspaceCache();

      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(run.stderr).toContain('legacy table set is incomplete');

      // Fail closed: no table was renamed, no ownership was transferred,
      // the one fixture record and its physical unique constraint survive
      // unchanged, metadata version untouched, and no cache invalidation
      // occurred (the command never reached the commit/flush step).
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
      expect(
        (
          await existingTables([
            '_myahInstagramAccount',
            '_myahSocialConversation',
            '_myahSocialMessage',
          ])
        ).sort(),
      ).toEqual(
        [
          '_myahInstagramAccount',
          '_myahSocialConversation',
          '_myahSocialMessage',
        ].sort(),
      );
      const [{ count: accountCountAfter }] = await global.testDataSource.query<
        { count: string }[]
      >(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `SELECT count(*)::text AS count FROM "${SCHEMA}"."_myahInstagramAccount" WHERE id = $1`,
        [accountId],
      );

      expect(Number(accountCountAfter)).toBe(1);
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);

      // Cleanup path for this scenario: rename the remaining underscored
      // table back natively so afterEach's generic restoration applies.
      await global.testDataSource.query(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `ALTER TABLE "${SCHEMA}"."myahInstagramReplyDraft" RENAME TO "_myahInstagramReplyDraft"`,
      );
    }, 60_000);

    it('fails closed and leaves tables, ownership, records, constraints, version and cache unchanged when native target tables already exist (collision)', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      await renameTables('nativeTableName', 'legacyTableName');

      const fixtureRecords = await insertOneRecordPerLegacyTable();

      // A stray physical table already occupies one of the native target
      // names (e.g. left over from a partial repair).
      await global.testDataSource.query(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `CREATE TABLE "${SCHEMA}"."myahInstagramAccount" (id uuid PRIMARY KEY)`,
      );

      const versionBefore = await getWorkspaceMetadataVersion();

      await flushWorkspaceCache();

      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(run.stderr).toContain('native target tables already exist');

      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
      expect((await existingTables(['myahInstagramAccount'])).length).toBe(1);
      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName).sort());
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);
      const [{ count: recordCountAfter }] = await global.testDataSource.query<
        { count: string }[]
      >(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `SELECT count(*)::text AS count FROM "${SCHEMA}"."_myahInstagramAccount" WHERE id = $1`,
        [fixtureRecords.accountId],
      );

      expect(Number(recordCountAfter)).toBe(1);

      await global.testDataSource.query(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `DROP TABLE "${SCHEMA}"."myahInstagramAccount"`,
      );
    }, 60_000);

    it('fails closed and leaves tables, ownership, version and cache unchanged when legacy ownership is ambiguous across only some Instagram objects', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);
      const partialObjectIds = objectIds.slice(0, 3);

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, partialObjectIds);
      await renameTables('nativeTableName', 'legacyTableName', [
        'myahInstagramAccount',
        'myahSocialConversation',
        'myahSocialMessage',
      ]);

      const versionBefore = await getWorkspaceMetadataVersion();

      await flushWorkspaceCache();

      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(run.stderr).toContain('ambiguous or incomplete');

      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
      expect(
        (
          await existingTables([
            '_myahInstagramAccount',
            '_myahSocialConversation',
            '_myahSocialMessage',
          ])
        ).sort(),
      ).toEqual(
        [
          '_myahInstagramAccount',
          '_myahSocialConversation',
          '_myahSocialMessage',
        ].sort(),
      );
      expect(await existingTables(['myahInstagramReplyDraft'])).toEqual([
        'myahInstagramReplyDraft',
      ]);
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);
    }, 60_000);

    it('fails closed on Instagram objects owned by a soft-deleted non-standard application', async () => {
      const objectRows = await getInstagramObjectRows();
      const objectIds = Object.values(objectRows).map(({ id }) => id);

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      await renameTables('nativeTableName', 'legacyTableName');
      await insertOneRecordPerLegacyTable();
      const countLegacyRecords = async () =>
        Promise.all(
          INSTAGRAM_OBJECTS.map(async ({ legacyTableName }) => {
            // pi-lens-ignore: sql-injection, property_identifier -- fixed fixture table names and schema.
            const [{ count }] = await global.testDataSource.query<
              { count: string }[]
            >(
              `SELECT count(*)::text AS count FROM "${SCHEMA}"."${legacyTableName}"`,
            );

            return Number(count);
          }),
        );
      const countsBefore = await countLegacyRecords();

      await global.testDataSource.query(
        `UPDATE core.application SET "deletedAt" = now() WHERE id = $1`,
        [legacyApplicationId],
      );
      const versionBefore = await getWorkspaceMetadataVersion();

      await flushWorkspaceCache();
      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      expect(
        await countOwnedMetadata(standardApplicationId, objectIds),
      ).toEqual({
        objects: 0,
        fields: 0,
        indexes: 0,
      });
      expect(
        await existingTables(
          INSTAGRAM_OBJECTS.map(({ legacyTableName }) => legacyTableName),
        ),
      ).toEqual(
        INSTAGRAM_OBJECTS.map(({ legacyTableName }) => legacyTableName).sort(),
      );
      expect(
        await existingTables(
          INSTAGRAM_OBJECTS.map(({ nativeTableName }) => nativeTableName),
        ),
      ).toEqual([]);
      await expectHistoricalPhysicalNames();
      expect(await countLegacyRecords()).toEqual(countsBefore);
    }, 60_000);

    it('fails closed and leaves tables, ownership, version and cache unchanged when unexpected legacy-owned metadata remains outside the expected graph', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);
      const accountObjectId =
        objectRowsBefore[
          MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier
        ].id;

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      await renameTables('nativeTableName', 'legacyTableName');
      const fixtureRecords = await insertOneRecordPerLegacyTable();

      // A residual field the expected-graph enumeration does not know
      // about: still owned by the legacy application, attached to one of
      // the four Instagram objects, but outside the frozen field set.
      await global.testDataSource.query(
        `INSERT INTO core."fieldMetadata"
          (id, "objectMetadataId", type, name, label, "isActive", "isSystem",
           "isUIReadOnly", "workspaceId", "isLabelSyncedWithName",
           "universalIdentifier", "applicationId", "isUIEditable", "isSystemSideEffect")
         VALUES ($1, $2, 'TEXT', 'myah408ResidualField', 'MYAH-408 residual field',
                 true, false, false, $3, false, $4, $5, true, false)`,
        [
          randomUUID(),
          accountObjectId,
          WORKSPACE_ID,
          randomUUID(),
          legacyApplicationId,
        ],
      );

      const versionBefore = await getWorkspaceMetadataVersion();

      await flushWorkspaceCache();

      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(run.stderr).toContain('unexpected legacy graph metadata remains');

      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName).sort());
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);
      const [{ count: recordCountAfter }] = await global.testDataSource.query<
        { count: string }[]
      >(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `SELECT count(*)::text AS count FROM "${SCHEMA}"."_myahInstagramAccount" WHERE id = $1`,
        [fixtureRecords.accountId],
      );

      expect(Number(recordCountAfter)).toBe(1);
    }, 60_000);
  });

  describe('deterministic mid-transaction rollback (disposable event trigger)', () => {
    let legacyApplicationId: string | undefined;
    let triggerInstalled = false;
    let indexOwnershipTriggerInstalled = false;

    afterEach(async () => {
      if (indexOwnershipTriggerInstalled) {
        await uninstallIndexOwnershipUpdateFailureTrigger();
        indexOwnershipTriggerInstalled = false;
      }
      if (triggerInstalled) {
        await uninstallMidTransactionFailureTrigger();
        triggerInstalled = false;
      }

      await restoreInstagramTables();
      const legacy = await existingTables(
        INSTAGRAM_OBJECTS.map((o) => o.legacyTableName),
      );

      for (const object of INSTAGRAM_OBJECTS) {
        if (legacy.includes(object.legacyTableName)) {
          await global.testDataSource.query(
            // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
            `ALTER TABLE "${SCHEMA}"."${object.legacyTableName}" RENAME TO "${object.nativeTableName}"`,
          );
        }
      }

      const objectRows = await getInstagramObjectRows();
      const objectIds = Object.values(objectRows).map((r) => r.id);

      await reassignInstagramOwnership(standardApplicationId, objectIds);
      await deleteAllFixtureRecords();

      if (legacyApplicationId !== undefined) {
        await deleteApplication(legacyApplicationId);
        legacyApplicationId = undefined;
      }
    });

    it('rolls back every already-executed rename and leaves ownership, records, constraints, version and cache untouched when the final table rename raises inside the transaction', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);

      const crmBefore = await getCrmSentinel();

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      await renameTables('nativeTableName', 'legacyTableName');

      const fixtureRecords = await insertOneRecordPerLegacyTable();

      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);

      const versionBefore = await getWorkspaceMetadataVersion();

      await flushWorkspaceCache();

      await installMidTransactionFailureTrigger();
      triggerInstalled = true;

      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(run.stderr).toContain('myah408 injected mid-transaction failure');

      // The three renames that succeeded before the trigger fired on the
      // fourth were inside the same database transaction as the failing
      // statement, so Postgres's transactional DDL rolls all four back
      // together: every table is still at its legacy (underscored) name,
      // none at native.
      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName).sort());
      expect(
        await existingTables(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName)),
      ).toEqual([]);

      // Ownership was never touched: the metadata-row applicationId UPDATEs
      // run only after all four renames succeed, which never happened.
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      expect(
        await countOwnedMetadata(standardApplicationId, objectIds),
      ).toEqual({ objects: 0, fields: 0, indexes: 0 });

      // Records and their physical unique constraints survive unchanged
      // under the (rolled-back-to) legacy table names.
      const [{ count: accountCountAfter }] = await global.testDataSource.query<
        { count: string }[]
      >(
        // pi-lens-ignore: sql-injection, property_identifier -- workspace schema and fixed table identifiers are not user input.
        `SELECT count(*)::text AS count FROM "${SCHEMA}"."_myahInstagramAccount" WHERE id = $1`,
        [fixtureRecords.accountId],
      );

      expect(Number(accountCountAfter)).toBe(1);
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);

      // No commit occurred, so no cache invalidation and no version bump.
      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
      expect(await getCrmSentinel()).toEqual(crmBefore);
    }, 90_000);

    it('rolls back table renames and object, field, and index ownership when the final index ownership update raises', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);
      const crmBefore = await getCrmSentinel();

      legacyApplicationId = await createLegacyApplication();
      await reassignInstagramOwnership(legacyApplicationId, objectIds);
      await renameTables('nativeTableName', 'legacyTableName');
      await insertOneRecordPerLegacyTable();
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);

      const versionBefore = await getWorkspaceMetadataVersion();
      await flushWorkspaceCache();
      await installIndexOwnershipUpdateFailureTrigger();
      indexOwnershipTriggerInstalled = true;

      const run = await runCommand(WORKSPACE_ID);

      expect(run.stderr).toContain(`Error in workspace ${WORKSPACE_ID}`);
      expect(run.stderr).toContain(
        'myah411 injected failure after Instagram table and object/field ownership updates',
      );

      // Remove the statement trigger before state assertions. If any
      // assertion above failed, afterEach still removes it through its flag.
      await uninstallIndexOwnershipUpdateFailureTrigger();
      indexOwnershipTriggerInstalled = false;

      expect(
        (
          await existingTables(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName))
        ).sort(),
      ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.legacyTableName).sort());
      expect(
        await existingTables(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName)),
      ).toEqual([]);

      // The trigger fires on the final index UPDATE, after the transaction
      // has already renamed tables and updated object and field ownership.
      // All three ownership classes therefore must be restored atomically.
      expect(await countOwnedMetadata(legacyApplicationId, objectIds)).toEqual({
        objects: 4,
        fields: EXPECTED_FIELD_COUNT,
        indexes: EXPECTED_INDEX_COUNT,
      });
      expect(
        await countOwnedMetadata(standardApplicationId, objectIds),
      ).toEqual({ objects: 0, fields: 0, indexes: 0 });

      const legacyRecordCounts = await Promise.all(
        INSTAGRAM_OBJECTS.map(async (object) => {
          const [{ count }] = await global.testDataSource.query<
            { count: string }[]
          >(
            // pi-lens-ignore: sql-injection, property_identifier -- fixed fixture identifiers are not user input.
            `SELECT count(*)::text AS count FROM "${SCHEMA}"."${object.legacyTableName}" WHERE id = ANY($1::uuid[])`,
            [fixtureRecordIds],
          );

          return Number(count);
        }),
      );
      expect(legacyRecordCounts).toEqual([1, 1, 1, 1]);
      await expectFivePhysicalUniqueConstraints([
        '_myahInstagramAccount',
        '_myahSocialConversation',
        '_myahSocialMessage',
      ]);
      expect(await getWorkspaceMetadataVersion()).toBe(versionBefore);
      expect(await getRedisCacheKeyPresence()).toEqual(ALL_CACHE_KEYS_PRESENT);
      expect(await getCrmSentinel()).toEqual(crmBefore);
    }, 90_000);
  });

  describe('empty existing workspace additive synchronization', () => {
    it('additively provisions the complete native Instagram graph into a workspace with zero prior Instagram metadata, without touching CRM data, and is idempotent on re-run', async () => {
      const objectRowsBefore = await getInstagramObjectRows();
      const objectIds = Object.values(objectRowsBefore).map((r) => r.id);

      expect(objectIds).toHaveLength(4);

      const crmBefore = await getCrmSentinel();
      const versionBefore = await getWorkspaceMetadataVersion();

      // Simulate a workspace with zero prior Instagram metadata: cascade
      // deletes remove every field (including the two Creator reverse
      // fields via `relationTargetObjectMetadataId ON DELETE CASCADE`) and
      // every index (via `objectMetadataId ON DELETE CASCADE`), then the
      // four physical tables are dropped.
      await global.testDataSource.query(
        `DELETE FROM core."objectMetadata" WHERE id = ANY($1::uuid[])`,
        [objectIds],
      );

      for (const object of INSTAGRAM_OBJECTS) {
        await global.testDataSource.query(
          // pi-lens-ignore: sql-injection, property_identifier -- fixed native table identifiers are not user input.
          `DROP TABLE IF EXISTS "${SCHEMA}"."${object.nativeTableName}" CASCADE`,
        );
      }

      // `DROP TABLE` does not cascade to the per-object enum types the
      // standard object builder creates (e.g.
      // `myahInstagramAccount_status_enum`): they must be dropped too, or a
      // fresh recreation of these tables fails with "type ... already
      // exists".
      const staleEnumTypes = await global.testDataSource.query<
        { typname: string }[]
      >(
        `SELECT t.typname FROM pg_type t
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = $1
            AND t.typname ~ $2`,
        [
          SCHEMA,
          `^(${INSTAGRAM_OBJECTS.map((o) => o.nativeTableName).join('|')})_`,
        ],
      );

      for (const { typname } of staleEnumTypes) {
        await global.testDataSource.query(
          // pi-lens-ignore: sql-injection, property_identifier -- workspace schema is not user input; type name is allowlisted by the regex query above.
          `DROP TYPE IF EXISTS "${SCHEMA}"."${typname}" CASCADE`,
        );
      }

      expect(
        await existingTables(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName)),
      ).toEqual([]);
      expect(await getInstagramObjectRows()).toEqual({});

      let recreated = false;

      try {
        await flushWorkspaceCache();

        const run = await runCommand(WORKSPACE_ID);

        expect(run.stderr).not.toContain(`Error in workspace ${WORKSPACE_ID}`);

        const objectRowsAfter = await getInstagramObjectRows();
        const objectIdsAfter = Object.values(objectRowsAfter).map((r) => r.id);

        expect(objectIdsAfter).toHaveLength(4);
        recreated = true;

        expect(
          await countOwnedMetadata(standardApplicationId, objectIdsAfter),
        ).toEqual({
          objects: 4,
          fields: EXPECTED_FIELD_COUNT,
          indexes: EXPECTED_INDEX_COUNT,
        });
        const creatorColumns = await global.testDataSource.query<
          { table_name: string; column_name: string }[]
        >(
          `SELECT table_name, column_name FROM information_schema.columns
             WHERE table_schema = $1
               AND table_name = ANY($2::text[])
               AND column_name = 'creatorId'`,
          [SCHEMA, ['myahSocialConversation', 'myahInstagramReplyDraft']],
        );
        expect(creatorColumns).toEqual([
          { table_name: 'myahInstagramReplyDraft', column_name: 'creatorId' },
          { table_name: 'myahSocialConversation', column_name: 'creatorId' },
        ]);
        expect(
          (
            await existingTables(
              INSTAGRAM_OBJECTS.map((o) => o.nativeTableName),
            )
          ).sort(),
        ).toEqual(INSTAGRAM_OBJECTS.map((o) => o.nativeTableName).sort());
        await expectFivePhysicalUniqueConstraints();

        // Additive and non-destructive to unrelated CRM/Brand Brain data.
        expect(await getCrmSentinel()).toEqual(crmBefore);
        expect(await getWorkspaceMetadataVersion()).toBe(versionBefore + 1);

        // Second run over the now-complete native graph is a no-op: no
        // further version churn.
        const versionAfterFirstRun = await getWorkspaceMetadataVersion();

        await flushWorkspaceCache();

        const secondRun = await runCommand(WORKSPACE_ID);

        expect(secondRun.stderr).not.toContain(
          `Error in workspace ${WORKSPACE_ID}`,
        );
        expect(await getWorkspaceMetadataVersion()).toBe(versionAfterFirstRun);
      } finally {
        // Safety net: if the command failed to recreate the graph (leaving
        // the shared seed workspace without Instagram metadata for any
        // later test run), attempt one non-assertive remediation re-run so
        // the workspace converges back to baseline regardless of how this
        // test's own assertions resolved.
        if (!recreated) {
          const stillMissing =
            Object.keys(await getInstagramObjectRows()).length === 0;

          if (stillMissing) {
            await flushWorkspaceCache();
            const remediation = await runCommand(WORKSPACE_ID);
            expect(remediation.stderr).not.toContain(
              `Error in workspace ${WORKSPACE_ID}`,
            );
          }
        }

        await flushWorkspaceCache();
        const restored = await runCommand(WORKSPACE_ID);
        expect(restored.stderr).not.toContain(
          `Error in workspace ${WORKSPACE_ID}`,
        );
        expect(
          await countOwnedMetadata(
            standardApplicationId,
            Object.values(await getInstagramObjectRows()).map(({ id }) => id),
          ),
        ).toMatchObject({ fields: EXPECTED_FIELD_COUNT });
      }
    }, 120_000);
  });
});
