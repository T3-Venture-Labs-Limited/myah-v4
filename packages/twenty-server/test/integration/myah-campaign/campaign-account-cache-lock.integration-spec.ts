import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { type Type } from '@nestjs/common';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';

type WorkspaceRow = { id: string };
type UserWorkspaceRow = { id: string };
type CampaignAccountRow = {
  connectedAccountId: string;
  isDefault: boolean;
  updatedAt?: Date;
};
type PhysicalIndexRow = {
  indexName: string;
  isUnique: boolean;
  isValid: boolean;
  isReady: boolean;
  columns: string;
  predicate: string;
};
type TransactionAuditRow = {
  operation: string;
  backendPid: string;
  transactionId: string;
  advisoryLockHeld: boolean;
  workspaceLockKey: string;
  campaignLockKey: string;
};
type WorkspaceIteratorReport = {
  fail: Array<{ workspaceId: string; error: Error }>;
  success: Array<{ workspaceId: string }>;
};
type WorkspaceIteratorContext = {
  dataSource: unknown;
  index: number;
  total: number;
};
type WorkspaceIterator = {
  iterate: (args: {
    workspaceIds: string[];
    callback: (context: WorkspaceIteratorContext) => Promise<void>;
  }) => Promise<WorkspaceIteratorReport>;
};
type CampaignAccountSynchronizationCommand = {
  runOnWorkspace: (args: {
    workspaceId: string;
    dataSource: unknown;
    index: number;
    total: number;
    options: { dryRun: boolean };
  }) => Promise<void>;
};
type SourceControlledMyahMetadataSynchronizer = {
  synchronizeWorkspace: (
    args: {
      workspaceId: string;
      dataSource: unknown;
      index: number;
      total: number;
      options: { dryRun: boolean };
    },
    selection: object,
    options: object,
  ) => Promise<void>;
};

const execFileAsync = promisify(execFile);
const CAMPAIGN_ACCOUNT_METADATA_COMMAND =
  'upgrade:2-20:synchronize-myah-campaign-account-metadata';
const TRANSACTION_FIXTURE_CAMPAIGN_NAME_PATTERN =
  '^MYAH-270 (Transaction|Transition|Same Account|Rollback|Mixed Case|Insert Rollback|Rollback Successor|Query Runner Ownership|Migration Conflict|Remove Timestamp|Row Permission Excluded|Row Permission Allowed) [0-9a-f-]{36}$';
const TRANSACTION_FIXTURE_CONNECTED_ACCOUNT_HANDLE_PATTERN =
  '^myah-270-lock-[0-9a-f-]{36}-[0-3]@example\\.test$';
const TRANSACTION_FIXTURE_TRIGGER_NAMES = [
  'myah_270_set_default_barrier_trigger',
  'myah_270_default_target_failure_trigger',
  'myah_270_mixed_case_lock_barrier_trigger',
  'myah_270_link_after_insert_failure_trigger',
  'myah_270_transaction_audit_trigger',
  'myah_270_waiting_successor_rollback_trigger',
] as const;
const TRANSACTION_FIXTURE_AUDIT_TABLE_NAME = 'myah_270_transaction_audit';
const TRANSACTION_FIXTURE_FUNCTION_NAMES = [
  'myah_270_set_default_barrier',
  'myah_270_default_target_failure',
  'myah_270_mixed_case_lock_barrier',
  'myah_270_link_after_insert_failure',
  'myah_270_transaction_audit_function',
  'myah_270_waiting_successor_rollback',
] as const;

const synchronizeCampaignAccountMetadata = async (workspaceId: string) => {
  await execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      CAMPAIGN_ACCOUNT_METADATA_COMMAND,
      '--workspace-id',
      workspaceId,
    ],
    { cwd: process.cwd(), env: process.env },
  );
};

const resolveProvider = <T>(type: Type<T>): T => {
  const app = global.app as typeof global.app & {
    container: {
      getModules(): Map<
        string,
        {
          providers: Map<
            unknown,
            { instance: unknown; metatype?: { name: string } }
          >;
        }
      >;
    };
  };
  const provider = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.entries()])
    .find(
      ([token, wrapper]) =>
        token === type || wrapper.metatype?.name === type.name,
    )?.[1];
  if (!provider?.instance) {
    throw new Error(`Missing provider ${type.name}`);
  }
  return provider.instance as T;
};

const waitForDatabaseCondition = async (
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await condition()) return;
    // Poll database state; no timing-based contention coordination is used.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

const resolveProviderByName = <T>(name: string): T => {
  const app = global.app as typeof global.app & {
    container: {
      getModules(): Map<
        string,
        {
          providers: Map<
            unknown,
            { instance: unknown; metatype?: { name: string } }
          >;
        }
      >;
    };
  };
  const provider = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.values()])
    .find((wrapper) => wrapper.metatype?.name === name);
  if (!provider?.instance) throw new Error(`Missing provider ${name}`);
  return provider.instance as T;
};

describe('CampaignAccountService transaction serialization (PostgreSQL)', () => {
  const campaignId = randomUUID();
  const transitionCampaignId = randomUUID();
  const sameAccountCampaignId = randomUUID();
  const rollbackCampaignId = randomUUID();
  const mixedCaseCampaignId = randomUUID();
  const insertRollbackCampaignId = randomUUID();
  const rollbackSuccessorCampaignId = randomUUID();
  const connectionOwnershipCampaignId = randomUUID();
  const migrationConflictCampaignId = randomUUID();
  const removeUpdatedAtCampaignId = randomUUID();
  const rowPermissionExcludedCampaignId = randomUUID();
  const rowPermissionAllowedCampaignId = randomUUID();
  const connectedAccountIds = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ] as const;
  const messageChannelIds = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ] as const;
  const senderEmails = connectedAccountIds.map(
    (id, index) => `myah-270-lock-${id}-${index}@example.test`,
  ) as [string, string, string, string];
  let workspaceId: string;
  let workspaceSchemaName: string;
  let userWorkspaceId: string;
  let campaignAccountService: CampaignAccountService;
  let workspaceIteratorService: WorkspaceIterator;
  let synchronizeCampaignAccountMetadataCommand: CampaignAccountSynchronizationCommand;
  let sourceControlledMyahMetadataService: SourceControlledMyahMetadataSynchronizer;

  const waitForCampaignAdvisoryLock = async (
    campaign: string,
    granted: boolean,
  ) =>
    waitForDatabaseCondition(
      `${granted ? 'granted' : 'waiting'} Campaign advisory lock`,
      async () => {
        const [lock] = await global.testDataSource.query<
          Array<{ exists: boolean }>
        >(
          `SELECT EXISTS (
             SELECT 1 FROM pg_locks
              WHERE locktype = 'advisory'
                AND mode = 'ExclusiveLock'
                AND granted = $3
                AND pid <> pg_backend_pid()
                AND classid = hashtext(($1::uuid)::text)::oid
                AND objid = hashtext(($2::uuid)::text)::oid
           ) AS "exists"`,
          [workspaceId, campaign, granted],
        );
        return lock.exists;
      },
    );

  const acquireTestBarrier = async (label: string) => {
    const queryRunner = global.testDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(
      'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
      ['myah-270-campaign-account-test-barrier', label],
    );
    return {
      release: async () => {
        try {
          await queryRunner.query(
            'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
            ['myah-270-campaign-account-test-barrier', label],
          );
        } finally {
          await queryRunner.release();
        }
      },
    };
  };

  const waitForTestBarrierWaiter = async (label: string) =>
    waitForDatabaseCondition(
      'predecessor arrival at controlled test barrier',
      async () => {
        const [lock] = await global.testDataSource.query<
          Array<{ exists: boolean }>
        >(
          `SELECT EXISTS (
           SELECT 1 FROM pg_locks
            WHERE locktype = 'advisory'
              AND mode = 'ExclusiveLock'
              AND NOT granted
              AND classid = hashtext($1)::oid
              AND objid = hashtext($2)::oid
         ) AS "exists"`,
          ['myah-270-campaign-account-test-barrier', label],
        );
        return lock.exists;
      },
    );

  const createTransactionBarrierTrigger = async ({
    functionName,
    triggerName,
    targetId,
    barrierLabel,
    failure,
  }: {
    functionName: string;
    triggerName: string;
    targetId: string;
    barrierLabel: string;
    failure?: string;
  }) => {
    await global.testDataSource.query(
      `CREATE OR REPLACE FUNCTION "${workspaceSchemaName}"."${functionName}"()
       RETURNS trigger AS $$
       BEGIN
         IF NEW.id = '${targetId}'::uuid AND NEW."isDefault" = true THEN
           PERFORM pg_advisory_xact_lock(
             hashtext('myah-270-campaign-account-test-barrier'),
             hashtext('${barrierLabel}')
           );
           ${failure ? `RAISE EXCEPTION '${failure}';` : ''}
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
    );
    await global.testDataSource.query(
      `CREATE TRIGGER "${triggerName}"
       BEFORE UPDATE ON "${workspaceSchemaName}"."campaignAccount"
       FOR EACH ROW EXECUTE FUNCTION "${workspaceSchemaName}"."${functionName}"()`,
    );
  };

  const dropTransactionBarrierTrigger = async (
    functionName: string,
    triggerName: string,
  ) => {
    await global.testDataSource.query(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "${workspaceSchemaName}"."campaignAccount"`,
    );
    await global.testDataSource.query(
      `DROP FUNCTION IF EXISTS "${workspaceSchemaName}"."${functionName}"()`,
    );
  };

  const assertNoInterruptedFixtureResidue = async () => {
    const [
      campaignResidue,
      connectedAccountResidue,
      triggerResidue,
      functionResidue,
      auditTableResidue,
    ] = await Promise.all([
        global.testDataSource.query<Array<{ id: string }>>(
          `SELECT "id" FROM "${workspaceSchemaName}"."campaign"
             WHERE "name" ~ $1`,
          [TRANSACTION_FIXTURE_CAMPAIGN_NAME_PATTERN],
        ),
        global.testDataSource.query<Array<{ id: string }>>(
          `SELECT "id" FROM core."connectedAccount" WHERE "handle" ~ $1`,
          [TRANSACTION_FIXTURE_CONNECTED_ACCOUNT_HANDLE_PATTERN],
        ),
        global.testDataSource.query<Array<{ name: string }>>(
          `SELECT trigger_name AS "name"
             FROM information_schema.triggers
            WHERE event_object_schema = $1
              AND event_object_table = 'campaignAccount'
              AND trigger_name = ANY($2::text[])`,
          [workspaceSchemaName, TRANSACTION_FIXTURE_TRIGGER_NAMES],
        ),
        global.testDataSource.query<Array<{ name: string }>>(
          `SELECT proname AS "name"
             FROM pg_proc AS procedure
             INNER JOIN pg_namespace AS namespace
               ON namespace.oid = procedure.pronamespace
            WHERE namespace.nspname = $1
              AND proname = ANY($2::text[])`,
          [workspaceSchemaName, TRANSACTION_FIXTURE_FUNCTION_NAMES],
        ),
        global.testDataSource.query<Array<{ name: string }>>(
          `SELECT relname AS "name"
             FROM pg_class AS relation
             INNER JOIN pg_namespace AS namespace
               ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = $1 AND relname = $2`,
          [workspaceSchemaName, TRANSACTION_FIXTURE_AUDIT_TABLE_NAME],
        ),
      ]);
    const residue = [
      ...campaignResidue.map(({ id }) => `campaign:${id}`),
      ...connectedAccountResidue.map(({ id }) => `connectedAccount:${id}`),
      ...triggerResidue.map(({ name }) => `trigger:${name}`),
      ...functionResidue.map(({ name }) => `function:${name}`),
      ...auditTableResidue.map(({ name }) => `table:${name}`),
    ];
    if (residue.length) {
      throw new Error(
        `Interrupted CampaignAccount integration fixture residue detected; clean only these IDs/artifacts before retry: ${residue.join(', ')}`,
      );
    }
  };

  beforeAll(async () => {
    const workspaces = await global.testDataSource.query<WorkspaceRow[]>(
      `SELECT "id" FROM core."workspace" ORDER BY "createdAt"`,
    );
    for (const workspace of workspaces) {
      const candidateSchemaName = getWorkspaceSchemaName(workspace.id);
      const [{ campaignTable, campaignAccountTable }] =
        await global.testDataSource.query<
          Array<{
            campaignTable: string | null;
            campaignAccountTable: string | null;
          }>
        >(
          `SELECT to_regclass(format('%I.%I', $1::text, 'campaign'))::text AS "campaignTable",
                  to_regclass(format('%I.%I', $1::text, 'campaignAccount'))::text AS "campaignAccountTable"`,
          [candidateSchemaName],
        );
      if (campaignTable !== null && campaignAccountTable !== null) {
        workspaceId = workspace.id;
        workspaceSchemaName = candidateSchemaName;
        break;
      }
    }
    if (!workspaceId || !workspaceSchemaName) {
      throw new Error(
        'A workspace with Campaign and CampaignAccount is required',
      );
    }

    const [userWorkspace] = await global.testDataSource.query<
      UserWorkspaceRow[]
    >(
      `SELECT "id"
         FROM core."userWorkspace"
        WHERE "workspaceId" = $1
        LIMIT 1`,
      [workspaceId],
    );
    if (!userWorkspace) {
      throw new Error('A workspace member is required');
    }
    userWorkspaceId = userWorkspace.id;
    await assertNoInterruptedFixtureResidue();
    campaignAccountService = resolveProvider(CampaignAccountService);
    workspaceIteratorService = resolveProviderByName<WorkspaceIterator>(
      'WorkspaceIteratorService',
    );
    synchronizeCampaignAccountMetadataCommand =
      resolveProviderByName<CampaignAccountSynchronizationCommand>(
        'SynchronizeMyahCampaignAccountMetadataCommand',
      );
    sourceControlledMyahMetadataService =
      resolveProviderByName<SourceControlledMyahMetadataSynchronizer>(
        'SynchronizeSourceControlledMyahMetadataService',
      );
    await synchronizeCampaignAccountMetadata(workspaceId);
    await synchronizeCampaignAccountMetadata(workspaceId);

    await global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."campaign" ("id", "name")
       VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10), ($11, $12), ($13, $14), ($15, $16), ($17, $18), ($19, $20), ($21, $22), ($23, $24)`,
      [
        campaignId,
        `MYAH-270 Transaction ${campaignId}`,
        transitionCampaignId,
        `MYAH-270 Transition ${transitionCampaignId}`,
        sameAccountCampaignId,
        `MYAH-270 Same Account ${sameAccountCampaignId}`,
        rollbackCampaignId,
        `MYAH-270 Rollback ${rollbackCampaignId}`,
        mixedCaseCampaignId,
        `MYAH-270 Mixed Case ${mixedCaseCampaignId}`,
        insertRollbackCampaignId,
        `MYAH-270 Insert Rollback ${insertRollbackCampaignId}`,
        rollbackSuccessorCampaignId,
        `MYAH-270 Rollback Successor ${rollbackSuccessorCampaignId}`,
        connectionOwnershipCampaignId,
        `MYAH-270 Query Runner Ownership ${connectionOwnershipCampaignId}`,
        migrationConflictCampaignId,
        `MYAH-270 Migration Conflict ${migrationConflictCampaignId}`,
        removeUpdatedAtCampaignId,
        `MYAH-270 Remove Timestamp ${removeUpdatedAtCampaignId}`,
        rowPermissionExcludedCampaignId,
        `MYAH-270 Row Permission Excluded ${rowPermissionExcludedCampaignId}`,
        rowPermissionAllowedCampaignId,
        `MYAH-270 Row Permission Allowed ${rowPermissionAllowedCampaignId}`,
      ],
    );
    for (const [index, connectedAccountId] of connectedAccountIds.entries()) {
      await global.testDataSource.query(
        `INSERT INTO core."connectedAccount" (
          "id", "workspaceId", "userWorkspaceId", "handle", "name", "provider", "visibility"
        ) VALUES ($1, $2, $3, $4, $5, $6, 'workspace')`,
        [
          connectedAccountId,
          workspaceId,
          userWorkspaceId,
          senderEmails[index],
          `MYAH-270 Lock Sender ${index + 1}`,
          ConnectedAccountProvider.GOOGLE,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."messageChannel" (
          "id", "workspaceId", "connectedAccountId", "handle", "visibility", "type",
          "pendingGroupEmailsAction", "syncStatus", "syncStage"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          messageChannelIds[index],
          workspaceId,
          connectedAccountId,
          senderEmails[index],
          MessageChannelVisibility.SHARE_EVERYTHING,
          MessageChannelType.EMAIL,
          MessageChannelPendingGroupEmailsAction.NONE,
          MessageChannelSyncStatus.ACTIVE,
          MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
        ],
      );
    }
  });

  afterAll(async () => {
    if (!workspaceId) return;
    const fixtureCampaignIds = [
      campaignId,
      transitionCampaignId,
      sameAccountCampaignId,
      rollbackCampaignId,
      mixedCaseCampaignId,
      insertRollbackCampaignId,
      rollbackSuccessorCampaignId,
      connectionOwnershipCampaignId,
      migrationConflictCampaignId,
      removeUpdatedAtCampaignId,
      rowPermissionExcludedCampaignId,
      rowPermissionAllowedCampaignId,
    ];
    const cleanupErrors: Error[] = [];
    const attempt = async (label: string, cleanup: () => Promise<void>) => {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(
          new Error(
            `${label}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    };

    // A failed legacy-index restoration must not strand fixture records. Run
    // every restoration and deletion independently and report all failures.
    for (const triggerName of TRANSACTION_FIXTURE_TRIGGER_NAMES) {
      await attempt(`drop fixture trigger ${triggerName}`, () =>
        global.testDataSource.query(
          `DROP TRIGGER IF EXISTS "${triggerName}" ON "${workspaceSchemaName}"."campaignAccount"`,
        ),
      );
    }
    for (const functionName of TRANSACTION_FIXTURE_FUNCTION_NAMES) {
      await attempt(`drop fixture function ${functionName}`, () =>
        global.testDataSource.query(
          `DROP FUNCTION IF EXISTS "${workspaceSchemaName}"."${functionName}"()`,
        ),
      );
    }
    await attempt('drop fixture transaction audit table', () =>
      global.testDataSource.query(
        `DROP TABLE IF EXISTS "${workspaceSchemaName}"."${TRANSACTION_FIXTURE_AUDIT_TABLE_NAME}"`,
      ),
    );
    await attempt('restore conflicting default', () =>
      global.testDataSource.query(
        `UPDATE "${workspaceSchemaName}"."campaignAccount"
            SET "isDefault" = false
          WHERE "campaignId" = $1 AND "connectedAccountId" = $2`,
        [migrationConflictCampaignId, connectedAccountIds[1]],
      ),
    );
    await attempt('synchronize restored default index', () =>
      synchronizeCampaignAccountMetadata(workspaceId),
    );
    await attempt('verify restored default index after cleanup', async () => {
      const indexes = await global.testDataSource.query<PhysicalIndexRow[]>(
        `SELECT index_row.indisunique AS "isUnique",
                index_row.indisvalid AS "isValid",
                index_row.indisready AS "isReady",
                string_agg(attribute.attname, ',' ORDER BY key_columns.ordinality) AS "columns",
                pg_get_expr(index_row.indpred, index_row.indrelid) AS "predicate"
           FROM pg_index AS index_row
           INNER JOIN pg_class AS table_class ON table_class.oid = index_row.indrelid
           INNER JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
           INNER JOIN unnest(index_row.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
             ON key_columns.attnum > 0
           INNER JOIN pg_attribute AS attribute
             ON attribute.attrelid = table_class.oid AND attribute.attnum = key_columns.attnum
          WHERE namespace.nspname = $1 AND table_class.relname = 'campaignAccount'
            AND index_row.indisunique AND pg_get_expr(index_row.indpred, index_row.indrelid) IS NOT NULL
          GROUP BY index_row.indisunique, index_row.indisvalid, index_row.indisready,
                   index_row.indpred, index_row.indrelid`,
        [workspaceSchemaName],
      );
      expect(
        indexes.find(
          ({ columns, predicate }) =>
            columns === 'campaignId,channel' &&
            predicate.includes('"deletedAt" IS NULL') &&
            predicate.includes('"isDefault" = true'),
        ),
      ).toMatchObject({ isUnique: true, isValid: true, isReady: true });
    });
    await attempt('delete CampaignAccount fixtures', () =>
      global.testDataSource.query(
        `DELETE FROM "${workspaceSchemaName}"."campaignAccount"
          WHERE "campaignId" = ANY($1::uuid[])`,
        [fixtureCampaignIds],
      ),
    );
    await attempt('delete Campaign fixtures', () =>
      global.testDataSource.query(
        `DELETE FROM "${workspaceSchemaName}"."campaign"
          WHERE "id" = ANY($1::uuid[])`,
        [fixtureCampaignIds],
      ),
    );
    await attempt('delete MessageChannel fixtures', () =>
      global.testDataSource.query(
        `DELETE FROM core."messageChannel" WHERE "id" = ANY($1::uuid[])`,
        [messageChannelIds],
      ),
    );
    await attempt('delete ConnectedAccount fixtures', () =>
      global.testDataSource.query(
        `DELETE FROM core."connectedAccount" WHERE "id" = ANY($1::uuid[])`,
        [connectedAccountIds],
      ),
    );
    await attempt('verify Campaign fixture deletion', async () => {
      const [remaining] = await global.testDataSource.query<
        Array<{ count: number }>
      >(
        `SELECT COUNT(*)::int AS "count"
           FROM "${workspaceSchemaName}"."campaign"
          WHERE "id" = ANY($1::uuid[])`,
        [fixtureCampaignIds],
      );
      expect(remaining.count).toBe(0);
    });
    await attempt('verify ConnectedAccount fixture deletion', async () => {
      const [remaining] = await global.testDataSource.query<
        Array<{ count: number }>
      >(
        `SELECT COUNT(*)::int AS "count"
           FROM core."connectedAccount"
          WHERE "id" = ANY($1::uuid[])`,
        [connectedAccountIds],
      );
      expect(remaining.count).toBe(0);
    });
    if (cleanupErrors.length) {
      throw new Error(
        `CampaignAccount fixture cleanup failed:\n${cleanupErrors
          .map(({ message }) => message)
          .join('\n')}`,
      );
    }
  });

  it('installs the Campaign default partial unique index through the idempotent workspace command', async () => {
    const indexes = await global.testDataSource.query<PhysicalIndexRow[]>(
      `SELECT index_class.relname AS "indexName",
              index_row.indisunique AS "isUnique",
              index_row.indisvalid AS "isValid",
              index_row.indisready AS "isReady",
              string_agg(attribute.attname, ',' ORDER BY key_columns.ordinality) AS "columns",
              pg_get_expr(index_row.indpred, index_row.indrelid) AS "predicate"
         FROM pg_index AS index_row
         INNER JOIN pg_class AS table_class ON table_class.oid = index_row.indrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
         INNER JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
         INNER JOIN unnest(index_row.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
           ON key_columns.attnum > 0
         INNER JOIN pg_attribute AS attribute
           ON attribute.attrelid = table_class.oid
          AND attribute.attnum = key_columns.attnum
        WHERE namespace.nspname = $1
          AND table_class.relname = 'campaignAccount'
          AND index_row.indisunique
          AND pg_get_expr(index_row.indpred, index_row.indrelid) IS NOT NULL
        GROUP BY index_class.relname,
                 index_row.indisunique,
                 index_row.indisvalid,
                 index_row.indisready,
                 index_row.indpred,
                 index_row.indrelid`,
      [workspaceSchemaName],
    );
    const defaultIndex = indexes.find(
      (index) =>
        index.columns === 'campaignId,channel' &&
        index.predicate.includes('"deletedAt" IS NULL') &&
        index.predicate.includes('"isDefault" = true'),
    );

    expect(defaultIndex).toMatchObject({
      isUnique: true,
      isValid: true,
      isReady: true,
      columns: 'campaignId,channel',
    });
  });

  it('serializes simultaneous first links with one PostgreSQL transaction per request', async () => {
    const links = await Promise.all(
      connectedAccountIds
        .slice(0, 2)
        .map((connectedAccountId) =>
          campaignAccountService.link(
            { campaignId, connectedAccountId },
            buildSystemAuthContext(workspaceId),
          ),
        ),
    );
    expect(links).toHaveLength(2);

    const persisted = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1
          AND "channel" = 'EMAIL'
          AND "deletedAt" IS NULL
        ORDER BY "connectedAccountId"`,
      [campaignId],
    );
    expect(persisted).toHaveLength(2);
    expect(persisted.map((link) => link.connectedAccountId).sort()).toEqual(
      [...connectedAccountIds.slice(0, 2)].sort(),
    );
    expect(persisted.filter((link) => link.isDefault)).toHaveLength(1);

    const [{ idleInTransactionCount }] = await global.testDataSource.query<
      Array<{ idleInTransactionCount: string }>
    >(
      `SELECT COUNT(*)::text AS "idleInTransactionCount"
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'idle in transaction'
          AND pid <> pg_backend_pid()
          AND query LIKE $1`,
      [`%${workspaceSchemaName}%`],
    );
    expect(Number(idleInTransactionCount)).toBe(0);
  });

  it('serializes a default selection before the latest remove preserves an intentional pause', async () => {
    await campaignAccountService.link(
      {
        campaignId: transitionCampaignId,
        connectedAccountId: connectedAccountIds[2],
      },
      buildSystemAuthContext(workspaceId),
    );
    await campaignAccountService.link(
      {
        campaignId: transitionCampaignId,
        connectedAccountId: connectedAccountIds[3],
      },
      buildSystemAuthContext(workspaceId),
    );
    const [target] = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT id
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "connectedAccountId" = $2 AND "deletedAt" IS NULL`,
      [transitionCampaignId, connectedAccountIds[3]],
    );
    const functionName = 'myah_270_set_default_barrier';
    const triggerName = 'myah_270_set_default_barrier_trigger';
    const barrierLabel = randomUUID();
    const barrier = await acquireTestBarrier(barrierLabel);
    let removeSettled = false;
    const transitions: Promise<unknown>[] = [];
    try {
      await createTransactionBarrierTrigger({
        functionName,
        triggerName,
        targetId: target.id,
        barrierLabel,
      });
      const setDefault = campaignAccountService.setDefault(
        { campaignId: transitionCampaignId, campaignAccountId: target.id },
        buildSystemAuthContext(workspaceId),
      );
      // Observe rejection immediately so cleanup never leaves an unhandled promise.
      transitions.push(setDefault);
      void setDefault.catch(() => undefined);
      await waitForCampaignAdvisoryLock(transitionCampaignId, true);
      await waitForTestBarrierWaiter(barrierLabel);
      const remove = campaignAccountService
        .remove(
          { campaignId: transitionCampaignId, campaignAccountId: target.id },
          buildSystemAuthContext(workspaceId),
        )
        .finally(() => {
          removeSettled = true;
        });
      transitions.push(remove);
      void remove.catch(() => undefined);
      await waitForCampaignAdvisoryLock(transitionCampaignId, false);
      expect(removeSettled).toBe(false);
      await barrier.release();
      await Promise.all([setDefault, remove]);
    } finally {
      await barrier.release().catch(() => undefined);
      await Promise.allSettled(transitions);
      await dropTransactionBarrierTrigger(functionName, triggerName);
    }

    const active = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [transitionCampaignId],
    );
    expect(active).toEqual([
      expect.objectContaining({
        connectedAccountId: connectedAccountIds[2],
        isDefault: false,
      }),
    ]);
    await expect(
      campaignAccountService.setDefault(
        { campaignId: transitionCampaignId, campaignAccountId: target.id },
        buildSystemAuthContext(workspaceId),
      ),
    ).rejects.toThrow('Campaign email account not found');
  });

  it('serializes a same-account first-link race into one link and an explicit duplicate', async () => {
    const outcomes = await Promise.allSettled([
      campaignAccountService.link(
        {
          campaignId: sameAccountCampaignId,
          connectedAccountId: connectedAccountIds[2],
        },
        buildSystemAuthContext(workspaceId),
      ),
      campaignAccountService.link(
        {
          campaignId: sameAccountCampaignId,
          connectedAccountId: connectedAccountIds[2],
        },
        buildSystemAuthContext(workspaceId),
      ),
    ]);
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          message: 'Connected email account is already linked',
        }),
      }),
    ]);
    const persisted = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [sameAccountCampaignId],
    );
    expect(persisted).toEqual([
      expect.objectContaining({
        connectedAccountId: connectedAccountIds[2],
        isDefault: true,
      }),
    ]);
  });

  it('advances updatedAt when a Campaign email account is successfully removed', async () => {
    await campaignAccountService.link(
      {
        campaignId: removeUpdatedAtCampaignId,
        connectedAccountId: connectedAccountIds[0],
      },
      buildSystemAuthContext(workspaceId),
    );
    const [link] = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [removeUpdatedAtCampaignId],
    );
    const beforeRemoval = new Date('2000-01-01T00:00:00.000Z');
    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "updatedAt" = $2 WHERE id = $1`,
      [link.id, beforeRemoval],
    );
    await campaignAccountService.remove(
      { campaignId: removeUpdatedAtCampaignId, campaignAccountId: link.id },
      buildSystemAuthContext(workspaceId),
    );
    const [removed] = await global.testDataSource.query<
      Array<{ deletedAt: Date; updatedAt: Date }>
    >(
      `SELECT "deletedAt", "updatedAt" FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE id = $1`,
      [link.id],
    );
    expect(removed.deletedAt).toEqual(expect.anything());
    expect(removed.updatedAt.getTime()).toBeGreaterThan(
      beforeRemoval.getTime(),
    );
  });

  it('rolls back the previous default when the target update fails after clear', async () => {
    await campaignAccountService.link(
      {
        campaignId: rollbackCampaignId,
        connectedAccountId: connectedAccountIds[0],
      },
      buildSystemAuthContext(workspaceId),
    );
    await campaignAccountService.link(
      {
        campaignId: rollbackCampaignId,
        connectedAccountId: connectedAccountIds[1],
      },
      buildSystemAuthContext(workspaceId),
    );
    const [target] = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT id
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "connectedAccountId" = $2 AND "deletedAt" IS NULL`,
      [rollbackCampaignId, connectedAccountIds[1]],
    );
    const preservedTimestamp = new Date('2000-01-01T00:00:00.000Z');
    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "updatedAt" = $2
        WHERE "campaignId" = $1`,
      [rollbackCampaignId, preservedTimestamp],
    );
    const functionName = 'myah_270_default_target_failure';
    const triggerName = 'myah_270_default_target_failure_trigger';
    try {
      await global.testDataSource.query(
        `CREATE OR REPLACE FUNCTION "${workspaceSchemaName}"."${functionName}"()
         RETURNS trigger AS $$
         BEGIN
           IF NEW.id = '${target.id}'::uuid AND NEW."isDefault" = true THEN
             RAISE EXCEPTION 'forced target default failure';
           END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
      );
      await global.testDataSource.query(
        `CREATE TRIGGER "${triggerName}"
         BEFORE UPDATE ON "${workspaceSchemaName}"."campaignAccount"
         FOR EACH ROW EXECUTE FUNCTION "${workspaceSchemaName}"."${functionName}"()`,
      );
      await expect(
        campaignAccountService.setDefault(
          { campaignId: rollbackCampaignId, campaignAccountId: target.id },
          buildSystemAuthContext(workspaceId),
        ),
      ).rejects.toThrow();
    } finally {
      await global.testDataSource.query(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "${workspaceSchemaName}"."campaignAccount"`,
      );
      await global.testDataSource.query(
        `DROP FUNCTION IF EXISTS "${workspaceSchemaName}"."${functionName}"()`,
      );
    }
    const active = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault", "updatedAt"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [rollbackCampaignId],
    );
    expect(active).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectedAccountId: connectedAccountIds[0],
          isDefault: true,
          updatedAt: preservedTimestamp,
        }),
        expect.objectContaining({
          connectedAccountId: connectedAccountIds[1],
          isDefault: false,
          updatedAt: preservedTimestamp,
        }),
      ]),
    );

    await campaignAccountService.setDefault(
      { campaignId: rollbackCampaignId, campaignAccountId: target.id },
      buildSystemAuthContext(workspaceId),
    );
    const advanced = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault", "updatedAt"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [rollbackCampaignId],
    );
    expect(advanced).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectedAccountId: connectedAccountIds[0],
          isDefault: false,
          updatedAt: expect.anything(),
        }),
        expect.objectContaining({
          connectedAccountId: connectedAccountIds[1],
          isDefault: true,
          updatedAt: expect.anything(),
        }),
      ]),
    );
    expect(
      advanced.every(
        ({ updatedAt }) =>
          updatedAt &&
          new Date(updatedAt).getTime() > preservedTimestamp.getTime(),
      ),
    ).toBe(true);
  });

  it('serializes mixed-case Campaign UUID selection and remove into an intentional pause', async () => {
    await Promise.all(
      connectedAccountIds
        .slice(0, 2)
        .map((connectedAccountId) =>
          campaignAccountService.link(
            { campaignId: mixedCaseCampaignId, connectedAccountId },
            buildSystemAuthContext(workspaceId),
          ),
        ),
    );
    const [target] = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "connectedAccountId" = $2 AND "deletedAt" IS NULL`,
      [mixedCaseCampaignId, connectedAccountIds[1]],
    );
    const functionName = 'myah_270_mixed_case_lock_barrier';
    const triggerName = 'myah_270_mixed_case_lock_barrier_trigger';
    const barrierLabel = randomUUID();
    const barrier = await acquireTestBarrier(barrierLabel);
    const transitions: Promise<unknown>[] = [];
    try {
      await createTransactionBarrierTrigger({
        functionName,
        triggerName,
        targetId: target.id,
        barrierLabel,
      });
      const setDefault = campaignAccountService.setDefault(
        {
          campaignId: mixedCaseCampaignId.toUpperCase(),
          campaignAccountId: target.id,
        },
        buildSystemAuthContext(workspaceId),
      );
      transitions.push(setDefault);
      void setDefault.catch(() => undefined);
      await waitForCampaignAdvisoryLock(mixedCaseCampaignId, true);
      await waitForTestBarrierWaiter(barrierLabel);
      const remove = campaignAccountService.remove(
        { campaignId: mixedCaseCampaignId, campaignAccountId: target.id },
        buildSystemAuthContext(workspaceId),
      );
      transitions.push(remove);
      void remove.catch(() => undefined);
      // Without UUID canonicalization this exact key has no waiting holder;
      // row locking alone cannot satisfy this advisory-lock observation.
      await waitForCampaignAdvisoryLock(mixedCaseCampaignId, false);
      await barrier.release();
      await Promise.all(transitions);
    } finally {
      await barrier.release().catch(() => undefined);
      await Promise.allSettled(transitions);
      await dropTransactionBarrierTrigger(functionName, triggerName);
    }
    const active = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [mixedCaseCampaignId],
    );
    expect(active).toEqual([
      expect.objectContaining({
        connectedAccountId: connectedAccountIds[0],
        isDefault: false,
      }),
    ]);
  });

  it('rolls back a link inserted before an outer transaction failure', async () => {
    const functionName = 'myah_270_link_after_insert_failure';
    const triggerName = 'myah_270_link_after_insert_failure_trigger';
    try {
      await global.testDataSource.query(
        `CREATE OR REPLACE FUNCTION "${workspaceSchemaName}"."${functionName}"()
         RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced insert rollback'; END; $$ LANGUAGE plpgsql`,
      );
      await global.testDataSource.query(
        `CREATE CONSTRAINT TRIGGER "${triggerName}"
         AFTER INSERT ON "${workspaceSchemaName}"."campaignAccount"
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION "${workspaceSchemaName}"."${functionName}"()`,
      );
      await expect(
        campaignAccountService.link(
          {
            campaignId: insertRollbackCampaignId,
            connectedAccountId: connectedAccountIds[0],
          },
          buildSystemAuthContext(workspaceId),
        ),
      ).rejects.toThrow('forced insert rollback');
    } finally {
      await global.testDataSource.query(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "${workspaceSchemaName}"."campaignAccount"`,
      );
      await global.testDataSource.query(
        `DROP FUNCTION IF EXISTS "${workspaceSchemaName}"."${functionName}"()`,
      );
    }
    const [{ count }] = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT COUNT(*)::text AS count FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1`,
      [insertRollbackCampaignId],
    );
    expect(count).toBe('0');
  });

  it('rolls back a link after its insert callback returns before outer commit', async () => {
    const marker = new Error('MYAH-270 controlled outer rollback');
    const workspaceOrmManager = campaignAccountService as unknown as {
      globalWorkspaceOrmManager: {
        getGlobalWorkspaceDataSource: () => Promise<{
          transaction: <T>(
            callback: (manager: unknown) => Promise<T>,
          ) => Promise<T>;
        }>;
      };
    };
    const dataSource =
      await workspaceOrmManager.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const originalTransaction = dataSource.transaction.bind(dataSource);
    const workspaceEventEmitter = resolveProvider(WorkspaceEventEmitter);
    const originalEmitDatabaseBatchEvent =
      workspaceEventEmitter.emitDatabaseBatchEvent.bind(workspaceEventEmitter);
    const campaignAccountEvents: unknown[] = [];
    const emitDatabaseBatchEventSpy = jest
      .spyOn(workspaceEventEmitter, 'emitDatabaseBatchEvent')
      .mockImplementation((event) => {
        if (
          event?.workspaceId === workspaceId &&
          event.objectMetadataNameSingular === 'campaignAccount'
        ) {
          campaignAccountEvents.push(event);
        }
        return originalEmitDatabaseBatchEvent(event);
      });
    let serviceCallbackReturnedAfterInsert = false;
    let serviceRejected = false;
    dataSource.transaction = async (callback) =>
      originalTransaction(async (manager: unknown) => {
        await callback(manager);
        serviceCallbackReturnedAfterInsert = true;
        throw marker;
      });
    try {
      await expect(
        campaignAccountService.link(
          {
            campaignId: insertRollbackCampaignId,
            connectedAccountId: connectedAccountIds[0],
          },
          buildSystemAuthContext(workspaceId),
        ),
      ).rejects.toThrow(marker.message);
      serviceRejected = true;
    } finally {
      dataSource.transaction = originalTransaction;
      emitDatabaseBatchEventSpy.mockRestore();
    }

    expect(serviceCallbackReturnedAfterInsert).toBe(true);
    expect(campaignAccountEvents).toEqual([]);
    expect(serviceRejected).toBe(true);
    const [{ count }] = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT COUNT(*)::text AS count FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1`,
      [insertRollbackCampaignId],
    );
    // The transaction callback has completed, so no ORM mutation event can
    // have committed a CampaignAccount write before the controlled rollback.
    expect(count).toBe('0');
    await expect(
      campaignAccountService.link(
        {
          campaignId: insertRollbackCampaignId,
          connectedAccountId: connectedAccountIds[1],
        },
        buildSystemAuthContext(workspaceId),
      ),
    ).resolves.toHaveLength(1);
    const [{ idleInTransactionCount }] = await global.testDataSource.query<
      Array<{ idleInTransactionCount: string }>
    >(
      `SELECT COUNT(*)::text AS "idleInTransactionCount"
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'idle in transaction'
          AND pid <> pg_backend_pid()
          AND query LIKE $1`,
      [`%${workspaceSchemaName}%`],
    );
    expect(Number(idleInTransactionCount)).toBe(0);
  });

  it('keeps each default transition and its transactional advisory lock on one PostgreSQL backend and transaction', async () => {
    const auditTable = 'myah_270_transaction_audit';
    const functionName = 'myah_270_transaction_audit_function';
    const triggerName = 'myah_270_transaction_audit_trigger';
    const auditObjects = { table: false, function: false, trigger: false };
    try {
      await global.testDataSource.query(
        `CREATE TABLE "${workspaceSchemaName}"."${auditTable}" (
           operation text NOT NULL,
           "backendPid" integer NOT NULL,
           "transactionId" bigint NOT NULL,
           "advisoryLockHeld" boolean NOT NULL,
           "workspaceLockKey" text NOT NULL,
           "campaignLockKey" text NOT NULL
         )`,
      );
      auditObjects.table = true;
      await global.testDataSource.query(
        `CREATE FUNCTION "${workspaceSchemaName}"."${functionName}"()
         RETURNS trigger AS $$
         BEGIN
           INSERT INTO "${workspaceSchemaName}"."${auditTable}" (
             operation, "backendPid", "transactionId", "advisoryLockHeld",
             "workspaceLockKey", "campaignLockKey"
           ) VALUES (
             TG_OP,
             pg_backend_pid(),
             txid_current(),
             EXISTS (
               SELECT 1 FROM pg_locks
                WHERE pid = pg_backend_pid()
                  AND locktype = 'advisory'
                  AND mode = 'ExclusiveLock'
                  AND granted
                  AND classid = hashtext(('${workspaceId}'::uuid)::text)::oid
                  AND objid = hashtext(('${connectionOwnershipCampaignId}'::uuid)::text)::oid
             ),
             hashtext(('${workspaceId}'::uuid)::text)::text,
             hashtext(('${connectionOwnershipCampaignId}'::uuid)::text)::text
           );
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`,
      );
      auditObjects.function = true;
      await global.testDataSource.query(
        `CREATE TRIGGER "${triggerName}"
         AFTER INSERT OR UPDATE ON "${workspaceSchemaName}"."campaignAccount"
         FOR EACH ROW EXECUTE FUNCTION "${workspaceSchemaName}"."${functionName}"()`,
      );
      auditObjects.trigger = true;

      await campaignAccountService.link(
        {
          campaignId: connectionOwnershipCampaignId,
          connectedAccountId: connectedAccountIds[0],
        },
        buildSystemAuthContext(workspaceId),
      );
      await campaignAccountService.link(
        {
          campaignId: connectionOwnershipCampaignId,
          connectedAccountId: connectedAccountIds[1],
        },
        buildSystemAuthContext(workspaceId),
      );
      const [target] = await global.testDataSource.query<Array<{ id: string }>>(
        `SELECT id FROM "${workspaceSchemaName}"."campaignAccount"
          WHERE "campaignId" = $1 AND "connectedAccountId" = $2 AND "deletedAt" IS NULL`,
        [connectionOwnershipCampaignId, connectedAccountIds[1]],
      );
      await campaignAccountService.setDefault(
        {
          campaignId: connectionOwnershipCampaignId,
          campaignAccountId: target.id,
        },
        buildSystemAuthContext(workspaceId),
      );
      await campaignAccountService.remove(
        {
          campaignId: connectionOwnershipCampaignId,
          campaignAccountId: target.id,
        },
        buildSystemAuthContext(workspaceId),
      );

      const audit = await global.testDataSource.query<TransactionAuditRow[]>(
        `SELECT operation, "backendPid"::text AS "backendPid",
                "transactionId"::text AS "transactionId", "advisoryLockHeld",
                "workspaceLockKey", "campaignLockKey"
           FROM "${workspaceSchemaName}"."${auditTable}"
          ORDER BY ctid`,
      );
      expect(audit).toHaveLength(5);
      expect(audit.map(({ operation }) => operation)).toEqual([
        'INSERT',
        'INSERT',
        'UPDATE',
        'UPDATE',
        'UPDATE',
      ]);
      const defaultTransition = audit.slice(2, 4);
      expect(
        new Set(defaultTransition.map(({ backendPid }) => backendPid)).size,
      ).toBe(1);
      expect(
        new Set(defaultTransition.map(({ transactionId }) => transactionId))
          .size,
      ).toBe(1);
      const [{ workspaceLockKey, campaignLockKey }] =
        await global.testDataSource.query<
          Array<{ workspaceLockKey: string; campaignLockKey: string }>
        >(
          `SELECT hashtext(($1::uuid)::text)::text AS "workspaceLockKey",
                  hashtext(($2::uuid)::text)::text AS "campaignLockKey"`,
          [workspaceId, connectionOwnershipCampaignId],
        );
      expect(audit).toHaveLength(5);
      expect(
        audit.every(
          (row) =>
            row.advisoryLockHeld === true &&
            row.workspaceLockKey === workspaceLockKey &&
            row.campaignLockKey === campaignLockKey &&
            row.backendPid.length > 0 &&
            row.transactionId.length > 0,
        ),
      ).toBe(true);
    } finally {
      if (auditObjects.trigger) {
        await global.testDataSource.query(
          `DROP TRIGGER IF EXISTS "${triggerName}" ON "${workspaceSchemaName}"."campaignAccount"`,
        );
      }
      if (auditObjects.function) {
        await global.testDataSource.query(
          `DROP FUNCTION IF EXISTS "${workspaceSchemaName}"."${functionName}"()`,
        );
      }
      if (auditObjects.table) {
        await global.testDataSource.query(
          `DROP TABLE IF EXISTS "${workspaceSchemaName}"."${auditTable}"`,
        );
      }
    }
  });

  it('releases a failed default transition so a waiting successor can commit without stale state', async () => {
    await Promise.all(
      connectedAccountIds
        .slice(0, 3)
        .map((connectedAccountId) =>
          campaignAccountService.link(
            { campaignId: rollbackSuccessorCampaignId, connectedAccountId },
            buildSystemAuthContext(workspaceId),
          ),
        ),
    );
    const accounts = await global.testDataSource.query<
      Array<{ id: string; connectedAccountId: string }>
    >(
      `SELECT id, "connectedAccountId" FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [rollbackSuccessorCampaignId],
    );
    const failedTarget = accounts.find(
      ({ connectedAccountId }) => connectedAccountId === connectedAccountIds[1],
    );
    const successor = accounts.find(
      ({ connectedAccountId }) => connectedAccountId === connectedAccountIds[2],
    );
    expect(failedTarget).toBeDefined();
    expect(successor).toBeDefined();
    const functionName = 'myah_270_waiting_successor_rollback';
    const triggerName = 'myah_270_waiting_successor_rollback_trigger';
    const barrierLabel = randomUUID();
    const barrier = await acquireTestBarrier(barrierLabel);
    const transitions: Promise<unknown>[] = [];
    let successorSettled = false;
    try {
      await createTransactionBarrierTrigger({
        functionName,
        triggerName,
        targetId: failedTarget!.id,
        barrierLabel,
        failure: 'forced successor predecessor rollback',
      });
      const failed = campaignAccountService.setDefault(
        {
          campaignId: rollbackSuccessorCampaignId,
          campaignAccountId: failedTarget!.id,
        },
        buildSystemAuthContext(workspaceId),
      );
      void failed.catch(() => undefined);
      transitions.push(failed);
      await waitForCampaignAdvisoryLock(rollbackSuccessorCampaignId, true);
      await waitForTestBarrierWaiter(barrierLabel);
      const waitingSuccessor = campaignAccountService
        .setDefault(
          {
            campaignId: rollbackSuccessorCampaignId,
            campaignAccountId: successor!.id,
          },
          buildSystemAuthContext(workspaceId),
        )
        .finally(() => {
          successorSettled = true;
        });
      void waitingSuccessor.catch(() => undefined);
      transitions.push(waitingSuccessor);
      await waitForCampaignAdvisoryLock(rollbackSuccessorCampaignId, false);
      expect(successorSettled).toBe(false);
      await barrier.release();
      await expect(failed).rejects.toThrow(
        'forced successor predecessor rollback',
      );
      await expect(waitingSuccessor).resolves.toBeDefined();
    } finally {
      await barrier.release().catch(() => undefined);
      await Promise.allSettled(transitions);
      await dropTransactionBarrierTrigger(functionName, triggerName);
    }
    const active = await global.testDataSource.query<CampaignAccountRow[]>(
      `SELECT "connectedAccountId", "isDefault" FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL`,
      [rollbackSuccessorCampaignId],
    );
    expect(active.filter(({ isDefault }) => isDefault)).toEqual([
      expect.objectContaining({ connectedAccountId: connectedAccountIds[2] }),
    ]);
    const [{ idleInTransactionCount }] = await global.testDataSource.query<
      Array<{ idleInTransactionCount: string }>
    >(
      `SELECT COUNT(*)::text AS "idleInTransactionCount" FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'idle in transaction'
          AND pid <> pg_backend_pid() AND query LIKE $1`,
      [`%${workspaceSchemaName}%`],
    );
    expect(Number(idleInTransactionCount)).toBe(0);
  });

  it('enforces real row-level Campaign permissions before account writes while allowing a control Campaign', async () => {
    const roleId = randomUUID();
    const roleTarget = await global.testDataSource.query<
      Array<{ id: string; roleId: string }>
    >(
      `SELECT id, "roleId" AS "roleId" FROM core."roleTarget"
        WHERE "workspaceId" = $1 AND "userWorkspaceId" = $2`,
      [workspaceId, userWorkspaceId],
    );
    expect(roleTarget).toHaveLength(1);
    const [application] = await global.testDataSource.query<
      Array<{ id: string }>
    >(`SELECT id FROM core."application" WHERE "workspaceId" = $1 LIMIT 1`, [
      workspaceId,
    ]);
    const [campaignMetadata] = await global.testDataSource.query<
      Array<{ id: string }>
    >(
      `SELECT id FROM core."objectMetadata"
        WHERE "workspaceId" = $1 AND "nameSingular" = 'campaign'`,
      [workspaceId],
    );
    const [campaignIdField] = await global.testDataSource.query<
      Array<{ id: string }>
    >(
      `SELECT field_metadata.id AS id FROM core."fieldMetadata" field_metadata
        WHERE field_metadata."workspaceId" = $1
          AND field_metadata."objectMetadataId" = $2
          AND field_metadata.name = 'id'`,
      [workspaceId, campaignMetadata.id],
    );
    expect(application).toBeDefined();
    expect(campaignMetadata).toBeDefined();
    expect(campaignIdField).toBeDefined();
    const cacheService = resolveProviderByName<{
      invalidateAndRecompute: (
        workspace: string,
        keys: string[],
      ) => Promise<void>;
    }>('WorkspaceCacheService');
    const actorContextService = resolveProviderByName<{
      buildUserAndAgentActorContext: (
        userWorkspace: string,
        workspace: string,
      ) => Promise<{
        authContext: Parameters<CampaignAccountService['link']>[1];
      }>;
    }>('AgentActorContextService');
    const cacheKeys = [
      'rolesPermissions',
      'userWorkspaceRoleMap',
      'flatRoleMaps',
      'flatRoleTargetMaps',
      'flatObjectPermissionMaps',
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
    ];
    const originalRoleId = roleTarget[0].roleId;
    try {
      await global.testDataSource.query(
        `INSERT INTO core."role" (
          id, "workspaceId", "universalIdentifier", "applicationId", label,
          "canReadAllObjectRecords", "canUpdateAllObjectRecords",
          "canSoftDeleteAllObjectRecords", "canDestroyAllObjectRecords"
        ) VALUES ($1, $2, $3, $4, $5, false, false, false, false)`,
        [
          roleId,
          workspaceId,
          randomUUID(),
          application.id,
          `MYAH-270 RLP ${roleId}`,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."objectPermission" (
          id, "workspaceId", "universalIdentifier", "applicationId", "roleId",
          "objectMetadataId", "canReadObjectRecords", "canUpdateObjectRecords",
          "canSoftDeleteObjectRecords", "canDestroyObjectRecords"
        ) VALUES ($1, $2, $3, $4, $5, $6, true, true, false, false)`,
        [
          randomUUID(),
          workspaceId,
          randomUUID(),
          application.id,
          roleId,
          campaignMetadata.id,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."rowLevelPermissionPredicate" (
          id, "workspaceId", "universalIdentifier", "applicationId", "roleId",
          "objectMetadataId", "fieldMetadataId", operand, value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'IS', $8::jsonb)`,
        [
          randomUUID(),
          workspaceId,
          randomUUID(),
          application.id,
          roleId,
          campaignMetadata.id,
          campaignIdField.id,
          JSON.stringify(rowPermissionAllowedCampaignId),
        ],
      );
      await global.testDataSource.query(
        `UPDATE core."roleTarget" SET "roleId" = $1 WHERE id = $2`,
        [roleId, roleTarget[0].id],
      );
      await cacheService.invalidateAndRecompute(workspaceId, cacheKeys);
      const authContext = (
        await actorContextService.buildUserAndAgentActorContext(
          userWorkspaceId,
          workspaceId,
        )
      ).authContext;

      await campaignAccountService.link(
        {
          campaignId: rowPermissionExcludedCampaignId,
          connectedAccountId: connectedAccountIds[0],
        },
        buildSystemAuthContext(workspaceId),
      );
      await campaignAccountService.link(
        {
          campaignId: rowPermissionExcludedCampaignId,
          connectedAccountId: connectedAccountIds[1],
        },
        buildSystemAuthContext(workspaceId),
      );
      const excludedBefore = await global.testDataSource.query<
        Array<{
          id: string;
          isDefault: boolean;
          updatedAt: Date;
          deletedAt: Date | null;
        }>
      >(
        `SELECT id, "isDefault", "updatedAt", "deletedAt"
           FROM "${workspaceSchemaName}"."campaignAccount"
          WHERE "campaignId" = $1 ORDER BY id`,
        [rowPermissionExcludedCampaignId],
      );
      await expect(
        campaignAccountService.link(
          {
            campaignId: rowPermissionExcludedCampaignId,
            connectedAccountId: connectedAccountIds[2],
          },
          authContext,
        ),
      ).rejects.toThrow('Campaign not found');
      await expect(
        campaignAccountService.setDefault(
          {
            campaignId: rowPermissionExcludedCampaignId,
            campaignAccountId: excludedBefore[1].id,
          },
          authContext,
        ),
      ).rejects.toThrow('Campaign not found');
      await expect(
        campaignAccountService.remove(
          {
            campaignId: rowPermissionExcludedCampaignId,
            campaignAccountId: excludedBefore[1].id,
          },
          authContext,
        ),
      ).rejects.toThrow('Campaign not found');
      expect(
        await global.testDataSource.query(
          `SELECT id, "isDefault", "updatedAt", "deletedAt"
             FROM "${workspaceSchemaName}"."campaignAccount"
            WHERE "campaignId" = $1 ORDER BY id`,
          [rowPermissionExcludedCampaignId],
        ),
      ).toEqual(excludedBefore);

      await expect(
        campaignAccountService.link(
          {
            campaignId: rowPermissionAllowedCampaignId,
            connectedAccountId: connectedAccountIds[0],
          },
          authContext,
        ),
      ).resolves.toHaveLength(1);
      await expect(
        campaignAccountService.link(
          {
            campaignId: rowPermissionAllowedCampaignId,
            connectedAccountId: connectedAccountIds[1],
          },
          authContext,
        ),
      ).resolves.toHaveLength(2);
      const [allowedTarget] = await global.testDataSource.query<
        Array<{ id: string }>
      >(
        `SELECT id FROM "${workspaceSchemaName}"."campaignAccount"
          WHERE "campaignId" = $1 AND "connectedAccountId" = $2 AND "deletedAt" IS NULL`,
        [rowPermissionAllowedCampaignId, connectedAccountIds[1]],
      );
      await expect(
        campaignAccountService.setDefault(
          {
            campaignId: rowPermissionAllowedCampaignId,
            campaignAccountId: allowedTarget.id,
          },
          authContext,
        ),
      ).resolves.toHaveLength(2);
      await expect(
        campaignAccountService.remove(
          {
            campaignId: rowPermissionAllowedCampaignId,
            campaignAccountId: allowedTarget.id,
          },
          authContext,
        ),
      ).resolves.toHaveLength(1);
    } finally {
      await global.testDataSource.query(
        `UPDATE core."roleTarget" SET "roleId" = $1 WHERE id = $2`,
        [originalRoleId, roleTarget[0].id],
      );
      await global.testDataSource.query(
        `DELETE FROM core."role" WHERE id = $1`,
        [roleId],
      );
      await cacheService.invalidateAndRecompute(workspaceId, cacheKeys);
    }
  });

  it('rejects direct duplicate defaults while allowing non-default and soft-deleted rows', async () => {
    const links = await global.testDataSource.query<
      Array<{ id: string; isDefault: boolean }>
    >(
      `SELECT id, "isDefault"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL
        ORDER BY "isDefault" DESC`,
      [campaignId],
    );
    const [defaultLink, nonDefaultLink] = links;
    expect(defaultLink.isDefault).toBe(true);
    expect(nonDefaultLink.isDefault).toBe(false);

    await expect(
      global.testDataSource.query(
        `UPDATE "${workspaceSchemaName}"."campaignAccount"
            SET "isDefault" = true WHERE id = $1`,
        [nonDefaultLink.id],
      ),
    ).rejects.toThrow();

    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "deletedAt" = NOW() WHERE id = $1`,
      [defaultLink.id],
    );
    const [{ defaultCount }] = await global.testDataSource.query<
      Array<{ defaultCount: string }>
    >(
      `SELECT COUNT(*)::text AS "defaultCount"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL AND "isDefault" = true`,
      [campaignId],
    );
    expect(defaultCount).toBe('0');

    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "isDefault" = true WHERE id = $1`,
      [nonDefaultLink.id],
    );
    await expect(
      global.testDataSource.query(
        `UPDATE "${workspaceSchemaName}"."campaignAccount"
            SET "deletedAt" = NULL WHERE id = $1`,
        [defaultLink.id],
      ),
    ).rejects.toThrow();
    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "isDefault" = false WHERE id = $1`,
      [nonDefaultLink.id],
    );
  });

  it('fails conflicting legacy defaults without publishing index metadata, then synchronizes the repaired fixture idempotently', async () => {
    const defaultIndexUniversalIdentifier =
      MYAH_STANDARD_OBJECTS.campaignAccount.indexes
        .campaignAccountDefaultUniqueIndex.universalIdentifier;
    const selection = {
      objectMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.universalIdentifier,
      ]),
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.campaignAccounts
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.outreachAction.fields.campaignAccountId
          .universalIdentifier,
      ]),
      index: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.indexes.campaignAccountUniqueIndex
          .universalIdentifier,
        defaultIndexUniversalIdentifier,
      ]),
      objectPermission: new Set(['9dda7955-44b7-5ea0-ab63-6dc0630626e8']),
    };
    const runCommand = () =>
      workspaceIteratorService.iterate({
        workspaceIds: [workspaceId],
        callback: async ({ dataSource, index, total }) => {
          await synchronizeCampaignAccountMetadataCommand.runOnWorkspace({
            workspaceId,
            dataSource,
            index,
            total,
            options: { dryRun: false },
          });
        },
      });
    const deleteDefaultIndexMetadata = () =>
      workspaceIteratorService.iterate({
        workspaceIds: [workspaceId],
        callback: async ({ dataSource, index, total }) => {
          await sourceControlledMyahMetadataService.synchronizeWorkspace(
            {
              workspaceId,
              dataSource,
              index,
              total,
              options: { dryRun: false },
            },
            {},
            {
              deletionSelection: {
                index: new Set([defaultIndexUniversalIdentifier]),
              },
            },
          );
        },
      });
    const coreDefaultIndex = () =>
      global.testDataSource.query<
        Array<{ id: string; isUnique: boolean; indexWhereClause: string }>
      >(
        `SELECT index_metadata.id, index_metadata."isUnique",
                index_metadata."indexWhereClause"
           FROM core."indexMetadata" index_metadata
          WHERE index_metadata."workspaceId" = $1
            AND index_metadata."universalIdentifier" = $2`,
        [workspaceId, defaultIndexUniversalIdentifier],
      );
    const physicalDefaultIndexes = () =>
      global.testDataSource.query<PhysicalIndexRow[]>(
        `SELECT index_class.relname AS "indexName",
                index_row.indisunique AS "isUnique",
                index_row.indisvalid AS "isValid",
                index_row.indisready AS "isReady",
                string_agg(attribute.attname, ',' ORDER BY key_columns.ordinality) AS "columns",
                pg_get_expr(index_row.indpred, index_row.indrelid) AS "predicate"
           FROM pg_index AS index_row
           INNER JOIN pg_class AS table_class ON table_class.oid = index_row.indrelid
           INNER JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
           INNER JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
           INNER JOIN unnest(index_row.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
             ON key_columns.attnum > 0
           INNER JOIN pg_attribute AS attribute
             ON attribute.attrelid = table_class.oid AND attribute.attnum = key_columns.attnum
          WHERE namespace.nspname = $1 AND table_class.relname = 'campaignAccount'
            AND index_row.indisunique AND pg_get_expr(index_row.indpred, index_row.indrelid) IS NOT NULL
          GROUP BY index_class.relname, index_row.indisunique, index_row.indisvalid,
                   index_row.indisready, index_row.indpred, index_row.indrelid`,
        [workspaceSchemaName],
      );

    const deletionReport = await deleteDefaultIndexMetadata();
    expect(deletionReport).toEqual({ fail: [], success: [{ workspaceId }] });
    expect(await coreDefaultIndex()).toEqual([]);
    expect(
      (await physicalDefaultIndexes()).find(
        ({ columns, predicate }) =>
          columns === 'campaignId,channel' &&
          predicate.includes('"isDefault" = true'),
      ),
    ).toBeUndefined();

    await global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."campaignAccount"
        ("campaignId", "connectedAccountId", "messageChannelId", "channel", "isDefault")
       VALUES ($1, $2, $3, 'EMAIL', true), ($1, $4, $5, 'EMAIL', true)`,
      [
        migrationConflictCampaignId,
        connectedAccountIds[0],
        messageChannelIds[0],
        connectedAccountIds[1],
        messageChannelIds[1],
      ],
    );

    const conflictReport = await runCommand();
    expect(conflictReport.fail).toHaveLength(1);
    expect(conflictReport.fail[0].workspaceId).toBe(workspaceId);
    expect(conflictReport.fail[0].error.message).toContain(
      "Migration action 'create' for 'index'",
    );
    expect(conflictReport.success).toEqual([]);
    const [{ conflictingDefaults }] = await global.testDataSource.query<
      Array<{ conflictingDefaults: string }>
    >(
      `SELECT COUNT(*)::text AS "conflictingDefaults"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL AND "isDefault" = true`,
      [migrationConflictCampaignId],
    );
    expect(conflictingDefaults).toBe('2');
    expect(await coreDefaultIndex()).toEqual([]);
    expect(
      (await physicalDefaultIndexes()).find(
        ({ columns, predicate }) =>
          columns === 'campaignId,channel' &&
          predicate.includes('"isDefault" = true'),
      ),
    ).toBeUndefined();

    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "isDefault" = false
        WHERE "campaignId" = $1 AND "connectedAccountId" = $2`,
      [migrationConflictCampaignId, connectedAccountIds[1]],
    );
    const repairReport = await runCommand();
    expect(repairReport).toEqual({ fail: [], success: [{ workspaceId }] });
    const [restoredMetadata] = await coreDefaultIndex();
    expect(restoredMetadata).toMatchObject({
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL AND "isDefault" = true',
    });
    const [restoredPhysicalIndex] = (await physicalDefaultIndexes()).filter(
      ({ columns, predicate }) =>
        columns === 'campaignId,channel' &&
        predicate.includes('"deletedAt" IS NULL') &&
        predicate.includes('"isDefault" = true'),
    );
    expect(restoredPhysicalIndex).toMatchObject({
      isUnique: true,
      isValid: true,
      isReady: true,
      columns: 'campaignId,channel',
    });
    const rerunReport = await runCommand();
    expect(rerunReport).toEqual({ fail: [], success: [{ workspaceId }] });
    expect(await coreDefaultIndex()).toEqual([restoredMetadata]);
    expect(
      (await physicalDefaultIndexes()).filter(
        ({ columns, predicate }) =>
          columns === 'campaignId,channel' &&
          predicate.includes('"isDefault" = true'),
      ),
    ).toEqual([restoredPhysicalIndex]);
    expect(selection.index).toContain(defaultIndexUniversalIdentifier);
  });
});
