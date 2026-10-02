import { randomUUID } from 'node:crypto';

import { Client } from 'pg';

// Task-owned opt-in URL and independent expected identity, never a shared
// server DATABASE_URL. No integration setup/reset or external provider calls.
const enabled = process.env.MYAH392_PARTNERSHIP_PG === '1';

describe('fresh participation schema examples (opt-in PostgreSQL)', () => {
  (enabled ? it : it.skip)(
    'round-trips three independent lines and rolls back',
    async () => {
      jest.useRealTimers();
      const urlString = process.env.MYAH392_PARTNERSHIP_PG_URL;
      const database = process.env.MYAH392_PARTNERSHIP_PG_DATABASE;
      const port = process.env.MYAH392_PARTNERSHIP_PG_PORT;
      const marker = process.env.MYAH392_PARTNERSHIP_PG_MARKER;
      const workspaceId = process.env.MYAH392_PARTNERSHIP_WORKSPACE_ID;
      const schema = process.env.MYAH392_PARTNERSHIP_WORKSPACE_SCHEMA;
      if (
        !urlString ||
        !database ||
        !/^myah392_[a-z0-9_]+_retry$/.test(database) ||
        !port ||
        !/^\d{4,5}$/.test(port) ||
        Number(port) > 65535 ||
        !marker ||
        !/^MYAH392_FRESH_[A-Za-z0-9_-]+_DISPOSABLE$/.test(marker) ||
        !workspaceId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          workspaceId,
        ) ||
        !schema ||
        !/^workspace_[a-z0-9]+$/.test(schema)
      )
        throw new Error('Task-owned disposable PostgreSQL identity required');
      const url = new URL(urlString);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== '127.0.0.1' ||
        url.port !== port ||
        url.pathname !== `/${database}` ||
        url.search ||
        url.hash
      )
        throw new Error('Unexpected PostgreSQL endpoint');

      const client = new Client({ connectionString: urlString });
      let transaction = false;
      try {
        await client.connect();
        const {
          rows: [identity],
        } = await client.query(`SELECT current_database() AS name,
        pg_catalog.shobj_description(oid, 'pg_database') AS marker,
        current_setting('server_version_num') AS version
        FROM pg_catalog.pg_database WHERE datname = current_database()`);
        if (
          identity?.name !== database ||
          identity.marker !== marker ||
          !/^(15|16)\d{4}$/.test(identity.version)
        )
          throw new Error('Task database marker/version mismatch');
        const { rows: workspaces } =
          await client.query(`SELECT id, "databaseSchema", "activationStatus"
        FROM core.workspace WHERE "deletedAt" IS NULL`);
        if (
          workspaces.length !== 1 ||
          workspaces[0].activationStatus !== 'ACTIVE' ||
          workspaces[0].id !== workspaceId ||
          workspaces[0].databaseSchema !== schema
        )
          throw new Error('Expected exactly the marked seeded workspace');
        const tables = [
          'campaignCreator',
          'partnershipOfferVersion',
          'partnershipObligation',
          'task',
        ];
        for (const table of tables) {
          const {
            rows: [found],
          } = await client.query(
            'SELECT to_regclass($1) IS NOT NULL AS present',
            [`${schema}."${table}"`],
          );
          if (!found.present) throw new Error(`Missing ${table} table`);
        }
        // Only task-owned synthetic IDs are touched. No authorization, agreement,
        // fulfillment, date computation, API, queue worker or provider is invoked.
        const participation = randomUUID();
        const version = randomUUID();
        const obligationIds = [randomUUID(), randomUUID(), randomUUID()];
        const taskIds = [randomUUID(), randomUUID(), randomUUID()];
        const q = (sql: string, params: unknown[] = []) =>
          client.query(sql, params);
        const count = async () => {
          const {
            rows: [row],
          } = await q(
            `SELECT
          (SELECT count(*)::int FROM "${schema}"."campaignCreator" WHERE id=$1) AS participation,
          (SELECT count(*)::int FROM "${schema}"."partnershipOfferVersion" WHERE id=$2) AS version,
          (SELECT count(*)::int FROM "${schema}"."partnershipObligation" WHERE id=ANY($3::uuid[])) AS obligations,
          (SELECT count(*)::int FROM "${schema}".task WHERE id=ANY($4::uuid[])) AS tasks`,
            [participation, version, obligationIds, taskIds],
          );
          return row;
        };
        expect(await count()).toEqual({
          participation: 0,
          version: 0,
          obligations: 0,
          tasks: 0,
        });
        await q('BEGIN');
        transaction = true;
        await q(
          `INSERT INTO "${schema}"."campaignCreator" (id, name) VALUES ($1, 'task-1.2-synthetic')`,
          [participation],
        );
        await q(
          `INSERT INTO "${schema}"."partnershipOfferVersion"
        (id, "campaignCreatorId", version, "fixedAmount", currency)
        VALUES ($1,$2,1,'500.00','USD')`,
          [version, participation],
        );
        for (let i = 0; i < 3; i++)
          await q(`INSERT INTO "${schema}".task (id,title) VALUES ($1,$2)`, [
            taskIds[i],
            `task-1.2-${['deposit', 'balance', 'reel'][i]}`,
          ]);
        const lines = [
          {
            purpose: 'payment:deposit',
            type: 'PAYMENT',
            amount: '125.40',
            currency: 'USD',
            prerequisite: { event: 'agreement-confirmed' },
            evidence: 'fixture:deposit-request',
          },
          {
            purpose: 'payment:balance',
            type: 'PAYMENT',
            amount: '374.60',
            currency: 'USD',
            prerequisite: {
              event: 'publication-confirmed',
              line: 'content:reel-1:1',
            },
            evidence: 'fixture:balance-request',
          },
          {
            purpose: 'content:reel-1:1',
            type: 'CONTENT',
            amount: null,
            currency: null,
            prerequisite: { event: 'receipt-confirmed' },
            evidence: 'fixture:reel-brief',
          },
        ];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          await q(
            `INSERT INTO "${schema}"."partnershipObligation"
          (id,"campaignCreatorId","offerVersionId","taskId",purpose,"obligationType",amount,currency,
           prerequisites,"dueCondition","evidenceReference")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
            [
              obligationIds[i],
              participation,
              version,
              taskIds[i],
              line.purpose,
              line.type,
              line.amount,
              line.currency,
              JSON.stringify(line.prerequisite),
              JSON.stringify(
                i === 2
                  ? { event: 'receipt-confirmed', elapsedDays: 14 }
                  : null,
              ),
              line.evidence,
            ],
          );
        }
        const { rows } = await q(
          `SELECT o.purpose,o."obligationType"::text AS type,o.amount,o.currency,
        o.prerequisites,o."dueCondition",o."evidenceReference" AS evidence,
        o."offerVersionId" AS version,o."campaignCreatorId" AS participation,
        t.title AS task,v."fixedAmount" AS fixed,v.currency AS "offerCurrency"
        FROM "${schema}"."partnershipObligation" o
        JOIN "${schema}".task t ON t.id=o."taskId"
        JOIN "${schema}"."partnershipOfferVersion" v ON v.id=o."offerVersionId"
        WHERE o.id=ANY($1::uuid[]) ORDER BY o.purpose`,
          [obligationIds],
        );
        expect(rows).toEqual([
          {
            purpose: 'content:reel-1:1',
            type: 'CONTENT',
            amount: null,
            currency: null,
            prerequisites: { event: 'receipt-confirmed' },
            dueCondition: { event: 'receipt-confirmed', elapsedDays: 14 },
            evidence: 'fixture:reel-brief',
            version,
            participation,
            task: 'task-1.2-reel',
            fixed: '500.00',
            offerCurrency: 'USD',
          },
          {
            purpose: 'payment:balance',
            type: 'PAYMENT',
            amount: '374.60',
            currency: 'USD',
            prerequisites: {
              event: 'publication-confirmed',
              line: 'content:reel-1:1',
            },
            dueCondition: null,
            evidence: 'fixture:balance-request',
            version,
            participation,
            task: 'task-1.2-balance',
            fixed: '500.00',
            offerCurrency: 'USD',
          },
          {
            purpose: 'payment:deposit',
            type: 'PAYMENT',
            amount: '125.40',
            currency: 'USD',
            prerequisites: { event: 'agreement-confirmed' },
            dueCondition: null,
            evidence: 'fixture:deposit-request',
            version,
            participation,
            task: 'task-1.2-deposit',
            fixed: '500.00',
            offerCurrency: 'USD',
          },
        ]);
        await q(
          `UPDATE "${schema}"."partnershipObligation" SET "deletedAt"=now() WHERE id=$1`,
          [obligationIds[0]],
        );
        const rejectsConstraint = async (
          sql: string,
          params: unknown[],
          code: string,
        ) => {
          await q('SAVEPOINT rejected_row');
          try {
            await expect(q(sql, params)).rejects.toMatchObject({ code });
          } finally {
            await q('ROLLBACK TO SAVEPOINT rejected_row');
            await q('RELEASE SAVEPOINT rejected_row');
          }
        };
        await rejectsConstraint(
          `INSERT INTO "${schema}"."partnershipObligation"
          (id,"campaignCreatorId","offerVersionId",purpose) VALUES ($1,$2,$3,'payment:deposit')`,
          [randomUUID(), participation, version],
          '23505',
        );
        await q(
          `UPDATE "${schema}"."partnershipOfferVersion" SET "deletedAt"=now() WHERE id=$1`,
          [version],
        );
        await rejectsConstraint(
          `INSERT INTO "${schema}"."partnershipOfferVersion" (id,"campaignCreatorId",version)
           VALUES ($1,$2,1)`,
          [randomUUID(), participation],
          '23505',
        );
        await rejectsConstraint(
          `INSERT INTO "${schema}"."partnershipObligation"
           (id,"campaignCreatorId","offerVersionId",purpose)
           VALUES ($1,$2,$3,'fixture:invalid-version')`,
          [randomUUID(), participation, randomUUID()],
          '23503',
        );
        await rejectsConstraint(
          `INSERT INTO "${schema}"."partnershipObligation"
           (id,"campaignCreatorId","offerVersionId","taskId",purpose)
           VALUES ($1,$2,$3,$4,'fixture:invalid-task')`,
          [randomUUID(), participation, version, randomUUID()],
          '23503',
        );
        expect(await count()).toEqual({
          participation: 1,
          version: 1,
          obligations: 3,
          tasks: 3,
        });
        await q('ROLLBACK');
        transaction = false;
        expect(await count()).toEqual({
          participation: 0,
          version: 0,
          obligations: 0,
          tasks: 0,
        });
        // oxlint-disable-next-line no-console -- sanitized identity/readback only
        console.info(
          `MYAH392_PARTNERSHIP_PG_ATTEST host=127.0.0.1 port=${url.port} database=${database} marker=${marker} pgVersion=${identity.version} rolledBack=1 remaining=0`,
        );
      } finally {
        try {
          if (transaction) await client.query('ROLLBACK');
        } finally {
          await client.end();
        }
      }
    },
    30000,
  );
});
