import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// 0004 is already receipted on isolated databases. Do not rewrite its shape
// or applied identity: this is an additive account-bound credential version.
@RegisteredInstanceCommand('2.20.0', 1790000000005)
export class AddCampaignEmailAccountIncarnationFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."connectedAccount"
      ADD COLUMN "campaignEmailIncarnationId" uuid NOT NULL DEFAULT uuid_generate_v4()`);
    // Existing 0004 generations already have an independently generated
    // accountIncarnationId; never backfill it to this new account incarnation.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [result]: [{ hasEvidence: boolean }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM core."campaignEmailBaselineGeneration") AS "hasEvidence"`,
    );
    if (result.hasEvidence) throw new Error('Cannot remove Campaign Email account incarnation with baseline evidence');
    await queryRunner.query(`ALTER TABLE core."connectedAccount" DROP COLUMN "campaignEmailIncarnationId"`);
  }
}
