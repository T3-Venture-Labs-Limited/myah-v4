import { type DataSource, type QueryRunner } from 'typeorm';

// Fixed source-owned predicates; catalog text below is compared, never executed.
const bindingPredicate = `(
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
  )`;
const syncPredicate = `("currentChatId" IS NULL AND "currentChatAttendeeId" IS NULL) OR ("currentChatId" IS NOT NULL AND btrim("currentChatAttendeeId") <> '')`;

// Exact PG 16.15 pg_get_constraintdef/pg_get_expr observations from the
// Task21 isolated catalog probe (old definitions also match the saved UAT catalog).
const checks = [
  {
    table: 'actionApprovalBinding',
    name: 'CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT',
    predicate: bindingPredicate,
    columns: [
      ['actionName', 'varchar', true],
      ['actionVersion', 'int4', true],
      ['draftId', 'uuid', true],
      ['actionKind', 'varchar', false],
      ['threadId', 'uuid', false],
      ['interactionContextType', 'varchar', false],
      ['interactionContextId', 'uuid', false],
    ],
    old: {
      definition: `CHECK ((((("actionName")::text = 'send_instagram_message'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY['START_CHAT'::character varying, 'REPLY'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = 'MYAH_INBOX_INSTAGRAM_DRAFT'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> 'send_instagram_message'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL))))`,
      expression: `(((("actionName")::text = 'send_instagram_message'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY['START_CHAT'::character varying, 'REPLY'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = 'MYAH_INBOX_INSTAGRAM_DRAFT'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> 'send_instagram_message'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)))`,
    },
    strict: {
      definition: `CHECK (((((("actionName")::text = 'send_instagram_message'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY['START_CHAT'::character varying, 'REPLY'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = 'MYAH_INBOX_INSTAGRAM_DRAFT'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> 'send_instagram_message'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL))) IS TRUE))`,
      expression: `((((("actionName")::text = 'send_instagram_message'::text) AND ("actionVersion" = 2) AND (("actionKind")::text = ANY ((ARRAY['START_CHAT'::character varying, 'REPLY'::character varying])::text[])) AND ((("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL)) OR (("threadId" IS NULL) AND (("interactionContextType")::text = 'MYAH_INBOX_INSTAGRAM_DRAFT'::text) AND ("interactionContextId" = "draftId")))) OR ((("actionName")::text <> 'send_instagram_message'::text) AND ("actionKind" IS NULL) AND ("threadId" IS NOT NULL) AND ("interactionContextType" IS NULL) AND ("interactionContextId" IS NULL))) IS TRUE)`,
    },
  },
  {
    table: 'unipileInstagramSyncRun',
    name: 'CHK_UNIPILE_IG_SYNC_RUN_CHAT_IDENTITY',
    predicate: syncPredicate,
    columns: [
      ['currentChatId', 'text', false],
      ['currentChatAttendeeId', 'text', false],
    ],
    old: {
      definition: `CHECK (((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> ''::text))))`,
      expression: `((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> ''::text)))`,
    },
    strict: {
      definition: `CHECK ((((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> ''::text))) IS TRUE))`,
      expression: `(((("currentChatId" IS NULL) AND ("currentChatAttendeeId" IS NULL)) OR (("currentChatId" IS NOT NULL) AND (btrim("currentChatAttendeeId") <> ''::text))) IS TRUE)`,
    },
  },
] as const;

type CheckState = 'old' | 'strict';
type SecurityCheck = (typeof checks)[number];

export type InstagramSecurityChecksRepairResult = {
  dryRun: boolean;
  proposedRepairs: number;
  completedRepairs: number;
  constraints: {
    table: string;
    constraint: string;
    before: CheckState;
    after: CheckState;
  }[];
};

const inspectCheck = async (
  runner: QueryRunner,
  check: SecurityCheck,
): Promise<CheckState> => {
  const relations = await runner.query(
    `SELECT c.oid::pg_catalog.text AS oid, c.relkind, c.relispartition,
       EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i
         WHERE i.inhrelid = c.oid OR i.inhparent = c.oid) AS inherited
     FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'core' AND c.relname = $1`,
    [check.table],
  );

  if (
    relations.length !== 1 ||
    relations[0].relkind !== 'r' ||
    relations[0].relispartition !== false ||
    relations[0].inherited !== false
  ) {
    throw new Error(`Unsupported core relation: ${check.table}`);
  }

  const oid = relations[0].oid;
  const columns = await runner.query(
    `SELECT a.attname, a.attnotnull, a.atttypmod, t.typname, t.typtype,
       n.nspname AS type_schema
     FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
     JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE a.attrelid = $1::pg_catalog.oid AND a.attnum > 0 AND NOT a.attisdropped`,
    [oid],
  );

  for (const [name, type, notNull] of check.columns) {
    const column = columns.find(
      (candidate: { attname: string }) => candidate.attname === name,
    );

    if (
      !column ||
      column.type_schema !== 'pg_catalog' ||
      column.typtype !== 'b' ||
      column.typname !== type ||
      column.atttypmod !== -1 ||
      column.attnotnull !== notNull
    ) {
      throw new Error(`Unsupported core column: ${check.table}.${name}`);
    }
  }

  const constraints = await runner.query(
    `SELECT contype, convalidated, conislocal, coninhcount, connoinherit,
       pg_get_constraintdef(oid) AS definition,
       pg_get_expr(conbin, conrelid) AS expression
     FROM pg_catalog.pg_constraint WHERE conrelid = $1::pg_catalog.oid AND conname = $2`,
    [oid, check.name],
  );
  const constraint = constraints[0];

  if (
    constraints.length !== 1 ||
    constraint.contype !== 'c' ||
    constraint.convalidated !== true ||
    constraint.conislocal !== true ||
    constraint.coninhcount !== 0 ||
    constraint.connoinherit !== false
  ) {
    throw new Error(`Unsupported core CHECK: ${check.name}`);
  }

  for (const state of ['old', 'strict'] as const) {
    if (
      constraint.definition === check[state].definition &&
      constraint.expression === check[state].expression
    ) {
      return state;
    }
  }

  throw new Error(`Unknown core CHECK: ${check.name}`);
};

// Own the transaction: both catalogs and populations must pass before either DDL.
// Dry-run is read-only inspection, not a repair-and-rollback simulation.
export const repairInstagramSecurityChecks = async (
  dataSource: DataSource,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<InstagramSecurityChecksRepairResult> => {
  const runner = dataSource.createQueryRunner();

  try {
    await runner.connect();
    await runner.startTransaction();
    if (dryRun) {
      await runner.query('SET TRANSACTION READ ONLY');
    }
    await runner.query('SET LOCAL search_path = pg_catalog');
    await runner.query("SET LOCAL lock_timeout = '1s'");
    if (!dryRun) {
      for (const check of checks) {
        await runner.query(
          `LOCK TABLE "core"."${check.table}" IN ACCESS EXCLUSIVE MODE`,
        );
      }
    }

    const states: CheckState[] = [];

    for (const check of checks) {
      states.push(await inspectCheck(runner, check));
    }
    for (const check of checks) {
      const rows = await runner.query(
        `SELECT count(*)::pg_catalog.text AS invalid_count FROM "core"."${check.table}" WHERE (${check.predicate}) IS NOT TRUE`,
      );

      if (rows.length !== 1 || rows[0].invalid_count !== '0') {
        throw new Error(`Invalid rows for core CHECK: ${check.name}`);
      }
    }

    const proposedRepairs = states.filter((state) => state === 'old').length;

    if (!dryRun) {
      for (const [index, check] of checks.entries()) {
        if (states[index] === 'old') {
          await runner.query(
            `ALTER TABLE "core"."${check.table}" DROP CONSTRAINT "${check.name}"`,
          );
          await runner.query(
            `ALTER TABLE "core"."${check.table}" ADD CONSTRAINT "${check.name}" CHECK ((${check.predicate}) IS TRUE) NOT VALID`,
          );
          await runner.query(
            `ALTER TABLE "core"."${check.table}" VALIDATE CONSTRAINT "${check.name}"`,
          );
        }
      }
      for (const check of checks) {
        if ((await inspectCheck(runner, check)) !== 'strict') {
          throw new Error(`Core CHECK repair not verified: ${check.name}`);
        }
      }
    }

    await runner.commitTransaction();

    return {
      dryRun,
      proposedRepairs,
      completedRepairs: dryRun ? 0 : proposedRepairs,
      constraints: checks.map((check, index) => ({
        table: check.table,
        constraint: check.name,
        before: states[index],
        after: dryRun ? states[index] : 'strict',
      })),
    };
  } catch (error) {
    // AfterTransactionStart can reject after TypeORM has activated BEGIN.
    if (runner.isTransactionActive) {
      await runner.rollbackTransaction();
    }
    throw error;
  } finally {
    await runner.release();
  }
};
