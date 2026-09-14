import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { DiscoveryService } from '@nestjs/core';
import { CreateUnipileInstagramFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619348-create-unipile-instagram-foundation';
import { InvalidateComposioInstagramAuthoritiesSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1789307619363-invalidate-composio-instagram-authorities';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { type WorkspaceIteratorReport } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
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

const INSTAGRAM_SLOW_D =
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';
const INSTAGRAM_WORKSPACE_D =
  '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000';

// Reflect real command prototypes only; these fixtures never invoke production command bodies.
const buildInstagramSequenceReader = () => {
  const providers = [
    CreateUnipileInstagramFoundationFastInstanceCommand,
    InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
    BackfillComposioInstagramHistoryWorkspaceCommand,
  ].map((metatype) => ({
    metatype,
    instance: Object.create(metatype.prototype),
  }));
  const registry = new UpgradeCommandRegistryService({
    getProviders: () => providers,
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  const reader = new UpgradeSequenceReaderService(registry);
  expect(reader.getUpgradeSequence().map(({ timestamp }) => timestamp)).toEqual(
    [1789307619348, 1789307619363, 1789307619373],
  );
  return reader;
};

describe('Instagram durable resume boundaries', () => {
  it.each([
    {
      label: 'saved slow plus initial backfill',
      globalName: INSTAGRAM_SLOW_D,
      status: 'completed',
      isInitial: true,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [],
    },
    {
      label: 'noninitial completed workspace',
      globalName: INSTAGRAM_WORKSPACE_D,
      status: 'completed',
      isInitial: false,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [],
    },
    {
      label: 'failed instance retries D',
      globalName: INSTAGRAM_SLOW_D,
      status: 'failed',
      isInitial: true,
      zeroWorkspaces: false,
      expectedInstance: [INSTAGRAM_SLOW_D],
      expectedWorkspace: [],
    },
    {
      label: 'failed workspace retries D',
      globalName: INSTAGRAM_WORKSPACE_D,
      status: 'failed',
      isInitial: false,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [INSTAGRAM_WORKSPACE_D],
    },
    {
      label: 'zero workspaces completed slow',
      globalName: INSTAGRAM_SLOW_D,
      status: 'completed',
      isInitial: false,
      zeroWorkspaces: true,
      expectedInstance: [],
      expectedWorkspace: [],
    },
  ] as const)('$label', async (scenario) => {
    const reader = buildInstagramSequenceReader();
    const workspaceIds = scenario.zeroWorkspaces ? [] : [WORKSPACE_ID];
    const historicalCursor = Object.freeze({
      id: 'saved-row',
      attempt: 1,
      workspaceId: WORKSPACE_ID,
      name: INSTAGRAM_WORKSPACE_D,
      status:
        scenario.globalName === INSTAGRAM_WORKSPACE_D
          ? scenario.status
          : 'completed',
      isInitial: scenario.isInitial,
      createdAt: new Date('2026-09-12T00:00:00Z'),
      errorMessage: null,
      executedByVersion: '2.20.0',
    });
    const original = { ...historicalCursor };
    const runFastInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runSlowInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runWorkspaceCommands = jest.fn().mockResolvedValue(undefined);
    const runner = new UpgradeSequenceRunnerService(
      {
        getLastAttemptedCommandNameOrThrow: jest.fn().mockResolvedValue({
          name: scenario.globalName,
          status: scenario.status,
        }),
        getWorkspaceLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue(
            new Map(workspaceIds.map((id) => [id, historicalCursor])),
          ),
      } as unknown as UpgradeMigrationService,
      {
        runFastInstanceCommand,
        runSlowInstanceCommand,
      } as unknown as InstanceCommandRunnerService,
      { runWorkspaceCommands } as unknown as WorkspaceCommandRunnerService,
      reader,
      { refresh: jest.fn() } as unknown as UpgradeAwareEntityMetadataAdapter,
      {
        iterate: jest.fn(async ({ callback }) => {
          for (const workspaceId of workspaceIds)
            await callback({ workspaceId, index: 0, total: 1 });
          return {
            fail: [],
            success: workspaceIds.map((workspaceId) => ({ workspaceId })),
          };
        }),
      } as never,
      {
        getActiveOrSuspendedWorkspaceIds: jest
          .fn()
          .mockResolvedValue(workspaceIds),
      } as unknown as WorkspaceVersionService,
    );
    await expect(
      runner.run({ sequence: reader.getUpgradeSequence(), options: {} }),
    ).resolves.toEqual({
      totalFailures: 0,
      totalSuccesses: workspaceIds.length,
    });
    expect(runFastInstanceCommand).not.toHaveBeenCalled();
    expect(
      runSlowInstanceCommand.mock.calls.map(([entry]) => entry.name),
    ).toEqual(scenario.expectedInstance);
    expect(
      runWorkspaceCommands.mock.calls.flatMap(([args]) =>
        args.workspaceCommands.map(({ name }: { name: string }) => name),
      ),
    ).toEqual(scenario.expectedWorkspace);
    expect(historicalCursor).toEqual(original);
  });
});

const FORWARD_VERIFIER_E9 =
  '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534';
const buildForwardSequenceReader = () => {
  const providers = [
    CreateUnipileInstagramFoundationFastInstanceCommand,
    InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
    BackfillComposioInstagramHistoryWorkspaceCommand,
    VerifyInstagramSecurityCutoverWorkspaceCommand,
  ].map((metatype) => ({
    metatype,
    instance: Object.create(metatype.prototype),
  }));
  const registry = new UpgradeCommandRegistryService({
    getProviders: () => providers,
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  return new UpgradeSequenceReaderService(registry);
};
describe('Instagram appended verifier resume boundaries', () => {
  it.each([
    {
      label: 'saved slow plus initial backfill',
      globalName: INSTAGRAM_SLOW_D,
      status: 'completed',
      isInitial: true,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [FORWARD_VERIFIER_E9],
    },
    {
      label: 'noninitial completed workspace',
      globalName: INSTAGRAM_WORKSPACE_D,
      status: 'completed',
      isInitial: false,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [FORWARD_VERIFIER_E9],
    },
    {
      label: 'failed instance retries D',
      globalName: INSTAGRAM_SLOW_D,
      status: 'failed',
      isInitial: true,
      zeroWorkspaces: false,
      expectedInstance: [INSTAGRAM_SLOW_D],
      expectedWorkspace: [FORWARD_VERIFIER_E9],
    },
    {
      label: 'failed workspace retries D',
      globalName: INSTAGRAM_WORKSPACE_D,
      status: 'failed',
      isInitial: false,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [INSTAGRAM_WORKSPACE_D, FORWARD_VERIFIER_E9],
    },
    {
      label: 'failed verifier retries real E9',
      globalName: FORWARD_VERIFIER_E9,
      status: 'failed',
      isInitial: false,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [FORWARD_VERIFIER_E9],
    },
    {
      label: 'initial at new tail skips normal verification',
      globalName: INSTAGRAM_SLOW_D,
      workspaceName: FORWARD_VERIFIER_E9,
      status: 'completed',
      isInitial: true,
      zeroWorkspaces: false,
      expectedInstance: [],
      expectedWorkspace: [],
    },
    {
      label: 'zero workspaces completed slow',
      globalName: INSTAGRAM_SLOW_D,
      status: 'completed',
      isInitial: false,
      zeroWorkspaces: true,
      expectedInstance: [],
      expectedWorkspace: [],
    },
  ] as const)('$label', async (scenario) => {
    const reader = buildForwardSequenceReader();
    const workspaceIds = scenario.zeroWorkspaces ? [] : [WORKSPACE_ID];
    const historicalCursor = Object.freeze({
      id: 'saved-row',
      attempt: 1,
      workspaceId: WORKSPACE_ID,
      name:
        'workspaceName' in scenario
          ? scenario.workspaceName
          : scenario.globalName === FORWARD_VERIFIER_E9
            ? FORWARD_VERIFIER_E9
            : INSTAGRAM_WORKSPACE_D,
      status:
        scenario.globalName === INSTAGRAM_WORKSPACE_D ||
        scenario.globalName === FORWARD_VERIFIER_E9
          ? scenario.status
          : 'completed',
      isInitial: scenario.isInitial,
      createdAt: new Date('2026-09-12T00:00:00Z'),
      errorMessage: null,
      executedByVersion: '2.20.0',
    });
    const original = { ...historicalCursor };
    const runFastInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runSlowInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runWorkspaceCommands = jest.fn().mockResolvedValue(undefined);
    const runner = new UpgradeSequenceRunnerService(
      {
        getLastAttemptedCommandNameOrThrow: jest.fn().mockResolvedValue({
          name: scenario.globalName,
          status: scenario.status,
        }),
        getWorkspaceLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue(
            new Map(workspaceIds.map((id) => [id, historicalCursor])),
          ),
      } as unknown as UpgradeMigrationService,
      {
        runFastInstanceCommand,
        runSlowInstanceCommand,
      } as unknown as InstanceCommandRunnerService,
      { runWorkspaceCommands } as unknown as WorkspaceCommandRunnerService,
      reader,
      { refresh: jest.fn() } as unknown as UpgradeAwareEntityMetadataAdapter,
      {
        iterate: jest.fn(async ({ callback }) => {
          for (const workspaceId of workspaceIds)
            await callback({ workspaceId, index: 0, total: 1 });
          return {
            fail: [],
            success: workspaceIds.map((workspaceId) => ({ workspaceId })),
          };
        }),
      } as never,
      {
        getActiveOrSuspendedWorkspaceIds: jest
          .fn()
          .mockResolvedValue(workspaceIds),
      } as unknown as WorkspaceVersionService,
    );
    await expect(
      runner.run({ sequence: reader.getUpgradeSequence(), options: {} }),
    ).resolves.toEqual({
      totalFailures: 0,
      totalSuccesses: workspaceIds.length,
    });
    expect(runFastInstanceCommand).not.toHaveBeenCalled();
    expect(
      runSlowInstanceCommand.mock.calls.map(([entry]) => entry.name),
    ).toEqual(scenario.expectedInstance);
    expect(
      runWorkspaceCommands.mock.calls.flatMap(([args]) =>
        args.workspaceCommands.map(({ name }: { name: string }) => name),
      ),
    ).toEqual(scenario.expectedWorkspace);
    expect(historicalCursor).toEqual(original);
  });
});
