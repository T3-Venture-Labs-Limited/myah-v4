import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1790141137300)
export class CreateMyahCampaignReplyEvidenceFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahCampaignReplyEvidence" (
      "workspaceId" uuid NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
      "inboundMessageId" uuid NOT NULL,
      "messageChannelId" uuid NOT NULL,
      "creatorId" uuid,
      "campaignId" uuid NOT NULL,
      "enrollmentId" uuid NOT NULL,
      "matchedAttemptId" uuid REFERENCES core."outboundEmailAttempt"("attemptId"),
      "classification" text NOT NULL CHECK (
        ("classification" = 'EXACT' AND "matchedAttemptId" IS NOT NULL)
        OR ("classification" = 'THREAD' AND "matchedAttemptId" IS NULL)
      ),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "inboundMessageId")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_CAMPAIGN_REPLY_EVIDENCE_THREAD"
      ON core."myahCampaignReplyEvidence" ("workspaceId", "messageChannelId", "createdAt", "inboundMessageId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_CAMPAIGN_REPLY_EVIDENCE_ATTEMPT"
      ON core."myahCampaignReplyEvidence" ("workspaceId", "matchedAttemptId")`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahCampaignReplyPending" (
      "workspaceId" uuid NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
      "messageId" uuid NOT NULL,
      "messageThreadId" uuid NOT NULL,
      "messageChannelId" uuid NOT NULL,
      "threadExternalId" text NOT NULL,
      "normalizedSender" text NOT NULL,
      "inReplyToHeaderMessageIds" text[] NOT NULL DEFAULT '{}',
      "candidateAttemptIds" uuid[] NOT NULL DEFAULT '{}',
      "candidateOverflow" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "messageId")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_CAMPAIGN_REPLY_PENDING_CANDIDATE"
      ON core."myahCampaignReplyPending" USING gin ("candidateAttemptIds")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_CAMPAIGN_REPLY_PENDING_ORDER"
      ON core."myahCampaignReplyPending" ("workspaceId", "createdAt", "messageId")`);

    await queryRunner.query(`CREATE OR REPLACE FUNCTION core."protectMyahCampaignReplyEvidence"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD."classification" = 'THREAD' AND NEW."classification" = 'EXACT'
          AND OLD."matchedAttemptId" IS NULL AND NEW."matchedAttemptId" IS NOT NULL
          AND (NEW."workspaceId", NEW."inboundMessageId", NEW."messageChannelId",
            NEW."creatorId", NEW."campaignId", NEW."enrollmentId", NEW."createdAt")
            IS NOT DISTINCT FROM
            (OLD."workspaceId", OLD."inboundMessageId", OLD."messageChannelId",
              OLD."creatorId", OLD."campaignId", OLD."enrollmentId", OLD."createdAt")
        THEN RETURN NEW; END IF;
        RAISE EXCEPTION 'Campaign reply evidence identity is immutable';
      END $$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_MYAH_CAMPAIGN_REPLY_EVIDENCE_IMMUTABLE" ON core."myahCampaignReplyEvidence"`);
    await queryRunner.query(`CREATE TRIGGER "TRG_MYAH_CAMPAIGN_REPLY_EVIDENCE_IMMUTABLE"
      BEFORE UPDATE ON core."myahCampaignReplyEvidence"
      FOR EACH ROW EXECUTE FUNCTION core."protectMyahCampaignReplyEvidence"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS core."myahCampaignReplyPending"');
    await queryRunner.query('DROP TABLE IF EXISTS core."myahCampaignReplyEvidence"');
    await queryRunner.query('DROP FUNCTION IF EXISTS core."protectMyahCampaignReplyEvidence"()');
  }
}
