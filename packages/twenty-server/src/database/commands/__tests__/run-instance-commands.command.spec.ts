import { type DataSource, type QueryRunner } from 'typeorm';
import { MigrationExecutor } from 'typeorm/migration/MigrationExecutor';

jest.mock('typeorm/migration/MigrationExecutor', () => ({
  MigrationExecutor: jest.fn().mockImplementation(() => ({
    getPendingMigrations: jest.fn().mockResolvedValue([]),
    executePendingMigrations: jest.fn(),
  })),
}));

import { RunInstanceCommandsCommand } from 'src/database/commands/run-instance-commands.command';
import { LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-reconciliation-name.constant';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
import { AddInstagramReplyApprovalProviderBindingSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding';
import { RepairInstagramReplyApprovalSchemaFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963055-repair-instagram-reply-approval-schema';
import { PendingMigrationCheckFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112688976-pending-migration-check';
import { type InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { type UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { type UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { type WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

describe('RunInstanceCommandsCommand', () => {
  const rebrandName =
    '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206';
  const auditName =
    '2.19.0_CreateInstagramReplyAuditFastInstanceCommand_1784106536000';

  it('acquires the common lock before inspecting the historical ledger or TypeORM migrations', async () => {
    const hasInstanceAttempt = jest.fn();
    const runMigrations = jest.fn();
    const withLock = jest.fn(async () => {
      throw new Error('upgrade busy');
    });
    const command = new RunInstanceCommandsCommand(
      { runMigrations } as unknown as DataSource,
      {} as WorkspaceVersionService,
      {} as UpgradeCommandRegistryService,
      {} as UpgradeSequenceReaderService,
      {} as InstanceCommandRunnerService,
      { hasInstanceAttempt } as unknown as UpgradeMigrationService,
      {} as UpgradeStatusService,
      { withLock } as never,
    );

    await expect(command.run([], { force: true })).rejects.toThrow(
      'upgrade busy',
    );
    expect(withLock).toHaveBeenCalledWith(expect.any(Function), {
      requireNoOngoingActivation: true,
      allowEmptyCoreBootstrap: true,
    });
    expect(hasInstanceAttempt).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it('runs the first legacy migrations before touching an absent upgrade ledger on empty-core bootstrap', async () => {
    const executePendingMigrations = jest
      .fn()
      .mockResolvedValue([{ name: 'setup' }]);
    jest.mocked(MigrationExecutor).mockImplementationOnce(
      () =>
        ({
          getPendingMigrations: jest
            .fn()
            .mockResolvedValue([{ name: 'setup' }]),
          executePendingMigrations,
        }) as unknown as MigrationExecutor,
    );
    const hasInstanceAttempt = jest.fn(() => {
      throw new Error('upgrade ledger does not exist yet');
    });
    const getActiveOrSuspendedWorkspaceIds = jest.fn(async () => {
      expect(executePendingMigrations).toHaveBeenCalledTimes(1);
      return [];
    });
    const command = new RunInstanceCommandsCommand(
      {} as DataSource,
      {
        getActiveOrSuspendedWorkspaceIds,
      } as unknown as WorkspaceVersionService,
      {} as UpgradeCommandRegistryService,
      {
        getUpgradeSequence: jest.fn().mockReturnValue([]),
      } as unknown as UpgradeSequenceReaderService,
      {} as InstanceCommandRunnerService,
      { hasInstanceAttempt } as unknown as UpgradeMigrationService,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
      } as unknown as UpgradeStatusService,
      {
        withLock: async (
          operation: (emptyCoreBootstrap: boolean) => Promise<void>,
        ) => operation(true),
        currentRunner: () => ({}) as QueryRunner,
      } as never,
    );

    await command.run([], {});

    expect(executePendingMigrations).toHaveBeenCalledTimes(1);
    expect(hasInstanceAttempt).not.toHaveBeenCalled();
    expect(getActiveOrSuspendedWorkspaceIds).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'failed'] as const)(
    'blocks a %s R attempt before migrations even under --force with aligned historical receipts',
    async (status) => {
      const runMigrations = jest.fn();
      const runFastInstanceCommand = jest.fn();
      const getActiveOrSuspendedWorkspaceIds = jest.fn();
      const receipt = {
        name: LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
        status,
      };
      const hasInstanceAttempt = jest
        .fn()
        .mockImplementation(async (name) => receipt.name === name);
      const isLastAttemptCompleted = jest
        .fn()
        .mockImplementation(
          async ({ name }) =>
            name === receipt.name && receipt.status === 'completed',
        );
      const command = new RunInstanceCommandsCommand(
        { runMigrations } as unknown as DataSource,
        {
          getActiveOrSuspendedWorkspaceIds,
        } as unknown as WorkspaceVersionService,
        {} as UpgradeCommandRegistryService,
        {
          getUpgradeSequence: jest.fn(),
        } as unknown as UpgradeSequenceReaderService,
        { runFastInstanceCommand } as unknown as InstanceCommandRunnerService,
        {
          hasInstanceAttempt,
          isLastAttemptCompleted,
        } as unknown as UpgradeMigrationService,
        {
          invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
        } as unknown as UpgradeStatusService,
        {
          withLock: async (operation: () => Promise<unknown>) => operation(),
        } as never,
      );
      // A failed receipt is still present, even though it is not completed.
      await expect(
        command.run([], { force: true, includeSlow: true }),
      ).rejects.toThrow(/ordered upgrade route/);
      expect(hasInstanceAttempt).toHaveBeenCalledWith(
        LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
      );
      expect(isLastAttemptCompleted).not.toHaveBeenCalled();
      expect(runMigrations).not.toHaveBeenCalled();
      expect(runFastInstanceCommand).not.toHaveBeenCalled();
      expect(getActiveOrSuspendedWorkspaceIds).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['failed Rebrand retry', 'failed', false],
    ['later cursor with partial prerequisites', 'completed', true],
  ])(
    'rejects %s before TypeORM migrations or forced replay',
    async (_scenario, rebrandStatus, auditCompleted) => {
      const runMigrations = jest.fn();
      const runFastInstanceCommand = jest.fn();
      const command = new RunInstanceCommandsCommand(
        { runMigrations } as unknown as DataSource,
        {} as WorkspaceVersionService,
        {} as UpgradeCommandRegistryService,
        {
          getUpgradeSequence: jest.fn(),
        } as unknown as UpgradeSequenceReaderService,
        { runFastInstanceCommand } as unknown as InstanceCommandRunnerService,
        {
          hasInstanceAttempt: jest
            .fn()
            .mockImplementation(async (name) => name === rebrandName),
          isLastAttemptCompleted: jest
            .fn()
            .mockImplementation(async ({ name }) =>
              name === rebrandName
                ? rebrandStatus === 'completed'
                : name === auditName && auditCompleted,
            ),
        } as unknown as UpgradeMigrationService,
        {
          invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
        } as unknown as UpgradeStatusService,
        {
          withLock: async (operation: () => Promise<unknown>) => operation(),
        } as never,
      );

      await expect(
        command.run([], { force: true, includeSlow: true }),
      ).rejects.toThrow(/ordered upgrade route/);
      expect(runMigrations).not.toHaveBeenCalled();
      expect(runFastInstanceCommand).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'successful 166',
      '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001',
      'completed',
    ],
    [
      'failed 167',
      '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
      'failed',
    ],
  ])(
    'blocks the historical receipt hole after %s before any writes or workspace safety check',
    async (_scenario, lastName, lastStatus) => {
      const globalReceipts = [
        { name: rebrandName, status: 'completed' },
        { name: lastName, status: lastStatus },
      ];
      const runMigrations = jest.fn();
      const getActiveOrSuspendedWorkspaceIds = jest.fn();
      const runFastInstanceCommand = jest.fn();
      const getUpgradeSequence = jest.fn();
      const invalidateInstanceAndAllWorkspacesStatus = jest
        .fn()
        .mockResolvedValue(undefined);
      const isLastAttemptCompleted = jest
        .fn()
        .mockImplementation(async ({ name, workspaceId }) => {
          expect(workspaceId).toBeNull();
          return (
            globalReceipts.find((receipt) => receipt.name === name)?.status ===
            'completed'
          );
        });
      const command = new RunInstanceCommandsCommand(
        { runMigrations } as unknown as DataSource,
        {
          getActiveOrSuspendedWorkspaceIds,
        } as unknown as WorkspaceVersionService,
        {
          getLastWorkspaceCommandForVersion: jest.fn(),
        } as unknown as UpgradeCommandRegistryService,
        { getUpgradeSequence } as unknown as UpgradeSequenceReaderService,
        { runFastInstanceCommand } as unknown as InstanceCommandRunnerService,
        {
          isLastAttemptCompleted,
          hasInstanceAttempt: jest
            .fn()
            .mockImplementation(async (name) => name === rebrandName),
        } as unknown as UpgradeMigrationService,
        {
          invalidateInstanceAndAllWorkspacesStatus,
        } as unknown as UpgradeStatusService,
        {
          withLock: async (operation: () => Promise<unknown>) => operation(),
        } as never,
      );

      await expect(
        command.run([], { force: true, includeSlow: true }),
      ).rejects.toThrow(/run-instance-commands.*ordered upgrade/i);
      await expect(command.run([], { includeSlow: true })).rejects.toThrow(
        /run-instance-commands.*ordered upgrade/i,
      );
      expect(isLastAttemptCompleted).toHaveBeenCalledWith({
        name: auditName,
        workspaceId: null,
      });
      expect(getActiveOrSuspendedWorkspaceIds).not.toHaveBeenCalled();
      expect(runMigrations).not.toHaveBeenCalled();
      expect(getUpgradeSequence).not.toHaveBeenCalled();
      expect(runFastInstanceCommand).not.toHaveBeenCalled();
      expect(invalidateInstanceAndAllWorkspacesStatus).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['fresh zero-workspace initialization', false, false],
    ['aligned historical receipts', true, true],
  ])('preserves %s', async (_case, rebrandCompleted, auditCompleted) => {
    const runMigrations = jest.fn().mockResolvedValue([]);
    const runFastInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const getActiveOrSuspendedWorkspaceIds = jest.fn().mockResolvedValue([]);
    const isLastAttemptCompleted = jest
      .fn()
      .mockImplementation(async () => auditCompleted);
    const command = new RunInstanceCommandsCommand(
      { runMigrations } as unknown as DataSource,
      {
        getActiveOrSuspendedWorkspaceIds,
      } as unknown as WorkspaceVersionService,
      {} as UpgradeCommandRegistryService,
      {
        getUpgradeSequence: jest
          .fn()
          .mockReturnValue([
            { kind: 'fast-instance', command: {}, name: 'next' },
          ]),
      } as unknown as UpgradeSequenceReaderService,
      { runFastInstanceCommand } as unknown as InstanceCommandRunnerService,
      {
        isLastAttemptCompleted,
        hasInstanceAttempt: jest
          .fn()
          .mockImplementation(
            async (name) => name === rebrandName && rebrandCompleted,
          ),
      } as unknown as UpgradeMigrationService,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest
          .fn()
          .mockResolvedValue(undefined),
      } as unknown as UpgradeStatusService,
      {
        withLock: async (operation: () => Promise<unknown>) => operation(),
        currentRunner: () => ({}) as QueryRunner,
      } as never,
    );

    await command.run([], { includeSlow: true });

    expect(runMigrations).not.toHaveBeenCalled();
    expect(runFastInstanceCommand).toHaveBeenCalledTimes(1);
    expect(getActiveOrSuspendedWorkspaceIds).toHaveBeenCalledTimes(2);
    expect(isLastAttemptCompleted).toHaveBeenCalledTimes(
      rebrandCompleted ? 11 : 0,
    );
  });
  it('runs opted-in slow data migrations without active workspaces', async () => {
    const rebrandCommand = {
      down: jest.fn().mockResolvedValue(undefined),
      runDataMigration: jest.fn().mockResolvedValue(undefined),
      runDataMigrationWithoutWorkspaces: true,
      up: jest.fn().mockResolvedValue(undefined),
    } satisfies SlowInstanceCommand & {
      runDataMigrationWithoutWorkspaces: boolean;
    };
    const runSlowInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });

    const command = new RunInstanceCommandsCommand(
      {
        runMigrations: jest.fn().mockResolvedValue([]),
      } as unknown as DataSource,
      {
        getActiveOrSuspendedWorkspaceIds: jest.fn().mockResolvedValue([]),
      } as unknown as WorkspaceVersionService,
      {} as UpgradeCommandRegistryService,
      {
        getUpgradeSequence: jest.fn().mockReturnValue([
          {
            command: rebrandCommand,
            kind: 'slow-instance',
            name: 'rebrand-email-sender-to-myah',
            timestamp: 1784005792206,
            version: '2.19.0',
          },
        ]),
      } as unknown as UpgradeSequenceReaderService,
      {
        runSlowInstanceCommand,
      } as unknown as InstanceCommandRunnerService,
      {
        isLastAttemptCompleted: jest.fn().mockResolvedValue(false),
        hasInstanceAttempt: jest.fn().mockResolvedValue(false),
      } as unknown as UpgradeMigrationService,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest
          .fn()
          .mockResolvedValue(undefined),
      } as unknown as UpgradeStatusService,
      {
        withLock: async (operation: () => Promise<unknown>) => operation(),
        currentRunner: () => ({}) as QueryRunner,
      } as never,
    );

    await command.run([], { force: true, includeSlow: true });

    expect(runSlowInstanceCommand).toHaveBeenCalledWith({
      command: rebrandCommand,
      name: 'rebrand-email-sender-to-myah',
      skipDataMigration: false,
    });
  });

  it('recovers the approval schema before adding provider bindings', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValue(undefined);

    await new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "core"."instagramReplyApprovalRequest"',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      9,
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text',
    );
    expect(query).toHaveBeenNthCalledWith(
      10,
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text',
    );
    expect(query).toHaveBeenCalledTimes(10);
  });

  it('repairs the approval schema before a post-workspace migration can run', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new RepairInstagramReplyApprovalSchemaFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "core"."instagramReplyExecutionReceipt" DROP CONSTRAINT IF EXISTS "FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST"',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text',
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text',
    );
  });

  it('recreates the missing Instagram reply audit schema for a failed pending check', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new PendingMigrationCheckFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(7);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'CREATE TYPE "core"."instagramReplyApprovalRequest_state_enum"',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "core"."instagramReplyApprovalRequest"',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "core"."instagramReplyExecutionReceipt"',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining(
        'ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83"',
      ),
    );
  });
});
