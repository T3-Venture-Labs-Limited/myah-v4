import { QueryRunner } from 'typeorm';
import { ensureInstagramReplyApprovalSchema } from './ensure-instagram-reply-approval-schema';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784106536001, { type: 'slow' })
export class AddInstagramReplyApprovalProviderBindingSlowInstanceCommand
  implements SlowInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensureInstagramReplyApprovalSchema(queryRunner);
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" DROP COLUMN "recipientIgsid"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" DROP COLUMN "providerConversationId"',
    );
  }

  public runDataMigration(): Promise<void> {
    return Promise.resolve();
  }
}
