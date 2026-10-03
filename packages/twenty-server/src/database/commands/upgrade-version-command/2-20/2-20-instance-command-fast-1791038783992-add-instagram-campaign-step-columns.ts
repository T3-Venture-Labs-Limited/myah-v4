import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// MYAH-445: Instagram sequence steps link their send receipt, and only cold
// Instagram messages count toward the account limits. Existing reservations
// stay cold (counted), which is the previous behavior.
@RegisteredInstanceCommand('2.20.0', 1791038783992)
export class AddInstagramCampaignStepColumnsFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."campaignOccurrence"
      ADD COLUMN IF NOT EXISTS "actionExecutionReceiptId" uuid`);
    await queryRunner.query(`ALTER TABLE core."instagramActionReservation"
      ADD COLUMN IF NOT EXISTS "isCold" boolean NOT NULL DEFAULT true`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."instagramActionReservation"
      DROP COLUMN IF EXISTS "isCold"`);
    await queryRunner.query(`ALTER TABLE core."campaignOccurrence"
      DROP COLUMN IF EXISTS "actionExecutionReceiptId"`);
  }
}
