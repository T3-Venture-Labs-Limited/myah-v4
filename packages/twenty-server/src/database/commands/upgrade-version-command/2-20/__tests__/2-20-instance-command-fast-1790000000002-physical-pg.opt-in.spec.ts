import { DataSource, type QueryRunner } from 'typeorm';

import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { AddCampaignReplyAmbiguitySnapshotFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000002-add-campaign-reply-ambiguity-snapshot';

// Same isolation policy as F's opt-in physical proof; provision a new empty
// task-owned database and marker first. Never point at a server/integration DB.
const databaseName = 'myah392_ambiguity_pg_20260924';
const databaseMarker = 'MYAH392_AMBIGUITY_PG_20260924_DISPOSABLE';
const enabled = process.env.MYAH392_AMBIGUITY_PHYSICAL_PG === '1';
const uuid = '12345678-1234-1234-1234-123456789abc';
const otherUuid = '22345678-1234-1234-1234-123456789abc';

describe(enabled ? 'G physical PostgreSQL contract' : 'G physical PostgreSQL contract (opt-in)', () => {
  (enabled ? it : it.skip)('upgrades after F; holds ambiguous Email with frozen route and audited one-way resolution', async () => {
    jest.useRealTimers();
    const urlString = process.env.MYAH392_AMBIGUITY_PHYSICAL_PG_URL;
    if (!urlString) throw new Error('MYAH392_AMBIGUITY_PHYSICAL_PG_URL required');
    const url = new URL(urlString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      !url.port || url.pathname !== `/${databaseName}` || url.search || url.hash) {
      throw new Error('Expected exact local task-owned PostgreSQL URL without options');
    }
    const dataSource = new DataSource({ type: 'postgres', url: urlString });
    let runner: QueryRunner | undefined;
    try {
      await dataSource.initialize();
      runner = dataSource.createQueryRunner();
      await runner.connect();
      const qr = runner;
      const [identity]: { name: string; marker: string | null; version: string }[] = await runner.query(`SELECT current_database() AS name,
        pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
        current_setting('server_version_num') AS version
        FROM pg_catalog.pg_database d WHERE d.datname = current_database()`);
      if (identity?.name !== databaseName || identity.marker !== databaseMarker ||
        !/^(15|16)\d{4}$/.test(identity.version)) throw new Error('Task-owned PG15/16 database identity not verified');
      const [{ coreExists, workExists }]: { coreExists: boolean; workExists: boolean }[] = await runner.query(`SELECT
        to_regnamespace('core') IS NOT NULL AS "coreExists",
        to_regclass('core."campaignPartnershipWorkItem"') IS NOT NULL AS "workExists"`);
      if (coreExists || workExists) throw new Error('Expected a fresh empty task database');
      // oxlint-disable-next-line no-console -- sanitized opt-in database attestation
      console.info(`MYAH392_AMBIGUITY_ATTEST host=127.0.0.1 port=${url.port} database=${identity.name} pgVersion=${identity.version} marker=${identity.marker}`);
      await runner.startTransaction();
      await runner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public');
      await runner.query('CREATE SCHEMA core');
      await runner.query('CREATE TABLE core."workspace" ("id" uuid PRIMARY KEY)');
      await runner.query('INSERT INTO core."workspace" ("id") VALUES ($1)', [uuid]);
      const f = new CreateCampaignPartnershipWorkItemFastInstanceCommand();
      await f.up(runner);
      const g = new AddCampaignReplyAmbiguitySnapshotFastInstanceCommand();
      // A historical purpose value without verified provider coordinates is
      // not a route: preflight must reject it before adding any G columns.
      await runner.query('SAVEPOINT ambiguity_preexisting');
      try {
        await runner.query(`INSERT INTO core."campaignPartnershipWorkItem"
          ("workspaceId", "triggerKey", "purpose", "state")
          VALUES ($1, $2, 'REPLY_AMBIGUITY', 'HELD')`, [uuid, `email-message:${uuid}`]);
        await expect(g.up(runner)).rejects.toThrow('Unknown preexisting reply ambiguity rows');
        const [{ absent }]: { absent: boolean }[] = await runner.query(`SELECT
          NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
            WHERE attrelid = 'core."campaignPartnershipWorkItem"'::regclass
              AND attname = 'messageChannelId' AND NOT attisdropped) AS absent`);
        expect(absent).toBe(true);
      } finally {
        await runner.query('ROLLBACK TO SAVEPOINT ambiguity_preexisting');
        await runner.query('RELEASE SAVEPOINT ambiguity_preexisting');
      }
      await g.up(runner);
      await f.assertPhysicalContract(qr);
      await qr.query('SAVEPOINT f_identity_on_g');
      try {
        const [{ oid: originalOid }]: { oid: string }[] = await qr.query(`SELECT
          to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')::oid::text AS oid`);
        await qr.query(`CREATE OR REPLACE FUNCTION core."protectCampaignPartnershipWorkItemIdentity"()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`);
        const [{ oid: replacedOid }]: { oid: string }[] = await qr.query(`SELECT
          to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')::oid::text AS oid`);
        expect(replacedOid).toBe(originalOid);
        await expect(f.assertPhysicalContract(qr)).rejects.toThrow('physical contract is incomplete');
        await g.assertPhysicalContract(qr);
      } finally {
        await qr.query('ROLLBACK TO SAVEPOINT f_identity_on_g');
        await qr.query('RELEASE SAVEPOINT f_identity_on_g');
      }
      await f.assertPhysicalContract(qr);
      await g.assertPhysicalContract(qr);
      await expect(g.up(runner)).resolves.toBeUndefined(); // empty exact rerun
      const base = `INSERT INTO core."campaignPartnershipWorkItem"
        ("workspaceId", "triggerKey", "purpose", "state", "messageChannelId",
         "connectedAccountId", "resolvedThreadExternalId", "normalizedRecipient")
        VALUES ($1, $2, 'REPLY_AMBIGUITY', 'HELD', $3, $4, $5, $6)`;
      const reject = async (sql: string, params: unknown[]) => {
        await qr.query('SAVEPOINT ambiguity_case');
        try {
          await expect(qr.query(sql, params)).rejects.toThrow();
        } finally {
          await qr.query('ROLLBACK TO SAVEPOINT ambiguity_case');
          await qr.query('RELEASE SAVEPOINT ambiguity_case');
        }
      };
      await reject(base, [uuid, `email-message:${uuid}`, uuid, otherUuid, ' thread ', 'creator@example.com']);
      await reject(base, [uuid, `instagram-message:${uuid}`, uuid, otherUuid, 'thread', 'creator@example.com']);
      await reject(base, [uuid, `email-message:${uuid}`, uuid, otherUuid, 'thread', ' Creator@example.com ']);
      await reject(`${base}, ($1, $2, 'REPLY_AMBIGUITY', 'HELD', $3, $4, $5, $6)`,
        [uuid, `email-message:${uuid}`, uuid, otherUuid, 'thread', 'creator@example.com']);
      await reject(`INSERT INTO core."campaignPartnershipWorkItem"
        ("workspaceId", "triggerKey", "purpose", "state", "messageChannelId",
          "connectedAccountId", "resolvedThreadExternalId", "normalizedRecipient",
          "participationId", "resolvedByWorkspaceMemberId", "resolvedAt")
        VALUES ($1, $2, 'REPLY_AMBIGUITY', 'HELD', $3, $4, $5, $6, $7, $8, now())`,
        [uuid, `email-message:${uuid}`, uuid, otherUuid, 'thread', 'creator@example.com', otherUuid, uuid]);
      await runner.query(base, [uuid, `email-message:${uuid}`, uuid, otherUuid, 'thread', 'creator@example.com']);
      await reject(`UPDATE core."campaignPartnershipWorkItem" SET "connectedAccountId" = $1 WHERE "triggerKey" = $2`,
        [uuid, `email-message:${uuid}`]);
      await reject(`UPDATE core."campaignPartnershipWorkItem" SET "participationId" = $1 WHERE "triggerKey" = $2`,
        [otherUuid, `email-message:${uuid}`]);
      await runner.query(`UPDATE core."campaignPartnershipWorkItem" SET "participationId" = $1,
        "resolvedByWorkspaceMemberId" = $2, "resolvedAt" = now() WHERE "triggerKey" = $3`,
        [otherUuid, uuid, `email-message:${uuid}`]);
      await reject(`UPDATE core."campaignPartnershipWorkItem" SET "resolvedByWorkspaceMemberId" = $1 WHERE "triggerKey" = $2`,
        [otherUuid, `email-message:${uuid}`]);
      await expect(g.up(runner)).resolves.toBeUndefined();
      const corrupt = async (statements: string[]) => {
        await qr.query('SAVEPOINT ambiguity_shape');
        try {
          for (const statement of statements) await qr.query(statement);
          await expect(g.assertPhysicalContract(qr)).rejects.toThrow('physical contract is incomplete');
          await expect(g.up(qr)).rejects.toThrow('physical contract is incomplete');
        } finally {
          await qr.query('ROLLBACK TO SAVEPOINT ambiguity_shape');
          await qr.query('RELEASE SAVEPOINT ambiguity_shape');
        }
        await g.assertPhysicalContract(qr);
      };
      // A same-name object is not evidence that its physical definition is safe.
      await corrupt([`ALTER TABLE core."campaignPartnershipWorkItem" DROP CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY"`,
        `ALTER TABLE core."campaignPartnershipWorkItem" ADD CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY"
          CHECK ("purpose" <> 'REPLY_AMBIGUITY' OR "messageChannelId" IS NOT NULL)`]);
      await corrupt([`ALTER TABLE core."campaignPartnershipWorkItem" ALTER COLUMN "connectedAccountId" SET DEFAULT '${uuid}'::uuid`]);
      await corrupt([`ALTER FUNCTION core."protectCampaignPartnershipReplyAmbiguity"() STABLE`]);
      await corrupt([`ALTER FUNCTION core."protectCampaignPartnershipReplyAmbiguity"() SECURITY DEFINER`]);
      await corrupt([`ALTER FUNCTION core."protectCampaignPartnershipReplyAmbiguity"() STRICT`]);
      await corrupt([`ALTER FUNCTION core."protectCampaignPartnershipReplyAmbiguity"() SET search_path TO public`]);
      await corrupt([`ALTER TABLE core."campaignPartnershipWorkItem" ALTER COLUMN "normalizedRecipient" TYPE varchar(255)`]);
      await corrupt([`DROP TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY" ON core."campaignPartnershipWorkItem"`]);
      await corrupt([`DROP TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY" ON core."campaignPartnershipWorkItem"`,
        `CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY"
          BEFORE INSERT OR UPDATE ON core."campaignPartnershipWorkItem"
          FOR EACH ROW WHEN (false)
          EXECUTE FUNCTION core."protectCampaignPartnershipReplyAmbiguity"()`]);
      await corrupt([`DROP TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY" ON core."campaignPartnershipWorkItem"`,
        `CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY"
          BEFORE INSERT OR UPDATE OF "state" ON core."campaignPartnershipWorkItem"
          FOR EACH ROW EXECUTE FUNCTION core."protectCampaignPartnershipReplyAmbiguity"()`]);
      await runner.query('SAVEPOINT ambiguity_shape');
      try {
        await runner.query(`CREATE OR REPLACE FUNCTION core."protectCampaignPartnershipReplyAmbiguity"()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`);
        await expect(g.assertPhysicalContract(runner)).rejects.toThrow('physical contract is incomplete');
        await expect(g.up(runner)).rejects.toThrow('physical contract is incomplete');
      } finally {
        await runner.query('ROLLBACK TO SAVEPOINT ambiguity_shape');
        await runner.query('RELEASE SAVEPOINT ambiguity_shape');
      }
      await g.assertPhysicalContract(runner);
      await expect(g.down(runner)).rejects.toThrow('persisted evidence');
      // Even non-ambiguity work carrying a G coordinate would lose evidence.
      await runner.query('SAVEPOINT ambiguity_rollback');
      try {
        await runner.query(`DELETE FROM core."campaignPartnershipWorkItem"`);
        await runner.query(`INSERT INTO core."campaignPartnershipWorkItem"
          ("workspaceId", "triggerKey", "purpose", "state", "participationId", "messageChannelId")
          VALUES ($1, $2, 'REPLY', 'PENDING', $3, $4)`,
          [uuid, `email-message:${uuid}`, otherUuid, uuid]);
        await expect(g.down(runner)).rejects.toThrow('persisted evidence');
      } finally {
        await runner.query('ROLLBACK TO SAVEPOINT ambiguity_rollback');
        await runner.query('RELEASE SAVEPOINT ambiguity_rollback');
      }
      await runner.query(`DELETE FROM core."campaignPartnershipWorkItem"`);
      await g.down(runner);
      const [{ gAbsent, fPresent }]: { gAbsent: boolean; fPresent: boolean }[] = await runner.query(`SELECT
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
          WHERE attrelid = 'core."campaignPartnershipWorkItem"'::regclass
            AND attname = 'messageChannelId' AND NOT attisdropped) AS "gAbsent",
        to_regclass('core."campaignPartnershipWorkItem"') IS NOT NULL AS "fPresent"`);
      expect({ gAbsent, fPresent }).toEqual({ gAbsent: true, fPresent: true });
      await new CreateCampaignPartnershipWorkItemFastInstanceCommand().assertPhysicalContract(runner);
    } finally {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }, 30000);
});
