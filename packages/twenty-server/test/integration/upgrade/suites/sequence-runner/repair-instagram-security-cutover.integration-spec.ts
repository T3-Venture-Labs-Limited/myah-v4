import 'reflect-metadata';
import type { DiscoveryService } from '@nestjs/core';
import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import type { RepairInstagramSecurityCutoverCommand } from 'src/database/commands/upgrade-version-command/2-20/repair-instagram-security-cutover.command';
import { INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY } from 'src/engine/core-modules/upgrade/constants/instagram-2-20-upgrade-name-compatibility.constant';
import type { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import type { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import type { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import type { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

import {
  DataSource,
  type EntitySubscriberInterface,
  getMetadataArgsStorage,
} from 'typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { UnipileInstagramSyncRunEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity';

const socket = process.env.MYAH314_SECURITY_CHECKS_TEST_SOCKET;

if (
  socket &&
  !/^\/tmp\/myah314-isolated-pg-socket-[a-zA-Z0-9_-]+$/.test(socket)
) {
  throw new Error(
    'Only a dedicated MYAH314 isolated PostgreSQL socket is allowed',
  );
}

const describePostgres = socket ? describe : describe.skip;
const bindingName = 'CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT';
const syncName = 'CHK_UNIPILE_IG_SYNC_RUN_CHAT_IDENTITY';
const draftId = '00000000-0000-4000-8000-000000000001';
const threadId = '00000000-0000-4000-8000-000000000002';
const thread = {
  actionName: 'send_instagram_message',
  actionVersion: 2,
  draftId,
  actionKind: 'REPLY',
  threadId,
  interactionContextType: null,
  interactionContextId: null,
};
const direct = {
  ...thread,
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: draftId,
};
const bindingCases = [
  { name: 'thread reply', values: thread, valid: true },
  { name: 'direct reply', values: direct, valid: true },
  {
    name: 'direct start',
    values: { ...direct, actionKind: 'START_CHAT' },
    valid: true,
  },
  { name: 'null kind', values: { ...thread, actionKind: null }, valid: false },
  {
    name: 'null direct type',
    values: { ...direct, interactionContextType: null },
    valid: false,
  },
  {
    name: 'null direct ID',
    values: { ...direct, interactionContextId: null },
    valid: false,
  },
  {
    name: 'both null direct fields',
    values: {
      ...direct,
      interactionContextType: null,
      interactionContextId: null,
    },
    valid: false,
  },
  {
    name: 'wrong direct ID',
    values: { ...direct, interactionContextId: threadId },
    valid: false,
  },
  {
    name: 'mixed thread/direct context',
    values: { ...direct, threadId },
    valid: false,
  },
  {
    name: 'legacy',
    values: { ...thread, actionName: 'send_email', actionKind: null },
    valid: true,
  },
  {
    name: 'legacy with kind',
    values: { ...thread, actionName: 'send_email' },
    valid: false,
  },
  {
    name: 'wrong version',
    values: { ...thread, actionVersion: 1 },
    valid: false,
  },
];
const syncCases = [
  { name: 'null pair', values: [null, null], valid: true },
  { name: 'valid pair', values: ['chat', 'attendee'], valid: true },
  { name: 'null attendee', values: ['chat', null], valid: false },
  { name: 'empty attendee', values: ['chat', ''], valid: false },
  { name: 'space attendee', values: ['chat', '   '], valid: false },
  { name: 'orphan attendee', values: [null, 'attendee'], valid: false },
  { name: 'empty chat unchanged', values: ['', 'attendee'], valid: true },
  { name: 'tab attendee unchanged', values: ['chat', '\t'], valid: true },
];

// Source-owned old predicates and verbatim catalogs from the parent PG 16.15 probe.
const oldPredicates = {
  binding: `(
    (
      "actionName" = 'send_instagram_message'
      AND "actionVersion" = 2
      AND "actionKind" IN ('START_CHAT', 'REPLY')
      AND (
        (
          "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL
          AND "interactionContextId" IS NULL
        )
        OR
        (
          "threadId" IS NULL
          AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT'
          AND "interactionContextId" = "draftId"
        )
      )
    )
    OR
    (
      "actionName" <> 'send_instagram_message'
      AND "actionKind" IS NULL
      AND "threadId" IS NOT NULL
      AND "interactionContextType" IS NULL
      AND "interactionContextId" IS NULL
    )
  )`,
  sync: `("currentChatId" IS NULL AND "currentChatAttendeeId" IS NULL) OR ("currentChatId" IS NOT NULL AND btrim("currentChatAttendeeId") <> '')`,
};
const observedCatalogs = {
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

const loadForwardDependencies = async () => ({
  ...(await import('typeorm')),
  ...(await import('@nestjs/common/constants')),
  ...(await import('@nestjs/core')),
  ...(await import('src/database/commands/command-runners/workspace-iterator.service')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619359-add-instagram-direct-action-context')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1789307619363-invalidate-composio-instagram-authorities')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/repair-instagram-security-cutover.command')),
  ...(await import('src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util')),
  ...(await import('src/database/commands/upgrade-version-command/instance-commands.constant')),
  ...(await import('src/engine/core-modules/upgrade/services/upgrade-command-registry.service')),
  ...(await import('src/engine/core-modules/upgrade/services/upgrade-migration.service')),
  ...(await import('src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service')),
  ...(await import('src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service')),
  ...(await import('src/engine/core-modules/upgrade/services/instance-command-runner.service')),
  ...(await import('src/engine/core-modules/upgrade/services/workspace-command-runner.service')),
  ...(await import('src/engine/core-modules/upgrade/upgrade-migration.entity')),
  ...(await import('src/engine/core-modules/workspace/workspace.entity')),
  ...(await import('src/engine/workspace-datasource/utils/get-workspace-schema-name.util')),
});

// No application bootstrap, default URL, or connection without the dedicated socket.
describePostgres('Instagram security cutover isolated PostgreSQL', () => {
  let dataSource: DataSource;
  let ownsSchema = false;

  const requireSchemaOwnership = () => {
    if (!ownsSchema) {
      throw new Error('The fixture does not own the core schema');
    }
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: socket,
      port: 5432,
      username: 'postgres',
      password: 'synthetic-unused',
      database: 'postgres',
      entities: [],
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });
    await dataSource.initialize();
    // Refuse a pre-existing core schema rather than touching unknown data.
    await dataSource.query('CREATE SCHEMA core');
    ownsSchema = true;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  const createTables = async () => {
    requireSchemaOwnership();
    await dataSource.query(
      'CREATE TABLE core."actionApprovalBinding" ("actionName" varchar NOT NULL, "actionVersion" integer NOT NULL, "draftId" uuid NOT NULL, "actionKind" varchar, "threadId" uuid, "interactionContextType" varchar, "interactionContextId" uuid)',
    );
    await dataSource.query(
      'CREATE TABLE core."unipileInstagramSyncRun" ("currentChatId" text, "currentChatAttendeeId" text)',
    );
  };

  const dropTables = async () => {
    if (!ownsSchema) {
      return;
    }
    await dataSource.query(
      'DROP TABLE IF EXISTS core."actionApprovalBinding", core."unipileInstagramSyncRun" CASCADE',
    );
  };

  const insertBinding = (values: Record<string, string | number | null>) => {
    const entries = Object.entries(values);

    return dataSource.query(
      `INSERT INTO core."actionApprovalBinding" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map((_, index) => `$${index + 1}`).join(',')})`,
      entries.map(([, value]) => value),
    );
  };

  describe('entity CHECK', () => {
    beforeAll(async () => {
      await createTables();
      for (const [entity, table, name] of [
        [ActionApprovalBindingEntity, 'actionApprovalBinding', bindingName],
        [UnipileInstagramSyncRunEntity, 'unipileInstagramSyncRun', syncName],
      ] as const) {
        const check = getMetadataArgsStorage().checks.find(
          (item) => item.target === entity && item.name === name,
        );

        // An absent entity CHECK deliberately leaves the table unconstrained;
        // behavioral assertions below then fail on admitted invalid rows.
        if (check) {
          await dataSource.query(
            `ALTER TABLE core."${table}" ADD CONSTRAINT "${name}" CHECK (${check.expression})`,
          );
        }
      }
    });

    afterAll(dropTables);

    it('matches the exact observed strict entity catalog definitions', async () => {
      const rows = await dataSource.query(
        `SELECT c.relname AS table_name, k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) AS definition, pg_get_expr(k.conbin,k.conrelid) AS expression FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' ORDER BY c.relname,k.conname`,
      );

      expect(rows).toEqual(observedCatalogs.strict);
    });

    it.each(bindingCases)('binding $name', async ({ values, valid }) => {
      const insertion = insertBinding(values);

      if (valid) {
        await expect(insertion).resolves.toBeDefined();
      } else {
        await expect(insertion).rejects.toMatchObject({
          driverError: { code: '23514', constraint: bindingName },
        });
      }
    });

    it.each(syncCases)('sync $name', async ({ values, valid }) => {
      const insertion = dataSource.query(
        'INSERT INTO core."unipileInstagramSyncRun" VALUES ($1, $2)',
        values,
      );

      if (valid) {
        await expect(insertion).resolves.toBeDefined();
      } else {
        await expect(insertion).rejects.toMatchObject({
          driverError: { code: '23514', constraint: syncName },
        });
      }
    });
  });

  describe('repair helper', () => {
    let repair: typeof import('src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util').repairInstagramSecurityChecks;

    beforeAll(async () => {
      requireSchemaOwnership();
      ({ repairInstagramSecurityChecks: repair } =
        await import('src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util'));
    });

    const installCheck = async (
      table: string,
      name: string,
      predicate: string,
      strict = false,
      validated = true,
    ) => {
      requireSchemaOwnership();
      await dataSource.query(
        `ALTER TABLE core."${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
      await dataSource.query(
        `ALTER TABLE core."${table}" ADD CONSTRAINT "${name}" CHECK (${strict ? `(${predicate}) IS TRUE` : predicate}) ${validated ? '' : 'NOT VALID'}`,
      );
    };
    const catalog = () =>
      dataSource.query(
        `SELECT c.relname AS table_name, k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) AS definition, pg_get_expr(k.conbin,k.conrelid) AS expression FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' AND k.conname IN ('${bindingName}', '${syncName}') ORDER BY c.relname,k.conname`,
      );

    beforeEach(async () => {
      await createTables();
      await installCheck(
        'actionApprovalBinding',
        bindingName,
        oldPredicates.binding,
      );
      await installCheck(
        'unipileInstagramSyncRun',
        syncName,
        oldPredicates.sync,
      );
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      if (!ownsSchema) {
        return;
      }
      await dataSource.query('DROP SCHEMA core CASCADE');
      ownsSchema = false;
      await dataSource.query('CREATE SCHEMA core');
      ownsSchema = true;
    });

    it.each([
      { bindingStrict: false, syncStrict: false, count: 2 },
      { bindingStrict: true, syncStrict: false, count: 1 },
      { bindingStrict: false, syncStrict: true, count: 1 },
      { bindingStrict: true, syncStrict: true, count: 0 },
    ])(
      'repairs old/strict/mixed $bindingStrict/$syncStrict and verifies repeat no-op',
      async ({ bindingStrict, syncStrict, count }) => {
        await installCheck(
          'actionApprovalBinding',
          bindingName,
          oldPredicates.binding,
          bindingStrict,
        );
        await installCheck(
          'unipileInstagramSyncRun',
          syncName,
          oldPredicates.sync,
          syncStrict,
        );
        expect(await catalog()).toEqual([
          observedCatalogs[bindingStrict ? 'strict' : 'old'][0],
          observedCatalogs[syncStrict ? 'strict' : 'old'][1],
        ]);
        await expect(repair(dataSource)).resolves.toMatchObject({
          proposedRepairs: count,
          completedRepairs: count,
        });
        expect(await catalog()).toEqual(observedCatalogs.strict);
        await expect(repair(dataSource)).resolves.toMatchObject({
          proposedRepairs: 0,
          completedRepairs: 0,
        });
        expect(await catalog()).toEqual(observedCatalogs.strict);
      },
    );

    it('strict helper CHECKs reject all invalid shapes and preserve valid controls', async () => {
      await repair(dataSource);
      for (const { values, valid } of bindingCases) {
        if (valid) {
          await expect(insertBinding(values)).resolves.toBeDefined();
        } else {
          await expect(insertBinding(values)).rejects.toMatchObject({
            driverError: { code: '23514', constraint: bindingName },
          });
        }
      }
      for (const { values, valid } of syncCases) {
        const insertion = dataSource.query(
          'INSERT INTO core."unipileInstagramSyncRun" VALUES ($1, $2)',
          values,
        );

        if (valid) {
          await expect(insertion).resolves.toBeDefined();
        } else {
          await expect(insertion).rejects.toMatchObject({
            driverError: { code: '23514', constraint: syncName },
          });
        }
      }
    });

    it.each(['binding', 'sync'] as const)(
      'fails closed for missing %s CHECK',
      async (target) => {
        await dataSource.query(
          `ALTER TABLE core."${target === 'binding' ? 'actionApprovalBinding' : 'unipileInstagramSyncRun'}" DROP CONSTRAINT "${target === 'binding' ? bindingName : syncName}"`,
        );
        const before = await catalog();

        await expect(repair(dataSource)).rejects.toThrow(
          'Unsupported core CHECK',
        );
        expect(await catalog()).toEqual(before);
      },
    );

    it.each(['binding', 'sync'] as const)(
      'fails closed for unvalidated %s CHECK',
      async (target) => {
        await installCheck(
          target === 'binding'
            ? 'actionApprovalBinding'
            : 'unipileInstagramSyncRun',
          target === 'binding' ? bindingName : syncName,
          oldPredicates[target],
          false,
          false,
        );
        const before = await catalog();

        await expect(repair(dataSource)).rejects.toThrow(
          'Unsupported core CHECK',
        );
        expect(await catalog()).toEqual(before);
      },
    );

    it.each(['binding', 'sync'] as const)(
      'fails closed for unknown %s predicate, including after a prior successful repair',
      async (target) => {
        await repair(dataSource);
        await installCheck(
          target === 'binding'
            ? 'actionApprovalBinding'
            : 'unipileInstagramSyncRun',
          target === 'binding' ? bindingName : syncName,
          'true',
        );
        const before = await catalog();

        await expect(repair(dataSource)).rejects.toThrow('Unknown core CHECK');
        expect(await catalog()).toEqual(before);
      },
    );

    it.each([
      ['binding null kind', { ...thread, actionKind: null }],
      ['binding null type', { ...direct, interactionContextType: null }],
      ['binding null ID', { ...direct, interactionContextId: null }],
    ])(
      'rejects old-admitted %s rows without mutation',
      async (_name, values) => {
        await insertBinding(values);
        const rows = await dataSource.query(
          'SELECT * FROM core."actionApprovalBinding"',
        );

        await expect(repair(dataSource)).rejects.toThrow(
          'Invalid rows for core CHECK',
        );
        expect(await catalog()).toEqual(observedCatalogs.old);
        expect(
          await dataSource.query('SELECT * FROM core."actionApprovalBinding"'),
        ).toEqual(rows);
      },
    );

    it('checks sync invalid rows before any binding DDL, also in dry-run', async () => {
      await dataSource.query(
        'INSERT INTO core."unipileInstagramSyncRun" VALUES ($1, $2)',
        ['chat', null],
      );
      for (const dryRun of [true, false]) {
        await expect(repair(dataSource, { dryRun })).rejects.toThrow(
          'Invalid rows for core CHECK',
        );
        expect(await catalog()).toEqual(observedCatalogs.old);
        expect(
          await dataSource.query(
            'SELECT * FROM core."unipileInstagramSyncRun"',
          ),
        ).toEqual([{ currentChatId: 'chat', currentChatAttendeeId: null }]);
      }
    });

    it('dry-run reports proposed work without DDL, DML, or a rollback simulation', async () => {
      await insertBinding(direct);
      const before = await catalog();
      const runner = dataSource.createQueryRunner();
      const query = jest.spyOn(runner, 'query');
      const rollback = jest.spyOn(runner, 'rollbackTransaction');

      jest.spyOn(dataSource, 'createQueryRunner').mockReturnValueOnce(runner);
      await expect(repair(dataSource, { dryRun: true })).resolves.toMatchObject(
        { proposedRepairs: 2, completedRepairs: 0 },
      );
      const queries = query.mock.calls.map(([sql]) => sql);

      expect(queries).toContain('SET TRANSACTION READ ONLY');
      expect(queries).toContain('SET LOCAL search_path = pg_catalog');
      expect(
        queries.some((sql) => /^(ALTER|LOCK|UPDATE|DELETE|INSERT)/.test(sql)),
      ).toBe(false);
      expect(rollback).not.toHaveBeenCalled();
      expect(await catalog()).toEqual(before);
      expect(
        await dataSource.query(
          'SELECT count(*)::text AS count FROM core."actionApprovalBinding"',
        ),
      ).toEqual([{ count: '1' }]);
    });

    it.each([
      [
        'missing required column',
        'ALTER TABLE core."unipileInstagramSyncRun" DROP COLUMN "currentChatAttendeeId" CASCADE',
      ],
      [
        'bounded varchar',
        'ALTER TABLE core."actionApprovalBinding" ALTER COLUMN "actionName" TYPE varchar(80)',
      ],
      [
        'wrong integer type',
        'ALTER TABLE core."actionApprovalBinding" ALTER COLUMN "actionVersion" TYPE bigint',
      ],
      [
        'wrong sync type',
        'ALTER TABLE core."unipileInstagramSyncRun" ALTER COLUMN "currentChatId" TYPE varchar',
      ],
      [
        'required nullability',
        'ALTER TABLE core."actionApprovalBinding" ALTER COLUMN "draftId" DROP NOT NULL',
      ],
      [
        'nullable column hardened',
        'ALTER TABLE core."unipileInstagramSyncRun" ALTER COLUMN "currentChatId" SET NOT NULL',
      ],
      [
        'domain',
        'CREATE DOMAIN core.chat_id AS text; ALTER TABLE core."unipileInstagramSyncRun" ALTER COLUMN "currentChatId" TYPE core.chat_id',
      ],
    ])('rejects unsupported column shape: %s', async (_name, sql) => {
      await dataSource.query(sql);
      const before = await catalog();

      for (const dryRun of [true, false]) {
        await expect(repair(dataSource, { dryRun })).rejects.toThrow(
          'Unsupported core column',
        );
        expect(await catalog()).toEqual(before);
      }
    });

    it.each([
      ['missing table', 'DROP TABLE core."unipileInstagramSyncRun"'],
      [
        'view',
        'DROP TABLE core."unipileInstagramSyncRun"; CREATE VIEW core."unipileInstagramSyncRun" AS SELECT NULL::text AS "currentChatId", NULL::text AS "currentChatAttendeeId"',
      ],
      [
        'partitioned table',
        'DROP TABLE core."unipileInstagramSyncRun"; CREATE TABLE core."unipileInstagramSyncRun" ("currentChatId" text, "currentChatAttendeeId" text) PARTITION BY HASH ("currentChatId")',
      ],
      [
        'inheritance parent',
        'CREATE TABLE core.child () INHERITS (core."unipileInstagramSyncRun")',
      ],
      [
        'inheritance child',
        'ALTER TABLE core."unipileInstagramSyncRun" RENAME TO parent; CREATE TABLE core."unipileInstagramSyncRun" () INHERITS (core.parent)',
      ],
      [
        'partition child',
        'DROP TABLE core."unipileInstagramSyncRun"; CREATE TABLE core.parent ("currentChatId" text, "currentChatAttendeeId" text) PARTITION BY HASH ("currentChatId"); CREATE TABLE core."unipileInstagramSyncRun" PARTITION OF core.parent FOR VALUES WITH (MODULUS 1, REMAINDER 0)',
      ],
    ])('fails closed for relation shape: %s', async (_name, sql) => {
      await dataSource.query(sql);
      const before = await catalog();

      for (const dryRun of [true, false]) {
        // Missing relations/views can fail at LOCK before catalog inspection.
        await expect(repair(dataSource, { dryRun })).rejects.toThrow();
        expect(await catalog()).toEqual(before);
      }
    });

    it('requires the core schema even when same-named tables exist elsewhere', async () => {
      await dataSource.query(
        'ALTER SCHEMA core RENAME TO other_security_checks',
      );
      try {
        await expect(repair(dataSource, { dryRun: true })).rejects.toThrow(
          'Unsupported core relation',
        );
        await expect(repair(dataSource)).rejects.toThrow();
      } finally {
        await dataSource.query(
          'ALTER SCHEMA other_security_checks RENAME TO core',
        );
      }
    });

    it('rolls back the first replacement after an actual PostgreSQL second-DDL failure', async () => {
      await dataSource.query(
        'INSERT INTO core."unipileInstagramSyncRun" VALUES ($1, $2)',
        ['chat', 'attendee'],
      );
      const runner = dataSource.createQueryRunner();
      const query = runner.query.bind(runner);

      jest.spyOn(dataSource, 'createQueryRunner').mockReturnValueOnce(runner);
      jest
        .spyOn(runner, 'query')
        .mockImplementation(async (sql, parameters) => {
          if (
            sql.includes('unipileInstagramSyncRun') &&
            sql.includes('ADD CONSTRAINT')
          ) {
            // Force PG (not a mock rejection) to fail the second replacement.
            return query(
              `ALTER TABLE core."unipileInstagramSyncRun" ADD CONSTRAINT "${syncName}" CHECK (false)`,
            );
          }

          return query(sql, parameters);
        });
      await expect(repair(dataSource)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
      expect(await catalog()).toEqual(observedCatalogs.old);
      expect(
        await dataSource.query('SELECT * FROM core."unipileInstagramSyncRun"'),
      ).toEqual([{ currentChatId: 'chat', currentChatAttendeeId: 'attendee' }]);
    });

    it('rolls back a real AfterTransactionStart rejection before returning the connection', async () => {
      const runner = dataSource.createQueryRunner();
      const connection = await runner.connect();
      const before = await runner.query(
        "SELECT pg_backend_pid() AS pid, current_setting('application_name') AS name",
      );
      const query = jest.spyOn(runner, 'query');
      const rollback = jest.spyOn(runner, 'rollbackTransaction');
      const release = jest.spyOn(runner, 'release');
      const subscriber: EntitySubscriberInterface = {
        async afterTransactionStart(event) {
          if (event.queryRunner === runner) {
            expect(runner.isTransactionActive).toBe(true);
            await runner.query(
              "SET LOCAL application_name = 'myah314-rejected-start'",
            );
            throw new Error('synthetic AfterTransactionStart rejection');
          }
        },
      };

      dataSource.subscribers.push(subscriber);
      jest.spyOn(dataSource, 'createQueryRunner').mockReturnValueOnce(runner);
      const probe = dataSource.createQueryRunner.bind(dataSource);
      let returnedRunner: ReturnType<typeof probe> | undefined;

      try {
        await expect(repair(dataSource)).rejects.toThrow(
          'synthetic AfterTransactionStart rejection',
        );
        returnedRunner = probe();
        expect(await returnedRunner.connect()).toBe(connection);
        expect(runner.isTransactionActive).toBe(false);
        expect(runner.isReleased).toBe(true);
        expect(rollback).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        expect(rollback.mock.invocationCallOrder[0]).toBeLessThan(
          release.mock.invocationCallOrder[0],
        );
        expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
        expect(
          await returnedRunner.query(
            "SELECT pg_backend_pid() AS pid, current_setting('application_name') AS name",
          ),
        ).toEqual(before);
        expect(await catalog()).toEqual(observedCatalogs.old);
      } finally {
        dataSource.subscribers.splice(
          dataSource.subscribers.indexOf(subscriber),
          1,
        );
        if (returnedRunner) {
          // Also contain a regression that returned a still-open transaction.
          await returnedRunner.query('ROLLBACK');
          await returnedRunner.release();
        }
        if (!runner.isReleased) {
          if (runner.isTransactionActive) {
            await runner.rollbackTransaction();
          }
          await runner.release();
        }
      }
    });

    it('bounds waiting for the first lock to one second and rolls back', async () => {
      const blocker = dataSource.createQueryRunner();

      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query(
        'LOCK TABLE core."actionApprovalBinding" IN ACCESS EXCLUSIVE MODE',
      );
      const started = Date.now();

      try {
        await expect(repair(dataSource)).rejects.toMatchObject({
          driverError: { code: '55P03' },
        });
        expect(Date.now() - started).toBeGreaterThanOrEqual(800);
        expect(Date.now() - started).toBeLessThan(5000);
      } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
      }
      expect(await catalog()).toEqual(observedCatalogs.old);
      await expect(repair(dataSource)).resolves.toMatchObject({
        completedRepairs: 2,
      });
    });

    it('serializes concurrent helpers in fixed lock order', async () => {
      const results = await Promise.all([
        repair(dataSource),
        repair(dataSource),
      ]);

      expect(
        results.map(({ completedRepairs }) => completedRepairs).sort(),
      ).toEqual([0, 2]);
      expect(await catalog()).toEqual(observedCatalogs.strict);
    });

    it('preserves unrelated CHECKs, indexes and complete synthetic rows', async () => {
      await dataSource.query(
        'ALTER TABLE core."actionApprovalBinding" ADD CONSTRAINT "unrelated_check" CHECK ("actionVersion" > 0)',
      );
      await dataSource.query(
        'CREATE INDEX "unrelated_index" ON core."actionApprovalBinding" ("draftId")',
      );
      await insertBinding(thread);
      await insertBinding(direct);
      const snapshot = async () => ({
        rows: await dataSource.query(
          'SELECT * FROM core."actionApprovalBinding" ORDER BY "threadId" NULLS FIRST',
        ),
        check: await dataSource.query(
          "SELECT oid, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='core.\"actionApprovalBinding\"'::regclass AND conname='unrelated_check'",
        ),
        index: await dataSource.query(
          'SELECT indexrelid, pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indrelid=\'core."actionApprovalBinding"\'::regclass',
        ),
      });
      const before = await snapshot();

      await repair(dataSource);
      await repair(dataSource);
      expect(await snapshot()).toEqual(before);
    });
  });
  // Minimal test-only dependency schemas, not full application bootstrap. The
  // real commands/iterator/history services below operate on the owned SQL fixture.
  describe('forward verifier and operational sweep', () => {
    let dataSource: DataSource;
    let dependencies: Awaited<ReturnType<typeof loadForwardDependencies>>;
    beforeAll(async () => {
      requireSchemaOwnership();
      dependencies = await loadForwardDependencies();
      dataSource = new DataSource({
        type: 'postgres',
        host: socket,
        port: 5432,
        username: 'postgres',
        password: 'synthetic-unused',
        database: 'postgres',
        // Minimal repository metadata only, with no application relation graph.
        entities: [
          new dependencies.EntitySchema({
            name: 'UpgradeMigrationEntity',
            target: dependencies.UpgradeMigrationEntity,
            tableName: 'upgradeMigration',
            schema: 'core',
            columns: {
              id: { type: 'uuid', primary: true, generated: 'uuid' },
              name: { type: 'varchar' },
              status: { type: 'varchar' },
              attempt: { type: 'integer', default: 1 },
              executedByVersion: { type: 'varchar' },
              errorMessage: { type: 'text', nullable: true },
              isInitial: { type: 'boolean', default: false },
              workspaceId: { type: 'uuid', nullable: true },
              createdAt: { type: 'timestamptz', createDate: true },
            },
          }),
          new dependencies.EntitySchema({
            name: 'WorkspaceEntity',
            target: dependencies.WorkspaceEntity,
            tableName: 'workspace',
            schema: 'core',
            columns: {
              id: { type: 'uuid', primary: true },
              databaseSchema: { type: 'varchar' },
              activationStatus: { type: 'varchar' },
              deletedAt: {
                type: 'timestamptz',
                nullable: true,
                deleteDate: true,
              },
            },
          }),
        ],
        synchronize: false,
        installExtensions: false,
        migrationsRun: false,
        logging: false,
      });
      await dataSource.initialize();
    });
    afterAll(async () => {
      if (dataSource?.isInitialized) await dataSource.destroy();
    });

    const workspaceA = '00000000-0000-4000-8000-000000000101';
    const workspaceB = '00000000-0000-4000-8000-000000000102';
    const ids = [workspaceA, workspaceB];
    const slowD =
      '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';
    const backfillD =
      '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000';
    const verifierE9 =
      '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534';
    const contextD =
      '2.20.0_AddInstagramDirectActionContextFastInstanceCommand_1799201003000';
    const permissionDefinitions = [
      ['SEND_INSTAGRAM_REPLY_TOOL', 'b955e9a9-2d3e-4001-a43d-cf6a9608c122'],
      [
        'SEND_INSTAGRAM_FIRST_MESSAGE_TOOL',
        '05f383be-dcf2-4510-8fb0-386705d90506',
      ],
      [
        'RESOLVE_INSTAGRAM_SEND_OUTCOME',
        '7e3b0a66-3730-43e9-ab10-993e721b8403',
      ],
    ];
    const ownedWorkspaceSchemas = new Set<string>();
    const id = (number: number) =>
      `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
    let migration: UpgradeMigrationService;
    let iterator: WorkspaceIteratorService;
    let verifier: VerifyInstagramSecurityCutoverWorkspaceCommand;
    let cli: RepairInstagramSecurityCutoverCommand;
    let reader: UpgradeSequenceReaderService;
    let workspaceRunner: WorkspaceCommandRunnerService;
    let instanceRunner: InstanceCommandRunnerService;
    let workspaceDataSource: GlobalWorkspaceDataSource;
    const history = () =>
      dataSource.query('SELECT * FROM core."upgradeMigration" ORDER BY id');
    const catalog = () =>
      dataSource.query(
        `SELECT c.relname, k.conname, pg_get_expr(k.conbin,k.conrelid) AS expression FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' AND k.conname IN ('${bindingName}', '${syncName}') ORDER BY c.relname`,
      );
    const seedHistory = async (
      name: string,
      workspaceId: string | null,
      status = 'completed',
      isInitial = false,
      attempt = 1,
      createdAt = '2026-09-12T12:00:00.123Z',
    ) => {
      await dataSource.query(
        'INSERT INTO core."upgradeMigration" (name, "workspaceId", status, "isInitial", attempt, "createdAt", "executedByVersion", "errorMessage") VALUES ($1,$2,$3,$4,$5,$6,\'2.20.0\',$7)',
        [
          name,
          workspaceId,
          status,
          isInitial,
          attempt,
          createdAt,
          status === 'failed'
            ? 'synthetic historic failure retained exactly'
            : null,
        ],
      );
    };
    const snapshot = async () => ({
      history: await history(),
      bindings: await dataSource.query(
        'SELECT * FROM core."actionApprovalBinding" ORDER BY id',
      ),
      evidence: await dataSource.query(
        'SELECT * FROM core."actionApprovalBindingEvidenceLink" ORDER BY id',
      ),
      receipts: await dataSource.query(
        'SELECT * FROM core."actionExecutionReceipt" ORDER BY id',
      ),
      workspaces: await Promise.all(
        ids.map(async (workspaceId) => {
          const schema = dependencies.getWorkspaceSchemaName(workspaceId);
          return {
            conversations: await dataSource.query(
              `SELECT * FROM "${schema}"."_myahSocialConversation" ORDER BY id`,
            ),
            messages: await dataSource.query(
              `SELECT * FROM "${schema}"."_myahSocialMessage" ORDER BY id`,
            ),
            drafts: await dataSource.query(
              `SELECT * FROM "${schema}"."_myahInstagramReplyDraft" ORDER BY id`,
            ),
          };
        }),
      ),
      catalog: await catalog(),
    });
    const args = (workspaceId = workspaceA, dryRun = false) => ({
      workspaceId,
      dataSource: workspaceDataSource,
      options: { dryRun },
      index: 0,
      total: 2,
    });

    beforeEach(async () => {
      requireSchemaOwnership();
      await createTables();
      // A core-owned default-function fixture avoids installing extensions or
      // modifying public objects. The production default spelling is preserved.
      await dataSource.query(
        'CREATE FUNCTION core.uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS $$ SELECT pg_catalog.gen_random_uuid() $$',
      );
      await dataSource.query('SET search_path = core, public');
      await dataSource.query(`CREATE TABLE core.workspace (id uuid PRIMARY KEY, "databaseSchema" varchar NOT NULL, "activationStatus" varchar NOT NULL, "deletedAt" timestamptz);
        CREATE TABLE core.application (id uuid PRIMARY KEY DEFAULT core.uuid_generate_v4(), "workspaceId" uuid NOT NULL, "universalIdentifier" uuid NOT NULL, "deletedAt" timestamptz);
        CREATE TABLE core."permissionFlag" (id uuid PRIMARY KEY DEFAULT core.uuid_generate_v4(), "workspaceId" uuid NOT NULL, key varchar NOT NULL, "universalIdentifier" uuid NOT NULL, "applicationId" uuid NOT NULL, "permissionType" varchar NOT NULL);
        CREATE TABLE core."upgradeMigration" (id uuid PRIMARY KEY DEFAULT core.uuid_generate_v4(), name varchar NOT NULL, status varchar NOT NULL, attempt integer NOT NULL DEFAULT 1, "executedByVersion" varchar NOT NULL, "errorMessage" text, "isInitial" boolean NOT NULL DEFAULT false, "workspaceId" uuid, "createdAt" timestamptz NOT NULL DEFAULT now());
        CREATE UNIQUE INDEX ON core."upgradeMigration" (name, attempt) WHERE "workspaceId" IS NULL;
        CREATE UNIQUE INDEX ON core."upgradeMigration" (name, attempt, "workspaceId") WHERE "workspaceId" IS NOT NULL;
        CREATE TYPE core."actionApprovalBinding_state_enum" AS ENUM ('PENDING','APPROVED','REJECTED','EXPIRED');
        ALTER TABLE core."actionApprovalBinding" ADD COLUMN id uuid PRIMARY KEY DEFAULT core.uuid_generate_v4(), ADD COLUMN "workspaceId" uuid NOT NULL, ADD COLUMN state core."actionApprovalBinding_state_enum" NOT NULL DEFAULT 'PENDING', ADD COLUMN "decidedAt" timestamptz, ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now();
        CREATE TABLE core."actionApprovalBindingEvidenceLink" (id uuid PRIMARY KEY DEFAULT core.uuid_generate_v4(), "actionApprovalBindingId" uuid NOT NULL, "objectMetadataId" uuid NOT NULL, "recordId" uuid NOT NULL, role varchar NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("actionApprovalBindingId", "objectMetadataId", "recordId", role));
        CREATE TABLE core."actionExecutionReceipt" (id uuid PRIMARY KEY, body text, "createdAt" timestamptz NOT NULL);
        INSERT INTO core."actionExecutionReceipt" VALUES ('${id(900)}', 'synthetic preserved receipt', '2026-09-01T00:00:00.789Z');
        CREATE TABLE core."userWorkspace" (id uuid PRIMARY KEY);
        ALTER TABLE core."actionApprovalBinding" ADD CONSTRAINT "${bindingName}" CHECK (${oldPredicates.binding});
        ALTER TABLE core."unipileInstagramSyncRun" ADD CONSTRAINT "${syncName}" CHECK (${oldPredicates.sync});`);
      for (const [index, workspaceId] of ids.entries()) {
        const schema = dependencies.getWorkspaceSchemaName(workspaceId);
        await dataSource.query(`CREATE SCHEMA "${schema}"`);
        ownedWorkspaceSchemas.add(schema);
        await dataSource.query(
          'INSERT INTO core.workspace VALUES ($1,$2,$3,NULL)',
          [workspaceId, schema, index === 0 ? 'ACTIVE' : 'SUSPENDED'],
        );
        await dataSource.query(
          'INSERT INTO core.application (id,"workspaceId","universalIdentifier") VALUES ($1,$2,$3),($4,$2,$5)',
          [
            id(200 + index),
            workspaceId,
            '4738ebcd-6662-4ecc-a190-374fa0525951',
            id(300 + index),
            '20202020-64aa-4b6f-b003-9c74b97cee20',
          ],
        );
        for (const [key, universalIdentifier] of permissionDefinitions)
          await dataSource.query(
            'INSERT INTO core."permissionFlag" ("workspaceId",key,"universalIdentifier","applicationId","permissionType") VALUES ($1,$2,$3,$4,\'tool\')',
            [workspaceId, key, universalIdentifier, id(300 + index)],
          );
        await dataSource.query(`CREATE TABLE "${schema}"."_myahSocialConversation" (id uuid PRIMARY KEY, provider varchar, lifecycle varchar, "providerConversationId" varchar, "recipientIgsid" varchar);
          CREATE TABLE "${schema}"."_myahSocialMessage" (id uuid PRIMARY KEY, provider varchar, "conversationId" uuid, text text, "providerCreatedAt" timestamptz);
          CREATE TABLE "${schema}"."_myahInstagramReplyDraft" (id uuid PRIMARY KEY, "conversationId" uuid, status varchar, "sentAt" timestamptz, "sendBlockedReason" varchar);
          INSERT INTO "${schema}"."_myahSocialConversation" VALUES ('${id(1)}',NULL,'ACTIVE','legacy-chat','recipient'),('${id(2)}','UNIPILE','ACTIVE','chat','recipient');
          INSERT INTO "${schema}"."_myahSocialMessage" VALUES ('${id(11)}',NULL,'${id(1)}','legacy body','2026-01-01T00:00:00.123Z'),('${id(12)}','UNIPILE','${id(1)}','mixed body','2026-01-01T00:00:00.123Z'),('${id(13)}','COMPOSIO','${id(2)}','mixed reverse','2026-01-01T00:00:00.123Z'),('${id(14)}','UNIPILE','${id(2)}','new body','2026-01-01T00:00:00.123Z'),('${id(15)}','COMPOSIO','${id(999)}','orphan body','2026-01-01T00:00:00.123Z');
          INSERT INTO "${schema}"."_myahInstagramReplyDraft" VALUES ('${id(21)}','${id(1)}','APPROVED',NULL,NULL),('${id(22)}','${id(1)}','APPROVED','2026-01-01T00:00:00.123Z',NULL),('${id(23)}','${id(2)}','APPROVED',NULL,NULL),('${id(24)}','${id(1)}','REJECTED',NULL,NULL);`);
        await seedHistory(backfillD, workspaceId, 'completed', true);
      }
      await seedHistory(slowD, null);
      await seedHistory(
        '1.0.0_UnrelatedUnsupported_123',
        null,
        'failed',
        false,
        1,
        '2025-01-01T00:00:00.123Z',
      );
      for (const [number, workspaceId, state, actionName] of [
        [401, workspaceA, 'PENDING', 'send_instagram_reply'],
        [402, workspaceA, 'APPROVED', 'send_instagram_reply'],
        [403, workspaceA, 'EXPIRED', 'send_instagram_reply'],
        [404, workspaceA, 'PENDING', 'send_instagram_message'],
        [405, workspaceB, 'APPROVED', 'send_instagram_reply'],
      ] as const) {
        await dataSource.query(
          'INSERT INTO core."actionApprovalBinding" (id,"workspaceId",state,"actionName","actionVersion","draftId","threadId","actionKind","decidedAt","updatedAt") VALUES ($1,$2,$3,$4,2,$5,$6,$7,$8,$9)',
          [
            id(number),
            workspaceId,
            state,
            actionName,
            id(21),
            threadId,
            actionName === 'send_instagram_message' ? 'REPLY' : null,
            state === 'APPROVED' || state === 'EXPIRED'
              ? '2026-01-01T00:00:00.123Z'
              : null,
            '2026-01-01T00:00:00.456Z',
          ],
        );
      }
      for (const number of [401, 403, 405])
        await dataSource.query(
          'INSERT INTO core."actionApprovalBindingEvidenceLink" ("actionApprovalBindingId","objectMetadataId","recordId",role) VALUES ($1,$2,$3,\'draft\')',
          [id(number), id(600), id(21)],
        );
      migration = new dependencies.UpgradeMigrationService(
        dataSource.getRepository(dependencies.UpgradeMigrationEntity),
      );
      // This adapter supplies SQL only; it does not claim full workspace ORM bootstrap.
      workspaceDataSource = {
        query: dataSource.query.bind(dataSource),
        coreDataSource: dataSource,
      } as unknown as GlobalWorkspaceDataSource;
      iterator = new dependencies.WorkspaceIteratorService(
        dataSource.getRepository(dependencies.WorkspaceEntity),
        {
          executeInWorkspaceContext: async (callback: () => Promise<void>) =>
            callback(),
          getGlobalWorkspaceDataSource: async () => workspaceDataSource,
        } as never,
      );
      const backfill =
        new dependencies.BackfillComposioInstagramHistoryWorkspaceCommand(
          iterator,
        );
      verifier =
        new dependencies.VerifyInstagramSecurityCutoverWorkspaceCommand(
          iterator,
          dataSource,
          new dependencies.InvalidateComposioInstagramAuthoritiesWorkspaceCommand(
            iterator,
          ),
          backfill,
        );
      const providers = [
        ...dependencies.INSTANCE_COMMANDS,
        ...Reflect.getMetadata(
          dependencies.MODULE_METADATA.PROVIDERS,
          dependencies.V2_20_UpgradeVersionCommandModule,
        ),
      ] as Function[];
      const registry = new dependencies.UpgradeCommandRegistryService({
        getProviders: () =>
          providers.map((metatype) => ({
            metatype,
            instance:
              metatype ===
              dependencies.VerifyInstagramSecurityCutoverWorkspaceCommand
                ? verifier
                : metatype ===
                    dependencies.BackfillComposioInstagramHistoryWorkspaceCommand
                  ? backfill
                  : Object.create(metatype.prototype),
          })),
      } as unknown as DiscoveryService);
      registry.onModuleInit();
      reader = new dependencies.UpgradeSequenceReaderService(registry);
      cli = new dependencies.RepairInstagramSecurityCutoverCommand(
        dataSource,
        iterator,
        verifier,
        migration,
        reader,
      );
      const config = { get: () => '2.20.0' } as never;
      const status = {
        invalidateInstanceAndAllWorkspacesStatus: async () => {},
      } as never;
      workspaceRunner = new dependencies.WorkspaceCommandRunnerService(
        config,
        migration,
        status,
      );
      instanceRunner = new dependencies.InstanceCommandRunnerService(
        dataSource,
        config,
        migration,
        { getActiveOrSuspendedWorkspaceIds: async () => ids } as never,
        status,
      );
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      if (!ownsSchema || !dataSource?.isInitialized) return;
      for (const schema of ownedWorkspaceSchemas)
        await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      ownedWorkspaceSchemas.clear();
      await dataSource.query('DROP SCHEMA core CASCADE');
      ownsSchema = false;
      await dataSource.query('CREATE SCHEMA core');
      ownsSchema = true;
    });

    it('verifier preserves mixed providers, other workspace, sent drafts, receipts and historical EXPIRED bindings; copies exact draft evidence only', async () => {
      const before = await snapshot();
      await verifier.runOnWorkspace(args());
      const after = await snapshot();
      expect(after.history).toEqual(before.history);
      expect(after.receipts).toEqual(before.receipts);
      expect(after.workspaces[1]).toEqual(before.workspaces[1]);
      expect(after.workspaces[0].messages).toEqual(
        before.workspaces[0].messages.map((message: { id: string }) =>
          message.id === id(11)
            ? { ...message, provider: 'COMPOSIO_HISTORY' }
            : message,
        ),
      );
      expect(after.workspaces[0].conversations).toEqual(
        before.workspaces[0].conversations.map((conversation: { id: string }) =>
          conversation.id === id(1)
            ? {
                ...conversation,
                provider: 'COMPOSIO_HISTORY',
                lifecycle: 'HISTORICAL',
              }
            : conversation,
        ),
      );
      expect(after.workspaces[0].drafts).toEqual(
        before.workspaces[0].drafts.map((draft: { id: string }) =>
          draft.id === id(21)
            ? {
                ...draft,
                status: 'DISCARDED',
                sendBlockedReason: 'PROVIDER_CUTOVER',
              }
            : draft,
        ),
      );
      expect(
        after.bindings.filter(
          (binding: { id: string }) => ![id(401), id(402)].includes(binding.id),
        ),
      ).toEqual(
        before.bindings.filter(
          (binding: { id: string }) => ![id(401), id(402)].includes(binding.id),
        ),
      );
      expect(
        after.bindings.find((binding: { id: string }) => binding.id === id(402))
          .decidedAt,
      ).toEqual(
        before.bindings.find(
          (binding: { id: string }) => binding.id === id(402),
        ).decidedAt,
      );
      expect(
        after.evidence.filter(
          (evidence: { role: string }) => evidence.role === 'draft',
        ),
      ).toEqual(before.evidence);
      expect(
        after.evidence.filter(
          (evidence: { role: string }) => evidence.role === 'PROVIDER_CUTOVER',
        ),
      ).toEqual([
        expect.objectContaining({
          actionApprovalBindingId: id(401),
          objectMetadataId: id(600),
          recordId: id(21),
        }),
      ]);
      await verifier.runOnWorkspace(args());
      expect(await snapshot()).toEqual(after);
    });

    it('operational repeat sweeps all active/suspended targets with no history or receipt mutation', async () => {
      const before = await history();
      await cli.run([], {});
      const after = await snapshot();
      expect(after.history).toEqual(before);
      expect(
        await dataSource.query(
          "SELECT count(*)::int AS count FROM core.\"actionApprovalBinding\" WHERE \"actionName\" = 'send_instagram_reply' AND state IN ('PENDING','APPROVED')",
        ),
      ).toEqual([{ count: 0 }]);
      await cli.run([], {});
      expect(await snapshot()).toEqual(after);
    });

    it('dry-run preserves whole SQL rows, catalogs and history', async () => {
      const before = await snapshot();
      await cli.run([], { dryRun: true });
      expect(await snapshot()).toEqual(before);
    });

    it.each([
      'missing-app',
      'deleted-app',
      'wrong-app-identity',
      'missing-standard',
      'schema-mismatch',
      'missing-column',
      'missing-permission',
      'misbound-permission',
      'wrong-permission-id',
      'permission-conflict',
      'evidence-default',
      'evidence-uniqueness',
      'state-enum',
      'binding-type',
    ])(
      'all-target %s preflight fails before any core/workspace mutations',
      async (mode) => {
        const schema = dependencies.getWorkspaceSchemaName(workspaceB);
        if (mode === 'missing-app')
          await dataSource.query('DELETE FROM core.application WHERE id=$1', [
            id(201),
          ]);
        if (mode === 'deleted-app')
          await dataSource.query(
            'UPDATE core.application SET "deletedAt"=now() WHERE id=$1',
            [id(201)],
          );
        if (mode === 'wrong-app-identity')
          await dataSource.query(
            'UPDATE core.application SET "universalIdentifier"=$1 WHERE id=$2',
            [id(999), id(201)],
          );
        if (mode === 'missing-standard')
          await dataSource.query('DELETE FROM core.application WHERE id=$1', [
            id(301),
          ]);
        if (mode === 'schema-mismatch')
          await dataSource.query(
            'UPDATE core.workspace SET "databaseSchema"=\'core\' WHERE id=$1',
            [workspaceB],
          );
        if (mode === 'missing-column')
          await dataSource.query(
            `ALTER TABLE "${schema}"."_myahSocialMessage" DROP COLUMN text`,
          );
        if (mode === 'missing-permission')
          await dataSource.query(
            'DELETE FROM core."permissionFlag" WHERE "workspaceId"=$1 AND key=$2',
            [workspaceB, permissionDefinitions[0][0]],
          );
        if (mode === 'misbound-permission')
          await dataSource.query(
            'UPDATE core."permissionFlag" SET "applicationId"=$1 WHERE "workspaceId"=$2',
            [id(201), workspaceB],
          );
        if (mode === 'wrong-permission-id')
          await dataSource.query(
            'UPDATE core."permissionFlag" SET "universalIdentifier"=$1 WHERE "workspaceId"=$2 AND key=$3',
            [id(999), workspaceB, permissionDefinitions[0][0]],
          );
        if (mode === 'permission-conflict')
          await dataSource.query(
            'INSERT INTO core."permissionFlag" ("workspaceId",key,"universalIdentifier","applicationId","permissionType") SELECT "workspaceId",key,"universalIdentifier","applicationId","permissionType" FROM core."permissionFlag" WHERE "workspaceId"=$1 LIMIT 1',
            [workspaceB],
          );
        if (mode === 'evidence-default')
          await dataSource.query(
            'ALTER TABLE core."actionApprovalBindingEvidenceLink" ALTER COLUMN id DROP DEFAULT',
          );
        if (mode === 'evidence-uniqueness') {
          const rows = await dataSource.query(
            "SELECT conname FROM pg_constraint WHERE conrelid='core.\"actionApprovalBindingEvidenceLink\"'::regclass AND contype='u'",
          );
          await dataSource.query(
            `ALTER TABLE core."actionApprovalBindingEvidenceLink" DROP CONSTRAINT "${rows[0].conname}"`,
          );
        }
        if (mode === 'state-enum')
          await dataSource.query(
            "ALTER TYPE core.\"actionApprovalBinding_state_enum\" RENAME VALUE 'EXPIRED' TO 'OTHER'",
          );
        if (mode === 'binding-type')
          await dataSource.query(
            'ALTER TABLE core."actionApprovalBinding" ALTER COLUMN "workspaceId" TYPE text',
          );
        const before = await snapshot();
        await expect(cli.run([], {})).rejects.toThrow('verification failed');
        expect(await snapshot()).toEqual(before);
      },
    );

    it('reports second-workspace partial failure and retry does not duplicate evidence or history', async () => {
      const before = await history();
      const original = verifier.runOnWorkspace.bind(verifier);
      jest
        .spyOn(verifier, 'runOnWorkspace')
        .mockImplementation(async (context) => {
          if (context.workspaceId === workspaceB)
            throw new Error('synthetic interruption');
          await original(context);
        });
      await expect(cli.run([], {})).rejects.toThrow('partial repair possible');
      expect(await history()).toEqual(before);
      expect((await catalog())[0].expression).toContain('IS TRUE');
      jest.restoreAllMocks();
      await cli.run([], {});
      const after = await snapshot();
      await cli.run([], {});
      expect(await snapshot()).toEqual(after);
    });

    it.each(['zero-active', 'removed', 'not-initialized'])(
      'zero target route %s never rediscover-mutates workspaces',
      async (mode) => {
        await dataSource.query(
          `UPDATE core.workspace SET ${mode === 'removed' ? '"deletedAt"=now()' : '"activationStatus"=\'INACTIVE\''}`,
        );
        if (mode === 'not-initialized')
          await dataSource.query('DELETE FROM core."upgradeMigration"');
        const before = await snapshot();
        const iterate = jest.spyOn(iterator, 'iterate');
        if (mode === 'not-initialized')
          await expect(cli.run([], {})).rejects.toThrow();
        else await cli.run([], {});
        expect(iterate).not.toHaveBeenCalled();
        const after = await snapshot();
        expect(after.history).toEqual(before.history);
        expect(after.workspaces).toEqual(before.workspaces);
        expect(after.bindings).toEqual(before.bindings);
        if (mode !== 'not-initialized')
          expect(after.catalog[0].expression).toContain('IS TRUE');
      },
    );

    it.each(['global', 'instance', 'workspace'])(
      'actual history/reader rejects selected unknown %s cursor without writes',
      async (scope) => {
        await seedHistory(
          '2.20.0_UnknownSelected_1',
          scope === 'workspace' ? workspaceB : null,
          'completed',
          scope === 'workspace',
          1,
          '2026-09-13T12:00:00.123Z',
        );
        const before = await snapshot();
        await expect(cli.run([], {})).rejects.toThrow();
        expect(await snapshot()).toEqual(before);
      },
    );

    it.each(
      INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY.flatMap((identity) => [
        {
          name: `${identity.version}_${identity.className}_${identity.timestamp}`,
          scope: 'initial',
        },
        { name: `9.0.0_${identity.className}_42`, scope: 'inactive' },
        { name: `${identity.durableName}_alternate`, scope: 'instance' },
      ]),
    )(
      'all history reserved identity $name ($scope) is rejected without translation',
      async ({ name, scope }) => {
        await seedHistory(
          name,
          scope === 'instance'
            ? null
            : scope === 'inactive'
              ? id(777)
              : workspaceA,
          'failed',
          scope === 'initial',
          1,
          '2025-01-01T00:00:00.123Z',
        );
        const before = await snapshot();
        await expect(cli.run([], {})).rejects.toThrow();
        expect(await snapshot()).toEqual(before);
      },
    );

    it('rejects outstanding old context failure, accepts genuine retries, and proves an old retry reinstates the permissive CHECK', async () => {
      await seedHistory(
        contextD,
        null,
        'failed',
        false,
        1,
        '2025-01-01T00:00:00.123Z',
      );
      const before = await history();
      await expect(cli.run([], {})).rejects.toThrow();
      expect(await history()).toEqual(before);
      await dependencies.repairInstagramSecurityChecks(dataSource);
      await expect(
        instanceRunner.runFastInstanceCommand({
          name: contextD,
          command:
            new dependencies.AddInstagramDirectActionContextFastInstanceCommand(),
        }),
      ).resolves.toEqual({ status: 'success' });
      expect((await catalog())[0].expression).not.toContain('IS TRUE');
      // Finish pending slow progress genuinely before final verification.
      await seedHistory(
        slowD,
        null,
        'failed',
        false,
        2,
        '2026-09-13T12:00:00.123Z',
      );
      await expect(
        instanceRunner.runSlowInstanceCommand({
          name: slowD,
          command:
            new dependencies.InvalidateComposioInstagramAuthoritiesSlowInstanceCommand(),
        }),
      ).resolves.toEqual({ status: 'success' });
      const retried = await history();
      expect(
        retried.filter((row: { id: string }) =>
          before.some((old: { id: string }) => old.id === row.id),
        ),
      ).toEqual(before);
      await cli.run([], {});
      expect(await history()).toEqual(retried);
      expect((await catalog())[0].expression).toContain('IS TRUE');
    });

    it.each([
      {
        label: 'saved slow + initial old backfill',
        global: slowD,
        workspace: backfillD,
        status: 'completed',
        initial: true,
        expected: [verifierE9],
      },
      {
        label: 'completed noninitial old tail',
        global: backfillD,
        workspace: backfillD,
        status: 'completed',
        initial: false,
        expected: [verifierE9],
      },
      {
        label: 'failed old workspace',
        global: backfillD,
        workspace: backfillD,
        status: 'failed',
        initial: false,
        expected: [backfillD, verifierE9],
      },
      {
        label: 'failed new verifier',
        global: verifierE9,
        workspace: verifierE9,
        status: 'failed',
        initial: false,
        expected: [verifierE9],
      },
      {
        label: 'initial already at new tail',
        global: slowD,
        workspace: verifierE9,
        status: 'completed',
        initial: true,
        expected: [],
      },
    ])(
      'actual normal runner $label appends only real attempts; operational sweep changes none',
      async (scenario) => {
        // Fixture history seeding precedes the immutable whole-row baseline.
        await dataSource.query(
          'DELETE FROM core."upgradeMigration" WHERE "workspaceId" IS NOT NULL',
        );
        for (const workspaceId of ids)
          await seedHistory(
            scenario.workspace,
            workspaceId,
            scenario.status,
            scenario.initial,
            1,
            '2026-09-13T12:00:00.123Z',
          );
        const before = await history();
        // For initial rows, actual migration semantics select the saved instance.
        expect(
          (await migration.getLastAttemptedCommandNameOrThrow(ids)).name,
        ).toBe(scenario.global);
        const runner = new dependencies.UpgradeSequenceRunnerService(
          migration,
          instanceRunner,
          workspaceRunner,
          reader,
          { refresh: async () => {} } as never,
          iterator,
          { getActiveOrSuspendedWorkspaceIds: async () => ids } as never,
        );
        await expect(
          runner.run({ sequence: reader.getUpgradeSequence(), options: {} }),
        ).resolves.toEqual({ totalFailures: 0, totalSuccesses: 2 });
        const after = await history();
        expect(
          after.filter((row: { id: string }) =>
            before.some((old: { id: string }) => old.id === row.id),
          ),
        ).toEqual(before);
        const appended = after.filter(
          (row: { id: string }) =>
            !before.some((old: { id: string }) => old.id === row.id),
        );
        for (const workspaceId of ids)
          expect(
            appended
              .filter(
                (row: { workspaceId: string }) =>
                  row.workspaceId === workspaceId,
              )
              .map((row: { name: string }) => row.name)
              .sort(),
          ).toEqual([...scenario.expected].sort());
        expect(
          appended.every(
            (row: { status: string; isInitial: boolean }) =>
              row.status === 'completed' && !row.isInitial,
          ),
        ).toBe(true);
        await cli.run([], {});
        expect(await history()).toEqual(after);
        expect((await catalog())[0].expression).toContain('IS TRUE');
      },
    );
    it('normal verifier failures append real attempts; operational repair preserves them for genuine normal retry', async () => {
      await dataSource.query(
        'UPDATE core.application SET "deletedAt"=now() WHERE id=$1',
        [id(200)],
      );
      const before = await history();
      const command = reader
        .getUpgradeSequence()
        .find((step) => step.name === verifierE9)!;
      const invoke = () =>
        workspaceRunner.runWorkspaceCommands({
          iteratorContext: args(),
          options: {},
          workspaceCommands: [command as never],
        });
      await expect(invoke()).rejects.toThrow('ownership');
      const failed = await history();
      expect(
        failed.filter((row: { id: string }) =>
          before.some((old: { id: string }) => old.id === row.id),
        ),
      ).toEqual(before);
      expect(
        failed.filter(
          (row: { id: string }) =>
            !before.some((old: { id: string }) => old.id === row.id),
        ),
      ).toEqual([
        expect.objectContaining({
          name: verifierE9,
          status: 'failed',
          attempt: 1,
          isInitial: false,
          workspaceId: workspaceA,
        }),
      ]);
      // Separately prepared prerequisite fixture; operational CLI never does this.
      await dataSource.query(
        'UPDATE core.application SET "deletedAt"=NULL WHERE id=$1',
        [id(200)],
      );
      await cli.run([], {});
      expect(await history()).toEqual(failed);
      await invoke();
      const retried = await history();
      expect(
        retried.filter((row: { id: string }) =>
          failed.some((old: { id: string }) => old.id === row.id),
        ),
      ).toEqual(failed);
      expect(
        retried.filter(
          (row: { id: string }) =>
            !failed.some((old: { id: string }) => old.id === row.id),
        ),
      ).toEqual([
        expect.objectContaining({
          name: verifierE9,
          status: 'completed',
          attempt: 2,
          isInitial: false,
          workspaceId: workspaceA,
        }),
      ]);
    });

    it('interruption after invalidation remains retryable without duplicate evidence or history writes', async () => {
      const before = await history();
      const query = workspaceDataSource.query.bind(workspaceDataSource);
      let interrupted = false;
      jest
        .spyOn(workspaceDataSource, 'query')
        .mockImplementation(async (sql, parameters) => {
          if (sql.includes('WITH "legacyMessages"') && !interrupted) {
            interrupted = true;
            throw new Error('synthetic post-invalidation interruption');
          }
          return query(sql, parameters);
        });
      await expect(verifier.runOnWorkspace(args())).rejects.toThrow(
        'interruption',
      );
      expect(await history()).toEqual(before);
      const evidence = await dataSource.query(
        'SELECT * FROM core."actionApprovalBindingEvidenceLink" ORDER BY id',
      );
      await verifier.runOnWorkspace(args());
      expect(
        await dataSource.query(
          'SELECT * FROM core."actionApprovalBindingEvidenceLink" ORDER BY id',
        ),
      ).toEqual(evidence);
      expect(await history()).toEqual(before);
    });

    it('known supported predecessor still requires genuine pending instance preparation', async () => {
      const predecessor = reader
        .getUpgradeSequence()
        .filter(
          (step) => step.version === '2.19.0' && step.kind !== 'workspace',
        );
      await seedHistory(
        predecessor[predecessor.length - 1].name,
        null,
        'completed',
        false,
        1,
        '2026-09-13T12:00:00.123Z',
      );
      const before = await snapshot();
      await expect(cli.run([], {})).rejects.toThrow('Finish prerequisites');
      expect(await snapshot()).toEqual(before);
    });

    it('missing configured physical schema stops before core mutation', async () => {
      const before = await snapshot();
      const schema = dependencies.getWorkspaceSchemaName(workspaceB);
      const temporary = `${schema}_missing`;
      await dataSource.query(
        `ALTER SCHEMA "${schema}" RENAME TO "${temporary}"`,
      );
      ownedWorkspaceSchemas.delete(schema);
      ownedWorkspaceSchemas.add(temporary);
      await expect(cli.run([], {})).rejects.toThrow();
      expect(await history()).toEqual(before.history);
      expect(await catalog()).toEqual(before.catalog);
      await dataSource.query(
        `ALTER SCHEMA "${temporary}" RENAME TO "${schema}"`,
      );
      ownedWorkspaceSchemas.delete(temporary);
      ownedWorkspaceSchemas.add(schema);
      expect(await snapshot()).toEqual(before);
    });
    it('operational repair preserves failed original workspace attempts without claiming their completion', async () => {
      await seedHistory(
        backfillD,
        workspaceA,
        'failed',
        false,
        2,
        '2026-09-13T12:00:00.123Z',
      );
      const before = await history();
      await cli.run([], {});
      expect(await history()).toEqual(before);
      expect(
        await migration.isLastAttemptCompleted({
          name: backfillD,
          workspaceId: workspaceA,
        }),
      ).toBe(false);
      expect((await catalog())[0].expression).toContain('IS TRUE');
    });

    it.each(['missing', 'unvalidated', 'unknown'])(
      'zero targets still rejects %s core catalog state without history mutation',
      async (mode) => {
        await dataSource.query('UPDATE core.workspace SET "deletedAt"=now()');
        await dataSource.query(
          `ALTER TABLE core."unipileInstagramSyncRun" DROP CONSTRAINT "${syncName}"`,
        );
        if (mode !== 'missing')
          await dataSource.query(
            `ALTER TABLE core."unipileInstagramSyncRun" ADD CONSTRAINT "${syncName}" CHECK (${mode === 'unknown' ? '"currentChatId" IS NOT NULL' : oldPredicates.sync}) ${mode === 'unvalidated' ? 'NOT VALID' : ''}`,
          );
        const before = await snapshot();
        await expect(cli.run([], {})).rejects.toThrow('verification failed');
        expect(await snapshot()).toEqual(before);
      },
    );
  });
});
