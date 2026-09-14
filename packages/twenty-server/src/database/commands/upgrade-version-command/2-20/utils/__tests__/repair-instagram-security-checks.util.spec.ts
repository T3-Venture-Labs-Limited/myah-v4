import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { type DataSource, getMetadataArgsStorage } from 'typeorm';

import { repairInstagramSecurityChecks } from 'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { UnipileInstagramSyncRunEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity';

describe('repairInstagramSecurityChecks entity metadata', () => {
  it.each([
    [
      ActionApprovalBindingEntity,
      'CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT',
    ],
    [UnipileInstagramSyncRunEntity, 'CHK_UNIPILE_IG_SYNC_RUN_CHAT_IDENTITY'],
  ] as const)('declares the strict named CHECK for %s', (entity, name) => {
    const checks = getMetadataArgsStorage().checks.filter(
      (check) => check.target === entity && check.name === name,
    );

    expect(checks).toHaveLength(1);
    expect(checks[0].expression).toMatch(/\) IS TRUE$/);
  });
});

// Verbatim parent PG 16.15 probe fixtures; no deparse normalization.
const catalogs = {
  old: [
    {
      table_name: 'actionApprovalBinding',
      conname: 'CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT',
      contype: 'c',
      convalidated: true,
      definition:
        'CHECK ((((("actionName")::text = \'send_instagram_message\'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY[\'START_CHAT\'::character varying, \'REPLY\'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = \'MYAH_INBOX_INSTAGRAM_DRAFT\'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> \'send_instagram_message\'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL))))',
      expression:
        '(((("actionName")::text = \'send_instagram_message\'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY[\'START_CHAT\'::character varying, \'REPLY\'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = \'MYAH_INBOX_INSTAGRAM_DRAFT\'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> \'send_instagram_message\'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)))',
    },
    {
      table_name: 'unipileInstagramSyncRun',
      conname: 'CHK_UNIPILE_IG_SYNC_RUN_CHAT_IDENTITY',
      contype: 'c',
      convalidated: true,
      definition:
        'CHECK (((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> \'\'::text))))',
      expression:
        '((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> \'\'::text)))',
    },
  ],
  strict: [
    {
      table_name: 'actionApprovalBinding',
      conname: 'CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT',
      contype: 'c',
      convalidated: true,
      definition:
        'CHECK (((((("actionName")::text = \'send_instagram_message\'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY[\'START_CHAT\'::character varying, \'REPLY\'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = \'MYAH_INBOX_INSTAGRAM_DRAFT\'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> \'send_instagram_message\'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL))) IS TRUE))',
      expression:
        '((((("actionName")::text = \'send_instagram_message\'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY[\'START_CHAT\'::character varying, \'REPLY\'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = \'MYAH_INBOX_INSTAGRAM_DRAFT\'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> \'send_instagram_message\'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL))) IS TRUE)',
    },
    {
      table_name: 'unipileInstagramSyncRun',
      conname: 'CHK_UNIPILE_IG_SYNC_RUN_CHAT_IDENTITY',
      contype: 'c',
      convalidated: true,
      definition:
        'CHECK ((((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> \'\'::text))) IS TRUE))',
      expression:
        '(((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> \'\'::text))) IS TRUE)',
    },
  ],
};

const columnShapes = [
  [
    ['actionName', 'varchar', true],
    ['actionVersion', 'int4', true],
    ['draftId', 'uuid', true],
    ['actionKind', 'varchar', false],
    ['threadId', 'uuid', false],
    ['interactionContextType', 'varchar', false],
    ['interactionContextId', 'uuid', false],
  ],
  [
    ['currentChatId', 'text', false],
    ['currentChatAttendeeId', 'text', false],
  ],
] as const;

const makeRunner = (initial: ('old' | 'strict')[] = ['old', 'old']) => {
  const states = [...initial];
  const runner = {
    connect: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: false,
    startTransaction: jest.fn(async () => {
      runner.isTransactionActive = true;
    }),
    commitTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
    }),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(
      async (
        sql: string,
        parameters?: unknown[],
      ): Promise<Record<string, unknown>[]> => {
        if (sql.includes('FROM pg_catalog.pg_class')) {
          return [
            {
              oid: parameters?.[0] === 'actionApprovalBinding' ? '1' : '2',
              relkind: 'r',
              relispartition: false,
              inherited: false,
            },
          ];
        }
        const index = parameters?.[0] === '1' ? 0 : 1;

        if (sql.includes('FROM pg_catalog.pg_attribute')) {
          return columnShapes[index].map(([attname, typname, attnotnull]) => ({
            attname,
            typname,
            attnotnull,
            atttypmod: -1,
            type_schema: 'pg_catalog',
            typtype: 'b',
          }));
        }
        if (sql.includes('FROM pg_catalog.pg_constraint')) {
          return [
            {
              ...catalogs[states[index]][index],
              conislocal: true,
              coninhcount: 0,
              connoinherit: false,
            },
          ];
        }
        if (sql.startsWith('SELECT count')) {
          return [{ invalid_count: '0' }];
        }
        if (sql.includes('VALIDATE CONSTRAINT')) {
          states[sql.includes('actionApprovalBinding') ? 0 : 1] = 'strict';
        }

        return [];
      },
    ),
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => runner),
  } as unknown as DataSource;

  return { runner, dataSource };
};

describe('repairInstagramSecurityChecks', () => {
  it.each([
    { states: ['old', 'old'], count: 2 },
    { states: ['old', 'strict'], count: 1 },
    { states: ['strict', 'old'], count: 1 },
    { states: ['strict', 'strict'], count: 0 },
  ] as const)('repairs only old CHECKs: $states', async ({ states, count }) => {
    const { runner, dataSource } = makeRunner([...states]);
    const result = await repairInstagramSecurityChecks(dataSource);
    const sql = runner.query.mock.calls.map(([query]) => query);

    expect(result).toMatchObject({
      dryRun: false,
      proposedRepairs: count,
      completedRepairs: count,
    });
    expect(result.constraints.map(({ after }) => after)).toEqual([
      'strict',
      'strict',
    ]);
    expect(sql.slice(0, 4)).toEqual([
      'SET LOCAL search_path = pg_catalog',
      "SET LOCAL lock_timeout = '1s'",
      'LOCK TABLE "core"."actionApprovalBinding" IN ACCESS EXCLUSIVE MODE',
      'LOCK TABLE "core"."unipileInstagramSyncRun" IN ACCESS EXCLUSIVE MODE',
    ]);
    expect(
      sql.filter((query) => query.includes('DROP CONSTRAINT')),
    ).toHaveLength(count);
    expect(
      sql.filter((query) => query.includes('FROM pg_catalog.pg_constraint')),
    ).toHaveLength(4);
    if (count > 0) {
      expect(
        sql.findIndex((query) => query.startsWith('ALTER')),
      ).toBeGreaterThan(
        sql
          .map((query, index) =>
            query.startsWith('SELECT count') ? index : -1,
          )
          .reduce((last, index) => Math.max(last, index), -1),
      );
    }
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rechecks a repeated no-op rather than caching', async () => {
    const { runner, dataSource } = makeRunner();

    await repairInstagramSecurityChecks(dataSource);
    await expect(
      repairInstagramSecurityChecks(dataSource),
    ).resolves.toMatchObject({ proposedRepairs: 0, completedRepairs: 0 });
    expect(
      runner.query.mock.calls.filter(([sql]) =>
        sql.includes('FROM pg_catalog.pg_constraint'),
      ),
    ).toHaveLength(8);
  });

  it('dry-run uses READ ONLY and no locks or repair simulation', async () => {
    const { runner, dataSource } = makeRunner();

    await expect(
      repairInstagramSecurityChecks(dataSource, { dryRun: true }),
    ).resolves.toMatchObject({
      dryRun: true,
      proposedRepairs: 2,
      completedRepairs: 0,
      constraints: [
        expect.objectContaining({ after: 'old' }),
        expect.objectContaining({ after: 'old' }),
      ],
    });
    const sql = runner.query.mock.calls.map(([query]) => query);

    expect(sql[0]).toBe('SET TRANSACTION READ ONLY');
    expect(sql[1]).toBe('SET LOCAL search_path = pg_catalog');
    expect(
      sql.some((query) => /^(ALTER|LOCK|UPDATE|DELETE|INSERT)/.test(query)),
    ).toBe(false);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['missing relation', 'FROM pg_catalog.pg_class', []],
    [
      'view',
      'FROM pg_catalog.pg_class',
      [{ oid: '1', relkind: 'v', relispartition: false, inherited: false }],
    ],
    [
      'partition',
      'FROM pg_catalog.pg_class',
      [{ oid: '1', relkind: 'r', relispartition: true, inherited: false }],
    ],
    [
      'inheritance',
      'FROM pg_catalog.pg_class',
      [{ oid: '1', relkind: 'r', relispartition: false, inherited: true }],
    ],
    ['missing columns', 'FROM pg_catalog.pg_attribute', []],
    ['missing CHECK', 'FROM pg_catalog.pg_constraint', []],
    [
      'unvalidated CHECK',
      'FROM pg_catalog.pg_constraint',
      [
        {
          ...catalogs.old[0],
          convalidated: false,
          conislocal: true,
          coninhcount: 0,
          connoinherit: false,
        },
      ],
    ],
    [
      'unknown CHECK',
      'FROM pg_catalog.pg_constraint',
      [
        {
          ...catalogs.old[0],
          definition: 'CHECK (true)',
          conislocal: true,
          coninhcount: 0,
          connoinherit: false,
        },
      ],
    ],
  ])('fails closed before DDL for %s', async (_name, match, rows) => {
    const { runner, dataSource } = makeRunner();
    const query = runner.query.getMockImplementation()!;

    runner.query.mockImplementation(async (sql, parameters) =>
      sql.includes(match as string) ? rows : query(sql, parameters),
    );
    await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow();
    expect(
      runner.query.mock.calls.some(([sql]) => sql.startsWith('ALTER')),
    ).toBe(false);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it.each(
    columnShapes.flatMap((columns, tableIndex) =>
      columns.map(([name]) => ({ name, tableIndex })),
    ),
  )(
    'rejects type/nullability drift for $tableIndex.$name',
    async ({ name, tableIndex }) => {
      for (const drift of [
        { typname: 'int8' },
        { atttypmod: 12 },
        { typtype: 'd' },
        { type_schema: 'core' },
        {
          attnotnull: !columnShapes[tableIndex].find(
            ([column]) => column === name,
          )![2],
        },
      ]) {
        const { runner, dataSource } = makeRunner();
        const query = runner.query.getMockImplementation()!;

        runner.query.mockImplementation(async (sql, parameters) => {
          const rows = await query(sql, parameters);

          if (
            sql.includes('FROM pg_catalog.pg_attribute') &&
            parameters?.[0] === String(tableIndex + 1)
          ) {
            return rows.map((row) =>
              'attname' in row && row.attname === name
                ? { ...row, ...drift }
                : row,
            );
          }

          return rows;
        });
        await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow(
          `Unsupported core column`,
        );
        expect(
          runner.query.mock.calls.some(([sql]) => sql.startsWith('ALTER')),
        ).toBe(false);
        expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
        expect(runner.release).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('does not normalize or execute an unknown catalog expression', async () => {
    const { runner, dataSource } = makeRunner();
    const query = runner.query.getMockImplementation()!;
    const unknown = 'SELECT secret_row_body FROM unknown_relation';

    runner.query.mockImplementation(async (sql, parameters) =>
      sql.includes('FROM pg_catalog.pg_constraint')
        ? [
            {
              ...catalogs.old[0],
              expression: unknown,
              conislocal: true,
              coninhcount: 0,
              connoinherit: false,
            },
          ]
        : query(sql, parameters),
    );
    await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow(
      'Unknown core CHECK',
    );
    expect(runner.query.mock.calls.some(([sql]) => sql.includes(unknown))).toBe(
      false,
    );
    expect(
      runner.query.mock.calls.some(([sql]) => sql.startsWith('ALTER')),
    ).toBe(false);
  });

  it.each([false, true])(
    'rejects invalid rows without exposing them (dryRun=%s)',
    async (dryRun) => {
      const { runner, dataSource } = makeRunner();
      const query = runner.query.getMockImplementation()!;

      runner.query.mockImplementation(async (sql, parameters) =>
        sql.startsWith('SELECT count')
          ? [{ invalid_count: '1' }]
          : query(sql, parameters),
      );
      await expect(
        repairInstagramSecurityChecks(dataSource, { dryRun }),
      ).rejects.toThrow('Invalid rows for core CHECK');
      expect(
        runner.query.mock.calls.some(([sql]) => sql.startsWith('ALTER')),
      ).toBe(false);
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(runner.release).toHaveBeenCalledTimes(1);
    },
  );

  it('rolls back both CHECKs when the second replacement fails', async () => {
    const { runner, dataSource } = makeRunner();
    const query = runner.query.getMockImplementation()!;

    runner.query.mockImplementation(async (sql, parameters) => {
      if (
        sql.includes('unipileInstagramSyncRun') &&
        sql.includes('ADD CONSTRAINT')
      ) {
        throw new Error('second DDL failure');
      }

      return query(sql, parameters);
    });
    await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow(
      'second DDL failure',
    );
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back an unsuccessful post-DDL verification', async () => {
    const { runner, dataSource } = makeRunner();
    const query = runner.query.getMockImplementation()!;

    runner.query.mockImplementation(async (sql, parameters) =>
      sql.includes('VALIDATE CONSTRAINT') ? [] : query(sql, parameters),
    );
    await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow(
      'repair not verified',
    );
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'cleans up transaction startup rejection (active=%s) before release',
    async (active) => {
      const { runner, dataSource } = makeRunner();

      runner.startTransaction.mockImplementationOnce(async () => {
        runner.isTransactionActive = active;
        throw new Error('transaction startup rejected');
      });
      runner.release.mockImplementationOnce(async () => {
        expect(runner.isTransactionActive).toBe(false);
      });
      await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow(
        'transaction startup rejected',
      );
      expect(runner.query).not.toHaveBeenCalled();
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(active ? 1 : 0);
      expect(runner.commitTransaction).not.toHaveBeenCalled();
      expect(runner.release).toHaveBeenCalledTimes(1);
      if (active) {
        expect(
          runner.rollbackTransaction.mock.invocationCallOrder[0],
        ).toBeLessThan(runner.release.mock.invocationCallOrder[0]);
      }
    },
  );

  it.each(['connect', 'startTransaction', 'commitTransaction'] as const)(
    'releases on %s failure',
    async (method) => {
      const { runner, dataSource } = makeRunner();

      runner[method].mockRejectedValueOnce(new Error(method));
      await expect(repairInstagramSecurityChecks(dataSource)).rejects.toThrow(
        method,
      );
      expect(runner.release).toHaveBeenCalledTimes(1);
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(
        method === 'commitTransaction' ? 1 : 0,
      );
    },
  );
});

// Run the integration file's real Jest hooks; no database driver or entity graph
// is loaded in the subprocess, even though its dedicated socket flag is set.
describe('repair-instagram-security-cutover fixture ownership', () => {
  it.each(['admission', 'recreation'] as const)(
    'does not mutate after failed schema %s in the actual Jest lifecycle',
    (failure) => {
      const directory = mkdtempSync(
        join(tmpdir(), 'myah314-fixture-lifecycle-'),
      );
      const server = resolve(__dirname, '../../../../../../..');
      const fixture = join(directory, 'fixture.spec.js');
      const report = join(directory, 'result.json');
      const trace = join(directory, 'trace.json');

      try {
        writeFileSync(
          fixture,
          `
const queries = [];
let creates = 0;
let destroyed = 0;
jest.mock('typeorm', () => ({
  DataSource: class {
    isInitialized = false;
    async initialize() { this.isInitialized = true; }
    async destroy() { destroyed++; this.isInitialized = false; }
    async query(sql) {
      queries.push(sql);
      if (sql === 'CREATE SCHEMA core' && ++creates === ${failure === 'admission' ? 1 : 2}) {
        throw new Error('synthetic schema ${failure} rejection');
      }
      if (sql.includes('DROP CONSTRAINT')) throw new Error('synthetic fixture setup rejection');
      return [];
    }
  },
  getMetadataArgsStorage: () => ({ checks: [] }),
}));
jest.mock('src/engine/core-modules/action-approval/entities/action-approval-binding.entity', () => ({ ActionApprovalBindingEntity: class {} }));
jest.mock('src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity', () => ({ UnipileInstagramSyncRunEntity: class {} }));
require(${JSON.stringify(join(server, 'test/integration/upgrade/suites/sequence-runner/repair-instagram-security-cutover.integration-spec.ts'))});
afterAll(() => require('node:fs').writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ queries, destroyed })));
`,
        );
        const config = join(directory, 'jest.config.mjs');

        writeFileSync(
          config,
          `import base from ${JSON.stringify(join(server, 'jest.config.mjs'))};
export default { ...base, rootDir: ${JSON.stringify(server)}, roots: [${JSON.stringify(directory)}], testRegex: 'fixture\\\\.spec\\\\.js$', setupFilesAfterEnv: [], fakeTimers: { enableGlobally: false }, cache: false };`,
        );
        const result = spawnSync(
          process.execPath,
          [
            require.resolve('jest/bin/jest'),
            '--config',
            config,
            '--runInBand',
            '--runTestsByPath',
            fixture,
            '--testNamePattern',
            'binding thread reply|fails closed for missing .* CHECK',
            '--watch=false',
            '--coverage=false',
            '--json',
            `--outputFile=${report}`,
          ],
          {
            cwd: server,
            env: {
              ...process.env,
              MYAH314_SECURITY_CHECKS_TEST_SOCKET:
                '/tmp/myah314-isolated-pg-socket-mocked-no-io',
            },
            encoding: 'utf8',
            timeout: 20000,
          },
        );
        expect(result.error).toBeUndefined();
        expect({ status: result.status, stderr: result.stderr }).toMatchObject({
          status: 1,
        });
        const results = JSON.parse(readFileSync(report, 'utf8'));
        const calls = JSON.parse(readFileSync(trace, 'utf8'));
        expect(results.numRuntimeErrorTestSuites).toBe(0);
        expect(results.testResults[0].message).toContain(
          `synthetic schema ${failure} rejection`,
        );
        expect(calls.destroyed).toBe(1);
        if (failure === 'admission') {
          expect(calls.queries).toEqual(['CREATE SCHEMA core']);
          expect(results.numFailedTests).toBe(3);
        } else {
          const failedCreate = calls.queries.lastIndexOf('CREATE SCHEMA core');

          expect(
            calls.queries.filter((sql: string) => sql === 'CREATE SCHEMA core'),
          ).toHaveLength(2);
          expect(calls.queries[failedCreate - 1]).toBe(
            'DROP SCHEMA core CASCADE',
          );
          expect(calls.queries.slice(failedCreate + 1)).toEqual([]);
          expect(results.numPassedTests).toBe(1);
          expect(results.numFailedTests).toBe(2);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    30000,
  );
});
