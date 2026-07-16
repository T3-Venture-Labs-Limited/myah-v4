import { type UpgradeStep } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { AddInstagramReplyApprovalProviderBindingSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding';

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

const dropApprovalSchema = async (context: IntegrationTestContext) => {
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

describe('UpgradeSequenceRunnerService — provider-binding recovery (integration)', () => {
  let context: IntegrationTestContext;

  beforeAll(async () => {
    context = await createUpgradeSequenceRunnerIntegrationTestModule();
  }, 30000);

  afterAll(async () => {
    await context.dataSource.query('DELETE FROM core."upgradeMigration"');
    setMockActiveWorkspaceIds([]);
    await context.module?.close();
    await context.dataSource?.destroy();
  }, 15000);

  beforeEach(async () => {
    await dropApprovalSchema(context);
    await context.dataSource.query('DELETE FROM core."upgradeMigration"');
    resetSeedSequenceCounter();
    setMockActiveWorkspaceIds([WS_1]);
  });

  it('replays a failed provider-binding cursor after recreating its approval schema without a third attempt', async () => {
    const sequence: UpgradeStep[] = [
      {
        kind: 'slow-instance',
        name: providerBindingName,
        version: '2.19.0',
        timestamp: 1784106536001,
        command: new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand(),
      } as unknown as UpgradeStep,
      {
        kind: 'workspace',
        name: workspaceReplayName,
        version: '2.19.0',
        timestamp: 1784113000000,
        command: { runOnWorkspace: async () => {} },
      } as unknown as UpgradeStep,
    ];

    await seedInstanceMigration(context.dataSource, {
      name: providerBindingName,
      status: 'failed',
      workspaceIds: [WS_1],
    });

    const report = await context.runner.run({
      sequence,
      options: DEFAULT_OPTIONS,
    });

    expect(report).toEqual({ totalFailures: 0, totalSuccesses: 1 });

    const approvalTables = await context.dataSource.query<
      { approvalRequest: string | null; executionReceipt: string | null }[]
    >(
      `SELECT
        to_regclass('core."instagramReplyApprovalRequest"') AS "approvalRequest",
        to_regclass('core."instagramReplyExecutionReceipt"') AS "executionReceipt"`,
    );

    expect(approvalTables).toHaveLength(1);
    expect(approvalTables[0]).toMatchObject({
      approvalRequest: expect.any(String),
      executionReceipt: expect.any(String),
    });

    const providerColumns = await context.dataSource.query<
      { column_name: string; data_type: string }[]
    >(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'core'
         AND table_name = 'instagramReplyApprovalRequest'
         AND column_name IN ('providerConversationId', 'recipientIgsid')
       ORDER BY column_name`,
    );

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

    expect(executed.map(migrationRecordToKey)).toStrictEqual([
      `${providerBindingName}:instance:failed:1`,
      `${providerBindingName}:${WS_1}:failed:1`,
      `${providerBindingName}:instance:completed:2`,
      `${providerBindingName}:${WS_1}:completed:2`,
      `${workspaceReplayName}:${WS_1}:completed:1`,
    ]);

    await context.runner.run({ sequence, options: DEFAULT_OPTIONS });

    const executedAfterSecondRun =
      await testGetExecutedMigrationsInOrder(context.dataSource);

    expect(executedAfterSecondRun).toStrictEqual(executed);
  });
});
