import { type DataSource } from 'typeorm';

import { RunInstanceCommandsCommand } from 'src/database/commands/run-instance-commands.command';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
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
});
