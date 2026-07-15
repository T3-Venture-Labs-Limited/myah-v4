import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784112963055)
export class RepairInstagramReplyApprovalSchemaFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."instagramReplyExecutionReceipt" DROP CONSTRAINT IF EXISTS "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"');
    await queryRunner.query('ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text');
    await queryRunner.query('ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."instagramReplyApprovalRequest" DROP COLUMN "recipientIgsid"');
    await queryRunner.query('ALTER TABLE "core"."instagramReplyApprovalRequest" DROP COLUMN "providerConversationId"');
    await queryRunner.query('ALTER TABLE "core"."instagramReplyExecutionReceipt" ADD CONSTRAINT "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST" FOREIGN KEY ("approvalRequestId") REFERENCES "core"."instagramReplyApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }
}
