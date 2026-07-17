import type { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import type { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

const LEGACY_BINDING = 'core."instagramReplyApprovalRequest"';
const LEGACY_RECEIPT = 'core."instagramReplyExecutionReceipt"';
const BINDING = 'core."actionApprovalBinding"';
const EVIDENCE_LINK = 'core."actionApprovalBindingEvidenceLink"';
const RECEIPT = 'core."actionExecutionReceipt"';

const hasLegacyBindingColumns = async (dataSource: DataSource) => {
  const rows: unknown = await dataSource.query(`SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'actionApprovalBinding'
      AND column_name = 'approvalId'
  ) AS "exists"`);

  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    !('exists' in rows[0]) ||
    typeof rows[0].exists !== 'boolean'
  ) {
    throw new Error('Unexpected legacy action approval shape query result');
  }

  return rows[0].exists;
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

const recreateLegacyTypes = async (queryRunner: QueryRunner) => {
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
};

@RegisteredInstanceCommand('2.19.0', 1784112963057, { type: 'slow' })
export class FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand
  implements SlowInstanceCommand
{
  public readonly runDataMigrationWithoutWorkspaces = true;

  public async runDataMigration(dataSource: DataSource): Promise<void> {
    if (!(await hasLegacyBindingColumns(dataSource))) {
      return;
    }

    await dataSource.query(`UPDATE ${BINDING}
      SET "actionName" = CASE
            WHEN "actionName" = 'request_instagram_reply_approval'
              THEN 'send_instagram_reply'
            ELSE "actionName"
          END,
          "actionVersion" = COALESCE("actionVersion", 1),
          "state" = CASE
            WHEN "state" IN ('PENDING', 'APPROVED') THEN 'EXPIRED'
            ELSE "state"
          END
      WHERE "actionName" = 'request_instagram_reply_approval'
        OR "actionVersion" IS NULL
        OR "state" IN ('PENDING', 'APPROVED')`);
    await dataSource.query(`UPDATE ${RECEIPT} AS receipt
      SET "workspaceId" = COALESCE(receipt."workspaceId", binding."workspaceId"),
          "idempotencyKey" = COALESCE(
            receipt."idempotencyKey",
            'legacy:' || receipt.id::text
          ),
          "redactedOutcome" = COALESCE(
            receipt."redactedOutcome",
            'legacy_migrated'
          )
      FROM ${BINDING} AS binding
      WHERE binding.id = receipt."actionApprovalBindingId"
        AND (
          receipt."workspaceId" IS NULL
          OR receipt."idempotencyKey" IS NULL
          OR receipt."redactedOutcome" IS NULL
        )`);
    await dataSource.query(`DO $$ BEGIN
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
        WHERE part."toolName" = 'request_instagram_reply_approval'
          AND part."toolOutput" #>> '{result,status}' IS DISTINCT FROM 'expired';
      END IF;
    END $$`);
    await dataSource.query(`DO $$ BEGIN
      IF to_regclass('core."agentChatThread"') IS NOT NULL
        AND to_regclass('core."agentMessage"') IS NOT NULL
        AND to_regclass('core."agentMessagePart"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'core' AND table_name = 'agentChatThread'
            AND column_name = 'pendingQuestionMessageId'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'core' AND table_name = 'agentMessage'
            AND column_name = 'threadId'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'core' AND table_name = 'agentMessagePart'
            AND column_name = 'messageId'
        ) THEN
        UPDATE core."agentChatThread" AS thread
        SET "pendingQuestionMessageId" = NULL
        FROM core."agentMessage" AS message
        WHERE thread.id = message."threadId"
          AND thread."pendingQuestionMessageId" = message.id
          AND EXISTS (
            SELECT 1
            FROM core."agentMessagePart" AS part
            WHERE part."messageId" = message.id
              AND part."toolName" = 'request_instagram_reply_approval'
          );
      END IF;
    END $$`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ALTER COLUMN "actionVersion" SET DEFAULT 1,
      ALTER COLUMN "actionVersion" SET NOT NULL,
      DROP COLUMN IF EXISTS "approvalId",
      DROP COLUMN IF EXISTS "connectedAccountId",
      DROP COLUMN IF EXISTS "conversationId",
      DROP COLUMN IF EXISTS "providerConversationId",
      DROP COLUMN IF EXISTS "recipientIgsid"`);
    await queryRunner.query(
      `ALTER TABLE ${BINDING} DROP CONSTRAINT IF EXISTS "FK_617792f9cfed9d503e2333b2a83"`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'FK_ACTION_APPROVAL_BINDING_WORKSPACE'
          AND conrelid = 'core."actionApprovalBinding"'::regclass
      ) THEN
        ALTER TABLE core."actionApprovalBinding"
          ADD CONSTRAINT "FK_ACTION_APPROVAL_BINDING_WORKSPACE"
          FOREIGN KEY ("workspaceId")
          REFERENCES core."workspace"("id") ON DELETE CASCADE;
      END IF;
    END $$`);
    await queryRunner.query(
      'DROP INDEX IF EXISTS core."IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD"',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD" ON core."actionApprovalBinding" ("workspaceId", "threadId")',
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"`,
    );
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
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'FK_ACTION_EXECUTION_RECEIPT_WORKSPACE'
          AND conrelid = 'core."actionExecutionReceipt"'::regclass
      ) THEN
        ALTER TABLE core."actionExecutionReceipt"
          ADD CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_WORKSPACE"
          FOREIGN KEY ("workspaceId")
          REFERENCES core."workspace"("id") ON DELETE CASCADE;
      END IF;
    END $$`);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ACTION_EXECUTION_RECEIPT_STATE" ON core."actionExecutionReceipt" ("state")',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS core."instagramReplyApprovalRequest_state_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS core."instagramReplyExecutionReceipt_state_enum"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await assertTablesAreEmpty(queryRunner);
    await queryRunner.query(
      'DROP INDEX IF EXISTS core."IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS core."IDX_ACTION_EXECUTION_RECEIPT_STATE"',
    );
    await queryRunner.query(
      `ALTER TABLE ${BINDING} DROP CONSTRAINT IF EXISTS "FK_ACTION_APPROVAL_BINDING_WORKSPACE"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "FK_ACTION_EXECUTION_RECEIPT_WORKSPACE"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "FK_ACTION_EXECUTION_RECEIPT_BINDING"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "UQ_ACTION_EXECUTION_RECEIPT_BINDING"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} DROP CONSTRAINT IF EXISTS "UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY"`,
    );
    await queryRunner.query(`ALTER TABLE ${RECEIPT}
      ADD COLUMN "failureReason" text,
      DROP COLUMN "workspaceId",
      DROP COLUMN "idempotencyKey",
      DROP COLUMN "redactedOutcome",
      RENAME COLUMN "actionApprovalBindingId" TO "approvalRequestId",
      RENAME COLUMN "providerCode" TO "failureCode"`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ADD COLUMN "approvalId" uuid NOT NULL,
      ADD COLUMN "connectedAccountId" varchar NOT NULL,
      ADD COLUMN "conversationId" uuid NOT NULL,
      ADD COLUMN "providerConversationId" text,
      ADD COLUMN "recipientIgsid" text,
      ALTER COLUMN "actionVersion" DROP DEFAULT,
      ALTER COLUMN "actionVersion" DROP NOT NULL,
      RENAME COLUMN "initiatorUserWorkspaceId" TO "userWorkspaceId",
      RENAME COLUMN "actionName" TO "toolName",
      RENAME COLUMN "contentDigest" TO "previewTextSha256"`);
    await queryRunner.query(
      `ALTER TABLE ${BINDING} ADD CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID" UNIQUE ("workspaceId", "approvalId")`,
    );
    await queryRunner.query(
      `ALTER TABLE ${BINDING} ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83" FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON core."actionApprovalBinding" ("workspaceId", "threadId")',
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} ADD CONSTRAINT "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST" UNIQUE ("approvalRequestId")`,
    );
    await queryRunner.query(
      `ALTER TABLE ${RECEIPT} ADD CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST" FOREIGN KEY ("approvalRequestId") REFERENCES ${BINDING}("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON core."actionExecutionReceipt" ("state")',
    );
    await recreateLegacyTypes(queryRunner);
  }
}
