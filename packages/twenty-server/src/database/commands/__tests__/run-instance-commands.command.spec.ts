import { type DataSource, type QueryRunner } from 'typeorm';

import { RunInstanceCommandsCommand } from 'src/database/commands/run-instance-commands.command';
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
      {} as UpgradeMigrationService,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest
          .fn()
          .mockResolvedValue(undefined),
      } as unknown as UpgradeStatusService,
    );

    await command.run([], { force: true, includeSlow: true });

    expect(runSlowInstanceCommand).toHaveBeenCalledWith({
      command: rebrandCommand,
      name: 'rebrand-email-sender-to-myah',
      skipDataMigration: false,
    });
  });

  it('recovers the approval schema before adding provider bindings', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "core"."instagramReplyApprovalRequest"',
      ),
    );
    expect(query).toHaveBeenNthCalledWith(
      8,
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text',
    );
    expect(query).toHaveBeenNthCalledWith(
      9,
      'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text',
    );
    expect(query).toHaveBeenCalledTimes(9);
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
