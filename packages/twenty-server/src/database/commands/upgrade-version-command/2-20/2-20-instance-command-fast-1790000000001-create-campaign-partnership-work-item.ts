import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// PostgreSQL stores the text between $$ delimiters verbatim in pg_proc.prosrc.
// Reuse this exact text for installation and the completed-command shape check.
const identityTriggerBody = ` BEGIN
        IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
          OR NEW."triggerKey" IS DISTINCT FROM OLD."triggerKey"
          OR NEW."purpose" IS DISTINCT FROM OLD."purpose"
        THEN RAISE EXCEPTION 'Campaign partnership work identity is immutable'; END IF;
        IF NEW."participationId" IS DISTINCT FROM OLD."participationId"
          AND NOT (OLD."participationId" IS NULL AND NEW."participationId" IS NOT NULL
            AND OLD."state" = 'HELD')
        THEN RAISE EXCEPTION 'Partnership work attribution cannot be changed'; END IF;
        IF OLD."state" = 'COMPLETED' AND (
          NEW."state" IS DISTINCT FROM 'COMPLETED'
          OR NEW."candidateId" IS DISTINCT FROM OLD."candidateId"
          OR NEW."draftId" IS DISTINCT FROM OLD."draftId"
          OR NEW."actionId" IS DISTINCT FROM OLD."actionId"
          OR NEW."receiptId" IS DISTINCT FROM OLD."receiptId"
        ) THEN RAISE EXCEPTION 'Completed partnership work cannot be rewritten'; END IF;
        RETURN NEW;
      END `;

@RegisteredInstanceCommand('2.20.0', 1790000000001)
export class CreateCampaignPartnershipWorkItemFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."campaignPartnershipWorkItem" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL,
      "triggerKey" varchar(64) NOT NULL,
      "purpose" varchar(64) NOT NULL,
      "participationId" uuid,
      "state" varchar(32) NOT NULL DEFAULT 'PENDING',
      "reason" varchar(128),
      "contextGeneration" integer NOT NULL DEFAULT 0,
      "attempts" integer NOT NULL DEFAULT 0,
      "leaseToken" uuid,
      "leaseExpiresAt" timestamptz,
      "nextDueAt" timestamptz,
      "candidateId" uuid,
      "draftId" uuid,
      "actionId" uuid,
      "receiptId" uuid,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_CAMPAIGN_PARTNERSHIP_WORK_ITEM" PRIMARY KEY ("id"),
      CONSTRAINT "FK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_WORKSPACE"
        FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER" CHECK (
        "triggerKey" ~ '^(email-message|instagram-message|due-check|participation-event):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ),
      CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_PURPOSE" CHECK (length(btrim("purpose")) > 0),
      CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_ATTEMPTS" CHECK ("attempts" >= 0),
      CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_GENERATION" CHECK ("contextGeneration" >= 0),
      CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_ATTRIBUTION" CHECK (
        "participationId" IS NOT NULL OR "state" = 'HELD'
      ),
      CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_STATE" CHECK (
        "state" IN ('PENDING', 'PROCESSING', 'AWAITING_REVIEW', 'READY_ACTION', 'COMPLETED', 'SUPERSEDED', 'HELD', 'FAILED')
      )
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER"
      ON core."campaignPartnershipWorkItem" ("workspaceId", "triggerKey", "purpose")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE"
      ON core."campaignPartnershipWorkItem" ("state", "nextDueAt")`);
    // update:false only protects ORM writes. Guard identity against direct SQL and other writers too.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION core."protectCampaignPartnershipWorkItemIdentity"()
      RETURNS trigger LANGUAGE plpgsql AS $$${identityTriggerBody}$$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY"
      ON core."campaignPartnershipWorkItem"`);
    await queryRunner.query(`CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY"
      BEFORE UPDATE ON core."campaignPartnershipWorkItem"
      FOR EACH ROW EXECUTE FUNCTION core."protectCampaignPartnershipWorkItemIdentity"()`);
    await this.assertPhysicalContract(queryRunner);
  }

  async assertPhysicalContract(queryRunner: QueryRunner): Promise<void> {
    // IF NOT EXISTS can silently accept a pre-existing, incompatible table or
    // same-named index. Do not report success unless the physical contract exists.
    const rows: { ready: boolean }[] = await queryRunner.query(
      `SELECT
      to_regclass('core."campaignPartnershipWorkItem"') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('id', 'uuid', true, 'uuid_generate_v4()'),
          ('workspaceId', 'uuid', true, NULL::text),
          ('triggerKey', 'character varying(64)', true, NULL),
          ('purpose', 'character varying(64)', true, NULL),
          ('participationId', 'uuid', false, NULL),
          ('state', 'character varying(32)', true, $default$'PENDING'::character varying$default$),
          ('reason', 'character varying(128)', false, NULL),
          ('contextGeneration', 'integer', true, '0'),
          ('attempts', 'integer', true, '0'),
          ('leaseToken', 'uuid', false, NULL),
          ('leaseExpiresAt', 'timestamp with time zone', false, NULL),
          ('nextDueAt', 'timestamp with time zone', false, NULL),
          ('candidateId', 'uuid', false, NULL),
          ('draftId', 'uuid', false, NULL),
          ('actionId', 'uuid', false, NULL),
          ('receiptId', 'uuid', false, NULL),
          ('createdAt', 'timestamp with time zone', true, 'now()'),
          ('updatedAt', 'timestamp with time zone', true, 'now()')
        ) AS expected(name, datatype, required, default_expr)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute a
          LEFT JOIN pg_catalog.pg_attrdef d
            ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = to_regclass('core."campaignPartnershipWorkItem"')
            AND a.attname = expected.name AND NOT a.attisdropped
            AND pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.datatype
            AND a.attnotnull = expected.required
            AND pg_catalog.pg_get_expr(d.adbin, d.adrelid)
              IS NOT DISTINCT FROM expected.default_expr
        )
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND c.conname = 'PK_CAMPAIGN_PARTNERSHIP_WORK_ITEM' AND c.contype = 'p'
          AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = c.conrelid AND attname = 'id')]::smallint[]
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND c.conname = 'FK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_WORKSPACE' AND c.contype = 'f'
          AND c.convalidated AND c.confrelid = to_regclass('core."workspace"')
          AND c.confdeltype = 'c' AND c.confupdtype = 'a'
          AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = c.conrelid AND attname = 'workspaceId')]::smallint[]
          AND c.confkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid = c.confrelid AND attname = 'id')]::smallint[]
      )
      -- Exact PG16 deparse includes whitespace inside regex literals; never
      -- normalize it. Unknown PostgreSQL formatting fails closed.
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES
          ('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER',
            $check$(("triggerKey")::text ~ '^(email-message|instagram-message|due-check|participation-event):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)$check$),
          ('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_PURPOSE',
            $check$(length(btrim((purpose)::text)) > 0)$check$),
          ('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_ATTEMPTS', $check$(attempts >= 0)$check$),
          ('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_GENERATION', $check$("contextGeneration" >= 0)$check$),
          ('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_ATTRIBUTION',
            $check$(("participationId" IS NOT NULL) OR ((state)::text = 'HELD'::text))$check$),
          ('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_STATE',
            $check$((state)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'AWAITING_REVIEW'::character varying, 'READY_ACTION'::character varying, 'COMPLETED'::character varying, 'SUPERSEDED'::character varying, 'HELD'::character varying, 'FAILED'::character varying])::text[]))$check$)
        ) AS expected(name, expression)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_constraint c
          WHERE c.conrelid = to_regclass('core."campaignPartnershipWorkItem"')
            AND c.conname = expected.name AND c.contype = 'c' AND c.convalidated
            AND pg_catalog.pg_get_expr(c.conbin, c.conrelid) = expected.expression
        )
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
        WHERE i.indrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND idx.relname = 'UQ_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER'
          AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
          AND i.indnkeyatts = 3
          AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = '"workspaceId"'
          AND pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = '"triggerKey"'
          AND pg_catalog.pg_get_indexdef(i.indexrelid, 3, true) = 'purpose'
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid = idx.relam
        WHERE i.indrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND idx.relname = 'IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE'
          AND i.indisvalid AND NOT i.indisunique AND i.indpred IS NULL
          AND i.indnkeyatts = 2 AND am.amname = 'btree'
          AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'state'
          AND pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = '"nextDueAt"'
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        WHERE p.oid = to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')
          AND p.prorettype = 'pg_catalog.trigger'::regtype
          AND p.pronargs = 0 AND l.lanname = 'plpgsql'
          AND p.prosrc = $1
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid = to_regclass('core."campaignPartnershipWorkItem"')
          AND t.tgname = 'TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY' AND t.tgenabled IN ('O', 'A')
          AND t.tgfoid = to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')
          AND t.tgtype = 19 -- BEFORE UPDATE FOR EACH ROW
          AND t.tgqual IS NULL AND t.tgattr = ''::int2vector
      ) AS ready`,
      [identityTriggerBody],
    );

    if (rows[0]?.ready !== true) {
      throw new Error(
        'Campaign partnership work physical contract is incomplete',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Disable worker consumption before rollback. Never discard persisted work:
    // the exclusive lock keeps writers out between the row check and table drop.
    await queryRunner.query(`DO $$ BEGIN
      IF to_regclass('core."campaignPartnershipWorkItem"') IS NOT NULL THEN
        LOCK TABLE core."campaignPartnershipWorkItem" IN ACCESS EXCLUSIVE MODE;
        IF EXISTS (SELECT 1 FROM core."campaignPartnershipWorkItem") THEN
          RAISE EXCEPTION 'Cannot drop campaign partnership work items with persisted rows; disable worker consumption and retain data';
        END IF;
        DROP TABLE core."campaignPartnershipWorkItem";
      END IF;
    END $$`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS core."protectCampaignPartnershipWorkItemIdentity"()`,
    );
  }
}
