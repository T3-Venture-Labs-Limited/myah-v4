import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789992172619)
export class AddConnectedAccountSendingPolicyRevisionFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."connectedAccount"
      ADD "sendingPolicyRevision" integer NOT NULL DEFAULT 1,
      ADD "sendingPolicyIdempotencyKey" uuid`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."connectedAccount"
      DROP COLUMN "sendingPolicyIdempotencyKey",
      DROP COLUMN "sendingPolicyRevision"`);
  }
}
