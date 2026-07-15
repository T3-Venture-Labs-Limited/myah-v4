import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784106536001, {
  type: 'slow',
  runAfterWorkspace: true,
})
export class AddInstagramReplyApprovalProviderBindingSlowInstanceCommand
  implements SlowInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" character varying',
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
