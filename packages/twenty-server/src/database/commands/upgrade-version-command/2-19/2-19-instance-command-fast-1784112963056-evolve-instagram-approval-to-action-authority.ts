import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

const LEGACY_BINDING = 'core."instagramReplyApprovalRequest"';
const LEGACY_RECEIPT = 'core."instagramReplyExecutionReceipt"';
const BINDING = 'core."actionApprovalBinding"';
const EVIDENCE_LINK = 'core."actionApprovalBindingEvidenceLink"';
const RECEIPT = 'core."actionExecutionReceipt"';

const tableExists = async (queryRunner: QueryRunner, table: string) => {
  const [{ exists }] = await queryRunner.query<{ exists: boolean }[]>(
    'SELECT to_regclass($1) IS NOT NULL AS "exists"',
    [table],
  );

  return exists;
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
    "recipientFingerprint" varchar(64),
    "sendingAccountFingerprint" varchar(64),
    "threadId" uuid NOT NULL,
    "state" core."actionApprovalBinding_state_enum" NOT NULL DEFAULT 'PENDING',
    "expiresAt" timestamptz NOT NULL,
    "decidedAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_ACTION_APPROVAL_BINDING" PRIMARY KEY ("id")
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
      FOREIGN KEY ("actionApprovalBindingId") REFERENCES ${BINDING}("id") ON DELETE RESTRICT
  )`);
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD" ON core."actionApprovalBinding" ("workspaceId", "threadId")',
  );
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_ACTION_EXECUTION_RECEIPT_STATE" ON core."actionExecutionReceipt" ("state")',
  );
};

const renameLegacyTables = async (queryRunner: QueryRunner) => {
  await queryRunner.query(
    `ALTER TABLE ${LEGACY_BINDING} RENAME TO "actionApprovalBinding"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${LEGACY_RECEIPT} RENAME TO "actionExecutionReceipt"`,
  );
};

const evolveLegacyBinding = async (queryRunner: QueryRunner) => {
  await queryRunner.query(`ALTER TABLE ${BINDING}
    ALTER COLUMN "state" DROP DEFAULT,
    ALTER COLUMN "state" TYPE core."actionApprovalBinding_state_enum"
      USING CASE "state"::text
        WHEN 'PENDING' THEN 'EXPIRED'
        WHEN 'APPROVED' THEN 'EXPIRED'
        WHEN 'REJECTED' THEN 'REJECTED'
        WHEN 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
        ELSE 'EXPIRED'
      END::core."actionApprovalBinding_state_enum",
    ALTER COLUMN "state" SET DEFAULT 'PENDING'`);
  await queryRunner.query(`ALTER TABLE ${BINDING}
    RENAME COLUMN "userWorkspaceId" TO "initiatorUserWorkspaceId"`);
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "toolName" TO "actionName"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${BINDING} RENAME COLUMN "previewTextSha256" TO "contentDigest"`,
  );
  await queryRunner.query(`ALTER TABLE ${BINDING}
    ADD COLUMN IF NOT EXISTS "actionVersion" integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "recipientFingerprint" varchar(64),
    ADD COLUMN IF NOT EXISTS "sendingAccountFingerprint" varchar(64)`);
  await queryRunner.query(
    `ALTER TABLE ${BINDING} ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
  );
  await queryRunner.query(`UPDATE ${BINDING}
    SET "actionName" = 'send_instagram_reply'
    WHERE "actionName" = 'request_instagram_reply_approval'`);
  await queryRunner.query(`DO $$ BEGIN
    IF to_regclass('core."agentMessagePart"') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'agentMessagePart'
          AND column_name = 'toolOutput'
      ) THEN
      UPDATE core."agentMessagePart" AS part
      SET "toolOutput" = jsonb_build_object(
        'success', true,
        'result', CASE WHEN (
          SELECT count(*)
          FROM core."actionApprovalBinding" AS binding
          WHERE binding."approvalId"::text =
            part."toolOutput"->'result'->>'approvalId'
        ) = 1 THEN jsonb_build_object(
          'status', 'expired',
          'bindingId', (
            SELECT binding.id
            FROM core."actionApprovalBinding" AS binding
            WHERE binding."approvalId"::text =
              part."toolOutput"->'result'->>'approvalId'
          )
        ) ELSE jsonb_build_object('status', 'expired') END
      )
      WHERE part."toolName" = 'request_instagram_reply_approval';
    END IF;
  END $$`);
  await queryRunner.query(`ALTER TABLE ${BINDING}
    DROP COLUMN IF EXISTS "approvalId",
    DROP COLUMN IF EXISTS "connectedAccountId",
    DROP COLUMN IF EXISTS "conversationId",
    DROP COLUMN IF EXISTS "providerConversationId",
    DROP COLUMN IF EXISTS "recipientIgsid"`);
  await queryRunner.query(
    'DROP INDEX IF EXISTS core."IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD"',
  );
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD" ON core."actionApprovalBinding" ("workspaceId", "threadId")',
  );
};

const evolveLegacyReceipt = async (queryRunner: QueryRunner) => {
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"`,
  );
  await queryRunner.query(`ALTER TABLE ${RECEIPT}
    ALTER COLUMN "state" DROP DEFAULT,
    ALTER COLUMN "state" TYPE core."actionExecutionReceipt_state_enum"
      USING CASE "state"::text
        WHEN 'PROCESSING' THEN 'PROCESSING'
        WHEN 'SENT' THEN 'SENT'
        WHEN 'FAILED' THEN 'FAILED'
        WHEN 'BLOCKED' THEN 'BLOCKED'
        ELSE 'UNKNOWN'
      END::core."actionExecutionReceipt_state_enum",
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
  await queryRunner.query(`UPDATE ${RECEIPT} AS receipt
    SET "workspaceId" = binding."workspaceId",
        "idempotencyKey" = 'legacy:' || receipt.id::text,
        "redactedOutcome" = 'legacy_migrated'
    FROM ${BINDING} AS binding
    WHERE binding.id = receipt."actionApprovalBindingId"`);
  await queryRunner.query(`ALTER TABLE ${RECEIPT}
    ALTER COLUMN "workspaceId" SET NOT NULL,
    ALTER COLUMN "idempotencyKey" SET NOT NULL,
    DROP COLUMN IF EXISTS "failureReason"`);
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "instagramReplyExecutionReceipt_approvalRequestId_key"`,
  );
  await queryRunner.query(
    `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST"`,
  );
  await queryRunner.query(
    'DROP INDEX IF EXISTS core."IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE"',
  );
  await queryRunner.query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'UQ_ACTION_EXECUTION_RECEIPT_BINDING'
        AND conrelid = 'core."actionExecutionReceipt"'::regclass
    ) THEN
      ALTER TABLE core."actionExecutionReceipt"
        ADD CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_BINDING"
        UNIQUE ("actionApprovalBindingId");
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY'
        AND conrelid = 'core."actionExecutionReceipt"'::regclass
    ) THEN
      ALTER TABLE core."actionExecutionReceipt"
        ADD CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY"
        UNIQUE ("workspaceId", "idempotencyKey");
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'FK_ACTION_EXECUTION_RECEIPT_BINDING'
        AND conrelid = 'core."actionExecutionReceipt"'::regclass
    ) THEN
      ALTER TABLE core."actionExecutionReceipt"
        ADD CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_BINDING"
        FOREIGN KEY ("actionApprovalBindingId")
        REFERENCES core."actionApprovalBinding"("id") ON DELETE RESTRICT;
    END IF;
  END $$`);
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_ACTION_EXECUTION_RECEIPT_STATE" ON core."actionExecutionReceipt" ("state")',
  );
};

@RegisteredInstanceCommand('2.19.0', 1784112963056)
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
      await renameLegacyTables(queryRunner);
      await evolveLegacyBinding(queryRunner);
      await evolveLegacyReceipt(queryRunner);
      await queryRunner.query(
        'DROP TYPE IF EXISTS core."instagramReplyApprovalRequest_state_enum"',
      );
      await queryRunner.query(
        'DROP TYPE IF EXISTS core."instagramReplyExecutionReceipt_state_enum"',
      );
      await createGenericTables(queryRunner);

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

    const [{ bindingRows, evidenceRows, receiptRows }] =
      (await queryRunner.query(`SELECT
        (SELECT count(*) FROM ${BINDING}) AS "bindingRows",
        (SELECT count(*) FROM ${EVIDENCE_LINK}) AS "evidenceRows",
        (SELECT count(*) FROM ${RECEIPT}) AS "receiptRows"`)) as {
        bindingRows: string;
        evidenceRows: string;
        receiptRows: string;
      }[];

    if (
      Number(bindingRows) > 0 ||
      Number(evidenceRows) > 0 ||
      Number(receiptRows) > 0
    ) {
      throw new Error(
        'Cannot roll back populated action approval authority tables',
      );
    }

    await queryRunner.query(`DROP TABLE ${EVIDENCE_LINK}`);
    await queryRunner.query(`DROP TABLE ${RECEIPT}`);
    await queryRunner.query(`DROP TABLE ${BINDING}`);
    await queryRunner.query(
      'DROP TYPE IF EXISTS core."actionApprovalBinding_state_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS core."actionExecutionReceipt_state_enum"',
    );
    await queryRunner.query(`CREATE TYPE core."instagramReplyApprovalRequest_state_enum" AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'
    )`);
    await queryRunner.query(`CREATE TYPE core."instagramReplyExecutionReceipt_state_enum" AS ENUM (
      'PROCESSING', 'SENT', 'FAILED', 'BLOCKED', 'UNKNOWN'
    )`);
    await queryRunner.query(`CREATE TABLE ${LEGACY_BINDING} (
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
      "providerConversationId" text,
      "recipientIgsid" text,
      CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID"
        UNIQUE ("workspaceId", "approvalId"),
      CONSTRAINT "PK_0570e6a0a7170ee067a969dcf27" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON core."instagramReplyApprovalRequest" ("workspaceId", "threadId")',
    );
    await queryRunner.query(`CREATE TABLE ${LEGACY_RECEIPT} (
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
      CONSTRAINT "PK_1ecd8d74d2ebde2854db62b469e" PRIMARY KEY ("id"),
      CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"
        FOREIGN KEY ("approvalRequestId") REFERENCES ${LEGACY_BINDING}("id")
        ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON core."instagramReplyExecutionReceipt" ("state")',
    );
  }
}
