import { type DataSource, type QueryRunner } from 'typeorm';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { DatabaseCommandModule } from 'src/database/commands/database-command.module';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { CreateMyahCampaignReplyEvidenceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790141137300-create-myah-campaign-reply-evidence';

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
  it('registers additive reply-evidence schema without scheduling standalone backfill', () => {
    const providers: Function[] = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    );
    const names = providers.map((provider) => provider.name);

    expect(names).toContain(
      'CreateMyahCampaignReplyEvidenceFastInstanceCommand',
    );
    expect(names).not.toContain(
      'MyahInboxBackfillCampaignReplyEvidenceCommand',
    );
    const cliProviders: Function[] = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DatabaseCommandModule,
    );
    expect(cliProviders.map((provider) => provider.name)).toContain(
      'MyahInboxBackfillCampaignReplyEvidenceCommand',
    );
  });

  it('creates unique evidence and pending rows per inbound without backfilling', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new CreateMyahCampaignReplyEvidenceFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    const statements = query.mock.calls.map(([sql]: [string]) => sql);

    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PRIMARY KEY ("workspaceId", "messageId")'),
        expect.stringContaining('"candidateAttemptIds" uuid[] NOT NULL'),
        expect.stringContaining(
          'BEFORE UPDATE ON core."myahCampaignReplyEvidence"',
        ),
      ]),
    );
    expect(statements.join('\n')).not.toMatch(
      /INSERT INTO|SELECT.*FROM core\."outboundEmailAttempt"/i,
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
