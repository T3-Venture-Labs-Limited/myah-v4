import { QueryRunner } from 'typeorm';
import { ensureInstagramReplyApprovalSchema } from './ensure-instagram-reply-approval-schema';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784112688976)
export class PendingMigrationCheckFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensureInstagramReplyApprovalSchema(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
