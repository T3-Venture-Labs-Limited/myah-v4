import { type WorkspaceIteratorReport } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { type InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';
import { type WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { type UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { type WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

const VERSION = '2.19.0';
const WORKSPACE_ID = 'workspace-a';

const pendingCheck = {
  command: {},
  name: '2.19.0_PendingMigrationCheckFastInstanceCommand_1784112688976',
  timestamp: 1784112688976,
  version: VERSION,
};

const repair = {
  command: {},
  name: '2.19.0_RepairInstagramReplyApprovalSchemaFastInstanceCommand_1784112963055',
  timestamp: 1784112963055,
  version: VERSION,
};

const providerBinding = {
  command: {},
  name: '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001',
  timestamp: 1784106536001,
  version: VERSION,
};

const workspaceCommand = {
  command: {},
  name: '2.19.0_WorkspaceCommand_1784113000000',
  timestamp: 1784113000000,
  version: VERSION,
};

describe('UpgradeSequenceRunnerService', () => {
  it('resumes a completed pending check through repair, provider binding, and workspace commands', async () => {
    const sequenceReader = new UpgradeSequenceReaderService({
      getBundleForVersion: (version: string) =>
        version === VERSION
          ? {
              fastInstanceCommands: [pendingCheck, repair],
              slowInstanceCommands: [providerBinding],
              workspaceCommands: [workspaceCommand],
            }
          : {
              fastInstanceCommands: [],
              slowInstanceCommands: [],
              workspaceCommands: [],
            },
    } as unknown as UpgradeCommandRegistryService);
    const sequence = sequenceReader.getUpgradeSequence();
    const runFastInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runSlowInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runWorkspaceCommands = jest.fn().mockResolvedValue(undefined);
    const workspaceCursors = new Map([
      [
        WORKSPACE_ID,
        {
          createdAt: new Date(),
          errorMessage: null,
          executedByVersion: VERSION,
          isInitial: false,
          name: pendingCheck.name,
          status: 'completed' as const,
          workspaceId: WORKSPACE_ID,
        },
      ],
    ]);
    const iterate = jest.fn(async ({ callback }) => {
      await callback({
        index: 0,
        total: 1,
        workspaceId: WORKSPACE_ID,
      });

      return {
        fail: [],
        success: [{ workspaceId: WORKSPACE_ID }],
      } satisfies WorkspaceIteratorReport;
    });

    const runner = new UpgradeSequenceRunnerService(
      {
        getLastAttemptedCommandNameOrThrow: jest.fn().mockResolvedValue({
          name: pendingCheck.name,
          status: 'completed',
        }),
        getWorkspaceLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue(workspaceCursors),
      } as unknown as UpgradeMigrationService,
      {
        runFastInstanceCommand,
        runSlowInstanceCommand,
      } as unknown as InstanceCommandRunnerService,
      {
        runWorkspaceCommands,
      } as unknown as WorkspaceCommandRunnerService,
      sequenceReader,
      {
        refresh: jest.fn().mockResolvedValue(undefined),
      } as unknown as UpgradeAwareEntityMetadataAdapter,
      {
        iterate,
      } as never,
      {
        getActiveOrSuspendedWorkspaceIds: jest
          .fn()
          .mockResolvedValue([WORKSPACE_ID]),
      } as unknown as WorkspaceVersionService,
    );

    await expect(runner.run({ options: {}, sequence })).resolves.toEqual({
      totalFailures: 0,
      totalSuccesses: 1,
    });

    expect(runFastInstanceCommand).toHaveBeenCalledWith({
      command: repair.command,
      name: repair.name,
    });
    expect(runSlowInstanceCommand).toHaveBeenCalledWith({
      command: providerBinding.command,
      name: providerBinding.name,
      skipDataMigration: false,
    });
    expect(runWorkspaceCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {} satisfies ParsedUpgradeCommandOptions,
        workspaceCommands: [
          expect.objectContaining({ name: workspaceCommand.name }),
        ],
      }),
    );
  });
});
