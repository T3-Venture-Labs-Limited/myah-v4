import {
  type WorkspaceIteratorService,
  type WorkspaceIteratorReport,
} from 'src/database/commands/command-runners/workspace-iterator.service';
import { RepairOrphanedObjectNavigationCommandsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788766265947-repair-orphaned-object-navigation-commands.command';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { type InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
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
    const executedSteps: string[] = [];
    const runFastInstanceCommand = jest.fn(
      async ({ name }: { name: string }) => {
        executedSteps.push(name);

        return { status: 'success' };
      },
    );
    const runSlowInstanceCommand = jest.fn(
      async ({ name }: { name: string }) => {
        executedSteps.push(name);

        return { status: 'success' };
      },
    );
    const runWorkspaceCommands = jest.fn(
      async ({
        workspaceCommands,
      }: {
        workspaceCommands: Array<{ name: string }>;
      }) => {
        executedSteps.push(...workspaceCommands.map(({ name }) => name));
      },
    );
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

    expect(runFastInstanceCommand).toHaveBeenCalledTimes(1);
    expect(runFastInstanceCommand).toHaveBeenCalledWith({
      command: repair.command,
      name: repair.name,
    });
    expect(runSlowInstanceCommand).toHaveBeenCalledTimes(1);
    expect(runSlowInstanceCommand).toHaveBeenCalledWith({
      command: providerBinding.command,
      name: providerBinding.name,
      skipDataMigration: false,
    });
    expect(runWorkspaceCommands).toHaveBeenCalledTimes(1);
    expect(runWorkspaceCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {} satisfies ParsedUpgradeCommandOptions,
        workspaceCommands: [
          expect.objectContaining({ name: workspaceCommand.name }),
        ],
      }),
    );
    expect(executedSteps).toStrictEqual([
      repair.name,
      providerBinding.name,
      workspaceCommand.name,
    ]);
  });
  it('simulates across an instance barrier without executing instance commands', async () => {
    const firstWorkspaceCommand = {
      command: {},
      name: '2.19.0_FirstWorkspaceCommand_1784113000000',
      timestamp: 1784113000000,
      version: VERSION,
    };
    const secondWorkspaceCommand = {
      command: {},
      name: '2.19.0_SecondWorkspaceCommand_1784113000001',
      timestamp: 1784113000001,
      version: VERSION,
    };
    const nextVersionFastInstanceCommand = {
      command: {},
      name: '2.20.0_NextVersionFastInstanceCommand_1784113000002',
      timestamp: 1784113000002,
      version: '2.20.0',
    };
    const nextVersionSlowInstanceCommand = {
      command: {},
      name: '2.20.0_NextVersionSlowInstanceCommand_1784113000003',
      timestamp: 1784113000003,
      version: '2.20.0',
    };
    const sequenceReader = new UpgradeSequenceReaderService({
      getBundleForVersion: (version: string) => {
        if (version === VERSION) {
          return {
            fastInstanceCommands: [],
            slowInstanceCommands: [],
            workspaceCommands: [firstWorkspaceCommand, secondWorkspaceCommand],
          };
        }

        if (version === '2.20.0') {
          return {
            fastInstanceCommands: [nextVersionFastInstanceCommand],
            slowInstanceCommands: [nextVersionSlowInstanceCommand],
            workspaceCommands: [],
          };
        }

        return {
          fastInstanceCommands: [],
          slowInstanceCommands: [],
          workspaceCommands: [],
        };
      },
    } as unknown as UpgradeCommandRegistryService);
    const sequence = sequenceReader.getUpgradeSequence();
    const runFastInstanceCommand = jest.fn();
    const runSlowInstanceCommand = jest.fn();
    const runWorkspaceCommands = jest.fn().mockResolvedValue(undefined);
    const workspaceCursors = new Map([
      [
        WORKSPACE_ID,
        {
          createdAt: new Date(),
          errorMessage: null,
          executedByVersion: VERSION,
          isInitial: false,
          name: firstWorkspaceCommand.name,
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
          name: firstWorkspaceCommand.name,
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

    await expect(
      runner.run({ options: { dryRun: true }, sequence }),
    ).resolves.toEqual({
      totalFailures: 0,
      totalSuccesses: 1,
    });

    expect(runWorkspaceCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { dryRun: true } satisfies ParsedUpgradeCommandOptions,
        workspaceCommands: [
          expect.objectContaining({ name: secondWorkspaceCommand.name }),
        ],
      }),
    );
    expect(runFastInstanceCommand).not.toHaveBeenCalled();
    expect(runSlowInstanceCommand).not.toHaveBeenCalled();
  });
});

describe('UpgradeSequenceRunnerService orphaned object-navigation repair delivery', () => {
  it.each([false, true])(
    'resumes the actual latest completed 2.20 cursor through the real command and workspace runner (dryRun=%s)',
    async (dryRun) => {
      const previousCommandName =
        '2.20.0_SynchronizeMyahCampaignAccountMetadataCommand_1788537600000';
      const repairCommandName =
        '2.20.0_RepairOrphanedObjectNavigationCommandsCommand_1788766265947';
      const previousRunOnWorkspace = jest.fn();
      const migrate = jest.fn();
      const emptyMaps = {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      };
      const command = new RepairOrphanedObjectNavigationCommandsCommand(
        {} as WorkspaceIteratorService,
        {
          findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
            .fn()
            .mockResolvedValue({
              twentyStandardFlatApplication: {
                id: 'standard-app',
                universalIdentifier: 'standard-app-uid',
              },
            }),
        } as unknown as ApplicationService,
        {
          getOrRecompute: jest.fn().mockResolvedValue({
            flatObjectMetadataMaps: emptyMaps,
            flatCommandMenuItemMaps: emptyMaps,
          }),
        } as unknown as WorkspaceCacheService,
        {
          validateBuildAndRunWorkspaceMigration: migrate,
        } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      );
      const runOnWorkspace = jest.spyOn(command, 'runOnWorkspace');
      const sequenceReader = new UpgradeSequenceReaderService({
        getBundleForVersion: (version: string) => ({
          fastInstanceCommands: [],
          slowInstanceCommands: [],
          workspaceCommands:
            version === '2.20.0'
              ? [
                  {
                    command: { runOnWorkspace: previousRunOnWorkspace },
                    name: previousCommandName,
                    timestamp: 1788537600000,
                    version: '2.20.0',
                  },
                  {
                    command,
                    name: repairCommandName,
                    timestamp: 1788766265947,
                    version: '2.20.0',
                  },
                ]
              : [],
        }),
      } as unknown as UpgradeCommandRegistryService);
      const recordUpgradeMigration = jest.fn().mockResolvedValue(undefined);
      const invalidateInstanceAndAllWorkspacesStatus = jest
        .fn()
        .mockResolvedValue(undefined);
      const workspaceCursors = new Map([
        [
          WORKSPACE_ID,
          {
            createdAt: new Date('2026-09-04T00:00:00.000Z'),
            errorMessage: null,
            executedByVersion: '2.20.0',
            isInitial: false,
            name: previousCommandName,
            status: 'completed' as const,
            workspaceId: WORKSPACE_ID,
          },
        ],
      ]);
      const upgradeMigrationService = {
        getLastAttemptedCommandNameOrThrow: jest.fn().mockResolvedValue({
          name: previousCommandName,
          status: 'completed',
        }),
        getWorkspaceLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue(workspaceCursors),
        recordUpgradeMigration,
      } as unknown as UpgradeMigrationService;
      const workspaceRunner = new WorkspaceCommandRunnerService(
        {
          get: jest.fn().mockReturnValue('2.20.0'),
        } as unknown as TwentyConfigService,
        upgradeMigrationService,
        {
          invalidateInstanceAndAllWorkspacesStatus,
        } as unknown as UpgradeStatusService,
      );
      const iterate = jest.fn(async ({ callback }) => {
        await callback({ index: 0, total: 1, workspaceId: WORKSPACE_ID });
        return {
          fail: [],
          success: [{ workspaceId: WORKSPACE_ID }],
        } satisfies WorkspaceIteratorReport;
      });
      const getActiveOrSuspendedWorkspaceIds = jest
        .fn()
        .mockResolvedValue([WORKSPACE_ID]);
      const runFastInstanceCommand = jest.fn();
      const runSlowInstanceCommand = jest.fn();
      const runner = new UpgradeSequenceRunnerService(
        upgradeMigrationService,
        {
          runFastInstanceCommand,
          runSlowInstanceCommand,
        } as unknown as InstanceCommandRunnerService,
        workspaceRunner,
        sequenceReader,
        {
          refresh: jest.fn().mockResolvedValue(undefined),
        } as unknown as UpgradeAwareEntityMetadataAdapter,
        { iterate } as unknown as WorkspaceIteratorService,
        {
          getActiveOrSuspendedWorkspaceIds,
        } as unknown as WorkspaceVersionService,
      );
      const options = dryRun ? { dryRun: true } : {};
      await expect(
        runner.run({ options, sequence: sequenceReader.getUpgradeSequence() }),
      ).resolves.toEqual({ totalSuccesses: 1, totalFailures: 0 });
      expect(getActiveOrSuspendedWorkspaceIds).toHaveBeenCalled();
      expect(iterate).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceIds: [WORKSPACE_ID],
          dryRun: options.dryRun,
        }),
      );
      expect(previousRunOnWorkspace).not.toHaveBeenCalled();
      expect(runFastInstanceCommand).not.toHaveBeenCalled();
      expect(runSlowInstanceCommand).not.toHaveBeenCalled();
      expect(runOnWorkspace).toHaveBeenCalledTimes(1);
      expect(runOnWorkspace).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        options,
        dataSource: undefined,
        index: 0,
        total: 1,
      });
      expect(migrate).not.toHaveBeenCalled();
      if (dryRun) {
        expect(recordUpgradeMigration).not.toHaveBeenCalled();
        expect(invalidateInstanceAndAllWorkspacesStatus).not.toHaveBeenCalled();
        expect(workspaceCursors.get(WORKSPACE_ID)?.name).toBe(
          previousCommandName,
        );
      } else {
        expect(recordUpgradeMigration).toHaveBeenCalledTimes(1);
        expect(recordUpgradeMigration).toHaveBeenCalledWith({
          name: repairCommandName,
          workspaceIds: [WORKSPACE_ID],
          isInstance: false,
          status: 'completed',
          executedByVersion: '2.20.0',
        });
        expect(invalidateInstanceAndAllWorkspacesStatus).toHaveBeenCalledTimes(
          1,
        );
        expect(recordUpgradeMigration.mock.invocationCallOrder[0]).toBeLessThan(
          invalidateInstanceAndAllWorkspacesStatus.mock.invocationCallOrder[0],
        );
      }
    },
  );
});
