import { MODULE_METADATA } from '@nestjs/common/constants';
import { type DataSource } from 'typeorm';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { MigrateManagedEmailPaymentReceiptsSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1786000004001-migrate-managed-email-payment-receipts';
import { CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911003-create-myah-inbox-email-general-provenance';
import { CreateCampaignForecastProjectionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172618-create-campaign-forecast-projection';
import { AddConnectedAccountSendingPolicyRevisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172619-add-connected-account-sending-policy-revision';
import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { AddCampaignReplyAmbiguitySnapshotFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000002-add-campaign-reply-ambiguity-snapshot';
import { CreateCampaignEmailBaselineFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000004-create-campaign-email-baseline';
import { AddCampaignEmailAccountIncarnationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000005-add-campaign-email-account-incarnation';
import { AddCampaignEmailWorkIdentityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000006-add-campaign-email-work-identity';
import { CreateCampaignEmailWorkCollisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000007-create-campaign-email-work-collision';
import { SynchronizeMyahPartnershipFactsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789730000001-synchronize-myah-partnership-facts.command';
import { SynchronizeCampaignReplyAuthorityCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000003-synchronize-campaign-reply-authority.command';
import { DiscoveryService } from '@nestjs/core';
import { CreateUnipileInstagramFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619348-create-unipile-instagram-foundation';
import { InvalidateComposioInstagramAuthoritiesSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1789307619363-invalidate-composio-instagram-authorities';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { RepairOrphanedObjectNavigationCommandsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788766265947-repair-orphaned-object-navigation-commands.command';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import {
  type WorkspaceIteratorService,
  type WorkspaceIteratorReport,
} from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { type InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import {
  UpgradeSequenceReaderService,
  type UpgradeStep,
} from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
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

const B_NAME = '2.20.0_SynchronizeMyahPartnershipFactsCommand_1789730000001';
const REPLY_TAIL =
  '2.20.0_SynchronizeCampaignReplyAuthorityCommand_1790000000003';
const F_NAME =
  '2.20.0_CreateCampaignPartnershipWorkItemFastInstanceCommand_1790000000001';
const G_NAME =
  '2.20.0_AddCampaignReplyAmbiguitySnapshotFastInstanceCommand_1790000000002';
const EMAIL_BASELINE =
  '2.20.0_CreateCampaignEmailBaselineFastInstanceCommand_1790000000004';
const EMAIL_ACCOUNT_INCARNATION =
  '2.20.0_AddCampaignEmailAccountIncarnationFastInstanceCommand_1790000000005';
const EMAIL_WORK_IDENTITY =
  '2.20.0_AddCampaignEmailWorkIdentityFastInstanceCommand_1790000000006';
const EMAIL_WORK_COLLISION =
  '2.20.0_CreateCampaignEmailWorkCollisionFastInstanceCommand_1790000000007';
const BEFORE_F =
  '2.20.0_CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand_1789645911003';
const FORECAST =
  '2.20.0_CreateCampaignForecastProjectionFastInstanceCommand_1789992172618';
const POLICY =
  '2.20.0_AddConnectedAccountSendingPolicyRevisionFastInstanceCommand_1789992172619';
const PAYMENT_SLOW =
  '2.20.0_MigrateManagedEmailPaymentReceiptsSlowInstanceCommand_1786000004001';
// The registry retains the earlier durable Instagram identity, not its new scheduling timestamp.
const INSTAGRAM_SLOW =
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';
const BROAD = '2.20.0_SynchronizeMyahStandardMetadataCommand_1784266302001';
const OLD_BROAD =
  '2.19.0_ResynchronizeMyahStandardApplicationCommand_1785453080000';
const WORKSPACE_A = '00000000-0000-4000-8000-000000000001';
const WORKSPACE_B = '00000000-0000-4000-8000-000000000002';

// The reader groups every 2.20 fast command before both slow commands and workspace B/reply.
const replySequence = [
  [OLD_BROAD, 'workspace'],
  [BROAD, 'workspace'],
  [BEFORE_F, 'fast-instance'],
  [FORECAST, 'fast-instance'],
  [POLICY, 'fast-instance'],
  [F_NAME, 'fast-instance'],
  [G_NAME, 'fast-instance'],
  [EMAIL_BASELINE, 'fast-instance'],
  [EMAIL_ACCOUNT_INCARNATION, 'fast-instance'],
  [EMAIL_WORK_IDENTITY, 'fast-instance'],
  [EMAIL_WORK_COLLISION, 'fast-instance'],
  [PAYMENT_SLOW, 'slow-instance'],
  [INSTAGRAM_SLOW, 'slow-instance'],
  [B_NAME, 'workspace'],
  [REPLY_TAIL, 'workspace'],
].map(
  ([name, kind], timestamp) =>
    ({
      kind,
      name,
      command:
        kind === 'slow-instance'
          ? { runDataMigrationWithoutWorkspaces: true }
          : {},
      timestamp,
      version: '2.20.0',
    }) as UpgradeStep,
);

const fullRegisteredReplySequence = (): UpgradeStep[] => {
  const workspaceProviders = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    V2_20_UpgradeVersionCommandModule,
  ) as Function[];
  const providers = [
    ...new Set([
      ...INSTANCE_COMMANDS.filter(
        (metatype) =>
          getRegisteredInstanceCommandMetadata(metatype)?.version === '2.20.0',
      ),
      ...workspaceProviders,
    ]),
  ];
  const registry = new UpgradeCommandRegistryService({
    getProviders: () =>
      providers.map((metatype) => ({
        metatype,
        instance: Object.create(metatype.prototype),
      })),
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  const sequence = new UpgradeSequenceReaderService(
    registry,
  ).getUpgradeSequence();
  return [{ ...replySequence[0], version: '2.19.0' }, ...sequence]; // Minimal earlier prefix; 2.20 is wholly registered.
};

describe('MYAH-334 pre-mutation native upgrade admission', () => {
  it('models the registered fast, slow and workspace tail with durable identities', () => {
    const metatypes = [
      CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand,
      CreateCampaignForecastProjectionFastInstanceCommand,
      AddConnectedAccountSendingPolicyRevisionFastInstanceCommand,
      CreateCampaignPartnershipWorkItemFastInstanceCommand,
      AddCampaignReplyAmbiguitySnapshotFastInstanceCommand,
      CreateCampaignEmailBaselineFastInstanceCommand,
      AddCampaignEmailAccountIncarnationFastInstanceCommand,
      AddCampaignEmailWorkIdentityFastInstanceCommand,
      CreateCampaignEmailWorkCollisionFastInstanceCommand,
      MigrateManagedEmailPaymentReceiptsSlowInstanceCommand,
      InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
      SynchronizeMyahPartnershipFactsCommand,
      SynchronizeCampaignReplyAuthorityCommand,
    ];
    const registry = new UpgradeCommandRegistryService({
      getProviders: () =>
        metatypes.map((metatype) => ({
          metatype,
          instance: Object.create(metatype.prototype),
        })),
    } as unknown as DiscoveryService);
    registry.onModuleInit();
    expect(
      new UpgradeSequenceReaderService(registry)
        .getUpgradeSequence()
        .map(({ name, kind }) => [name, kind]),
    ).toEqual(replySequence.slice(2).map(({ name, kind }) => [name, kind]));
  });

  const receipt = (
    workspaceId: string | null,
    name: string,
    status: 'completed' | 'failed' = 'completed',
    isInitial = false,
  ) => ({
    id: `${workspaceId}-${name}-${status}`,
    workspaceId,
    name,
    status,
    isInitial,
    attempt: 1,
    createdAt: new Date('2026-09-27'),
  });
  const initial = (id: string, name = REPLY_TAIL) =>
    receipt(id, name, 'completed', true);
  const setup = ({
    workspaces = [WORKSPACE_A],
    globalName = INSTAGRAM_SLOW,
    histories = new Map<string | null, ReturnType<typeof receipt>[]>([
      [
        null,
        [
          receipt(null, BEFORE_F),
          receipt(null, FORECAST),
          receipt(null, POLICY),
          receipt(null, F_NAME),
          receipt(null, G_NAME),
          receipt(null, EMAIL_BASELINE),
          receipt(null, EMAIL_ACCOUNT_INCARNATION),
          receipt(null, EMAIL_WORK_IDENTITY),
          receipt(null, EMAIL_WORK_COLLISION),
          receipt(null, PAYMENT_SLOW),
          receipt(null, INSTAGRAM_SLOW),
        ],
      ],
      [WORKSPACE_A, [initial(WORKSPACE_A)]],
    ]),
    sequence = replySequence,
  }: {
    workspaces?: string[];
    globalName?: string;
    histories?: Map<string | null, ReturnType<typeof receipt>[]>;
    sequence?: typeof replySequence;
  } = {}) => {
    const runFastInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runSlowInstanceCommand = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const runWorkspaceCommands = jest.fn();
    const recordUpgradeMigration = jest.fn();
    const queryRunner = {
      connect: jest.fn(),
      release: jest.fn(),
      isReleased: false,
    };
    const getScopedUpgradeReceiptHistories = jest
      .fn()
      .mockResolvedValue(histories);
    const runner = new UpgradeSequenceRunnerService(
      {
        getLastAttemptedCommandNameOrThrow: jest.fn().mockResolvedValue({
          name: globalName,
          status: 'completed',
        }),
        getWorkspaceLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue(
            new Map(
              workspaces.map((id) => [
                id,
                {
                  ...(histories.get(id)?.slice(-1)[0] ?? initial(id)),
                  executedByVersion: '2.20.0',
                  errorMessage: null,
                },
              ]),
            ),
          ),
        getScopedUpgradeReceiptHistories,
        recordUpgradeMigration,
      } as unknown as UpgradeMigrationService,
      {
        runFastInstanceCommand,
        runSlowInstanceCommand,
      } as unknown as InstanceCommandRunnerService,
      { runWorkspaceCommands } as unknown as WorkspaceCommandRunnerService,
      new UpgradeSequenceReaderService({} as UpgradeCommandRegistryService),
      { refresh: jest.fn() } as unknown as UpgradeAwareEntityMetadataAdapter,
      {
        iterate: jest.fn(async ({ callback }) => {
          for (const [index, workspaceId] of workspaces.entries()) {
            await callback({ workspaceId, index, total: workspaces.length });
          }
          return {
            fail: [],
            success: workspaces.map((workspaceId) => ({ workspaceId })),
          };
        }),
      } as never,
      {
        getActiveOrSuspendedWorkspaceIds: jest
          .fn()
          .mockResolvedValue(workspaces),
      } as unknown as WorkspaceVersionService,
      {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
    );
    return {
      runner,
      sequence,
      runFastInstanceCommand,
      runSlowInstanceCommand,
      runWorkspaceCommands,
      recordUpgradeMigration,
      queryRunner,
      histories,
      getScopedUpgradeReceiptHistories,
    };
  };

  it('adopts the full registered 2.20 shape and repeats a clean reply-initial workspace without B', async () => {
    const sequence = fullRegisteredReplySequence();
    const workspaceSteps = sequence.filter(
      (step) => step.version === '2.20.0' && step.kind === 'workspace',
    );
    expect(workspaceSteps).toHaveLength(29);
    expect(workspaceSteps.slice(-2).map(({ name }) => name)).toEqual([
      B_NAME,
      REPLY_TAIL,
    ]);
    expect(sequence.slice(-2).map(({ name }) => name)).toEqual([
      B_NAME,
      REPLY_TAIL,
    ]);
    const f = setup({ sequence });
    await expect(f.runner.run({ sequence, options: {} })).resolves.toEqual({
      totalSuccesses: 1,
      totalFailures: 0,
    });
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runSlowInstanceCommand).not.toHaveBeenCalled();
    expect(
      f.runWorkspaceCommands.mock.calls.flatMap(
        ([arg]) => arg.workspaceCommands,
      ),
    ).toEqual([]);
    expect(f.recordUpgradeMigration).not.toHaveBeenCalled();
  });

  it('holds a pre-0007 reply-tail workspace before any late fast command or workspace mutation', async () => {
    const sequence = fullRegisteredReplySequence();
    const f = setup({ sequence });
    f.histories.get(null)?.splice(
      f.histories
        .get(null)!
        .findIndex((row) => row.name === EMAIL_WORK_COLLISION),
      1,
    );
    await expect(f.runner.run({ sequence, options: {} })).rejects.toThrow(
      `instance command ${EMAIL_WORK_COLLISION} has no completed receipt`,
    );
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runSlowInstanceCommand).not.toHaveBeenCalled();
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
  });

  it('runs pending F/G/Email baseline and both slow commands on registered 2.20 with zero workspaces', async () => {
    const sequence = fullRegisteredReplySequence();
    const f = setup({
      sequence,
      workspaces: [],
      globalName: POLICY,
      histories: new Map([
        [
          null,
          [
            receipt(null, BEFORE_F),
            receipt(null, FORECAST),
            receipt(null, POLICY),
          ],
        ],
      ]),
    });
    await expect(f.runner.run({ sequence, options: {} })).resolves.toEqual({
      totalSuccesses: 0,
      totalFailures: 0,
    });
    expect(
      f.runFastInstanceCommand.mock.calls.map(([arg]) => arg.name),
    ).toEqual([
      F_NAME,
      G_NAME,
      EMAIL_BASELINE,
      EMAIL_ACCOUNT_INCARNATION,
      EMAIL_WORK_IDENTITY,
      EMAIL_WORK_COLLISION,
    ]);
    expect(
      f.runSlowInstanceCommand.mock.calls.map(([arg]) => arg.name),
    ).toEqual([PAYMENT_SLOW, INSTAGRAM_SLOW]);
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unknown fast gap',
      (sequence: UpgradeStep[]) =>
        sequence.map((step) =>
          step.name === FORECAST
            ? {
                ...step,
                name: '2.20.0_UnexpectedForecastFastInstanceCommand_1789992172618',
              }
            : step,
        ),
    ],
    [
      'unknown slow gap',
      (sequence: UpgradeStep[]) =>
        sequence.map((step) =>
          step.name === PAYMENT_SLOW
            ? {
                ...step,
                name: '2.20.0_UnknownSlowInstanceCommand_1786000004001',
              }
            : step,
        ),
    ],
    [
      'slow out of order',
      (sequence: UpgradeStep[]) =>
        sequence.map((step) =>
          step.name === PAYMENT_SLOW
            ? { ...step, name: INSTAGRAM_SLOW }
            : step.name === INSTAGRAM_SLOW
              ? { ...step, name: PAYMENT_SLOW }
              : step,
        ),
    ],
    [
      'slow collision',
      (sequence: UpgradeStep[]) => [
        ...sequence.slice(0, -29),
        sequence.find((step) => step.name === PAYMENT_SLOW)!,
        ...sequence.slice(-29),
      ],
    ],
    [
      'reordered workspace tail',
      (sequence: UpgradeStep[]) => [
        ...sequence.slice(0, -2),
        sequence[sequence.length - 1],
        sequence[sequence.length - 2],
      ],
    ],
  ])(
    'holds full-registration %s before receipts and commands',
    async (_label, change) => {
      const sequence = change(fullRegisteredReplySequence());
      const f = setup({ sequence });
      await expect(f.runner.run({ sequence, options: {} })).rejects.toThrow(
        /Unsupported MYAH-334 upgrade sequence/,
      );
      expect(f.getScopedUpgradeReceiptHistories).not.toHaveBeenCalled();
      expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
      expect(f.runSlowInstanceCommand).not.toHaveBeenCalled();
      expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['pending 2.19 broad', [receipt(WORKSPACE_A, OLD_BROAD)]],
    ['pending early 2.20 broad', [receipt(WORKSPACE_A, BROAD)]],
    ['B initial marker without reply tail', [initial(WORKSPACE_A, B_NAME)]],
    [
      'genuine failed B',
      [initial(WORKSPACE_A), receipt(WORKSPACE_A, B_NAME, 'failed')],
    ],
    ['genuine applied B', [initial(WORKSPACE_A), receipt(WORKSPACE_A, B_NAME)]],
    [
      'unexplained receipt',
      [initial(WORKSPACE_A), receipt(WORKSPACE_A, 'unknown-command')],
    ],
  ])('holds %s before any mutation', async (_label, rows) => {
    const f = setup({
      histories: new Map([
        [
          null,
          [
            receipt(null, BEFORE_F),
            receipt(null, FORECAST),
            receipt(null, POLICY),
            receipt(null, F_NAME),
            receipt(null, G_NAME),
            receipt(null, EMAIL_BASELINE),
            receipt(null, EMAIL_ACCOUNT_INCARNATION),
            receipt(null, EMAIL_WORK_IDENTITY),
            receipt(null, EMAIL_WORK_COLLISION),
            receipt(null, PAYMENT_SLOW),
            receipt(null, INSTAGRAM_SLOW),
          ],
        ],
        [WORKSPACE_A, rows],
      ]),
    });
    const original = structuredClone(rows);
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).rejects.toThrow(
      /Unsupported MYAH-334 upgrade history.*workspace.*(2\.19|2\.20|unknown-command)/,
    );
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
    expect(f.recordUpgradeMigration).not.toHaveBeenCalled();
    expect(rows).toEqual(original);
    expect(f.queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('reports the workspace-specific genuine B receipt even when the global cursor is B', async () => {
    const f = setup({
      globalName: B_NAME,
      histories: new Map([
        [
          null,
          [
            receipt(null, BEFORE_F),
            receipt(null, FORECAST),
            receipt(null, POLICY),
            receipt(null, F_NAME),
            receipt(null, G_NAME),
            receipt(null, EMAIL_BASELINE),
            receipt(null, EMAIL_ACCOUNT_INCARNATION),
            receipt(null, EMAIL_WORK_IDENTITY),
            receipt(null, EMAIL_WORK_COLLISION),
            receipt(null, PAYMENT_SLOW),
            receipt(null, INSTAGRAM_SLOW),
          ],
        ],
        [WORKSPACE_A, [initial(WORKSPACE_A), receipt(WORKSPACE_A, B_NAME)]],
      ]),
    });
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).rejects.toThrow(`workspace ${WORKSPACE_A} at ${B_NAME}`);
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
    expect(f.recordUpgradeMigration).not.toHaveBeenCalled();
  });

  it('holds mixed workspaces before F/G, including a clean companion', async () => {
    const f = setup({
      workspaces: [WORKSPACE_A, WORKSPACE_B],
      globalName: BEFORE_F,
      histories: new Map([
        [null, [receipt(null, BEFORE_F)]],
        [WORKSPACE_A, [initial(WORKSPACE_A)]],
        [WORKSPACE_B, [initial(WORKSPACE_B, B_NAME)]],
      ]),
    });
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).rejects.toThrow(WORKSPACE_A);
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
    expect(f.recordUpgradeMigration).not.toHaveBeenCalled();
  });

  it('runs Forecast/Policy/F/G and both slow commands on initialized-empty candidate at BEFORE_F', async () => {
    const f = setup({
      workspaces: [],
      globalName: BEFORE_F,
      histories: new Map([[null, [receipt(null, BEFORE_F)]]]),
    });
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).resolves.toEqual({
      totalSuccesses: 0,
      totalFailures: 0,
    });
    expect(
      f.runFastInstanceCommand.mock.calls.map(([arg]) => arg.name),
    ).toEqual([
      FORECAST,
      POLICY,
      F_NAME,
      G_NAME,
      EMAIL_BASELINE,
      EMAIL_ACCOUNT_INCARNATION,
      EMAIL_WORK_IDENTITY,
      EMAIL_WORK_COLLISION,
    ]);
    expect(
      f.runSlowInstanceCommand.mock.calls.map(([arg]) => [
        arg.name,
        arg.skipDataMigration,
      ]),
    ).toEqual([
      [PAYMENT_SLOW, false],
      [INSTAGRAM_SLOW, false],
    ]);
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
  });

  it('runs F/G on initialized-empty candidate and never runs B', async () => {
    const f = setup({
      workspaces: [],
      globalName: POLICY,
      histories: new Map([
        [
          null,
          [
            receipt(null, BEFORE_F),
            receipt(null, FORECAST),
            receipt(null, POLICY),
          ],
        ],
      ]),
    });
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).resolves.toEqual({
      totalSuccesses: 0,
      totalFailures: 0,
    });
    expect(
      f.runFastInstanceCommand.mock.calls.map(([arg]) => arg.name),
    ).toEqual([
      F_NAME,
      G_NAME,
      EMAIL_BASELINE,
      EMAIL_ACCOUNT_INCARNATION,
      EMAIL_WORK_IDENTITY,
      EMAIL_WORK_COLLISION,
    ]);
    expect(
      f.runSlowInstanceCommand.mock.calls.map(([arg]) => [
        arg.name,
        arg.skipDataMigration,
      ]),
    ).toEqual([
      [PAYMENT_SLOW, false],
      [INSTAGRAM_SLOW, false],
    ]);
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
  });

  it('repeats a candidate-created reply-tail initial checkpoint without forging B completion', async () => {
    const f = setup();
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).resolves.toEqual({
      totalSuccesses: 1,
      totalFailures: 0,
    });
    expect(
      f.runWorkspaceCommands.mock.calls.flatMap(
        ([arg]) => arg.workspaceCommands,
      ),
    ).toEqual([]);
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runSlowInstanceCommand).not.toHaveBeenCalled();
    expect(f.recordUpgradeMigration).not.toHaveBeenCalled();
  });

  it.each([
    [receipt(null, F_NAME, 'failed'), F_NAME],
    [receipt(null, PAYMENT_SLOW, 'failed'), PAYMENT_SLOW],
    [
      receipt(null, '2.20.0_UnknownSlowInstanceCommand_1786000004002'),
      'UnknownSlowInstanceCommand',
    ],
    [receipt(null, 'unknown-instance'), 'unknown-instance'],
  ])(
    'holds conflicting instance receipt %s before a workspace step',
    async (extra, name) => {
      const f = setup({
        histories: new Map([
          [
            null,
            [
              receipt(null, BEFORE_F),
              receipt(null, FORECAST),
              receipt(null, POLICY),
              receipt(null, F_NAME),
              receipt(null, G_NAME),
              receipt(null, EMAIL_BASELINE),
              receipt(null, EMAIL_ACCOUNT_INCARNATION),
              receipt(null, EMAIL_WORK_IDENTITY),
              receipt(null, EMAIL_WORK_COLLISION),
              receipt(null, PAYMENT_SLOW),
              receipt(null, INSTAGRAM_SLOW),
              extra,
            ],
          ],
          [WORKSPACE_A, [initial(WORKSPACE_A)]],
        ]),
      });
      await expect(
        f.runner.run({ sequence: f.sequence, options: {} }),
      ).rejects.toThrow(name);
      expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
      expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'unknown gap',
      replySequence.map((step) =>
        step.name === FORECAST
          ? { ...step, name: '2.20.0_UnknownFastInstanceCommand_1789992172618' }
          : step,
      ),
    ],
    [
      'out of order',
      replySequence.map((step) =>
        step.name === FORECAST
          ? { ...step, name: POLICY }
          : step.name === POLICY
            ? { ...step, name: FORECAST }
            : step,
      ),
    ],
    [
      'wrong kind',
      replySequence.map((step) =>
        step.name === POLICY
          ? ({ ...step, kind: 'workspace' } as unknown as UpgradeStep)
          : step,
      ),
    ],
    ['collision', [replySequence[0], replySequence[3], ...replySequence]],
    [
      'unknown slow gap',
      replySequence.map((step) =>
        step.name === PAYMENT_SLOW
          ? { ...step, name: '2.20.0_UnknownSlowInstanceCommand_1786000004001' }
          : step,
      ),
    ],
    [
      'slow out of order',
      replySequence.map((step) =>
        step.name === PAYMENT_SLOW
          ? { ...step, name: INSTAGRAM_SLOW }
          : step.name === INSTAGRAM_SLOW
            ? { ...step, name: PAYMENT_SLOW }
            : step,
      ),
    ],
    [
      'slow wrong kind',
      replySequence.map((step) =>
        step.name === PAYMENT_SLOW
          ? ({ ...step, kind: 'fast-instance' } as unknown as UpgradeStep)
          : step,
      ),
    ],
    ['slow collision', [replySequence[0], replySequence[7], ...replySequence]],
  ])(
    'holds %s registered gap before any step or ledger mutation',
    async (_label, sequence) => {
      const f = setup({ sequence });
      await expect(
        f.runner.run({ sequence: f.sequence, options: {} }),
      ).rejects.toThrow(/Unsupported MYAH-334 upgrade sequence/);
      expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
      expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
      expect(f.recordUpgradeMigration).not.toHaveBeenCalled();
      expect(f.getScopedUpgradeReceiptHistories).not.toHaveBeenCalled();
    },
  );

  it('holds unknown mixed B registration rather than guessing a safe tail', async () => {
    const f = setup({ sequence: replySequence.slice(0, -1) });
    await expect(
      f.runner.run({ sequence: f.sequence, options: {} }),
    ).rejects.toThrow(/Unsupported MYAH-334 upgrade sequence/);
    expect(f.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(f.runWorkspaceCommands).not.toHaveBeenCalled();
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
