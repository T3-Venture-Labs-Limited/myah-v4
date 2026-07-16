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
        'result', jsonb_build_object('status', 'expired', 'bindingId', binding.id)
      )
      FROM core."actionApprovalBinding" AS binding
      WHERE part."toolName" = 'request_instagram_reply_approval'
        AND part."toolOutput"->'result'->>'approvalId' = binding."approvalId"::text;
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
    const hasReceipt = await tableExists(queryRunner, RECEIPT);

    await createGenericTypes(queryRunner);

    if (!hasLegacyBinding && !hasLegacyReceipt && !hasBinding && !hasReceipt) {
      await createGenericTables(queryRunner);

      return;
    }

    if (hasLegacyBinding && hasLegacyReceipt && !hasBinding && !hasReceipt) {
      await renameLegacyTables(queryRunner);
      await evolveLegacyBinding(queryRunner);
      await evolveLegacyReceipt(queryRunner);
      await queryRunner.query(
        'DROP TYPE IF EXISTS core."instagramReplyApprovalRequest_state_enum"',
      );
      await queryRunner.query(
        'DROP TYPE IF EXISTS core."instagramReplyExecutionReceipt_state_enum"',
      );
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

      return;
    }

    await createGenericTables(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, BINDING))) {
      return;
    }

    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE core."instagramReplyApprovalRequest_state_enum" AS ENUM (
        'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE core."instagramReplyExecutionReceipt_state_enum" AS ENUM (
        'PROCESSING', 'SENT', 'FAILED', 'BLOCKED', 'UNKNOWN'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);

    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "FK_ACTION_EXECUTION_RECEIPT_BINDING"`,
    );
    await queryRunner.query(`ALTER TABLE ${RECEIPT}
      ALTER COLUMN "state" DROP DEFAULT,
      ALTER COLUMN "state" TYPE core."instagramReplyExecutionReceipt_state_enum"
        USING CASE "state"::text
          WHEN 'PROCESSING' THEN 'PROCESSING'
          WHEN 'SENT' THEN 'SENT'
          WHEN 'FAILED' THEN 'FAILED'
          WHEN 'BLOCKED' THEN 'BLOCKED'
          ELSE 'UNKNOWN'
        END::core."instagramReplyExecutionReceipt_state_enum",
      ALTER COLUMN "state" SET DEFAULT 'PROCESSING'`);
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} RENAME COLUMN "actionApprovalBindingId" TO "approvalRequestId"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} RENAME COLUMN "providerCode" TO "failureCode"`,
    );
    await queryRunner.query(`ALTER TABLE ${RECEIPT}
      ADD COLUMN IF NOT EXISTS "failureReason" text,
      DROP COLUMN IF EXISTS "workspaceId",
      DROP COLUMN IF EXISTS "idempotencyKey",
      DROP COLUMN IF EXISTS "redactedOutcome"`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ALTER COLUMN "state" DROP DEFAULT,
      ALTER COLUMN "state" TYPE core."instagramReplyApprovalRequest_state_enum"
        USING CASE "state"::text
          WHEN 'REJECTED' THEN 'REJECTED'
          WHEN 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
          WHEN 'APPROVED' THEN 'APPROVED'
          ELSE 'PENDING'
        END::core."instagramReplyApprovalRequest_state_enum",
      ALTER COLUMN "state" SET DEFAULT 'PENDING'`);
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
      ADD COLUMN IF NOT EXISTS "approvalId" uuid,
      ADD COLUMN IF NOT EXISTS "connectedAccountId" varchar,
      ADD COLUMN IF NOT EXISTS "conversationId" uuid,
      ADD COLUMN IF NOT EXISTS "providerConversationId" text,
      ADD COLUMN IF NOT EXISTS "recipientIgsid" text,
      DROP COLUMN IF EXISTS "actionVersion",
      DROP COLUMN IF EXISTS "recipientFingerprint",
      DROP COLUMN IF EXISTS "sendingAccountFingerprint"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS ${EVIDENCE_LINK}`,
    );
    await queryRunner.query(
      `ALTER TABLE ${BINDING} RENAME TO "instagramReplyApprovalRequest"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} RENAME TO "instagramReplyExecutionReceipt"`,
    );
  }
}
