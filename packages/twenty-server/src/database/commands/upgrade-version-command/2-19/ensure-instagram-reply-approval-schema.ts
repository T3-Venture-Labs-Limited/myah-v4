import { type QueryRunner } from 'typeorm';

export const ensureInstagramReplyApprovalSchema = async (
  queryRunner: QueryRunner,
): Promise<void> => {
  await queryRunner.query(
    `DO $$ BEGIN
        CREATE TYPE "core"."instagramReplyApprovalRequest_state_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$`,
  );
  await queryRunner.query(
    'CREATE TABLE IF NOT EXISTS "core"."instagramReplyApprovalRequest" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userWorkspaceId" uuid NOT NULL, "threadId" uuid NOT NULL, "approvalId" uuid NOT NULL, "toolName" character varying NOT NULL, "connectedAccountId" character varying NOT NULL, "draftId" uuid NOT NULL, "conversationId" uuid NOT NULL, "previewTextSha256" character varying(64) NOT NULL, "state" "core"."instagramReplyApprovalRequest_state_enum" NOT NULL DEFAULT \'PENDING\', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID" UNIQUE ("workspaceId", "approvalId"), CONSTRAINT "PK_0570e6a0a7170ee067a969dcf27" PRIMARY KEY ("id"))',
  );
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON "core"."instagramReplyApprovalRequest" ("workspaceId", "threadId")',
  );
  await queryRunner.query(
    `DO $$ BEGIN
        CREATE TYPE "core"."instagramReplyExecutionReceipt_state_enum" AS ENUM('PROCESSING', 'SENT', 'FAILED', 'BLOCKED', 'UNKNOWN');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$`,
  );
  await queryRunner.query(
    'CREATE TABLE IF NOT EXISTS "core"."instagramReplyExecutionReceipt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approvalRequestId" uuid NOT NULL, "state" "core"."instagramReplyExecutionReceipt_state_enum" NOT NULL DEFAULT \'PROCESSING\', "providerMessageId" text, "failureCode" text, "failureReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST" UNIQUE ("approvalRequestId"), CONSTRAINT "PK_1ecd8d74d2ebde2854db62b469e" PRIMARY KEY ("id"))',
  );
  await queryRunner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON "core"."instagramReplyExecutionReceipt" ("state")',
  );
  await queryRunner.query(
    `DO $$ BEGIN
        ALTER TABLE "core"."instagramReplyApprovalRequest" ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$`,
  );
};
