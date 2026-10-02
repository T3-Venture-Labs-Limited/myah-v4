import { DataSource, type QueryRunner, type Repository } from 'typeorm';

import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeMigrationEntity } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';

// Opt-in, read-only physical verification on a separately marked existing-workspace clone.
// Never use application PG_DATABASE_URL, integration Jest setup, migration or seeding.
const enabled = process.env.MYAH392_PINNED_READER_PHYSICAL_PG === '1';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fingerprint = { count: string; digest: string | null };

const fingerprint = (runner: QueryRunner): Promise<Fingerprint[]> =>
  runner.query(`SELECT count(*)::text AS count,
    md5(string_agg(row_to_json(r)::text, ',' ORDER BY r.id)) AS digest
    FROM core."upgradeMigration" r`);

describe('Pinned upgrade receipt history physical PG (opt-in, read-only)', () => {
  (enabled ? it : it.skip)(
    'reads the marked restored baseline through the real PostgreSQL QueryRunner without changing receipts',
    async () => {
      jest.useRealTimers();
      const required = (key: string): string => {
        const value = process.env[key];
        if (!value) throw new Error(`${key} is required`);
        return value;
      };
      const urlString = required('MYAH392_PINNED_READER_PG_URL');
      const database = required('MYAH392_PINNED_READER_EXPECTED_DB');
      const port = required('MYAH392_PINNED_READER_EXPECTED_PORT');
      const marker = required('MYAH392_PINNED_READER_EXPECTED_MARKER');
      const role = required('MYAH392_PINNED_READER_EXPECTED_ROLE');
      const workspaceId = required(
        'MYAH392_PINNED_READER_EXPECTED_WORKSPACE_ID',
      );
      const schema = required('MYAH392_PINNED_READER_EXPECTED_SCHEMA');
      const version = required('MYAH392_PINNED_READER_EXPECTED_VERSION');
      if (!uuidPattern.test(workspaceId) || !/^16\d{4}$/.test(version))
        throw new Error('Invalid expected workspace UUID or PG16 version');
      const url = new URL(urlString);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== '127.0.0.1' ||
        url.port !== port ||
        url.pathname !== `/${database}` ||
        url.username !== role ||
        !url.password ||
        url.search ||
        url.hash ||
        !/^\d{2,5}$/.test(port) ||
        !/^MYAH392_CANDIDATE_CLONE_PG16_[A-Za-z0-9-]+_DISPOSABLE$/.test(
          marker,
        ) ||
        !/^workspace_[a-z0-9]+$/.test(schema)
      )
        throw new Error(
          'Task-only marked loopback PostgreSQL URL/identity not verified',
        );

      // Server-side read-only session, including attestation and both method calls.
      const source = new DataSource({
        type: 'postgres',
        url: urlString,
        extra: { options: '-c default_transaction_read_only=on' },
      });
      let runner: QueryRunner | undefined;
      try {
        await source.initialize();
        runner = source.createQueryRunner();
        await runner.connect();
        const identities: {
          database: string;
          marker: string | null;
          role: string;
          version: string;
          readOnly: string;
        }[] = await runner.query(`SELECT current_database() AS database,
          pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
          current_user AS role, current_setting('server_version_num') AS version,
          current_setting('default_transaction_read_only') AS "readOnly"
          FROM pg_catalog.pg_database d WHERE d.datname = current_database()`);
        if (
          identities.length !== 1 ||
          identities[0].database !== database ||
          identities[0].marker !== marker ||
          identities[0].role !== role ||
          identities[0].version !== version ||
          identities[0].readOnly !== 'on'
        )
          throw new Error(
            'Clone PostgreSQL identity/read-only attestation failed',
          );

        const workspaces: { id: string; schemaExists: boolean }[] =
          await runner.query(
            `SELECT w.id, to_regnamespace($1) IS NOT NULL AS "schemaExists"
            FROM core."workspace" w WHERE w."activationStatus" = 'ACTIVE'`,
            [schema],
          );
        if (
          workspaces.length !== 1 ||
          workspaces[0].id !== workspaceId ||
          !workspaces[0].schemaExists
        )
          throw new Error(
            'Exactly one expected ACTIVE workspace/schema required',
          );

        const before = (await fingerprint(runner))[0];
        expect(before.count).toBe('137');
        const service = new UpgradeMigrationService(
          {} as Repository<UpgradeMigrationEntity>,
        );
        const scoped = await service.getScopedUpgradeReceiptHistories({
          workspaceIds: [workspaceId],
          queryRunner: runner,
        });
        expect([...scoped.keys()]).toEqual([null, workspaceId]);
        expect(scoped.get(null)).toHaveLength(136);
        expect(scoped.get(workspaceId)).toHaveLength(1);
        const initial = scoped.get(workspaceId)?.[0];
        expect(initial?.isInitial).toBe(true);
        expect(initial?.status).toBe('completed');
        for (const [scope, receipts] of scoped) {
          for (const row of receipts) {
            expect(row.workspaceId).toBe(scope);
            expect(row.id).toMatch(uuidPattern);
            expect(row.name).toEqual(expect.any(String));
            expect(row.name.length).toBeGreaterThan(0);
            expect(Number.isInteger(row.attempt) && row.attempt > 0).toBe(true);
            expect(['completed', 'failed']).toContain(row.status);
            expect(typeof row.isInitial).toBe('boolean');
            expect(row.createdAt).toBeInstanceOf(Date);
            expect(Number.isNaN(row.createdAt.getTime())).toBe(false);
          }
        }
        const empty = await service.getScopedUpgradeReceiptHistories({
          workspaceIds: [],
          queryRunner: runner,
        });
        expect([...empty.keys()]).toEqual([null]);
        expect(empty.get(null)).toEqual(scoped.get(null));
        expect((await fingerprint(runner))[0]).toEqual(before);
        // oxlint-disable-next-line no-console -- only sanitized count/digest, never URL or receipt IDs
        console.info(
          `PINNED_PHYSICAL_READ_ONLY count=${before.count} digest=${before.digest} instance=136 workspace=1 emptyScope=136`,
        );
      } finally {
        if (runner && !runner.isReleased) await runner.release();
        if (source.isInitialized) await source.destroy();
      }
    },
    30000,
  );
});
