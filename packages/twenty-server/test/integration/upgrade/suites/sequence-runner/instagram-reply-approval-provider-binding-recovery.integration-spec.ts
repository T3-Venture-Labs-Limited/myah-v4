import { type UpgradeStep } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { AddInstagramReplyApprovalProviderBindingSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding';
import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963058-evolve-instagram-approval-to-action-authority';
import { FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784112963059-finalize-instagram-approval-action-authority';

import {
  type IntegrationTestContext,
  createUpgradeSequenceRunnerIntegrationTestModule,
  DEFAULT_OPTIONS,
  migrationRecordToKey,
  resetSeedSequenceCounter,
  seedInstanceMigration,
  setMockActiveWorkspaceIds,
  testGetExecutedMigrationsInOrder,
  WS_1,
} from 'test/integration/upgrade/utils/upgrade-sequence-runner-integration-test.util';

const providerBindingName =
  '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001';
const workspaceReplayName = '2.19.0_TestWorkspaceReplay_1784113000000';
const unrelatedMigrationName = '2.19.0_TestUnrelatedMigration_1784114000000';

const dropApprovalSchema = async (context: IntegrationTestContext) => {
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."actionExecutionReceipt" CASCADE',
  );
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."actionApprovalBindingEvidenceLink" CASCADE',
  );
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."actionApprovalBinding" CASCADE',
  );
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."instagramReplyExecutionReceipt" CASCADE',
  );
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."instagramReplyApprovalRequest" CASCADE',
  );
  await context.dataSource.query(
    'DROP TYPE IF EXISTS core."instagramReplyExecutionReceipt_state_enum"',
  );
  await context.dataSource.query(
    'DROP TYPE IF EXISTS core."instagramReplyApprovalRequest_state_enum"',
  );
};

const restoreApprovalSchema = async (context: IntegrationTestContext) => {
  const queryRunner = context.dataSource.createQueryRunner();

  try {
    await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
      queryRunner,
    );
    await new FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand().up(
      queryRunner,
    );
  } finally {
    await queryRunner.release();
  }
};
const deleteRecoveryMigrations = async (context: IntegrationTestContext) => {
  await context.dataSource.query(
    'DELETE FROM core."upgradeMigration" WHERE name IN ($1, $2)',
    [providerBindingName, workspaceReplayName],
  );
};
const seedFailedProviderBindingMigration = async (
  context: IntegrationTestContext,
) => {
  await seedInstanceMigration(context.dataSource, {
    name: providerBindingName,
    status: 'failed',
    workspaceIds: [WS_1],
    namespaceName: false,
  });
  await context.dataSource.query(
    `UPDATE core."upgradeMigration"
     SET "createdAt" = NOW() - INTERVAL '1 second'
     WHERE name = $1`,
    [providerBindingName],
  );
};
type UpgradeMigrationRecord = {
  id: string;
  name: string;
  status: 'completed' | 'failed';
  attempt: number;
  executedByVersion: string;
  errorMessage: string | null;
  workspaceId: string | null;
  isInitial: boolean;
  createdAt: Date;
};

const getProviderBindingMigrations = async (context: IntegrationTestContext) =>
  context.dataSource.query<UpgradeMigrationRecord[]>(
    `SELECT id, name, status, attempt, "executedByVersion", "errorMessage",
         "workspaceId", "isInitial", "createdAt"
    FROM core."upgradeMigration"
   WHERE name = $1
   ORDER BY "createdAt", id`,
    [providerBindingName],
  );

const restoreProviderBindingMigrations = async (
  context: IntegrationTestContext,
  migrations: UpgradeMigrationRecord[],
) => {
  for (const migration of migrations) {
    await context.dataSource.query(
      `INSERT INTO core."upgradeMigration"
        (id, name, status, attempt, "executedByVersion", "errorMessage",
         "workspaceId", "isInitial", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        migration.id,
        migration.name,
        migration.status,
        migration.attempt,
        migration.executedByVersion,
        migration.errorMessage,
        migration.workspaceId,
        migration.isInitial,
        migration.createdAt,
      ],
    );
  }
};

const getApprovalTables = async (context: IntegrationTestContext) =>
  context.dataSource.query<
    { approvalRequest: string | null; executionReceipt: string | null }[]
  >(
    `SELECT
      to_regclass('core."instagramReplyApprovalRequest"') AS "approvalRequest",
      to_regclass('core."instagramReplyExecutionReceipt"') AS "executionReceipt"`,
  );

const getActionAuthorityTables = async (context: IntegrationTestContext) =>
  context.dataSource.query<
    { binding: string | null; receipt: string | null }[]
  >(
    `SELECT
      to_regclass('core."actionApprovalBinding"') AS "binding",
      to_regclass('core."actionExecutionReceipt"') AS "receipt"`,
  );

const getProviderColumns = async (context: IntegrationTestContext) =>
  context.dataSource.query<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'core'
       AND table_name = 'instagramReplyApprovalRequest'
       AND column_name IN ('providerConversationId', 'recipientIgsid')
     ORDER BY column_name`,
  );

describe('UpgradeSequenceRunnerService — provider-binding recovery (integration)', () => {
  let context: IntegrationTestContext;
  let originalProviderBindingMigrations: UpgradeMigrationRecord[];

  beforeAll(async () => {
    context = await createUpgradeSequenceRunnerIntegrationTestModule();
    await seedInstanceMigration(context.dataSource, {
      name: unrelatedMigrationName,
      status: 'completed',
      namespaceName: false,
    });
    originalProviderBindingMigrations =
      await getProviderBindingMigrations(context);
  }, 30000);

  afterAll(async () => {
    try {
      await restoreApprovalSchema(context);
      await deleteRecoveryMigrations(context);
      await restoreProviderBindingMigrations(
        context,
        originalProviderBindingMigrations,
      );

      await expect(
        getProviderBindingMigrations(context),
      ).resolves.toStrictEqual(originalProviderBindingMigrations);
      const actionAuthorityTables = await getActionAuthorityTables(context);

      expect(actionAuthorityTables).toStrictEqual([
        {
          binding: 'core."actionApprovalBinding"',
          receipt: 'core."actionExecutionReceipt"',
        },
      ]);
    } finally {
      setMockActiveWorkspaceIds([]);

      try {
        await context.module?.close();
      } finally {
        await context.dataSource?.destroy();
      }
    }
  }, 15000);

  beforeEach(async () => {
    await dropApprovalSchema(context);
    await deleteRecoveryMigrations(context);
    resetSeedSequenceCounter();
    setMockActiveWorkspaceIds([WS_1]);
  });

  it('replays a failed provider-binding cursor after recreating its approval schema without a third attempt', async () => {
    await expect(
      context.dataSource.query<{ name: string }[]>(
        'SELECT name FROM core."upgradeMigration" WHERE name = $1',
        [unrelatedMigrationName],
      ),
    ).resolves.toStrictEqual([{ name: unrelatedMigrationName }]);
    await context.dataSource.query(
      'DELETE FROM core."upgradeMigration" WHERE name = $1',
      [unrelatedMigrationName],
    );
    const sequence: UpgradeStep[] = [
      {
        kind: 'slow-instance',
        name: providerBindingName,
        version: '2.19.0',
        timestamp: 1784106536001,
        command:
          new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand(),
      } as unknown as UpgradeStep,
      {
        kind: 'workspace',
        name: workspaceReplayName,
        version: '2.19.0',
        timestamp: 1784113000000,
        command: { runOnWorkspace: async () => {} },
      } as unknown as UpgradeStep,
    ];

    await seedFailedProviderBindingMigration(context);

    const report = await context.runner.run({
      sequence,
      options: DEFAULT_OPTIONS,
    });

    expect(report).toEqual({ totalFailures: 0, totalSuccesses: 1 });

    const approvalTables = await getApprovalTables(context);

    expect(approvalTables).toHaveLength(1);
    expect(approvalTables[0]).toMatchObject({
      approvalRequest: expect.any(String),
      executionReceipt: expect.any(String),
    });

    const providerColumns = await getProviderColumns(context);

    expect(providerColumns).toStrictEqual([
      { column_name: 'providerConversationId', data_type: 'text' },
      { column_name: 'recipientIgsid', data_type: 'text' },
    ]);

    const workspaceForeignKey = await context.dataSource.query<
      { exists: boolean }[]
    >(
      `SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'FK_617792f9cfed9d503e2333b2a83'
          AND contype = 'f'
          AND conrelid = 'core."instagramReplyApprovalRequest"'::regclass
          AND confrelid = 'core."workspace"'::regclass
      ) AS "exists"`,
    );

    expect(workspaceForeignKey).toStrictEqual([{ exists: true }]);

    const executed = await testGetExecutedMigrationsInOrder(context.dataSource);

    const recoveryMigrationKeys = executed
      .filter(({ name }) =>
        [providerBindingName, workspaceReplayName].includes(name),
      )
      .map(migrationRecordToKey);

    expect(recoveryMigrationKeys).toStrictEqual([
      `${providerBindingName}:instance:failed:1`,
      `${providerBindingName}:${WS_1}:failed:1`,
      `${providerBindingName}:instance:completed:2`,
      `${providerBindingName}:${WS_1}:completed:2`,
      `${workspaceReplayName}:${WS_1}:completed:1`,
    ]);

    await context.runner.run({ sequence, options: DEFAULT_OPTIONS });

    const recoveryMigrationsAfterSecondRun = (
      await testGetExecutedMigrationsInOrder(context.dataSource)
    )
      .filter(({ name }) =>
        [providerBindingName, workspaceReplayName].includes(name),
      )
      .map(migrationRecordToKey);

    expect(recoveryMigrationsAfterSecondRun).toStrictEqual(
      recoveryMigrationKeys,
    );
  });
  it('restores missing approval schema during teardown after a recovery throws', async () => {
    const recoveryError = new Error('provider-binding recovery exploded');
    const sequence: UpgradeStep[] = [
      {
        kind: 'slow-instance',
        name: providerBindingName,
        version: '2.19.0',
        timestamp: 1784106536001,
        command: {
          up: async () => {
            throw recoveryError;
          },
          down: async () => {},
          runDataMigration: async () => {},
        },
      } as unknown as UpgradeStep,
    ];

    await seedFailedProviderBindingMigration(context);

    await expect(
      context.runner.run({
        sequence,
        options: DEFAULT_OPTIONS,
      }),
    ).rejects.toThrow(recoveryError);

    expect(await getApprovalTables(context)).toStrictEqual([
      { approvalRequest: null, executionReceipt: null },
    ]);
  });
});
