import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784106536000)
export class CreateInstagramReplyAuditFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TYPE "core"."instagramReplyApprovalRequest_state_enum" AS ENUM(\'PENDING\', \'APPROVED\', \'REJECTED\', \'CHANGES_REQUESTED\')',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."instagramReplyApprovalRequest" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userWorkspaceId" uuid NOT NULL, "threadId" uuid NOT NULL, "approvalId" uuid NOT NULL, "toolName" character varying NOT NULL, "connectedAccountId" character varying NOT NULL, "draftId" uuid NOT NULL, "conversationId" uuid NOT NULL, "previewTextSha256" character varying(64) NOT NULL, "state" "core"."instagramReplyApprovalRequest_state_enum" NOT NULL DEFAULT \'PENDING\', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID" UNIQUE ("workspaceId", "approvalId"), CONSTRAINT "PK_0570e6a0a7170ee067a969dcf27" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON "core"."instagramReplyApprovalRequest" ("workspaceId", "threadId")',
    );
    await queryRunner.query(
      'CREATE TYPE "core"."instagramReplyExecutionReceipt_state_enum" AS ENUM(\'PROCESSING\', \'SENT\', \'FAILED\', \'BLOCKED\', \'UNKNOWN\')',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."instagramReplyExecutionReceipt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approvalRequestId" uuid NOT NULL, "state" "core"."instagramReplyExecutionReceipt_state_enum" NOT NULL DEFAULT \'PROCESSING\', "providerMessageId" text, "failureCode" text, "failureReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST" UNIQUE ("approvalRequestId"), CONSTRAINT "PK_1ecd8d74d2ebde2854db62b469e" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON "core"."instagramReplyExecutionReceipt" ("state")',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyExecutionReceipt" ADD CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST" FOREIGN KEY ("approvalRequestId") REFERENCES "core"."instagramReplyApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyExecutionReceipt" DROP CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" DROP CONSTRAINT "FK_617792f9cfed9d503e2333b2a83"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE"',
    );
    await queryRunner.query(
      'DROP TABLE "core"."instagramReplyExecutionReceipt"',
    );
    await queryRunner.query(
      'DROP TYPE "core"."instagramReplyExecutionReceipt_state_enum"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD"',
    );
    await queryRunner.query(
      'DROP TABLE "core"."instagramReplyApprovalRequest"',
    );
    await queryRunner.query(
      'DROP TYPE "core"."instagramReplyApprovalRequest_state_enum"',
    );
  }
}
