import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1790000000004)
export class CreateCampaignEmailBaselineFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    // No rows are seeded: existing channels cannot inherit LIVE authority.
    await queryRunner.query(`CREATE TABLE core."campaignEmailBaselineGeneration" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
      "messageChannelId" uuid NOT NULL,
      "connectedAccountId" uuid NOT NULL,
      "accountIncarnationId" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider" varchar(32) NOT NULL,
      "scopeFingerprint" varchar(64) NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'SCANNING',
      "isCurrent" boolean NOT NULL DEFAULT true,
      "startedAt" timestamptz NOT NULL DEFAULT now(),
      "enumeratedAt" timestamptz,
      "completedAt" timestamptz,
      "finalCursors" jsonb,
      CONSTRAINT "PK_CAMPAIGN_EMAIL_BASELINE_GENERATION" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_STATUS" CHECK (
        "status" IN ('SCANNING', 'ENUMERATED', 'READY', 'INVALID')
      ),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_SCOPE" CHECK (
        "scopeFingerprint" ~ '^[0-9a-f]{64}$'
      ),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_FINAL" CHECK (
        "status" NOT IN ('ENUMERATED', 'READY') OR
        ("enumeratedAt" IS NOT NULL AND "finalCursors" IS NOT NULL
          AND jsonb_typeof("finalCursors") = 'object'
          AND "finalCursors" <> '{}'::jsonb)
      ),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_READY" CHECK (
        "status" NOT IN ('READY', 'SCANNING', 'ENUMERATED') OR
        ("status" = 'READY') = ("completedAt" IS NOT NULL)
      ),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_INVALID" CHECK (
        "status" <> 'INVALID' OR NOT "isCurrent"
      )
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_CAMPAIGN_EMAIL_BASELINE_CURRENT"
      ON core."campaignEmailBaselineGeneration" ("workspaceId", "messageChannelId")
      WHERE "isCurrent"`);
    await queryRunner.query(`CREATE TABLE core."campaignEmailBaselineItem" (
      "generationId" uuid NOT NULL REFERENCES core."campaignEmailBaselineGeneration"("id") ON DELETE CASCADE,
      "providerMessageId" varchar(512) NOT NULL,
      "disposition" varchar(16) NOT NULL DEFAULT 'LISTED',
      "reason" varchar(128),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_CAMPAIGN_EMAIL_BASELINE_ITEM"
        PRIMARY KEY ("generationId", "providerMessageId"),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_ITEM_ID" CHECK (
        length("providerMessageId") > 0
      ),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_DISPOSITION" CHECK (
        "disposition" IN ('LISTED', 'IMPORTED', 'EXCLUDED', 'FAILED')
      ),
      CONSTRAINT "CHK_CAMPAIGN_EMAIL_BASELINE_REASON" CHECK (
        ("disposition" IN ('EXCLUDED', 'FAILED')) = ("reason" IS NOT NULL)
      )
    )`);
    await queryRunner.query(`CREATE FUNCTION core."guardCampaignEmailBaselineGeneration"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
          OR OLD."messageChannelId" IS DISTINCT FROM NEW."messageChannelId"
          OR OLD."connectedAccountId" IS DISTINCT FROM NEW."connectedAccountId"
          OR OLD."accountIncarnationId" IS DISTINCT FROM NEW."accountIncarnationId"
          OR OLD."provider" IS DISTINCT FROM NEW."provider"
          OR OLD."scopeFingerprint" IS DISTINCT FROM NEW."scopeFingerprint"
          OR OLD."id" IS DISTINCT FROM NEW."id"
        THEN RAISE EXCEPTION 'Campaign Email baseline identity is immutable'; END IF;
        IF OLD."status" = 'INVALID' OR
          (OLD."status" = 'READY' AND NEW."status" <> 'INVALID') OR
          (OLD."status" = 'ENUMERATED' AND NEW."status" NOT IN ('ENUMERATED', 'READY', 'INVALID'))
        THEN RAISE EXCEPTION 'Campaign Email baseline state cannot be rewound'; END IF;
        IF NEW."status" = 'READY' AND (
          NOT NEW."isCurrent" OR OLD."status" <> 'ENUMERATED' OR
          EXISTS (SELECT 1 FROM core."campaignEmailBaselineItem" WHERE "generationId" = NEW."id"
            AND "disposition" IN ('LISTED', 'FAILED'))
        ) THEN RAISE EXCEPTION 'Campaign Email baseline has unresolved provider items'; END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_CAMPAIGN_EMAIL_BASELINE_GENERATION"
      BEFORE UPDATE ON core."campaignEmailBaselineGeneration"
      FOR EACH ROW EXECUTE FUNCTION core."guardCampaignEmailBaselineGeneration"()`);
    await queryRunner.query(`CREATE FUNCTION core."guardCampaignEmailBaselineItem"()
      RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parentStatus text; BEGIN
        IF TG_OP = 'UPDATE' AND (OLD."generationId" IS DISTINCT FROM NEW."generationId"
          OR OLD."providerMessageId" IS DISTINCT FROM NEW."providerMessageId")
        THEN RAISE EXCEPTION 'Campaign Email provider ID is immutable'; END IF;
        SELECT "status" INTO parentStatus FROM core."campaignEmailBaselineGeneration"
          WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."generationId" ELSE NEW."generationId" END
          FOR SHARE;
        IF parentStatus IN ('READY', 'INVALID')
        THEN RAISE EXCEPTION 'Campaign Email baseline evidence is sealed'; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_CAMPAIGN_EMAIL_BASELINE_ITEM"
      BEFORE INSERT OR UPDATE OR DELETE ON core."campaignEmailBaselineItem"
      FOR EACH ROW EXECUTE FUNCTION core."guardCampaignEmailBaselineItem"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [result]: [{ hasRows: boolean }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM core."campaignEmailBaselineGeneration") AS "hasRows"`,
    );
    if (result.hasRows) {
      throw new Error('Cannot remove Campaign Email baseline evidence');
    }
    await queryRunner.query('DROP TABLE core."campaignEmailBaselineItem"');
    await queryRunner.query('DROP TABLE core."campaignEmailBaselineGeneration"');
    await queryRunner.query('DROP FUNCTION core."guardCampaignEmailBaselineItem"()');
    await queryRunner.query('DROP FUNCTION core."guardCampaignEmailBaselineGeneration"()');
  }
}
