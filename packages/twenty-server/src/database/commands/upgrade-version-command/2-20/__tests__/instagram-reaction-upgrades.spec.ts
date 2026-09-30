import { Client } from 'pg';
import { type DataSource, type QueryRunner } from 'typeorm';

import { AddInstagramReactionEventFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790742251000-add-instagram-reaction-event';
import { InstallInstagramReactionWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790742251001-install-instagram-reaction.command';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';

it('adds only nullable reaction event fields and safely repeats on an existing core table', async () => {
  const query = jest.fn().mockResolvedValue([]);
  const command = new AddInstagramReactionEventFastInstanceCommand();

  await command.up({ query } as unknown as QueryRunner);
  await command.up({ query } as unknown as QueryRunner);

  expect(query).toHaveBeenCalledTimes(2);
  for (const [statement] of query.mock.calls) {
    expect(statement).toContain('ADD COLUMN IF NOT EXISTS "reactionValue" text');
    expect(statement).toContain('ADD COLUMN IF NOT EXISTS "reactionActorProviderId" text');
    expect(statement).toContain('ADD COLUMN IF NOT EXISTS "reactionOccurredAt" timestamptz(3)');
    expect(statement).not.toContain('NOT NULL');
  }
});

it('installs a private reaction table on an existing workspace and repeats safely', async () => {
  const queryRunner = {
    connect: jest.fn(),
    hasSchema: jest.fn().mockResolvedValue(true),
    hasTable: jest.fn().mockResolvedValue(true),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
  } as unknown as QueryRunner;
  const dataSource = {
    createQueryRunner: () => queryRunner,
  } as unknown as DataSource;
  const command = new InstallInstagramReactionWorkspaceCommand(
    {} as never,
    dataSource,
    new MyahInboxContactTriageSchemaService(),
  );
  const args = { workspaceId, options: { dryRun: false } } as never;

  await command.runOnWorkspace(args);
  await command.runOnWorkspace(args);

  expect(queryRunner.hasTable).toHaveBeenCalledWith(
    'workspace_1wgvd1injqtife6y4rvfbu3h5.myahSocialMessage',
  );
  expect(queryRunner.query).toHaveBeenCalledTimes(2);
  expect(queryRunner.query).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS'),
  );
  expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(2);
});

it('does not create a reaction table in an unprovisioned workspace', async () => {
  const queryRunner = {
    connect: jest.fn(),
    hasSchema: jest.fn().mockResolvedValue(false),
    hasTable: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
  } as unknown as QueryRunner;
  const command = new InstallInstagramReactionWorkspaceCommand(
    {} as never,
    { createQueryRunner: () => queryRunner } as unknown as DataSource,
    new MyahInboxContactTriageSchemaService(),
  );

  await command.runOnWorkspace({ workspaceId, options: { dryRun: false } } as never);

  expect(queryRunner.hasTable).not.toHaveBeenCalled();
  expect(queryRunner.query).not.toHaveBeenCalled();
  expect(queryRunner.release).toHaveBeenCalledTimes(1);
});

const postgresUrl = process.env.MYAH_INBOX_TEST_POSTGRES_URL;
const describePostgres = postgresUrl ? describe : describe.skip;

describePostgres('Instagram reaction upgrade (rolled-back PostgreSQL)', () => {
  let client: Client;
  const existingSchema = getWorkspaceSchemaName(workspaceId);
  const freshWorkspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea420';
  const freshSchema = getWorkspaceSchemaName(freshWorkspaceId);

  beforeAll(async () => {
    const endpoint = new URL(postgresUrl!);
    if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== '15432' ||
        endpoint.pathname !== '/default' || endpoint.search || endpoint.hash ||
        !['postgres:', 'postgresql:'].includes(endpoint.protocol)) {
      throw new Error('Instagram reaction upgrade test database is not allowlisted');
    }
    client = new Client({ connectionString: postgresUrl, statement_timeout: 5000 });
    await client.connect();
    const { rows } = await client.query<{ database: string }>('SELECT current_database() AS database');
    if (rows[0]?.database !== 'default') throw new Error('Unexpected test database');
    await client.query('BEGIN');
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA core;
      CREATE TABLE core."unipileInstagramWebhookEvent" (id uuid PRIMARY KEY, "eventType" text);
      INSERT INTO core."unipileInstagramWebhookEvent" VALUES ('00000000-0000-4000-8000-000000000001', 'MESSAGE_RECEIVED');`);
    for (const schema of [existingSchema, freshSchema]) {
      // pi-lens-ignore: sql-injection — schema names derive only from fixed fixture UUIDs.
      await client.query(`CREATE SCHEMA "${schema}";
        CREATE TABLE "${schema}"."myahSocialConversation" (id uuid PRIMARY KEY);
        CREATE TABLE "${schema}"."myahSocialMessage" (id uuid PRIMARY KEY);
        CREATE TABLE "${schema}"."workspaceMember" (id uuid PRIMARY KEY);`);
    }
    // pi-lens-ignore: sql-injection — existingSchema derives from the fixed fixture UUID.
    await client.query(`CREATE TABLE "${existingSchema}"."myahInboxTriageMigration"
      (id boolean PRIMARY KEY, status text NOT NULL);
      INSERT INTO "${existingSchema}"."myahInboxTriageMigration" VALUES (true, 'READY');`);
  }, 15000);

  afterAll(async () => {
    if (!client) return;
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  });

  const runner = (): QueryRunner => {
    const state = { isTransactionActive: false };
    return {
      get isTransactionActive() { return state.isTransactionActive; },
      connect: async () => undefined,
      release: async () => undefined,
      hasSchema: async (schema: string) => (await client.query(
        'SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists', [schema],
      )).rows[0].exists,
      hasTable: async (qualified: string) => {
        const [schema, table] = qualified.split('.');
        return (await client.query('SELECT to_regclass($1) IS NOT NULL AS exists',
          [`"${schema}"."${table}"`])).rows[0].exists;
      },
      startTransaction: async () => { await client.query('SAVEPOINT reaction_upgrade'); state.isTransactionActive = true; },
      commitTransaction: async () => { await client.query('RELEASE SAVEPOINT reaction_upgrade'); state.isTransactionActive = false; },
      rollbackTransaction: async () => { await client.query('ROLLBACK TO SAVEPOINT reaction_upgrade'); state.isTransactionActive = false; },
      query: async (sql: string, parameters?: unknown[]) => (await client.query(sql, parameters)).rows,
    } as unknown as QueryRunner;
  };

  it('replays core additions on an existing row without losing event data', async () => {
    const command = new AddInstagramReactionEventFastInstanceCommand();
    await command.up(runner());
    await command.up(runner());
    const event = await client.query<{ eventType: string; reactionValue: string | null }>(
      `SELECT "eventType", "reactionValue" FROM core."unipileInstagramWebhookEvent"`);
    expect(event.rows).toEqual([{ eventType: 'MESSAGE_RECEIVED', reactionValue: null }]);
    const columns = await client.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'core' AND table_name = 'unipileInstagramWebhookEvent'
         AND column_name LIKE 'reaction%' ORDER BY column_name`);
    expect(columns.rows).toEqual([
      { column_name: 'reactionActorProviderId', is_nullable: 'YES' },
      { column_name: 'reactionOccurredAt', is_nullable: 'YES' },
      { column_name: 'reactionValue', is_nullable: 'YES' },
    ]);
  });

  it('replays the workspace command on a READY existing workspace with a real foreign key', async () => {
    const queryRunner = runner();
    const command = new InstallInstagramReactionWorkspaceCommand(
      {} as never, { createQueryRunner: () => queryRunner } as unknown as DataSource,
      new MyahInboxContactTriageSchemaService(),
    );
    const args = { workspaceId, options: { dryRun: false } } as never;
    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);
    expect((await client.query('SELECT to_regclass($1) AS table_name',
      [`"${existingSchema}"."myahInboxInstagramReaction"`])).rows[0].table_name).toBeTruthy();
    const parentId = '00000000-0000-4000-8000-000000000002';
    const conversationId = '00000000-0000-4000-8000-000000000003';
    // pi-lens-ignore: sql-injection — existingSchema derives from the fixed fixture UUID.
    await client.query(`INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahSocialMessage" VALUES ($1)`, [parentId]);
    // pi-lens-ignore: sql-injection — existingSchema derives from the fixed fixture UUID.
    await client.query(`INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."myahSocialConversation" VALUES ($1)`, [conversationId]);
    // pi-lens-ignore: sql-injection — existingSchema derives from the fixed fixture UUID.
    await client.query(`INSERT INTO "${existingSchema}"."myahInboxInstagramReaction"
      ("messageRecordId", "conversationRecordId", "bindingId", "actorProviderId", "emoji", "occurredAt", "version")
      VALUES ($1, $2, $3, 'creator', '👍', now(), $4)`,
      [parentId, conversationId, '00000000-0000-4000-8000-000000000004', 'a'.repeat(64)]);
    // pi-lens-ignore: sql-injection — existingSchema derives from the fixed fixture UUID.
    await client.query(`DELETE FROM "${existingSchema}"."myahSocialMessage" WHERE id = $1`, [parentId]);
    // pi-lens-ignore: sql-injection — existingSchema derives from the fixed fixture UUID.
    expect((await client.query(`SELECT count(*)::integer AS count FROM "${existingSchema}"."myahInboxInstagramReaction"`)).rows[0].count).toBe(0);
  });

  it('installs the reaction table before marking a newly provisioned workspace READY', async () => {
    const service = new MyahInboxContactTriageSchemaService();
    const queryRunner = runner();
    await service.ensureWorkspaceTables(queryRunner, freshWorkspaceId);
    await service.initializeNewWorkspaceInTransaction(queryRunner, freshWorkspaceId);
    expect((await client.query('SELECT to_regclass($1) AS table_name',
      [`"${freshSchema}"."myahInboxInstagramReaction"`])).rows[0].table_name).toBeTruthy();
    // pi-lens-ignore: sql-injection — freshSchema derives from the fixed fixture UUID.
    expect((await client.query(`SELECT status FROM "${freshSchema}"."myahInboxTriageMigration"`)).rows)
      .toEqual([{ status: 'READY' }]);
  });
});
