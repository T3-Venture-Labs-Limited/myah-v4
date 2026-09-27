import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Additive authored-incoming provenance for contextual reply drafts. Existing
// rows stay NULL: a legacy draft has no baseline and is treated as edited.
@RegisteredInstanceCommand('2.20.0', 1790141137400)
export class AddMyahInboxReplyDraftIncomingBaselineFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."myahInboxReplyContextDraft"
      ADD COLUMN IF NOT EXISTS "authoredIncomingBaseline" text,
      ADD COLUMN IF NOT EXISTS "bodyProvenance" text`);
    await queryRunner.query(`ALTER TABLE core."myahInboxReplyContextDraft"
      DROP CONSTRAINT IF EXISTS "CHK_MYAH_INBOX_REPLY_DRAFT_BODY_PROVENANCE"`);
    await queryRunner.query(`ALTER TABLE core."myahInboxReplyContextDraft"
      ADD CONSTRAINT "CHK_MYAH_INBOX_REPLY_DRAFT_BODY_PROVENANCE"
      CHECK ("bodyProvenance" IS NULL OR "bodyProvenance" IN ('PROPOSAL','EDITED'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."myahInboxReplyContextDraft"
      DROP CONSTRAINT IF EXISTS "CHK_MYAH_INBOX_REPLY_DRAFT_BODY_PROVENANCE",
      DROP COLUMN IF EXISTS "bodyProvenance",
      DROP COLUMN IF EXISTS "authoredIncomingBaseline"`);
  }
}
