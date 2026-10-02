import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1790914739533)
export class AddInstagramReactionEventFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."unipileInstagramWebhookEvent"
      ADD COLUMN IF NOT EXISTS "reactionValue" text,
      ADD COLUMN IF NOT EXISTS "reactionActorProviderId" text,
      ADD COLUMN IF NOT EXISTS "reactionOccurredAt" timestamptz(3)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."unipileInstagramWebhookEvent"
      DROP COLUMN IF EXISTS "reactionOccurredAt",
      DROP COLUMN IF EXISTS "reactionActorProviderId",
      DROP COLUMN IF EXISTS "reactionValue"`);
  }
}
