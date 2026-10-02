import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Additive to receipted F/G/0004/0005. Existing generic work rows remain untouched;
// only new provider-qualified reply receipts carry this immutable source identity.
@RegisteredInstanceCommand('2.20.0', 1790000000006)
export class AddCampaignEmailWorkIdentityFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
      ADD COLUMN "canonicalMessageId" uuid,
      ADD COLUMN "messageThreadId" uuid,
      ADD COLUMN "providerMessageId" text,
      ADD COLUMN "accountIncarnationId" uuid,
      ADD COLUMN "providerThreadId" text,
      ADD COLUMN "creatorSender" text,
      ADD COLUMN "accountRecipient" text,
      ADD COLUMN "baselineGenerationId" uuid,
      ADD COLUMN "providerOccurredAt" timestamptz,
      ADD COLUMN "resolvedCampaignId" uuid,
      ADD COLUMN "resolvedCreatorId" uuid`);
    await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
      ADD CONSTRAINT "CHK_CAMPAIGN_EMAIL_WORK_IDENTITY" CHECK (
        "providerMessageId" IS NULL OR (
          "canonicalMessageId" IS NOT NULL AND "messageThreadId" IS NOT NULL
          AND "messageChannelId" IS NOT NULL AND "connectedAccountId" IS NOT NULL
          AND "accountIncarnationId" IS NOT NULL AND "baselineGenerationId" IS NOT NULL
          AND "providerOccurredAt" IS NOT NULL
          AND "providerThreadId" IS NOT NULL AND length("providerThreadId") > 0
          AND "creatorSender" IS NOT NULL AND length("creatorSender") > 0
          AND "accountRecipient" IS NOT NULL AND length("accountRecipient") > 0
          AND "resolvedThreadExternalId" = "providerThreadId"
          AND "normalizedRecipient" = "accountRecipient"
          AND "purpose" = 'REPLY_AMBIGUITY'
          AND length(btrim("providerMessageId")) > 0
          AND (("participationId" IS NULL AND "resolvedCampaignId" IS NULL AND "resolvedCreatorId" IS NULL)
            OR ("participationId" IS NOT NULL AND "resolvedCampaignId" IS NOT NULL AND "resolvedCreatorId" IS NOT NULL))
        )
      )`);
    // A second provider identity for the same canonical UUID gets its own trigger
    // UUID; a canonical Message UUID is not a unique provider/channel key.
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM"
      ON core."campaignPartnershipWorkItem" ("workspaceId", "messageChannelId", "accountIncarnationId", "providerMessageId")
      WHERE "providerMessageId" IS NOT NULL`);
    await queryRunner.query(`CREATE FUNCTION core."protectCampaignEmailWorkSourceIdentity"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD."providerMessageId" IS NOT NULL OR NEW."providerMessageId" IS NOT NULL THEN
          IF ROW(NEW."canonicalMessageId", NEW."messageThreadId", NEW."providerMessageId",
            NEW."accountIncarnationId", NEW."providerThreadId", NEW."creatorSender",
            NEW."accountRecipient", NEW."baselineGenerationId", NEW."providerOccurredAt", NEW."messageChannelId",
            NEW."connectedAccountId", NEW."resolvedThreadExternalId", NEW."normalizedRecipient")
            IS DISTINCT FROM ROW(OLD."canonicalMessageId", OLD."messageThreadId", OLD."providerMessageId",
            OLD."accountIncarnationId", OLD."providerThreadId", OLD."creatorSender",
            OLD."accountRecipient", OLD."baselineGenerationId", OLD."providerOccurredAt", OLD."messageChannelId",
            OLD."connectedAccountId", OLD."resolvedThreadExternalId", OLD."normalizedRecipient")
          THEN RAISE EXCEPTION 'Campaign Email work source identity is immutable'; END IF;
          IF NEW."resolvedCampaignId" IS DISTINCT FROM OLD."resolvedCampaignId"
            OR NEW."resolvedCreatorId" IS DISTINCT FROM OLD."resolvedCreatorId" THEN
            IF NOT (OLD."state" = 'HELD' AND OLD."participationId" IS NULL
              AND OLD."resolvedCampaignId" IS NULL AND OLD."resolvedCreatorId" IS NULL
              AND NEW."participationId" IS NOT NULL AND NEW."resolvedCampaignId" IS NOT NULL
              AND NEW."resolvedCreatorId" IS NOT NULL)
            THEN RAISE EXCEPTION 'Campaign Email work participation snapshot is immutable'; END IF;
          END IF;
        END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_CAMPAIGN_EMAIL_WORK_SOURCE_IDENTITY"
      BEFORE UPDATE ON core."campaignPartnershipWorkItem" FOR EACH ROW
      EXECUTE FUNCTION core."protectCampaignEmailWorkSourceIdentity"()`);
    await this.assertPhysicalContract(queryRunner);
  }

  async assertPhysicalContract(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ ready: boolean }> = await queryRunner.query(`SELECT
      to_regclass('core."campaignPartnershipWorkItem"') IS NOT NULL
      AND (SELECT count(*) FROM pg_attribute WHERE attrelid = to_regclass('core."campaignPartnershipWorkItem"')
        AND NOT attisdropped AND attname = ANY(ARRAY['canonicalMessageId', 'messageThreadId',
          'providerMessageId', 'accountIncarnationId', 'providerThreadId', 'creatorSender',
          'accountRecipient', 'baselineGenerationId', 'providerOccurredAt',
          'resolvedCampaignId', 'resolvedCreatorId'])) = 11
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('core."campaignPartnershipWorkItem"')
        AND conname = 'CHK_CAMPAIGN_EMAIL_WORK_IDENTITY' AND convalidated)
      AND EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = to_regclass('core."campaignPartnershipWorkItem"')
        AND c.relname = 'UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM' AND i.indisunique AND i.indisvalid)
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('core."campaignPartnershipWorkItem"')
        AND tgname = 'TRG_CAMPAIGN_EMAIL_WORK_SOURCE_IDENTITY' AND tgenabled IN ('O', 'A')) AS ready`);
    if (rows[0]?.ready !== true) throw new Error('Campaign Email work identity physical contract is incomplete');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      LOCK TABLE core."campaignPartnershipWorkItem" IN ACCESS EXCLUSIVE MODE;
      IF EXISTS (SELECT 1 FROM core."campaignPartnershipWorkItem" WHERE "providerMessageId" IS NOT NULL)
        THEN RAISE EXCEPTION 'Cannot remove persisted Campaign Email provider identities'; END IF;
    END $$`);
    await queryRunner.query(`DROP TRIGGER "TRG_CAMPAIGN_EMAIL_WORK_SOURCE_IDENTITY" ON core."campaignPartnershipWorkItem"`);
    await queryRunner.query(`DROP FUNCTION core."protectCampaignEmailWorkSourceIdentity"()`);
    await queryRunner.query(`DROP INDEX core."UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM"`);
    await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
      DROP CONSTRAINT "CHK_CAMPAIGN_EMAIL_WORK_IDENTITY",
      DROP COLUMN "canonicalMessageId", DROP COLUMN "messageThreadId", DROP COLUMN "providerMessageId",
      DROP COLUMN "accountIncarnationId", DROP COLUMN "providerThreadId", DROP COLUMN "creatorSender",
      DROP COLUMN "accountRecipient", DROP COLUMN "baselineGenerationId", DROP COLUMN "providerOccurredAt",
      DROP COLUMN "resolvedCampaignId", DROP COLUMN "resolvedCreatorId"`);
  }
}
