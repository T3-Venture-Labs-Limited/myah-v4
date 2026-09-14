import { DataSource, type QueryRunner } from 'typeorm';

import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

jest.useRealTimers();

const workspaceId = '00000000-0000-0000-0000-000000003130';
const schemaName = getWorkspaceSchemaName(workspaceId);

const createAppShapedInstagramTables = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
  await queryRunner.query(`CREATE TABLE "${schemaName}"."_myahSocialConversation" (
    "id" uuid PRIMARY KEY,
    "provider" text,
    "lifecycle" text,
    "providerConversationId" text,
    "recipientIgsid" text
  )`);
  await queryRunner.query(`CREATE TABLE "${schemaName}"."_myahSocialMessage" (
    "id" uuid PRIMARY KEY,
    "provider" text,
    "conversationId" uuid NOT NULL,
    "text" text,
    "providerCreatedAt" timestamptz
  )`);
  await queryRunner.query(`CREATE TABLE "${schemaName}"."_myahInstagramReplyDraft" (
    "id" uuid PRIMARY KEY,
    "conversationId" uuid NOT NULL,
    "status" text NOT NULL,
    "sentAt" timestamptz,
    "sendBlockedReason" text
  )`);
};

const seedStaleWorkspace = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`INSERT INTO "${schemaName}"."_myahSocialConversation" (
    "id", "provider", "lifecycle", "providerConversationId", "recipientIgsid"
  ) VALUES
    ('00000000-0000-0000-0000-000000003101', NULL, NULL, 'overlap', 'legacy-1'),
    ('00000000-0000-0000-0000-000000003102', 'COMPOSIO_HISTORY', 'HISTORICAL', 'overlap', 'legacy-2'),
    ('00000000-0000-0000-0000-000000003103', 'UNIPILE', 'ACTIVE', 'overlap', 'unipile')`);
  await queryRunner.query(`INSERT INTO "${schemaName}"."_myahSocialMessage" (
    "id", "provider", "conversationId", "text", "providerCreatedAt"
  ) VALUES
    ('00000000-0000-0000-0000-000000003201', NULL,
     '00000000-0000-0000-0000-000000003101', 'same content', '2026-01-01T00:00:00.000Z'),
    ('00000000-0000-0000-0000-000000003202', NULL,
     '00000000-0000-0000-0000-000000003102', 'same content', '2026-01-01T00:00:00.000Z'),
    ('00000000-0000-0000-0000-000000003203', 'UNIPILE',
     '00000000-0000-0000-0000-000000003103', 'same content', '2026-01-01T00:00:00.000Z')`);
  await queryRunner.query(`INSERT INTO "${schemaName}"."_myahInstagramReplyDraft" (
    "id", "conversationId", "status", "sentAt", "sendBlockedReason"
  ) VALUES
    ('00000000-0000-0000-0000-000000003301',
     '00000000-0000-0000-0000-000000003101', 'NEEDS_REVIEW', NULL, NULL),
    ('00000000-0000-0000-0000-000000003302',
     '00000000-0000-0000-0000-000000003102', 'APPROVED', NULL, NULL),
    ('00000000-0000-0000-0000-000000003303',
     '00000000-0000-0000-0000-000000003101', 'DRAFT', NULL, NULL),
    ('00000000-0000-0000-0000-000000003304',
     '00000000-0000-0000-0000-000000003101', 'SENT', '2026-01-01T00:00:00.000Z', NULL),
    ('00000000-0000-0000-0000-000000003305',
     '00000000-0000-0000-0000-000000003103', 'NEEDS_REVIEW', NULL, NULL)`);
};

describe('Composio Instagram stale-workspace cutover (integration)', () => {
  const dataSource = new DataSource({
    type: 'postgres',
    url:
      process.env.PG_DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/test',
  });
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    await dataSource.initialize();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await createAppShapedInstagramTables(queryRunner);
    await seedStaleWorkspace(queryRunner);
  });

  afterEach(async () => {
    if (queryRunner?.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    if (queryRunner && !queryRunner.isReleased) {
      await queryRunner.release();
    }
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('preserves overlapping history and IDs while discarding only obsolete unsent legacy drafts on an idempotent rerun', async () => {
    const commandDataSource = {
      query: (sql: string, parameters?: unknown[]) =>
        sql.includes('FROM core.workspace')
          ? Promise.resolve([{ databaseSchema: schemaName }])
          : queryRunner.query(sql, parameters),
    } as never;
    const command = new BackfillComposioInstagramHistoryWorkspaceCommand(
      {} as never,
      commandDataSource,
    );
    const args = {
      workspaceId,
      options: { dryRun: false },
      index: 0,
      total: 1,
      dataSource: commandDataSource,
    };

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    await expect(
      queryRunner.query(`SELECT
        "id", "provider", "lifecycle", "providerConversationId", "recipientIgsid"
        FROM "${schemaName}"."_myahSocialConversation"
        ORDER BY "id"`),
    ).resolves.toStrictEqual([
      {
        id: '00000000-0000-0000-0000-000000003101',
        provider: 'COMPOSIO_HISTORY',
        lifecycle: 'HISTORICAL',
        providerConversationId: 'overlap',
        recipientIgsid: 'legacy-1',
      },
      {
        id: '00000000-0000-0000-0000-000000003102',
        provider: 'COMPOSIO_HISTORY',
        lifecycle: 'HISTORICAL',
        providerConversationId: 'overlap',
        recipientIgsid: 'legacy-2',
      },
      {
        id: '00000000-0000-0000-0000-000000003103',
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
        providerConversationId: 'overlap',
        recipientIgsid: 'unipile',
      },
    ]);
    await expect(
      queryRunner.query(`SELECT
        "id", "provider", "conversationId", "text", "providerCreatedAt"
        FROM "${schemaName}"."_myahSocialMessage"
        ORDER BY "id"`),
    ).resolves.toStrictEqual([
      {
        id: '00000000-0000-0000-0000-000000003201',
        provider: 'COMPOSIO_HISTORY',
        conversationId: '00000000-0000-0000-0000-000000003101',
        text: 'same content',
        providerCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: '00000000-0000-0000-0000-000000003202',
        provider: 'COMPOSIO_HISTORY',
        conversationId: '00000000-0000-0000-0000-000000003102',
        text: 'same content',
        providerCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: '00000000-0000-0000-0000-000000003203',
        provider: 'UNIPILE',
        conversationId: '00000000-0000-0000-0000-000000003103',
        text: 'same content',
        providerCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    await expect(
      queryRunner.query(`SELECT
        "id", "status", "sentAt", "sendBlockedReason"
        FROM "${schemaName}"."_myahInstagramReplyDraft"
        ORDER BY "id"`),
    ).resolves.toStrictEqual([
      {
        id: '00000000-0000-0000-0000-000000003301',
        status: 'DISCARDED',
        sentAt: null,
        sendBlockedReason: 'PROVIDER_CUTOVER',
      },
      {
        id: '00000000-0000-0000-0000-000000003302',
        status: 'DISCARDED',
        sentAt: null,
        sendBlockedReason: 'PROVIDER_CUTOVER',
      },
      {
        id: '00000000-0000-0000-0000-000000003303',
        status: 'DRAFT',
        sentAt: null,
        sendBlockedReason: null,
      },
      {
        id: '00000000-0000-0000-0000-000000003304',
        status: 'SENT',
        sentAt: new Date('2026-01-01T00:00:00.000Z'),
        sendBlockedReason: null,
      },
      {
        id: '00000000-0000-0000-0000-000000003305',
        status: 'NEEDS_REVIEW',
        sentAt: null,
        sendBlockedReason: null,
      },
    ]);
  });
});
