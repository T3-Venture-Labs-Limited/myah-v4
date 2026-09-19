import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CommandMeta } from 'nest-commander/src/constants';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { SynchronizeCampaignLifecycleStatusMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971535-synchronize-campaign-lifecycle-status-metadata.command';
import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';
import { CatchUpCampaignActivityControlMetadataWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748003-catch-up-campaign-activity-control-metadata.command';
import { RepairInstagramSecurityCutoverCommand } from 'src/database/commands/upgrade-version-command/2-20/repair-instagram-security-cutover.command';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeModule } from 'src/engine/core-modules/upgrade/upgrade.module';
import { UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/upgrade-version-command.module';
import { WorkspaceCommandProviderModule } from 'src/database/commands/upgrade-version-command/workspace-command-provider.module';
import { InstanceCommandProviderModule } from 'src/database/commands/upgrade-version-command/instance-command-provider.module';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { DiscoveryService } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { SynchronizeMyahCampaignCreatorListSourcesCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786602066315-synchronize-myah-campaign-creator-list-sources.command';
import { SynchronizeMyahCampaignAutomationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786526100000-synchronize-myah-campaign-automation-metadata.command';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

describe('V2_20_UpgradeVersionCommandModule', () => {
  it('directly imports the workspace migration runner for social-link cache invalidation', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(imports).toContain(WorkspaceMigrationRunnerModule);
  });

  it('provides the retained Campaign Creator List source migration', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeMyahCampaignCreatorListSourcesCommand,
    );
  });

  it('retains the existing Campaign automation metadata migration', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeMyahCampaignAutomationMetadataCommand,
    );
  });

  it('provides the Composio Instagram history cutover after app metadata sync', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
    );
    expect(providers).toContain(
      BackfillComposioInstagramHistoryWorkspaceCommand,
    );
  });
});

const EXPECTED_INSTAGRAM_IDENTITIES = [
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'CreateUnipileInstagramFoundationFastInstanceCommand',
    timestamp: 1789307619348,
    durableName:
      '2.20.0_CreateUnipileInstagramFoundationFastInstanceCommand_1799201000000',
    oldTimestamp: 1799201000000,
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'AddUnipileInstagramSyncStateFastInstanceCommand',
    timestamp: 1789307619352,
    durableName:
      '2.20.0_AddUnipileInstagramSyncStateFastInstanceCommand_1799201001000',
    oldTimestamp: 1799201001000,
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'CreateInstagramActionBudgetFastInstanceCommand',
    timestamp: 1789307619356,
    durableName:
      '2.20.0_CreateInstagramActionBudgetFastInstanceCommand_1799201002000',
    oldTimestamp: 1799201002000,
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'AddInstagramDirectActionContextFastInstanceCommand',
    timestamp: 1789307619359,
    durableName:
      '2.20.0_AddInstagramDirectActionContextFastInstanceCommand_1799201003000',
    oldTimestamp: 1799201003000,
  },
  {
    version: '2.20.0',
    kind: 'slow-instance',
    className: 'InvalidateComposioInstagramAuthoritiesSlowInstanceCommand',
    timestamp: 1789307619363,
    durableName:
      '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000',
    oldTimestamp: 1799201004000,
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'SynchronizeInstagramMessagePermissionsCommand',
    timestamp: 1789307619366,
    durableName:
      '2.20.0_SynchronizeInstagramMessagePermissionsCommand_1799201011000',
    oldTimestamp: 1799201011000,
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'InvalidateComposioInstagramAuthoritiesWorkspaceCommand',
    timestamp: 1789307619370,
    durableName:
      '2.20.0_InvalidateComposioInstagramAuthoritiesWorkspaceCommand_1799201011500',
    oldTimestamp: 1799201011500,
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'BackfillComposioInstagramHistoryWorkspaceCommand',
    timestamp: 1789307619373,
    durableName:
      '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000',
    oldTimestamp: 1799201012000,
  },
] as const;

describe('Instagram production upgrade provider compatibility', () => {
  it('retains the provider import links shared by API and CLI', () => {
    const importsOf = (module: Function): unknown[] =>
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, module);
    expect(importsOf(UpgradeVersionCommandModule)).toContain(UpgradeModule);
    expect(importsOf(UpgradeModule)).toEqual(
      expect.arrayContaining([
        InstanceCommandProviderModule,
        WorkspaceCommandProviderModule,
      ]),
    );
    expect(importsOf(WorkspaceCommandProviderModule)).toContain(
      V2_20_UpgradeVersionCommandModule,
    );
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        InstanceCommandProviderModule,
      ),
    ).toEqual(expect.arrayContaining(INSTANCE_COMMANDS));
  });

  it('discovers exactly eight actual corrected providers and preserves the entire durable sequence and unaffected kind prefixes', () => {
    const workspaceModules = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      WorkspaceCommandProviderModule,
    ) as Function[];
    const workspaceProviders = workspaceModules.flatMap(
      (module) => Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [],
    ) as Function[];
    const instanceProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      InstanceCommandProviderModule,
    ) as Function[];
    const providers = [...instanceProviders, ...workspaceProviders].filter(
      (provider) => typeof provider === 'function',
    );
    const decorated = providers.flatMap((metatype) => {
      const instance = getRegisteredInstanceCommandMetadata(metatype);
      const workspace = getRegisteredWorkspaceCommandMetadata(metatype);
      const metadata = instance ?? workspace;
      return metadata
        ? [
            {
              metatype,
              ...metadata,
              kind: instance
                ? instance.type === 'slow'
                  ? 'slow-instance'
                  : 'fast-instance'
                : 'workspace',
            },
          ]
        : [];
    });
    for (const identity of EXPECTED_INSTAGRAM_IDENTITIES) {
      const matches = decorated.filter(
        (provider) => provider.metatype.name === identity.className,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        version: identity.version,
        kind: identity.kind,
        timestamp: identity.timestamp,
      });
    }
    const wrappers = [...providers].reverse().map((metatype) => ({
      metatype,
      instance: Object.create(metatype.prototype),
    }));
    const registry = new UpgradeCommandRegistryService({
      getProviders: () => wrappers,
    } as unknown as DiscoveryService);
    registry.onModuleInit();
    const reader = new UpgradeSequenceReaderService(registry);
    const sequence = reader.getUpgradeSequence();
    const kindOrder = ['fast-instance', 'slow-instance', 'workspace'];
    const expected = decorated
      .filter((entry) =>
        sequence.some((step) => step.version === entry.version),
      )
      .map((entry) => {
        const identity = EXPECTED_INSTAGRAM_IDENTITIES.find(
          (identity) => identity.className === entry.metatype.name,
        );
        const timestamp = identity?.oldTimestamp ?? entry.timestamp;
        return {
          ...entry,
          schedulingTimestamp: entry.timestamp,
          timestamp,
          name: `${entry.version}_${entry.metatype.name}_${timestamp}`,
        };
      })
      .sort(
        (left, right) =>
          left.version.localeCompare(right.version, undefined, {
            numeric: true,
          }) ||
          kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind) ||
          left.schedulingTimestamp - right.schedulingTimestamp,
      );
    expect(sequence.map(({ name }) => name)).toEqual(
      expected.map(({ name }) => name),
    );
    for (const kind of kindOrder) {
      const actualTail = sequence.filter(
        (step) =>
          step.version === '2.20.0' &&
          step.kind === kind &&
          step.name !==
            '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534',
      );
      const identities = EXPECTED_INSTAGRAM_IDENTITIES.filter(
        (identity) => identity.kind === kind,
      );
      const commandsThroughInstagramCutover = actualTail.filter(
        (step) => step.timestamp <= identities[identities.length - 1].timestamp,
      );
      expect(
        commandsThroughInstagramCutover
          .slice(-identities.length)
          .map(({ name }) => name),
      ).toEqual(identities.map(({ durableName }) => durableName));
      const unaffected = commandsThroughInstagramCutover.slice(
        0,
        -identities.length,
      );
      expect(
        unaffected.every((step) => step.timestamp < identities[0].timestamp),
      ).toBe(true);
    }
    expect(sequence[sequence.length - 1]?.name).toBe(
      '2.20.0_InstallMyahInboxEmailGeneralProvenanceCommand_1789645911004',
    );
    const lastInstagramCommand = sequence.findIndex(
      (step) =>
        step.name ===
        EXPECTED_INSTAGRAM_IDENTITIES[EXPECTED_INSTAGRAM_IDENTITIES.length - 1]
          .durableName,
    );
    expect(sequence[lastInstagramCommand + 1]?.name).toBe(
      '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534',
    );
    const workspaceCommands = sequence
      .filter((step) => step.kind === 'workspace')
      .filter((step) => step.version === '2.20.0');
    expect(
      reader
        .getPendingWorkspaceCommands({
          workspaceCommands,
          workspaceCursor: {
            name: '2.20.0_CatchUpMyahInboxContactTriageWorkspaceCommand_1789633748002',
            status: 'completed',
          },
        })
        .map(({ name }) => name),
    ).toEqual([
      '2.20.0_CatchUpCampaignActivityControlMetadataWorkspaceCommand_1789633748003',
      '2.20.0_InstallMyahInboxEmailGeneralProvenanceCommand_1789645911004',
    ]);
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeCampaignLifecycleStatusMetadataCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1789313971535 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeCampaignActivityControlMetadataCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1789313971536 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        CatchUpCampaignActivityControlMetadataWorkspaceCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1789633748003 });
    expect(
      sequence.filter((step) =>
        EXPECTED_INSTAGRAM_IDENTITIES.some(
          (identity) => identity.durableName === step.name,
        ),
      ),
    ).toHaveLength(8);
  });
});

describe('Instagram forward verifier reachability', () => {
  it('appends and exports the genuine E9 workspace verifier without a standalone CLI', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as Function[];
    const verifier = providers.find(
      (provider) =>
        provider.name === 'VerifyInstagramSecurityCutoverWorkspaceCommand',
    );
    expect(verifier).toBeDefined();
    expect(getRegisteredWorkspaceCommandMetadata(verifier!)).toEqual({
      version: '2.20.0',
      timestamp: 1789313971534,
    });
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).toContain(verifier);
  });

  it('provides the ordinary operational CLI in the parent, without a cycle', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      UpgradeVersionCommandModule,
    ) as Function[];
    expect(providers.map((provider) => provider.name)).toContain(
      'RepairInstagramSecurityCutoverCommand',
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, UpgradeVersionCommandModule),
    ).toContain(V2_20_UpgradeVersionCommandModule);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).not.toContain(UpgradeModule);
  });
});

describe('Instagram forward command constructor DI', () => {
  it('resolves the exact existing dependency tokens without application bootstrap', async () => {
    const module = await Test.createTestingModule({
      providers: [
        VerifyInstagramSecurityCutoverWorkspaceCommand,
        RepairInstagramSecurityCutoverCommand,
        InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
        BackfillComposioInstagramHistoryWorkspaceCommand,
        { provide: getDataSourceToken(), useValue: {} },
        { provide: WorkspaceIteratorService, useValue: {} },
        { provide: UpgradeMigrationService, useValue: {} },
        { provide: UpgradeSequenceReaderService, useValue: {} },
      ],
    }).compile();
    expect(
      module.get(VerifyInstagramSecurityCutoverWorkspaceCommand),
    ).toBeInstanceOf(VerifyInstagramSecurityCutoverWorkspaceCommand);
    expect(module.get(RepairInstagramSecurityCutoverCommand)).toBeInstanceOf(
      RepairInstagramSecurityCutoverCommand,
    );
    expect(
      Reflect.getMetadata(
        CommandMeta,
        VerifyInstagramSecurityCutoverWorkspaceCommand,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(CommandMeta, RepairInstagramSecurityCutoverCommand),
    ).toMatchObject({ name: 'upgrade:2-20:repair-instagram-security-cutover' });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RepairInstagramSecurityCutoverCommand,
      ),
    ).toBeUndefined();
    await module.close();
  });
});
