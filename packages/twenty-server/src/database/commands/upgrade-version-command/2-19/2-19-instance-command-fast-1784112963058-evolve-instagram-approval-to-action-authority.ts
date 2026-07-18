import type { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import type { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

const LEGACY_BINDING = 'core."instagramReplyApprovalRequest"';
const LEGACY_RECEIPT = 'core."instagramReplyExecutionReceipt"';
const BINDING = 'core."actionApprovalBinding"';
const EVIDENCE_LINK = 'core."actionApprovalBindingEvidenceLink"';
const RECEIPT = 'core."actionExecutionReceipt"';

const tableExists = async (queryRunner: QueryRunner, table: string) => {
  const rows: unknown = await queryRunner.query(
    'SELECT to_regclass($1) IS NOT NULL AS "exists"',
    [table],
  );

  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    !('exists' in rows[0]) ||
    typeof rows[0].exists !== 'boolean'
  ) {
    throw new Error('Unexpected table existence query result');
  }

  return rows[0].exists;
};

const columnExists = async (
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string,
) => {
  const rows: unknown = await queryRunner.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'core'
        AND table_name = $1
        AND column_name = $2
    ) AS "exists"`,
    [tableName, columnName],
  );

  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    !('exists' in rows[0]) ||
    typeof rows[0].exists !== 'boolean'
  ) {
    throw new Error('Unexpected column existence query result');
  }

  return rows[0].exists;
};

const createGenericTypes = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`DO $$ BEGIN
    CREATE TYPE core."actionApprovalBinding_state_enum" AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED', 'CONSUMED'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);
  await queryRunner.query(`DO $$ BEGIN
    CREATE TYPE core."actionExecutionReceipt_state_enum" AS ENUM (
      'PROCESSING', 'PROVIDER_ACCEPTED', 'SENT', 'BLOCKED', 'FAILED', 'UNKNOWN'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);
};

const createGenericTables = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${BINDING} (
    "workspaceId" uuid NOT NULL,
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "initiatorUserWorkspaceId" uuid NOT NULL,
    "actionName" varchar NOT NULL,
    "actionVersion" integer NOT NULL DEFAULT 1,
    "draftId" uuid NOT NULL,
    "contentDigest" varchar(64) NOT NULL,
    "inboundMessageId" text,
    "inboundSenderIgsid" text,
    "inboundDirection" text,
    "inboundReceivedAt" timestamptz,
    "recipientFingerprint" varchar(64),
    "sendingAccountFingerprint" varchar(64),
    "threadId" uuid NOT NULL,
    "state" core."actionApprovalBinding_state_enum" NOT NULL DEFAULT 'PENDING',
    "expiresAt" timestamptz NOT NULL,
    "decidedAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_ACTION_APPROVAL_BINDING" PRIMARY KEY ("id"),
    CONSTRAINT "FK_ACTION_APPROVAL_BINDING_WORKSPACE"
      FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE,
    CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION"
      CHECK ("inboundDirection" IS NULL OR "inboundDirection" = 'INBOUND')
  )`);
  await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${EVIDENCE_LINK} (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "actionApprovalBindingId" uuid NOT NULL,
    "objectMetadataId" uuid NOT NULL,
    "recordId" uuid NOT NULL,
    "role" varchar NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_ACTION_APPROVAL_BINDING_EVIDENCE_LINK" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_ACTION_APPROVAL_BINDING_EVIDENCE_LINK" UNIQUE (
      "actionApprovalBindingId", "objectMetadataId", "recordId", "role"
    ),
    CONSTRAINT "FK_ACTION_APPROVAL_BINDING_EVIDENCE_LINK_BINDING"
      FOREIGN KEY ("actionApprovalBindingId") REFERENCES ${BINDING}("id") ON DELETE CASCADE
  )`);
  await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${RECEIPT} (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "workspaceId" uuid NOT NULL,
    "actionApprovalBindingId" uuid NOT NULL,
    "idempotencyKey" varchar(64) NOT NULL,
    "state" core."actionExecutionReceipt_state_enum" NOT NULL DEFAULT 'PROCESSING',
    "providerMessageId" text,
    "providerCode" text,
    "redactedOutcome" varchar,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_ACTION_EXECUTION_RECEIPT" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_BINDING" UNIQUE ("actionApprovalBindingId"),
    CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY"
      UNIQUE ("workspaceId", "idempotencyKey"),
    CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_BINDING"
      FOREIGN KEY ("actionApprovalBindingId") REFERENCES ${BINDING}("id") ON DELETE RESTRICT,
    CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_WORKSPACE"
      FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE
  )`);
};

const createGenericIndexes = async (queryRunner: QueryRunner) => {
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD" ON core."actionApprovalBinding" ("workspaceId", "threadId")',
  );
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_ACTION_EXECUTION_RECEIPT_STATE" ON core."actionExecutionReceipt" ("state")',
  );
};

const prepareLegacyBinding = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`ALTER TABLE ${BINDING}
    ALTER COLUMN "state" DROP DEFAULT,
    ALTER COLUMN "state" TYPE core."actionApprovalBinding_state_enum"
      USING "state"::text::core."actionApprovalBinding_state_enum",
    ALTER COLUMN "state" SET DEFAULT 'PENDING'`);
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "userWorkspaceId" TO "initiatorUserWorkspaceId"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "toolName" TO "actionName"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "previewTextSha256" TO "contentDigest"`,
  );
  await queryRunner.query(`ALTER TABLE ${BINDING}
    ADD COLUMN IF NOT EXISTS "actionVersion" integer,
    ADD COLUMN IF NOT EXISTS "inboundMessageId" text,
    ADD COLUMN IF NOT EXISTS "inboundSenderIgsid" text,
    ADD COLUMN IF NOT EXISTS "inboundDirection" text,
    ADD COLUMN IF NOT EXISTS "inboundReceivedAt" timestamptz,
    ADD COLUMN IF NOT EXISTS "recipientFingerprint" varchar(64),
    ADD COLUMN IF NOT EXISTS "sendingAccountFingerprint" varchar(64)`);
  await queryRunner.query(
    `ALTER TABLE ${BINDING} ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
  );
};

const prepareLegacyReceipt = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`ALTER TABLE ${RECEIPT}
    ALTER COLUMN "state" DROP DEFAULT,
    ALTER COLUMN "state" TYPE core."actionExecutionReceipt_state_enum"
      USING "state"::text::core."actionExecutionReceipt_state_enum",
    ALTER COLUMN "state" SET DEFAULT 'PROCESSING'`);
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} RENAME COLUMN "approvalRequestId" TO "actionApprovalBindingId"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} RENAME COLUMN "failureCode" TO "providerCode"`,
  );
  await queryRunner.query(`ALTER TABLE ${RECEIPT}
    ADD COLUMN IF NOT EXISTS "workspaceId" uuid,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(64),
    ADD COLUMN IF NOT EXISTS "redactedOutcome" varchar`);
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
  );
};

const ensureReceiptIdempotencyConstraint = async (
  queryRunner: QueryRunner,
) => {
  await queryRunner.query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY'
        AND conrelid = 'core."actionExecutionReceipt"'::regclass
    ) THEN
      ALTER TABLE core."actionExecutionReceipt"
        ADD CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY"
        UNIQUE ("workspaceId", "idempotencyKey");
    END IF;
  END $$`);
};

const assertTablesAreEmpty = async (queryRunner: QueryRunner) => {
  const rows = (await queryRunner.query(`SELECT
    (SELECT count(*) FROM ${BINDING}) AS "bindingRows",
    (SELECT count(*) FROM ${EVIDENCE_LINK}) AS "evidenceRows",
    (SELECT count(*) FROM ${RECEIPT}) AS "receiptRows"`)) as {
    bindingRows: string;
    evidenceRows: string;
    receiptRows: string;
  }[];
  const [{ bindingRows, evidenceRows, receiptRows }] = rows;

  if (
    Number(bindingRows) > 0 ||
    Number(evidenceRows) > 0 ||
    Number(receiptRows) > 0
  ) {
    throw new Error(
      'Cannot roll back populated action approval authority tables',
    );
  }
};

const restoreLegacyShape = async (queryRunner: QueryRunner) => {
  const [newBindingFields, newReceiptFields] = await Promise.all([
    queryRunner.query(`SELECT count(*)::int AS count FROM ${BINDING}
      WHERE "actionVersion" IS NOT NULL
        OR "inboundMessageId" IS NOT NULL
        OR "inboundSenderIgsid" IS NOT NULL
        OR "inboundDirection" IS NOT NULL
        OR "inboundReceivedAt" IS NOT NULL
        OR "recipientFingerprint" IS NOT NULL
        OR "sendingAccountFingerprint" IS NOT NULL`),
    queryRunner.query(`SELECT count(*)::int AS count FROM ${RECEIPT}
      WHERE "workspaceId" IS NOT NULL
        OR "idempotencyKey" IS NOT NULL
        OR "redactedOutcome" IS NOT NULL`),
  ]);

  if (newBindingFields[0].count > 0 || newReceiptFields[0].count > 0) {
    throw new Error(
      'Cannot roll back action approval authority shape after new fields are populated',
    );
  }

  await assertTablesAreEmpty(queryRunner);
  await queryRunner.query(`DROP TABLE ${EVIDENCE_LINK}`);
  await queryRunner.query(`ALTER TABLE ${RECEIPT}
    DROP COLUMN "workspaceId",
    DROP COLUMN "idempotencyKey",
    DROP COLUMN "redactedOutcome"`);
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} RENAME COLUMN "actionApprovalBindingId" TO "approvalRequestId"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} RENAME COLUMN "providerCode" TO "failureCode"`,
  );
  await queryRunner.query(`ALTER TABLE ${RECEIPT}
    ALTER COLUMN "state" DROP DEFAULT,
    ALTER COLUMN "state" TYPE core."instagramReplyExecutionReceipt_state_enum"
      USING "state"::text::core."instagramReplyExecutionReceipt_state_enum",
    ALTER COLUMN "state" SET DEFAULT 'PROCESSING'`);
  await queryRunner.query(`ALTER TABLE ${BINDING}
    DROP COLUMN "actionVersion",
    DROP COLUMN "inboundMessageId",
    DROP COLUMN "inboundSenderIgsid",
    DROP COLUMN "inboundDirection",
    DROP COLUMN "inboundReceivedAt",
    DROP COLUMN "recipientFingerprint",
    DROP COLUMN "sendingAccountFingerprint"`);
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "initiatorUserWorkspaceId" TO "userWorkspaceId"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "actionName" TO "toolName"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "contentDigest" TO "previewTextSha256"`,
  );
  await queryRunner.query(`ALTER TABLE ${BINDING}
    ALTER COLUMN "state" DROP DEFAULT,
    ALTER COLUMN "state" TYPE core."instagramReplyApprovalRequest_state_enum"
      USING "state"::text::core."instagramReplyApprovalRequest_state_enum",
    ALTER COLUMN "state" SET DEFAULT 'PENDING'`);
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME TO "instagramReplyApprovalRequest"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} RENAME TO "instagramReplyExecutionReceipt"`,
  );
  await queryRunner.query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'FK_617792f9cfed9d503e2333b2a83'
        AND conrelid = 'core."instagramReplyApprovalRequest"'::regclass
    ) THEN
      ALTER TABLE core."instagramReplyApprovalRequest"
        ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83"
        FOREIGN KEY ("workspaceId")
        REFERENCES core."workspace"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST'
        AND conrelid = 'core."instagramReplyExecutionReceipt"'::regclass
    ) THEN
      ALTER TABLE core."instagramReplyExecutionReceipt"
        ADD CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"
        FOREIGN KEY ("approvalRequestId")
        REFERENCES core."instagramReplyApprovalRequest"("id")
        ON DELETE RESTRICT;
    END IF;
  END $$`);
  await queryRunner.query(
    'DROP TYPE IF EXISTS core."actionApprovalBinding_state_enum"',
  );
  await queryRunner.query(
    'DROP TYPE IF EXISTS core."actionExecutionReceipt_state_enum"',
  );
};

@RegisteredInstanceCommand('2.19.0', 1784112963058)
export class EvolveInstagramApprovalToActionAuthorityFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasLegacyBinding = await tableExists(queryRunner, LEGACY_BINDING);
    const hasLegacyReceipt = await tableExists(queryRunner, LEGACY_RECEIPT);
    const hasBinding = await tableExists(queryRunner, BINDING);
    const hasEvidenceLink = await tableExists(queryRunner, EVIDENCE_LINK);
    const hasReceipt = await tableExists(queryRunner, RECEIPT);

    if (
      !hasLegacyBinding &&
      !hasLegacyReceipt &&
      !hasBinding &&
      !hasEvidenceLink &&
      !hasReceipt
    ) {
      await createGenericTypes(queryRunner);
      await createGenericTables(queryRunner);
      await createGenericIndexes(queryRunner);

      return;
    }

    if (
      hasLegacyBinding &&
      hasLegacyReceipt &&
      !hasBinding &&
      !hasEvidenceLink &&
      !hasReceipt
    ) {
      await createGenericTypes(queryRunner);
      await queryRunner.query(
        `ALTER TABLE ${LEGACY_BINDING} RENAME TO "actionApprovalBinding"`,
      );
      await queryRunner.query(
        `ALTER TABLE ${LEGACY_RECEIPT} RENAME TO "actionExecutionReceipt"`,
      );
      await prepareLegacyBinding(queryRunner);
      await prepareLegacyReceipt(queryRunner);
      await createGenericTables(queryRunner);
      await ensureReceiptIdempotencyConstraint(queryRunner);

      return;
    }

    if (
      !hasLegacyBinding &&
      !hasLegacyReceipt &&
      hasBinding &&
      hasEvidenceLink &&
      hasReceipt
    ) {
      return;
    }

    throw new Error('Unsupported action approval migration table state');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasBinding = await tableExists(queryRunner, BINDING);
    const hasEvidenceLink = await tableExists(queryRunner, EVIDENCE_LINK);
    const hasReceipt = await tableExists(queryRunner, RECEIPT);

    if (!hasBinding && !hasEvidenceLink && !hasReceipt) {
      return;
    }

    if (!hasBinding || !hasEvidenceLink || !hasReceipt) {
      throw new Error('Unsupported action approval migration table state');
    }

    if (await columnExists(queryRunner, 'actionApprovalBinding', 'approvalId')) {
      await restoreLegacyShape(queryRunner);

      return;
    }

    await assertTablesAreEmpty(queryRunner);
    await queryRunner.query(`DROP TABLE ${EVIDENCE_LINK}`);
    await queryRunner.query(`DROP TABLE ${RECEIPT}`);
    await queryRunner.query(`DROP TABLE ${BINDING}`);
    await queryRunner.query(
      'DROP TYPE IF EXISTS core."actionApprovalBinding_state_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS core."actionExecutionReceipt_state_enum"',
    );
  }
}
