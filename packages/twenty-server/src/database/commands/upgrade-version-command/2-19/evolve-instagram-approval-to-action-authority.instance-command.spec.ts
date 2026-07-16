import { DataSource, type QueryRunner } from 'typeorm';

import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-evolve-instagram-approval-to-action-authority';
jest.useRealTimers();


type LegacyFixture = 'absent' | 'original' | 'repaired' | 'populated';

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

const getColumns = async (queryRunner: QueryRunner, tableName: string) =>
  queryRunner.query<{ column_name: string }[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );

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
      "id" uuid PRIMARY KEY,
      "userWorkspaceId" uuid NOT NULL,
      "threadId" uuid NOT NULL,
      "approvalId" uuid NOT NULL,
      "toolName" varchar NOT NULL,
      "connectedAccountId" varchar NOT NULL,
      "draftId" uuid NOT NULL,
      "conversationId" uuid NOT NULL,
      "previewTextSha256" varchar(64) NOT NULL,
      "state" core."instagramReplyApprovalRequest_state_enum" NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      "decidedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID"
        UNIQUE ("workspaceId", "approvalId")
    )`,
  );
  await queryRunner.query(
    `CREATE TABLE core."instagramReplyExecutionReceipt" (
      "id" uuid PRIMARY KEY,
      "approvalRequestId" uuid NOT NULL UNIQUE,
      "state" core."instagramReplyExecutionReceipt_state_enum" NOT NULL,
      "providerMessageId" text,
      "failureCode" text,
      "failureReason" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`,
  );

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
     VALUES (
       '00000000-0000-0000-0000-000000000301',
       'request_instagram_reply_approval',
       '{"result":{"approvalId":"00000000-0000-0000-0000-000000000031","preview":"private reply"}}'
     )`,
  );
};

const assertGenericAuthoritySchema = async (queryRunner: QueryRunner) => {
  await expect(
    queryRunner.query<
      { binding: string | null; link: string | null; receipt: string | null }[]
    >(
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
    queryRunner.query(
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

  it.each<LegacyFixture>(['absent', 'original', 'repaired', 'populated'])(
    'evolves the %s legacy fixture in place and is idempotent',
    async (fixture) => {
      await installLegacyFixture(queryRunner, fixture);
      const command =
        new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();

      await command.up(queryRunner);
      await assertGenericAuthoritySchema(queryRunner);

      const beforeSecondUp = await queryRunner.query(
        `SELECT
          (SELECT count(*) FROM core."actionApprovalBinding") AS bindings,
          (SELECT count(*) FROM core."actionExecutionReceipt") AS receipts`,
      );

      const secondUpQuery = jest.spyOn(queryRunner, 'query');
      await command.up(queryRunner);
      expect(
        secondUpQuery.mock.calls.map(([query]) => String(query)),
      ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^ALTER TABLE/)]));
      secondUpQuery.mockRestore();
      await assertGenericAuthoritySchema(queryRunner);

      await expect(
        queryRunner.query(
          `SELECT
            (SELECT count(*) FROM core."actionApprovalBinding") AS bindings,
            (SELECT count(*) FROM core."actionExecutionReceipt") AS receipts`,
        ),
      ).resolves.toStrictEqual(beforeSecondUp);

      if (fixture !== 'populated') {
        return;
      }

      await expect(
        queryRunner.query(
          `SELECT id, state
           FROM core."actionApprovalBinding"
           WHERE id IN ($1, $2)
           ORDER BY id`,
          [bindingIds.pending, bindingIds.approved],
        ),
      ).resolves.toStrictEqual([
        { id: bindingIds.pending, state: 'EXPIRED' },
        { id: bindingIds.approved, state: 'EXPIRED' },
      ]);
      await expect(
        queryRunner.query(
          `SELECT id, state
           FROM core."actionExecutionReceipt"
           ORDER BY id`,
        ),
      ).resolves.toStrictEqual([
        { id: receiptIds.sent, state: 'SENT' },
        { id: receiptIds.failed, state: 'FAILED' },
        { id: receiptIds.blocked, state: 'BLOCKED' },
        { id: receiptIds.unknown, state: 'UNKNOWN' },
      ]);
      await expect(
        queryRunner.query(
          'SELECT "toolOutput" FROM core."agentMessagePart"',
        ),
      ).resolves.toStrictEqual([
        {
          toolOutput: {
            result: {
              bindingId: bindingIds.pending,
              status: 'expired',
            },
            success: true,
          },
        },
      ]);
    },
  );

  it('restores the repaired schema only for disposable tests', async () => {
    await installLegacyFixture(queryRunner, 'repaired');
    const command =
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand();

    await command.up(queryRunner);
    await command.down(queryRunner);

    await expect(
      queryRunner.query(
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
  });
});
