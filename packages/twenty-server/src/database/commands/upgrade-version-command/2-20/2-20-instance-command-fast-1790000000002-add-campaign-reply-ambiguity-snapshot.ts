import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Email Message UUID alone is not a provider route. A later, permissioned resolver
// must bind the intended participation without changing these captured coordinates.
const snapshotTriggerBody = ` BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW."purpose" = 'REPLY_AMBIGUITY' AND (
            NEW."participationId" IS NOT NULL OR NEW."resolvedByWorkspaceMemberId" IS NOT NULL
            OR NEW."resolvedAt" IS NOT NULL)
          THEN RAISE EXCEPTION 'Ambiguity review must start unresolved'; END IF;
        ELSE
          IF NEW."messageChannelId" IS DISTINCT FROM OLD."messageChannelId"
            OR NEW."connectedAccountId" IS DISTINCT FROM OLD."connectedAccountId"
            OR NEW."resolvedThreadExternalId" IS DISTINCT FROM OLD."resolvedThreadExternalId"
            OR NEW."normalizedRecipient" IS DISTINCT FROM OLD."normalizedRecipient"
          THEN RAISE EXCEPTION 'Ambiguity provider coordinates are immutable'; END IF;
          IF OLD."resolvedByWorkspaceMemberId" IS NOT NULL OR OLD."resolvedAt" IS NOT NULL THEN
            IF NEW."resolvedByWorkspaceMemberId" IS DISTINCT FROM OLD."resolvedByWorkspaceMemberId"
              OR NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt"
            THEN RAISE EXCEPTION 'Ambiguity resolution audit is immutable'; END IF;
          END IF;
        END IF;
        RETURN NEW;
      END `;

@RegisteredInstanceCommand('2.20.0', 1790000000002)
export class AddCampaignReplyAmbiguitySnapshotFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Never interpret historical rows with this purpose as if they carried a
    // verified route. The table lock makes preflight and DDL a single boundary.
    await queryRunner.query(`LOCK TABLE core."campaignPartnershipWorkItem" IN ACCESS EXCLUSIVE MODE`);
    const existing: { count: string }[] = await queryRunner.query(
      `SELECT count(*)::text AS count FROM core."campaignPartnershipWorkItem" WHERE "purpose" = 'REPLY_AMBIGUITY'`,
    );

    // Reruns with valid ambiguity rows are allowed only after the full G
    // contract has already been installed and verified.
    if (Number(existing[0]?.count) > 0) {
      const installed: { present: boolean }[] = await queryRunner.query(`SELECT
        EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
          WHERE conrelid = 'core."campaignPartnershipWorkItem"'::regclass
            AND conname = 'CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
          WHERE attrelid = 'core."campaignPartnershipWorkItem"'::regclass
            AND attname = 'messageChannelId' AND NOT attisdropped) AS present`);
      if (installed[0]?.present !== true) {
        throw new Error('Unknown preexisting reply ambiguity rows require manual review; no guessed backfill');
      }
      await this.assertPhysicalContract(queryRunner);
      return;
    }

    await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
      ADD COLUMN IF NOT EXISTS "messageChannelId" uuid,
      ADD COLUMN IF NOT EXISTS "connectedAccountId" uuid,
      ADD COLUMN IF NOT EXISTS "resolvedThreadExternalId" text,
      ADD COLUMN IF NOT EXISTS "normalizedRecipient" text,
      ADD COLUMN IF NOT EXISTS "resolvedByWorkspaceMemberId" uuid,
      ADD COLUMN IF NOT EXISTS "resolvedAt" timestamptz`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'core."campaignPartnershipWorkItem"'::regclass
          AND conname = 'CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY') THEN
        ALTER TABLE core."campaignPartnershipWorkItem"
          ADD CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY" CHECK (
            "purpose" <> 'REPLY_AMBIGUITY' OR (
              "triggerKey" ~ '^email-message:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND "messageChannelId" IS NOT NULL AND "connectedAccountId" IS NOT NULL
              AND "resolvedThreadExternalId" IS NOT NULL AND length("resolvedThreadExternalId") > 0
              AND "resolvedThreadExternalId" = btrim("resolvedThreadExternalId")
              AND "normalizedRecipient" IS NOT NULL AND length("normalizedRecipient") > 0
              AND "normalizedRecipient" = lower(btrim("normalizedRecipient"))
              AND (("participationId" IS NULL AND "state" = 'HELD'
                AND "resolvedByWorkspaceMemberId" IS NULL AND "resolvedAt" IS NULL)
                OR ("participationId" IS NOT NULL AND "resolvedByWorkspaceMemberId" IS NOT NULL
                  AND "resolvedAt" IS NOT NULL))
            ));
      END IF;
    END $$`);
    // Do not repair a replaced function or trigger on rerun: assert below
    // must detect incompatible same-name objects instead of blessing them.
    await queryRunner.query(`DO $$ BEGIN
      IF to_regprocedure('core."protectCampaignPartnershipReplyAmbiguity"()') IS NULL THEN
        CREATE FUNCTION core."protectCampaignPartnershipReplyAmbiguity"()
          RETURNS trigger LANGUAGE plpgsql AS $body$${snapshotTriggerBody}$body$;
      END IF;
    END $$`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = 'core."campaignPartnershipWorkItem"'::regclass
          AND tgname = 'TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY') THEN
        CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY"
          BEFORE INSERT OR UPDATE ON core."campaignPartnershipWorkItem"
          FOR EACH ROW EXECUTE FUNCTION core."protectCampaignPartnershipReplyAmbiguity"();
      END IF;
    END $$`);
    await this.assertPhysicalContract(queryRunner);
  }

  async assertPhysicalContract(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL deparses CHECK text differently between versions. Compile the
    // independently named expected expression on the SAME relation (attribute
    // numbers matter), compare parsed trees, then remove the temporary probe.
    // The fast instance runner wraps this in a transaction; unexpected errors
    // roll back both probe and migration. A pre-existing probe name fails closed.
    await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
      ADD CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY_PROBE"
      CHECK ("purpose" <> 'REPLY_AMBIGUITY' OR (
        "triggerKey" ~ '^email-message:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND "messageChannelId" IS NOT NULL AND "connectedAccountId" IS NOT NULL
        AND "resolvedThreadExternalId" IS NOT NULL AND length("resolvedThreadExternalId") > 0
        AND "resolvedThreadExternalId" = btrim("resolvedThreadExternalId")
        AND "normalizedRecipient" IS NOT NULL AND length("normalizedRecipient") > 0
        AND "normalizedRecipient" = lower(btrim("normalizedRecipient"))
        AND (("participationId" IS NULL AND "state" = 'HELD'
          AND "resolvedByWorkspaceMemberId" IS NULL AND "resolvedAt" IS NULL)
          OR ("participationId" IS NOT NULL AND "resolvedByWorkspaceMemberId" IS NOT NULL
            AND "resolvedAt" IS NOT NULL))
      )) NOT VALID`);
    try {
    const rows: { ready: boolean }[] = await queryRunner.query(
      `SELECT
      NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('messageChannelId', 'uuid'), ('connectedAccountId', 'uuid'),
          ('resolvedThreadExternalId', 'text'), ('normalizedRecipient', 'text'),
          ('resolvedByWorkspaceMemberId', 'uuid'),
          ('resolvedAt', 'timestamp with time zone')
        ) expected(name, datatype)
        WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
          LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = to_regclass('core."campaignPartnershipWorkItem"')
            AND a.attname = expected.name AND NOT a.attisdropped
            AND NOT a.attnotnull AND d.oid IS NULL
            AND pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.datatype)
      )
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND c.conname = 'CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY'
          AND c.contype = 'c' AND c.convalidated AND NOT c.connoinherit
          AND pg_catalog.pg_get_expr(c.conbin, c.conrelid) = (SELECT pg_catalog.pg_get_expr(probe.conbin, probe.conrelid) FROM pg_catalog.pg_constraint probe
            WHERE probe.conrelid = c.conrelid
              AND probe.conname = 'CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY_PROBE'
              AND probe.contype = 'c' AND NOT probe.convalidated))
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        WHERE p.oid = to_regprocedure('core."protectCampaignPartnershipReplyAmbiguity"()')
          AND p.prorettype = 'pg_catalog.trigger'::regtype AND p.pronargs = 0
          AND l.lanname = 'plpgsql' AND p.prosrc = $1
          AND p.provolatile = 'v' AND NOT p.prosecdef
          AND NOT p.proisstrict AND p.proconfig IS NULL)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND t.tgname = 'TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY'
          AND t.tgenabled IN ('O', 'A')
          AND t.tgfoid = to_regprocedure('core."protectCampaignPartnershipReplyAmbiguity"()')
          AND t.tgtype = 23 -- BEFORE INSERT OR UPDATE FOR EACH ROW
          AND t.tgqual IS NULL AND t.tgattr = ''::int2vector) AS ready`,
      [snapshotTriggerBody],
    );
    if (rows[0]?.ready !== true) {
      throw new Error('Campaign reply ambiguity snapshot physical contract is incomplete');
    }
    } finally {
      await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
        DROP CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY_PROBE"`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE core."campaignPartnershipWorkItem" IN ACCESS EXCLUSIVE MODE`);
    await this.assertPhysicalContract(queryRunner);
    const rows: { occupied: boolean }[] = await queryRunner.query(`SELECT EXISTS (
      SELECT 1 FROM core."campaignPartnershipWorkItem" WHERE "purpose" = 'REPLY_AMBIGUITY'
        OR "messageChannelId" IS NOT NULL OR "connectedAccountId" IS NOT NULL
        OR "resolvedThreadExternalId" IS NOT NULL OR "normalizedRecipient" IS NOT NULL
        OR "resolvedByWorkspaceMemberId" IS NOT NULL OR "resolvedAt" IS NOT NULL
    ) AS occupied`);
    if (rows[0]?.occupied !== false) {
      throw new Error('Cannot remove campaign reply ambiguity snapshot with persisted evidence');
    }
    await queryRunner.query(`DROP TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY" ON core."campaignPartnershipWorkItem"`);
    await queryRunner.query(`DROP FUNCTION core."protectCampaignPartnershipReplyAmbiguity"()`);
    await queryRunner.query(`ALTER TABLE core."campaignPartnershipWorkItem"
      DROP CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY",
      DROP COLUMN "messageChannelId", DROP COLUMN "connectedAccountId",
      DROP COLUMN "resolvedThreadExternalId", DROP COLUMN "normalizedRecipient",
      DROP COLUMN "resolvedByWorkspaceMemberId", DROP COLUMN "resolvedAt"`);
  }
}
