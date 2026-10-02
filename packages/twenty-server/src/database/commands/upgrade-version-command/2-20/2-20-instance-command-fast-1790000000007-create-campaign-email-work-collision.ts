import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Separate source event evidence: 0006's provider key belongs to the FIRST
// canonical item and must never be overwritten to make room for a collision.
@RegisteredInstanceCommand('2.20.0', 1790000000007)
export class CreateCampaignEmailWorkCollisionFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_CAMPAIGN_WORK_COLLISION_ROUTE"
      ON core."campaignPartnershipWorkItem"
      ("workspaceId", "id", "messageChannelId", "connectedAccountId",
        "accountIncarnationId", "providerMessageId")`);
    await queryRunner.query(`CREATE TABLE core."campaignEmailWorkCollision" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL,
      "originalWorkId" uuid NOT NULL,
      "canonicalMessageId" uuid NOT NULL,
      "messageThreadId" uuid NOT NULL,
      "messageChannelId" uuid NOT NULL,
      "connectedAccountId" uuid NOT NULL,
      "accountIncarnationId" uuid NOT NULL,
      "providerMessageId" text NOT NULL,
      "providerThreadId" text NOT NULL,
      "creatorSender" text NOT NULL,
      "accountRecipient" text NOT NULL,
      "baselineGenerationId" uuid NOT NULL,
      "providerOccurredAt" timestamptz NOT NULL,
      "sourceFingerprint" varchar(64) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_CAMPAIGN_EMAIL_WORK_COLLISION" PRIMARY KEY ("id"),
      CONSTRAINT "FK_CAMPAIGN_EMAIL_WORK_COLLISION_WORKSPACE"
        FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_CAMPAIGN_EMAIL_WORK_COLLISION_ORIGINAL"
        FOREIGN KEY ("workspaceId", "originalWorkId", "messageChannelId", "connectedAccountId",
          "accountIncarnationId", "providerMessageId")
        REFERENCES core."campaignPartnershipWorkItem"("workspaceId", "id", "messageChannelId",
          "connectedAccountId", "accountIncarnationId", "providerMessageId") ON DELETE CASCADE,
      CONSTRAINT "UQ_CAMPAIGN_EMAIL_WORK_COLLISION_SOURCE"
        UNIQUE ("workspaceId", "canonicalMessageId", "messageChannelId", "accountIncarnationId", "providerMessageId", "sourceFingerprint"),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_WORK_COLLISION_VALUES" CHECK (
        length(btrim("providerMessageId")) > 0 AND length(btrim("providerThreadId")) > 0
        AND "providerThreadId" = btrim("providerThreadId")
        AND length(btrim("creatorSender")) > 0 AND length(btrim("accountRecipient")) > 0
        AND "accountRecipient" = lower(btrim("accountRecipient"))
        AND "sourceFingerprint" ~ '^[0-9a-f]{64}$'
      )
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_CAMPAIGN_EMAIL_WORK_COLLISION_THREAD"
      ON core."campaignEmailWorkCollision" ("workspaceId", "messageThreadId", "createdAt")`);
    await queryRunner.query(`CREATE FUNCTION core."protectCampaignEmailWorkCollision"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'Campaign Email collision evidence is immutable';
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_CAMPAIGN_EMAIL_WORK_COLLISION_IMMUTABLE"
      BEFORE UPDATE OR DELETE ON core."campaignEmailWorkCollision" FOR EACH ROW
      EXECUTE FUNCTION core."protectCampaignEmailWorkCollision"()`);
    await this.assertPhysicalContract(queryRunner);
  }

  async assertPhysicalContract(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ ready: boolean }> = await queryRunner.query(`SELECT
      to_regclass('core."campaignEmailWorkCollision"') IS NOT NULL
      AND (SELECT count(*) FROM pg_attribute WHERE attrelid = to_regclass('core."campaignEmailWorkCollision"')
        AND NOT attisdropped AND attname = ANY(ARRAY['id','workspaceId','originalWorkId',
          'canonicalMessageId','messageThreadId','messageChannelId','connectedAccountId',
          'accountIncarnationId','providerMessageId','providerThreadId','creatorSender',
          'accountRecipient','baselineGenerationId','providerOccurredAt','sourceFingerprint','createdAt'])) = 16
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('core."campaignEmailWorkCollision"')
        AND conname='UQ_CAMPAIGN_EMAIL_WORK_COLLISION_SOURCE' AND contype='u' AND convalidated)
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('core."campaignEmailWorkCollision"')
        AND conname='FK_CAMPAIGN_EMAIL_WORK_COLLISION_ORIGINAL' AND contype='f' AND convalidated)
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('core."campaignEmailWorkCollision"')
        AND tgname='TRG_CAMPAIGN_EMAIL_WORK_COLLISION_IMMUTABLE' AND tgenabled IN ('O','A')) AS ready`);
    if (rows[0]?.ready !== true) throw new Error('Campaign Email collision evidence physical contract is incomplete');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      LOCK TABLE core."campaignEmailWorkCollision" IN ACCESS EXCLUSIVE MODE;
      IF EXISTS (SELECT 1 FROM core."campaignEmailWorkCollision")
        THEN RAISE EXCEPTION 'Cannot remove persisted Campaign Email collision evidence'; END IF;
    END $$`);
    await queryRunner.query(`DROP TABLE core."campaignEmailWorkCollision"`);
    await queryRunner.query(`DROP FUNCTION core."protectCampaignEmailWorkCollision"()`);
    await queryRunner.query(`DROP INDEX core."UQ_CAMPAIGN_WORK_COLLISION_ROUTE"`);
  }
}
