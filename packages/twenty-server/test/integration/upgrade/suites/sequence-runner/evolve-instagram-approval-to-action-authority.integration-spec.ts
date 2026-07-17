import { DataSource, type QueryRunner } from 'typeorm';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-evolve-instagram-approval-to-action-authority';
import { AddInstagramReplyApprovalProviderBindingSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding';
import { FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784112963059-finalize-instagram-approval-action-authority';
jest.useRealTimers();


type LegacyFixture =
  | 'absent'
  | 'original'
  | 'repaired'
  | 'populated'
  | 'missing-id-default';

const workspaceId = '00000000-0000-0000-0000-000000000001';
const bindingIds = {
  pending: '00000000-0000-0000-0000-000000000101',
  unknown: '00000000-0000-0000-0000-000000000104',
  approved: '00000000-0000-0000-0000-000000000102',
  rejected: '00000000-0000-0000-0000-000000000103',
};

const receiptIds = {
  sent: '00000000-0000-0000-0000-000000000201',
  failed: '00000000-0000-0000-0000-000000000202',
  blocked: '00000000-0000-0000-0000-000000000203',
  unknown: '00000000-0000-0000-0000-000000000204',
};

const queryRaw = async (
  queryRunner: QueryRunner,
  query: string,
  parameters?: unknown[],
): Promise<unknown> => queryRunner.query(query, parameters);

const getColumns = async (queryRunner: QueryRunner, tableName: string) => {
  const rows: unknown = await queryRunner.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );

  if (!Array.isArray(rows)) {
    throw new Error('Unexpected column query result');
  }

  const columns: { column_name: string }[] = [];

  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('column_name' in row) ||
      typeof row.column_name !== 'string'
    ) {
      throw new Error('Unexpected column query result');
    }

    columns.push({ column_name: row.column_name });
  }

  return columns;
};

const dropFixtureSchema = async (queryRunner: QueryRunner) => {
  await queryRunner.query('DROP TABLE IF EXISTS core."agentMessagePart" CASCADE');
  await queryRunner.query(
    'DROP TABLE IF EXISTS core."actionApprovalBindingEvidenceLink" CASCADE',
  );
  await queryRunner.query(
    'DROP TABLE IF EXISTS core."actionExecutionReceipt" CASCADE',
  );
  await queryRunner.query(
    'DROP TABLE IF EXISTS core."actionApprovalBinding" CASCADE',
  );
  await queryRunner.query(
    'DROP TABLE IF EXISTS core."instagramReplyExecutionReceipt" CASCADE',
  );
  await queryRunner.query(
    'DROP TABLE IF EXISTS core."instagramReplyApprovalRequest" CASCADE',
  );
  await queryRunner.query(
    'DROP TYPE IF EXISTS core."actionExecutionReceipt_state_enum" CASCADE',
  );
  await queryRunner.query(
    'DROP TYPE IF EXISTS core."actionApprovalBinding_state_enum" CASCADE',
  );
  await queryRunner.query(
    'DROP TYPE IF EXISTS core."instagramReplyExecutionReceipt_state_enum" CASCADE',
  );
  await queryRunner.query(
    'DROP TYPE IF EXISTS core."instagramReplyApprovalRequest_state_enum" CASCADE',
  );
};

const installLegacyFixture = async (
  queryRunner: QueryRunner,
  fixture: LegacyFixture,
) => {
  await queryRunner.query('CREATE SCHEMA IF NOT EXISTS core');
  await queryRunner.query(
    'CREATE TABLE IF NOT EXISTS core."workspace" ("id" uuid PRIMARY KEY)',
  );
  await queryRunner.query(`DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'workspace'
        AND column_name = 'workspaceCustomApplicationId'
    ) THEN
      ALTER TABLE core."workspace"
        ALTER COLUMN "workspaceCustomApplicationId" DROP NOT NULL;
    END IF;
  END $$`);
  await queryRunner.query(`DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'workspace'
        AND column_name = 'subdomain'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'workspace'
        AND column_name = 'activationStatus'
    ) THEN
      INSERT INTO core."workspace" ("id", "subdomain", "activationStatus")
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'authority-migration-test',
        'PENDING_CREATION'
      )
      ON CONFLICT ("id") DO NOTHING;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'workspace'
        AND column_name = 'subdomain'
    ) THEN
      INSERT INTO core."workspace" ("id", "subdomain")
      VALUES ('00000000-0000-0000-0000-000000000001', 'authority-migration-test')
      ON CONFLICT ("id") DO NOTHING;
    ELSE
      INSERT INTO core."workspace" ("id")
      VALUES ('00000000-0000-0000-0000-000000000001')
      ON CONFLICT ("id") DO NOTHING;
    END IF;
  END $$`);
  await dropFixtureSchema(queryRunner);

  if (fixture === 'absent') {
    return;
  }

  await queryRunner.query(
    `CREATE TYPE core."instagramReplyApprovalRequest_state_enum" AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'
    )`,
  );
  await queryRunner.query(
    `CREATE TYPE core."instagramReplyExecutionReceipt_state_enum" AS ENUM (
      'PROCESSING', 'SENT', 'FAILED', 'BLOCKED', 'UNKNOWN'
    )`,
  );
  await queryRunner.query(
    `CREATE TABLE core."instagramReplyApprovalRequest" (
      "workspaceId" uuid NOT NULL,
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userWorkspaceId" uuid NOT NULL,
      "threadId" uuid NOT NULL,
      "approvalId" uuid NOT NULL,
      "toolName" varchar NOT NULL,
      "connectedAccountId" varchar NOT NULL,
      "draftId" uuid NOT NULL,
      "conversationId" uuid NOT NULL,
      "previewTextSha256" varchar(64) NOT NULL,
      "state" core."instagramReplyApprovalRequest_state_enum" NOT NULL DEFAULT 'PENDING',
      "expiresAt" timestamptz NOT NULL,
      "decidedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID"
        UNIQUE ("workspaceId", "approvalId"),
      CONSTRAINT "PK_0570e6a0a7170ee067a969dcf27" PRIMARY KEY ("id")
    )`,
  );
  await queryRunner.query(
    'CREATE INDEX "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON core."instagramReplyApprovalRequest" ("workspaceId", "threadId")',
  );
  await queryRunner.query(
    `CREATE TABLE core."instagramReplyExecutionReceipt" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "approvalRequestId" uuid NOT NULL,
      "state" core."instagramReplyExecutionReceipt_state_enum" NOT NULL DEFAULT 'PROCESSING',
      "providerMessageId" text,
      "failureCode" text,
      "failureReason" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST"
        UNIQUE ("approvalRequestId"),
      CONSTRAINT "PK_1ecd8d74d2ebde2854db62b469e" PRIMARY KEY ("id")
    )`,
  );
  await queryRunner.query(
    'CREATE INDEX "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON core."instagramReplyExecutionReceipt" ("state")',
  );

  if (fixture === 'original') {
    await queryRunner.query(
      `ALTER TABLE core."instagramReplyExecutionReceipt"
       ADD CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"
       FOREIGN KEY ("approvalRequestId")
       REFERENCES core."instagramReplyApprovalRequest"("id") ON DELETE RESTRICT`,
    );
  }

  if (fixture === 'missing-id-default') {
    await queryRunner.query(
      'ALTER TABLE core."instagramReplyApprovalRequest" ALTER COLUMN "id" DROP DEFAULT',
    );
    await queryRunner.query(
      'ALTER TABLE core."instagramReplyExecutionReceipt" ALTER COLUMN "id" DROP DEFAULT',
    );
  }

  if (fixture === 'repaired' || fixture === 'populated') {
    await queryRunner.query(
      'ALTER TABLE core."instagramReplyApprovalRequest" ADD COLUMN "providerConversationId" text',
    );
    await queryRunner.query(
      'ALTER TABLE core."instagramReplyApprovalRequest" ADD COLUMN "recipientIgsid" text',
    );
  }

  if (fixture !== 'populated') {
    return;
  }

  await queryRunner.query(
    `CREATE TABLE core."agentMessagePart" (
      "id" uuid PRIMARY KEY,
      "toolName" varchar,
      "toolOutput" jsonb
    )`,
  );
  await queryRunner.query(
    `INSERT INTO core."instagramReplyApprovalRequest" (
      "workspaceId", "id", "userWorkspaceId", "threadId", "approvalId",
      "toolName", "connectedAccountId", "draftId", "conversationId",
      "previewTextSha256", "state", "expiresAt", "providerConversationId",
      "recipientIgsid"
    ) VALUES
      ($1, $2, '00000000-0000-0000-0000-000000000011',
       '00000000-0000-0000-0000-000000000021',
       '00000000-0000-0000-0000-000000000031',
       'request_instagram_reply_approval', 'provider-account',
       '00000000-0000-0000-0000-000000000041',
       '00000000-0000-0000-0000-000000000051',
       repeat('a', 64), 'PENDING', now() + interval '1 day',
       'provider-conversation', 'recipient-igsid'),
      ($1, $3, '00000000-0000-0000-0000-000000000012',
       '00000000-0000-0000-0000-000000000022',
       '00000000-0000-0000-0000-000000000032',
       'request_instagram_reply_approval', 'provider-account',
       '00000000-0000-0000-0000-000000000042',
       '00000000-0000-0000-0000-000000000052',
       repeat('b', 64), 'APPROVED', now() + interval '1 day',
       'provider-conversation', 'recipient-igsid'),
      ($1, $4, '00000000-0000-0000-0000-000000000013',
       '00000000-0000-0000-0000-000000000023',
       '00000000-0000-0000-0000-000000000033',
       'request_instagram_reply_approval', 'provider-account',
       '00000000-0000-0000-0000-000000000043',
       '00000000-0000-0000-0000-000000000053',
       repeat('c', 64), 'REJECTED', now() + interval '1 day',
       'provider-conversation', 'recipient-igsid'),
      ($1, $5, '00000000-0000-0000-0000-000000000014',
       '00000000-0000-0000-0000-000000000024',
       '00000000-0000-0000-0000-000000000034',
       'request_instagram_reply_approval', 'provider-account',
       '00000000-0000-0000-0000-000000000044',
       '00000000-0000-0000-0000-000000000054',
       repeat('d', 64), 'REJECTED', now() + interval '1 day',
       'provider-conversation', 'recipient-igsid')`,
    [
      workspaceId,
      bindingIds.pending,
      bindingIds.approved,
      bindingIds.rejected,
      bindingIds.unknown,
    ],
  );
  await queryRunner.query(
    `INSERT INTO core."instagramReplyExecutionReceipt" (
      "id", "approvalRequestId", "state", "providerMessageId",
      "failureCode", "failureReason"
    ) VALUES
      ($1, $2, 'SENT', 'provider-message-id', NULL, NULL),
      ($3, $4, 'FAILED', NULL, 'provider-code', 'raw provider failure'),
      ($5, $6, 'BLOCKED', NULL, 'restricted', 'raw block reason'),
      ($7, $8, 'UNKNOWN', NULL, NULL, 'raw unknown reason')`,
    [
      receiptIds.sent,
      bindingIds.pending,
      receiptIds.failed,
      bindingIds.approved,
      receiptIds.blocked,
      bindingIds.rejected,
      receiptIds.unknown,
      bindingIds.unknown,
    ],
  );
  await queryRunner.query(
    `INSERT INTO core."agentMessagePart" ("id", "toolName", "toolOutput")
     VALUES
       (
         '00000000-0000-0000-0000-000000000301',
         'request_instagram_reply_approval',
         '{"result":{"approvalId":"00000000-0000-0000-0000-000000000031","preview":"private reply"}}'
       ),
       (
         '00000000-0000-0000-0000-000000000302',
         'request_instagram_reply_approval',
         '{"result":{"approvalId":"00000000-0000-0000-0000-000000000999","preview":"private orphan"}}'
       ),
       (
         '00000000-0000-0000-0000-000000000303',
         'request_instagram_reply_approval',
         '"malformed private reply output"'
       )`,
  );
};

const assertGenericAuthoritySchema = async (queryRunner: QueryRunner) => {
  await expect(
    queryRaw(queryRunner,
      `SELECT
        to_regclass('core."actionApprovalBinding"') AS binding,
        to_regclass('core."actionApprovalBindingEvidenceLink"') AS link,
        to_regclass('core."actionExecutionReceipt"') AS receipt`,
    ),
  ).resolves.toStrictEqual([
    {
      binding: 'core."actionApprovalBinding"',
      link: 'core."actionApprovalBindingEvidenceLink"',
      receipt: 'core."actionExecutionReceipt"',
    },
  ]);
  await expect(
    queryRaw(queryRunner,
      `SELECT to_regclass('core."instagramReplyApprovalRequest"') AS binding,
              to_regclass('core."instagramReplyExecutionReceipt"') AS receipt`,
    ),
  ).resolves.toStrictEqual([{ binding: null, receipt: null }]);

  const bindingColumns = await getColumns(queryRunner, 'actionApprovalBinding');
  const receiptColumns = await getColumns(queryRunner, 'actionExecutionReceipt');

  expect(bindingColumns.map(({ column_name }) => column_name)).toEqual(
    expect.arrayContaining([
      'id',
      'workspaceId',
      'initiatorUserWorkspaceId',
      'actionName',
      'actionVersion',
      'draftId',
      'contentDigest',
      'inboundMessageId',
      'inboundSenderIgsid',
      'inboundDirection',
      'inboundReceivedAt',
      'recipientFingerprint',
      'sendingAccountFingerprint',
      'threadId',
      'state',
      'expiresAt',
      'decidedAt',
      'createdAt',
      'updatedAt',
    ]),
  );
  expect(receiptColumns.map(({ column_name }) => column_name)).toEqual(
    expect.arrayContaining([
      'id',
      'workspaceId',
      'actionApprovalBindingId',
      'idempotencyKey',
      'state',
      'providerMessageId',
      'providerCode',
      'redactedOutcome',
      'createdAt',
      'updatedAt',
    ]),
  );
  expect(bindingColumns.map(({ column_name }) => column_name)).not.toEqual(
    expect.arrayContaining([
      'approvalId',
      'connectedAccountId',
      'conversationId',
      'providerConversationId',
      'recipientIgsid',
      'previewTextSha256',
    ]),
  );
  expect(receiptColumns.map(({ column_name }) => column_name)).not.toEqual(
    expect.arrayContaining(['failureReason', 'failureCode']),
  );
};

const assertFinalizedInboundProof = async (queryRunner: QueryRunner) => {
  await expect(
    queryRaw(
      queryRunner,
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name = 'actionApprovalBinding'
         AND column_name IN (
           'inboundMessageId',
           'inboundSenderIgsid',
           'inboundDirection',
           'inboundReceivedAt'
         )
       ORDER BY column_name`,
    ),
  ).resolves.toStrictEqual([
    {
      column_name: 'inboundDirection',
      data_type: 'text',
      is_nullable: 'YES',
    },
    {
      column_name: 'inboundMessageId',
      data_type: 'text',
      is_nullable: 'YES',
    },
    {
      column_name: 'inboundReceivedAt',
      data_type: 'timestamp with time zone',
      is_nullable: 'YES',
    },
    {
      column_name: 'inboundSenderIgsid',
      data_type: 'text',
      is_nullable: 'YES',
    },
  ]);
  await expect(
    queryRaw(
      queryRunner,
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = 'core."actionApprovalBinding"'::regclass
         AND conname = 'CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION'
         AND contype = 'c'`,
    ),
  ).resolves.toStrictEqual([
    { conname: 'CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION' },
  ]);
};

const assertGenericIdDefaults = async (queryRunner: QueryRunner) => {
  await expect(
    queryRaw(queryRunner,
      `SELECT table_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name IN (
           'actionApprovalBinding',
           'actionApprovalBindingEvidenceLink',
           'actionExecutionReceipt'
         )
         AND column_name = 'id'
       ORDER BY table_name`,
    ),
  ).resolves.toStrictEqual([
    {
      table_name: 'actionApprovalBinding',
      column_default: 'uuid_generate_v4()',
    },
    {
      table_name: 'actionApprovalBindingEvidenceLink',
      column_default: 'uuid_generate_v4()',
    },
    {
      table_name: 'actionExecutionReceipt',
      column_default: 'uuid_generate_v4()',
    },
  ]);
};

const assertRepairedLegacySchema = async (queryRunner: QueryRunner) => {
  await expect(
    queryRaw(queryRunner,
      `SELECT table_name, array_agg(column_name ORDER BY column_name) AS columns
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name IN (
           'instagramReplyApprovalRequest',
           'instagramReplyExecutionReceipt'
         )
       GROUP BY table_name
       ORDER BY table_name`,
    ),
  ).resolves.toStrictEqual([
    {
      columns:
        '{approvalId,connectedAccountId,conversationId,createdAt,decidedAt,draftId,expiresAt,id,previewTextSha256,providerConversationId,recipientIgsid,state,threadId,toolName,updatedAt,userWorkspaceId,workspaceId}',
      table_name: 'instagramReplyApprovalRequest',
    },
    {
      columns:
        '{approvalRequestId,createdAt,failureCode,failureReason,id,providerMessageId,state,updatedAt}',
      table_name: 'instagramReplyExecutionReceipt',
    },
  ]);
  await expect(
    queryRaw(queryRunner,
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND ((table_name = 'instagramReplyApprovalRequest'
           AND column_name IN (
             'workspaceId', 'id', 'userWorkspaceId', 'threadId', 'approvalId',
             'toolName', 'connectedAccountId', 'draftId', 'conversationId',
             'previewTextSha256', 'state', 'expiresAt', 'createdAt', 'updatedAt'
           ))
           OR (table_name = 'instagramReplyExecutionReceipt'
             AND column_name IN (
               'id', 'approvalRequestId', 'state', 'createdAt', 'updatedAt'
             )))
         AND is_nullable = 'NO'
       ORDER BY table_name, column_name`,
    ),
  ).resolves.toHaveLength(19);
  await expect(
    queryRaw(queryRunner,
      `SELECT table_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name IN (
           'instagramReplyApprovalRequest',
           'instagramReplyExecutionReceipt'
         )
         AND column_name = 'id'
       ORDER BY table_name`,
    ),
  ).resolves.toStrictEqual([
    {
      table_name: 'instagramReplyApprovalRequest',
      column_default: 'uuid_generate_v4()',
    },
    {
      table_name: 'instagramReplyExecutionReceipt',
      column_default: 'uuid_generate_v4()',
    },
  ]);
  await expect(
    queryRaw(queryRunner,
      `SELECT conname, contype
       FROM pg_constraint
       WHERE conrelid IN (
         'core."instagramReplyApprovalRequest"'::regclass,
         'core."instagramReplyExecutionReceipt"'::regclass
       )
         AND contype IN ('p', 'u', 'f')
       ORDER BY conname`,
    ),
  ).resolves.toStrictEqual([
    {
      conname: 'FK_617792f9cfed9d503e2333b2a83',
      contype: 'f',
    },
    {
      conname: 'FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST',
      contype: 'f',
    },
    {
      conname: 'IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID',
      contype: 'u',
    },
    {
      conname: 'IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST',
      contype: 'u',
    },
    { conname: 'PK_0570e6a0a7170ee067a969dcf27', contype: 'p' },
    { conname: 'PK_1ecd8d74d2ebde2854db62b469e', contype: 'p' },
  ]);
  await expect(
    queryRaw(queryRunner,
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'core'
         AND tablename IN (
           'instagramReplyApprovalRequest',
           'instagramReplyExecutionReceipt'
         )
         AND indexname IN (
           'IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD',
           'IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE'
         )
       ORDER BY indexname`,
    ),
  ).resolves.toStrictEqual([
    { indexname: 'IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD' },
    { indexname: 'IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE' },
  ]);
};

describe('EvolveInstagramApprovalToActionAuthorityFastInstanceCommand', () => {
  const dataSource = new DataSource({
    type: 'postgres',
    url:
      process.env.PG_DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/test',
  });
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
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

  it('registers prepare and finalizer commands in timestamp order', () => {
    expect(INSTANCE_COMMANDS).toEqual(
      expect.arrayContaining([
        EvolveInstagramApprovalToActionAuthorityFastInstanceCommand,
        FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand,
      ]),
    );
    expect(
      [
        EvolveInstagramApprovalToActionAuthorityFastInstanceCommand,
        FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand,
      ].map(getRegisteredInstanceCommandMetadata),
    ).toStrictEqual([
      {
        runAfterWorkspace: false,
        timestamp: 1784112963056,
        type: 'fast',
        version: '2.19.0',
      },
      {
        runAfterWorkspace: false,
        timestamp: 1784112963059,
        type: 'slow',
        version: '2.19.0',
      },
    ]);
    expect(
      INSTANCE_COMMANDS.indexOf(
        EvolveInstagramApprovalToActionAuthorityFastInstanceCommand,
      ),
    ).toBeLessThan(
      INSTANCE_COMMANDS.indexOf(
        FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand,
      ),
    );
  });
  it('creates authority workspace foreign keys with cascading deletes', async () => {
    await installLegacyFixture(queryRunner, 'absent');
    await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
      queryRunner,
    );

    await expect(
      queryRaw(
        queryRunner,
        `SELECT relation.relname AS table_name, fk.conname,
                fk.confdeltype
         FROM pg_constraint AS fk
         JOIN pg_class AS relation ON relation.oid = fk.conrelid
         WHERE fk.contype = 'f'
           AND fk.conrelid IN (
             'core."actionApprovalBinding"'::regclass,
             'core."actionExecutionReceipt"'::regclass
           )
         ORDER BY table_name, fk.conname`,
      ),
    ).resolves.toStrictEqual([
      {
        conname: 'FK_ACTION_APPROVAL_BINDING_WORKSPACE',
        confdeltype: 'c',
        table_name: 'actionApprovalBinding',
      },
      {
        conname: 'FK_ACTION_EXECUTION_RECEIPT_BINDING',
        confdeltype: 'r',
        table_name: 'actionExecutionReceipt',
      },
      {
        conname: 'FK_ACTION_EXECUTION_RECEIPT_WORKSPACE',
        confdeltype: 'c',
        table_name: 'actionExecutionReceipt',
      },
    ]);
  });
  it('installs receipt idempotency uniqueness during the fast legacy cutover', async () => {
    await installLegacyFixture(queryRunner, 'original');
    await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
      queryRunner,
    );

    await expect(
      queryRaw(
        queryRunner,
        `SELECT conname
         FROM pg_constraint
         WHERE conrelid = 'core."actionExecutionReceipt"'::regclass
           AND conname = 'UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY'
           AND contype = 'u'`,
      ),
    ).resolves.toStrictEqual([
      { conname: 'UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY' },
    ]);
  });

  it('rejects a non-inbound inbound-proof direction', async () => {
    await installLegacyFixture(queryRunner, 'absent');
    await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
      queryRunner,
    );

    await expect(
      queryRaw(
        queryRunner,
        `INSERT INTO core."actionApprovalBinding" (
          "workspaceId", "initiatorUserWorkspaceId", "actionName", "draftId",
          "contentDigest", "threadId", "expiresAt", "inboundDirection"
        ) VALUES (
          '${workspaceId}',
          '00000000-0000-0000-0000-000000000601',
          'send_instagram_reply',
          '00000000-0000-0000-0000-000000000602',
          'abc',
          '00000000-0000-0000-0000-000000000603',
          now(),
          'OUTBOUND'
        )`,
      ),
    ).rejects.toThrow('CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION');
  });

  it('continues from a provider-binding cursor without recreating legacy tables', async () => {
    await installLegacyFixture(queryRunner, 'absent');
    const prepare =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();
    const providerBinding =
      new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand();
    const finalize =
      new FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand();

    await prepare.up(queryRunner);
    await providerBinding.up(queryRunner);

    await expect(
      queryRaw(
        queryRunner,
        `SELECT
          to_regclass('core."instagramReplyApprovalRequest"') AS legacy_binding,
          to_regclass('core."instagramReplyExecutionReceipt"') AS legacy_receipt,
          to_regclass('core."actionApprovalBinding"') AS binding`,
      ),
    ).resolves.toStrictEqual([
      {
        legacy_binding: null,
        legacy_receipt: null,
        binding: 'core."actionApprovalBinding"',
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'core'
           AND table_name = 'actionApprovalBinding'
           AND column_name IN ('providerConversationId', 'recipientIgsid')
         ORDER BY column_name`,
      ),
    ).resolves.toStrictEqual([
      { column_name: 'providerConversationId' },
      { column_name: 'recipientIgsid' },
    ]);

    await finalize.runDataMigration({
      query: queryRunner.query.bind(queryRunner),
    } as unknown as DataSource);
    await finalize.up(queryRunner);
    await assertGenericAuthoritySchema(queryRunner);
    await assertFinalizedInboundProof(queryRunner);
  });



  it('only prepares nullable generic shape before legacy data backfill', async () => {
    await installLegacyFixture(queryRunner, 'populated');
    const command =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();
    const query = jest.spyOn(queryRunner, 'query');

    await command.up(queryRunner);

    const queries = query.mock.calls.map(([statement]) => String(statement));
    query.mockRestore();

    expect(queries).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^\s*UPDATE\s/i)]),
    );
    expect(queries).not.toEqual(
      expect.arrayContaining([expect.stringContaining('jsonb_build_object')]),
    );
    await expect(
      queryRaw(
        queryRunner,
        `SELECT "actionName", "actionVersion"
         FROM core."actionApprovalBinding"
         ORDER BY id`,
      ),
    ).resolves.toStrictEqual([
      {
        actionName: 'request_instagram_reply_approval',
        actionVersion: null,
      },
      {
        actionName: 'request_instagram_reply_approval',
        actionVersion: null,
      },
      {
        actionName: 'request_instagram_reply_approval',
        actionVersion: null,
      },
      {
        actionName: 'request_instagram_reply_approval',
        actionVersion: null,
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT "workspaceId", "idempotencyKey", "redactedOutcome"
         FROM core."actionExecutionReceipt"
         ORDER BY id`,
      ),
    ).resolves.toStrictEqual([
      {
        workspaceId: null,
        idempotencyKey: null,
        redactedOutcome: null,
      },
      {
        workspaceId: null,
        idempotencyKey: null,
        redactedOutcome: null,
      },
      {
        workspaceId: null,
        idempotencyKey: null,
        redactedOutcome: null,
      },
      {
        workspaceId: null,
        idempotencyKey: null,
        redactedOutcome: null,
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'core'
           AND table_name = 'actionExecutionReceipt'
           AND column_name IN ('workspaceId', 'idempotencyKey')
         ORDER BY column_name`,
      ),
    ).resolves.toStrictEqual([
      { column_name: 'idempotencyKey', is_nullable: 'YES' },
      { column_name: 'workspaceId', is_nullable: 'YES' },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'core'
           AND table_name = 'actionApprovalBinding'
           AND column_name IN (
             'inboundMessageId',
             'inboundSenderIgsid',
             'inboundDirection',
             'inboundReceivedAt'
           )
         ORDER BY column_name`,
      ),
    ).resolves.toStrictEqual([
      { column_name: 'inboundDirection', is_nullable: 'YES' },
      { column_name: 'inboundMessageId', is_nullable: 'YES' },
      { column_name: 'inboundReceivedAt', is_nullable: 'YES' },
      { column_name: 'inboundSenderIgsid', is_nullable: 'YES' },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT "toolOutput"
         FROM core."agentMessagePart"
         WHERE id = '00000000-0000-0000-0000-000000000301'`,
      ),
    ).resolves.toStrictEqual([
      {
        toolOutput: {
          result: {
            approvalId: '00000000-0000-0000-0000-000000000031',
            preview: 'private reply',
          },
        },
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'core'
           AND table_name = 'actionApprovalBinding'
           AND column_name = 'approvalId'`,
      ),
    ).resolves.toStrictEqual([{ column_name: 'approvalId' }]);
  });

  it('backfills legacy data before finalizing action authority constraints', async () => {
    await installLegacyFixture(queryRunner, 'populated');
    await queryRunner.query('DROP TABLE IF EXISTS core."agentMessage" CASCADE');
    await queryRunner.query(
      'DROP TABLE IF EXISTS core."agentChatThread" CASCADE',
    );
    const prepare =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();
    const finalize =
      new FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand();
    await queryRunner.query(`CREATE TABLE core."agentChatThread" (
      "id" uuid PRIMARY KEY,
      "pendingQuestionMessageId" uuid
    )`);
    await queryRunner.query(`CREATE TABLE core."agentMessage" (
      "id" uuid PRIMARY KEY,
      "threadId" uuid NOT NULL
    )`);
    await queryRunner.query(
      'ALTER TABLE core."agentMessagePart" ADD COLUMN "messageId" uuid',
    );
    await queryRunner.query(`INSERT INTO core."agentChatThread" (
      "id", "pendingQuestionMessageId"
    ) VALUES
      ('00000000-0000-0000-0000-000000000401',
       '00000000-0000-0000-0000-000000000402'),
      ('00000000-0000-0000-0000-000000000403',
       '00000000-0000-0000-0000-000000000404')`);
    await queryRunner.query(`INSERT INTO core."agentMessage" ("id", "threadId")
      VALUES
        ('00000000-0000-0000-0000-000000000402',
         '00000000-0000-0000-0000-000000000401'),
        ('00000000-0000-0000-0000-000000000404',
         '00000000-0000-0000-0000-000000000403')`);
    await queryRunner.query(`UPDATE core."agentMessagePart"
      SET "messageId" = '00000000-0000-0000-0000-000000000402'
      WHERE "id" = '00000000-0000-0000-0000-000000000301'`);
    await queryRunner.query(`INSERT INTO core."agentMessagePart" (
      "id", "toolName", "toolOutput", "messageId"
    ) VALUES (
      '00000000-0000-0000-0000-000000000304',
      'ask_questions',
      '{"result":{"status":"pending"}}',
      '00000000-0000-0000-0000-000000000402'
    )`);


    await prepare.up(queryRunner);
    await finalize.runDataMigration({
      query: queryRunner.query.bind(queryRunner),
    } as unknown as DataSource);

    await expect(
      queryRaw(
        queryRunner,
        `SELECT "actionName", "actionVersion", state
         FROM core."actionApprovalBinding"
         ORDER BY id`,
      ),
    ).resolves.toStrictEqual([
      {
        actionName: 'send_instagram_reply',
        actionVersion: 1,
        state: 'EXPIRED',
      },
      {
        actionName: 'send_instagram_reply',
        actionVersion: 1,
        state: 'EXPIRED',
      },
      {
        actionName: 'send_instagram_reply',
        actionVersion: 1,
        state: 'EXPIRED',
      },
      {
        actionName: 'send_instagram_reply',
        actionVersion: 1,
        state: 'EXPIRED',
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT "inboundMessageId", "inboundSenderIgsid",
                "inboundDirection", "inboundReceivedAt"
         FROM core."actionApprovalBinding"
         ORDER BY id`,
      ),
    ).resolves.toStrictEqual([
      {
        inboundDirection: null,
        inboundMessageId: null,
        inboundReceivedAt: null,
        inboundSenderIgsid: null,
      },
      {
        inboundDirection: null,
        inboundMessageId: null,
        inboundReceivedAt: null,
        inboundSenderIgsid: null,
      },
      {
        inboundDirection: null,
        inboundMessageId: null,
        inboundReceivedAt: null,
        inboundSenderIgsid: null,
      },
      {
        inboundDirection: null,
        inboundMessageId: null,
        inboundReceivedAt: null,
        inboundSenderIgsid: null,
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT "workspaceId", "idempotencyKey", "redactedOutcome"
         FROM core."actionExecutionReceipt"
         ORDER BY id`,
      ),
    ).resolves.toStrictEqual([
      {
        workspaceId,
        idempotencyKey: `legacy:${receiptIds.sent}`,
        redactedOutcome: 'legacy_migrated',
      },
      {
        workspaceId,
        idempotencyKey: `legacy:${receiptIds.failed}`,
        redactedOutcome: 'legacy_migrated',
      },
      {
        workspaceId,
        idempotencyKey: `legacy:${receiptIds.blocked}`,
        redactedOutcome: 'legacy_migrated',
      },
      {
        workspaceId,
        idempotencyKey: `legacy:${receiptIds.unknown}`,
        redactedOutcome: 'legacy_migrated',
      },
    ]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'core'
           AND table_name = 'actionApprovalBinding'
           AND column_name = 'approvalId'`,
      ),
    ).resolves.toStrictEqual([{ column_name: 'approvalId' }]);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT "id", "pendingQuestionMessageId"
         FROM core."agentChatThread"
         ORDER BY "id"`,
      ),
    ).resolves.toStrictEqual([
      {
        id: '00000000-0000-0000-0000-000000000401',
        pendingQuestionMessageId: '00000000-0000-0000-0000-000000000402',
      },
      {
        id: '00000000-0000-0000-0000-000000000403',
        pendingQuestionMessageId: '00000000-0000-0000-0000-000000000404',
      },
    ]);


    await finalize.up(queryRunner);
    await assertGenericAuthoritySchema(queryRunner);
    await assertFinalizedInboundProof(queryRunner);
  });

  it.each<LegacyFixture>([
    'absent',
    'original',
    'repaired',
    'missing-id-default',
  ])(
    'evolves the %s legacy fixture through prepared, backfilled, and finalized boundaries',
    async (fixture) => {
      await installLegacyFixture(queryRunner, fixture);
      const prepare =
        new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();
      const finalize =
        new FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand();

      await prepare.up(queryRunner);

      const beforeSecondPrepare = await queryRaw(queryRunner,
        `SELECT
          (SELECT count(*) FROM core."actionApprovalBinding") AS bindings,
          (SELECT count(*) FROM core."actionExecutionReceipt") AS receipts`,
      );

      const secondPrepareQuery = jest.spyOn(queryRunner, 'query');
      await prepare.up(queryRunner);
      expect(
        secondPrepareQuery.mock.calls.map(([query]) => String(query)),
      ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^ALTER TABLE/)]));
      secondPrepareQuery.mockRestore();

      await finalize.runDataMigration({
        query: queryRunner.query.bind(queryRunner),
      } as unknown as DataSource);
      await finalize.up(queryRunner);
      await assertGenericAuthoritySchema(queryRunner);
      await assertGenericIdDefaults(queryRunner);
      await assertFinalizedInboundProof(queryRunner);

      await expect(
        queryRaw(queryRunner,
          `SELECT
            (SELECT count(*) FROM core."actionApprovalBinding") AS bindings,
            (SELECT count(*) FROM core."actionExecutionReceipt") AS receipts`,
        ),
      ).resolves.toStrictEqual(beforeSecondPrepare);

    },
  );
  it.each([
    ['partial legacy', 'instagramReplyApprovalRequest'],
    ['partial generic', 'actionApprovalBinding'],
  ])('rejects a %s table state', async (_name, tableName) => {
    await installLegacyFixture(queryRunner, 'absent');
    await queryRunner.query(`CREATE TABLE core."${tableName}" ("id" uuid)`);

    const command =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();

    await expect(command.up(queryRunner)).rejects.toThrow(
      'Unsupported action approval migration table state',
    );
  });

  it('rejects a legacy and generic mixed table state', async () => {
    await installLegacyFixture(queryRunner, 'original');
    await queryRunner.query(
      'CREATE TABLE core."actionApprovalBinding" ("id" uuid)',
    );

    const command =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();

    await expect(command.up(queryRunner)).rejects.toThrow(
      'Unsupported action approval migration table state',
    );
  });

  it('refuses to roll back populated generic authority tables', async () => {
    await installLegacyFixture(queryRunner, 'populated');
    const command =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();

    await command.up(queryRunner);

    await expect(command.down(queryRunner)).rejects.toThrow(
      'Cannot roll back populated action approval authority tables',
    );
    await assertGenericAuthoritySchema(queryRunner);
  });

  it('rolls finalized inbound proof back through the prepared legacy shape', async () => {
    await installLegacyFixture(queryRunner, 'repaired');
    const prepare =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();
    const finalize =
      new FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand();

    await prepare.up(queryRunner);
    await finalize.runDataMigration({
      query: queryRunner.query.bind(queryRunner),
    } as unknown as DataSource);
    await finalize.up(queryRunner);
    await assertFinalizedInboundProof(queryRunner);
    await queryRunner.query('SET CONSTRAINTS ALL IMMEDIATE');
    await finalize.down(queryRunner);
    await expect(
      queryRaw(
        queryRunner,
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'core'
           AND table_name = 'actionApprovalBinding'
           AND column_name IN (
             'inboundMessageId',
             'inboundSenderIgsid',
             'inboundDirection',
             'inboundReceivedAt'
           )
         ORDER BY column_name`,
      ),
    ).resolves.toStrictEqual([
      { column_name: 'inboundDirection', is_nullable: 'YES' },
      { column_name: 'inboundMessageId', is_nullable: 'YES' },
      { column_name: 'inboundReceivedAt', is_nullable: 'YES' },
      { column_name: 'inboundSenderIgsid', is_nullable: 'YES' },
    ]);
    await prepare.down(queryRunner);

    await expect(
      queryRaw(queryRunner,
        `SELECT
          to_regclass('core."instagramReplyApprovalRequest"') AS binding,
          to_regclass('core."instagramReplyExecutionReceipt"') AS receipt,
          to_regclass('core."actionApprovalBinding"') AS generic_binding,
          to_regclass('core."actionExecutionReceipt"') AS generic_receipt`,
      ),
    ).resolves.toStrictEqual([
      {
        binding: 'core."instagramReplyApprovalRequest"',
        receipt: 'core."instagramReplyExecutionReceipt"',
        generic_binding: null,
        generic_receipt: null,
      },
    ]);
    await assertRepairedLegacySchema(queryRunner);
  });
});
