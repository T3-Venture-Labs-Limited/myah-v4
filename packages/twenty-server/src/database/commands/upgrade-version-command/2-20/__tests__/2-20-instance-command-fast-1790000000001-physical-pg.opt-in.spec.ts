import { DataSource, type QueryRunner } from 'typeorm';

import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';

// Only a freshly created, externally verified task-owned database may be touched.
// Bootstrap with CREATE DATABASE myah392_physical_pg_20260924, then
// COMMENT ON DATABASE myah392_physical_pg_20260924 IS
// 'MYAH392_PHYSICAL_PG_20260924_DISPOSABLE'. Never use the server's
// PG_DATABASE_URL or Jest integration setup. PostgreSQL stores database comments
// in the shared catalog, hence shobj_description rather than obj_description.
const databaseName = 'myah392_physical_pg_20260924';
const databaseMarker = 'MYAH392_PHYSICAL_PG_20260924_DISPOSABLE';
const enabled = process.env.MYAH392_PHYSICAL_PG === '1';

describe(
  enabled
    ? '2.20 FAST physical PostgreSQL contract'
    : '2.20 FAST physical PostgreSQL contract (opt-in)',
  () => {
    (enabled ? it : it.skip)(
      'accepts fresh PG15/16 and rejects same-OID function, restricted triggers and malformed due indexes',
      async () => {
        jest.useRealTimers();
        const urlString = process.env.MYAH392_PHYSICAL_PG_URL;

        if (!urlString) throw new Error('MYAH392_PHYSICAL_PG_URL is required');
        const url = new URL(urlString);

        if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
          throw new Error('Expected a PostgreSQL URL');
        if (
          url.hostname !== '127.0.0.1' ||
          url.pathname !== `/${databaseName}` ||
          !url.port ||
          url.search ||
          url.hash
        )
          throw new Error(
            'Expected an exact local task-owned PostgreSQL URL without options',
          );

        const dataSource = new DataSource({ type: 'postgres', url: urlString });
        let runner: QueryRunner | undefined;

        try {
          await dataSource.initialize();
          runner = dataSource.createQueryRunner();
          await runner.connect();
          const [identity]: {
            name: string;
            marker: string | null;
            version: string;
          }[] = await runner.query(`SELECT current_database() AS name,
          pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
          current_setting('server_version_num') AS version
          FROM pg_catalog.pg_database d WHERE d.datname = current_database()`);

          if (
            identity?.name !== databaseName ||
            identity.marker !== databaseMarker ||
            !/^(15|16)\d{4}$/.test(identity.version)
          )
            throw new Error(
              'Task-owned local PostgreSQL 15/16 database identity not verified',
            );

          // Fail closed on an existing core schema: never touch a shared or populated fixture.
          const [{ coreExists, workExists }]: {
            coreExists: boolean;
            workExists: boolean;
          }[] = await runner.query(`SELECT
          to_regnamespace('core') IS NOT NULL AS "coreExists",
          to_regclass('core."campaignPartnershipWorkItem"') IS NOT NULL AS "workExists"`);

          if (coreExists || workExists)
            throw new Error('Expected a fresh empty task database');

          // Jest config is silent by default; use --silent=false for run provenance.
          // oxlint-disable-next-line no-console -- sanitized opt-in database attestation
          console.info(
            `MYAH392_PHYSICAL_PG_ATTEST host=127.0.0.1 port=${url.port} database=${identity.name} pgVersion=${identity.version} marker=${identity.marker}`,
          );

          await runner.startTransaction();
          await runner.query(
            'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
          );
          await runner.query('CREATE SCHEMA core');
          await runner.query(
            'CREATE TABLE core."workspace" ("id" uuid PRIMARY KEY)',
          );

          const command =
            new CreateCampaignPartnershipWorkItemFastInstanceCommand();

          await command.up(runner); // Exactly once: up() repairs malformed triggers.
          await expect(
            command.assertPhysicalContract(runner),
          ).resolves.toBeUndefined();

          const qr = runner;
          const rejectsCorruption = async (statements: string[]) => {
            await qr.query('SAVEPOINT physical_contract_case');
            try {
              for (const statement of statements) await qr.query(statement);
              await expect(command.assertPhysicalContract(qr)).rejects.toThrow(
                'Campaign partnership work physical contract is incomplete',
              );
            } finally {
              await qr.query('ROLLBACK TO SAVEPOINT physical_contract_case');
              await qr.query('RELEASE SAVEPOINT physical_contract_case');
            }
            await expect(
              command.assertPhysicalContract(qr),
            ).resolves.toBeUndefined();
          };

          const [{ oid: originalOid }]: { oid: string }[] = await runner.query(
            `SELECT to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')::oid::text AS oid`,
          );

          await runner.query('SAVEPOINT physical_contract_case');
          try {
            await runner.query(`CREATE OR REPLACE FUNCTION core."protectCampaignPartnershipWorkItemIdentity"()
            RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`);
            const [{ oid: replacedOid }]: { oid: string }[] =
              await runner.query(
                `SELECT to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')::oid::text AS oid`,
              );

            expect(replacedOid).toBe(originalOid);
            await expect(
              command.assertPhysicalContract(runner),
            ).rejects.toThrow(
              'Campaign partnership work physical contract is incomplete',
            );
          } finally {
            await runner.query('ROLLBACK TO SAVEPOINT physical_contract_case');
            await runner.query('RELEASE SAVEPOINT physical_contract_case');
          }
          await expect(
            command.assertPhysicalContract(runner),
          ).resolves.toBeUndefined();

          const dropTrigger = `DROP TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY"
            ON core."campaignPartnershipWorkItem"`;
          await rejectsCorruption([
            dropTrigger,
            `CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY"
              BEFORE UPDATE ON core."campaignPartnershipWorkItem"
              FOR EACH ROW WHEN (false)
              EXECUTE FUNCTION core."protectCampaignPartnershipWorkItemIdentity"()`,
          ]);
          await rejectsCorruption([
            dropTrigger,
            `CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY"
              BEFORE UPDATE OF "state" ON core."campaignPartnershipWorkItem"
              FOR EACH ROW EXECUTE FUNCTION core."protectCampaignPartnershipWorkItemIdentity"()`,
          ]);

          for (const malformedIndex of [
            `CREATE INDEX "IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE"
              ON core."campaignPartnershipWorkItem" ("state", "attempts")`,
            `CREATE INDEX "IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE"
              ON core."campaignPartnershipWorkItem" ("state", "nextDueAt") WHERE "state" = 'PENDING'`,
            `CREATE UNIQUE INDEX "IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE"
              ON core."campaignPartnershipWorkItem" ("state", "nextDueAt")`,
          ]) {
            await rejectsCorruption([
              'DROP INDEX core."IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE"',
              malformedIndex,
            ]);
          }
          await expect(
            command.assertPhysicalContract(runner),
          ).resolves.toBeUndefined();
        } finally {
          if (runner?.isTransactionActive) await runner.rollbackTransaction();
          if (runner && !runner.isReleased) await runner.release();
          if (dataSource.isInitialized) await dataSource.destroy();
        }
      },
      30000,
    );
  },
);
