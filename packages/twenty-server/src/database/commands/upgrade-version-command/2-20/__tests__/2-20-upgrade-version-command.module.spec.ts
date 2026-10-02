import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CommandMeta } from 'nest-commander/src/constants';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { SynchronizeCampaignLifecycleStatusMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971535-synchronize-campaign-lifecycle-status-metadata.command';
import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';
import { CatchUpCampaignActivityControlMetadataWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748003-catch-up-campaign-activity-control-metadata.command';
import { SynchronizeMyahAssistantSkillsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { ResynchronizeMyahCampaignLayoutCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790537642854-resynchronize-myah-campaign-layout.command';
import { CreateMyahInboxReplyContextDraftsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911001-create-myah-inbox-reply-context-drafts';
import { CreateCampaignForecastProjectionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172618-create-campaign-forecast-projection';
import { AddConnectedAccountSendingPolicyRevisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172619-add-connected-account-sending-policy-revision';
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

  it('appends the MYAH-315 exact-approval Myah assistant skill refresh', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as Function[];
    const refresh = providers.find(
      (provider) =>
        provider.name ===
        'RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand',
    );

    expect(refresh).toBeDefined();
    expect(Object.getPrototypeOf(refresh)).toBe(
      SynchronizeMyahAssistantSkillsCommand,
    );
    expect(getRegisteredWorkspaceCommandMetadata(refresh!)).toEqual({
      version: '2.20.0',
      timestamp: 1790161829172,
    });
    expect(Reflect.getMetadata(CommandMeta, refresh!)).toMatchObject({
      name: 'upgrade:2-20:refresh-myah-assistant-skills-for-exact-approvals',
    });
  });

  it('appends a distinct idempotent Myah assistant skill refresh command', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as Function[];
    const refresh = providers.find(
      (provider) =>
        provider.name === 'RefreshMyahAssistantSkillsWorkspaceCommand',
    );

    expect(refresh).toBeDefined();
    expect(getRegisteredWorkspaceCommandMetadata(refresh!)).toEqual({
      version: '2.20.0',
      timestamp: 1789645911006,
    });
    expect(Reflect.getMetadata(CommandMeta, refresh!)).toMatchObject({
      name: 'upgrade:2-20:refresh-myah-assistant-skills',
    });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahAssistantSkillsCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1788250000000 });
    expect(
      Reflect.getMetadata(CommandMeta, SynchronizeMyahAssistantSkillsCommand),
    ).toMatchObject({
      name: 'upgrade:2-20:synchronize-myah-assistant-skills',
    });
  });

  it('appends the distinct layout-only Campaign workspace upgrade after applied commands', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as Function[];
    expect(providers).toContain(ResynchronizeMyahCampaignLayoutCommand);
    expect(
      getRegisteredWorkspaceCommandMetadata(
        ResynchronizeMyahCampaignLayoutCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1790537642854 });
    expect(
      Reflect.getMetadata(CommandMeta, ResynchronizeMyahCampaignLayoutCommand),
    ).toMatchObject({
      name: 'upgrade:2-20:resynchronize-myah-campaign-layout',
    });
    expect(1790537642854).toBeGreaterThan(1790491923604);
  });

  it('registers additive Instagram reaction instance and workspace upgrades after the existing 2.20 tails', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as Function[];
    const core = providers.find(
      (provider) => provider.name === 'AddInstagramReactionEventFastInstanceCommand',
    );
    const workspace = providers.find(
      (provider) => provider.name === 'InstallInstagramReactionWorkspaceCommand',
    );

    expect(core).toBeDefined();
    expect(workspace).toBeDefined();
    expect(getRegisteredInstanceCommandMetadata(core!)).toMatchObject({
      version: '2.20.0',
      timestamp: 1790914739533,
      type: 'fast',
    });
    expect(getRegisteredWorkspaceCommandMetadata(workspace!)).toEqual({
      version: '2.20.0',
      timestamp: 1790914739534,
    });
    expect(getRegisteredInstanceCommandMetadata(core!)!.timestamp).toBeGreaterThan(1790767948744);
    expect(getRegisteredWorkspaceCommandMetadata(workspace!)!.timestamp).toBeGreaterThan(1790767948744);
  });

  it('preserves pre-existing v3 bindings when the original Inbox migration has not run yet', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new CreateMyahInboxReplyContextDraftsFastInstanceCommand().up({
      query,
    } as never);
    const contextSql = query.mock.calls
      .map(([statement]) => statement as string)
      .find((statement) =>
        statement.includes('ADD CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"'),
      );
    expect(contextSql).toContain('"actionVersion" = 2');
    expect(contextSql).toContain('"actionVersion" = 3');
    expect(contextSql).toContain('MYAH_INSTAGRAM_MESSAGE_DRAFT');
    expect(contextSql).toContain('"actionName" = \'send_inbox_reply\'');
    expect(
      getRegisteredInstanceCommandMetadata(
        CreateMyahInboxReplyContextDraftsFastInstanceCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789645911001 });
  });

  it('appends an instance repair after the Inbox migration that replaced the Instagram v3 check', async () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as Function[];
    const repair = providers.find(
      (provider) =>
        provider.name ===
        'RestoreInstagramV3ApprovalContextFastInstanceCommand',
    );

    expect(repair).toBeDefined();
    expect(getRegisteredInstanceCommandMetadata(repair!)).toEqual({
      version: '2.20.0',
      timestamp: 1790577600427,
      type: 'fast',
      runAfterWorkspace: false,
      catchUpOnResume: true,
    });
    const overwritten = providers.find(
      (provider) =>
        provider.name ===
        'CreateMyahInboxReplyContextDraftsFastInstanceCommand',
    );
    expect(
      getRegisteredInstanceCommandMetadata(overwritten!)!.timestamp,
    ).toBeLessThan(getRegisteredInstanceCommandMetadata(repair!)!.timestamp);
    const query = jest.fn().mockResolvedValue([]);
    const command = new (repair as new () => {
      up: (runner: { query: typeof query }) => Promise<void>;
    })();
    await command.up({ query });
    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');
    expect(sql).toContain('"actionVersion" = 3');
    expect(sql).toContain("'MYAH_INSTAGRAM_MESSAGE_DRAFT'");
    expect(sql).toContain('"actionVersion" = 2');
    expect(sql).toContain("'send_inbox_reply'");
    expect(sql).toContain(') IS TRUE');
  });

  it('registers the Campaign forecast and sending-policy instance commands', () => {
    expect(INSTANCE_COMMANDS).toEqual(
      expect.arrayContaining([
        CreateCampaignForecastProjectionFastInstanceCommand,
        AddConnectedAccountSendingPolicyRevisionFastInstanceCommand,
      ]),
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
    kind: 'fast-instance',
    className: 'AddInstagramMessageV3SnapshotFastInstanceCommand',
    timestamp: 1789633748004,
    durableName:
      '2.20.0_AddInstagramMessageV3SnapshotFastInstanceCommand_1789633748004',
    // New command: no persisted legacy identity to preserve, so the durable name
    // keeps its own registration timestamp.
    oldTimestamp: 1789633748004,
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
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'SynchronizeInstagramComposerMetadataCommand',
    timestamp: 1789633748005,
    durableName:
      '2.20.0_SynchronizeInstagramComposerMetadataCommand_1789633748005',
    oldTimestamp: 1789633748005,
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

  it('discovers the full ten-provider Instagram sequence with the security sweep and unaffected kind tails', () => {
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
    expect(
      sequence.find((step) =>
        step.name.includes('RestoreInstagramV3ApprovalContextFastInstanceCommand'),
      ),
    ).toMatchObject({ kind: 'fast-instance', catchUpOnResume: true });
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
            '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534' &&
          // MYAH-338's Campaign lifecycle status sync (PR #143) is not an
          // Instagram identity and carries no durable-name rename, so its own
          // real registration timestamp (1789313971535) is what participates
          // in ordering. That timestamp happens to land inside the numeric
          // range historically used for the Instagram security-cutover work,
          // which would otherwise falsely count it as part of the Instagram
          // cutover accounting below and displace a real Instagram identity
          // out of the expected tail. Exclude it explicitly, the same way the
          // cutover verifier itself is excluded above.
          step.name !==
            '2.20.0_SynchronizeCampaignLifecycleStatusMetadataCommand_1789313971535' &&
          // MYAH-359's composer metadata sync was renumbered (see above) to a
          // real, current timestamp after MYAH-354's two triage workspace
          // commands (PR #161) landed on main, so its own real timestamp is
          // now the largest in this version directory and widens this window
          // enough to also catch those two non-Instagram commands. Exclude
          // them explicitly for the same reason as the Campaign lifecycle
          // sync above.
          step.name !==
            '2.20.0_InitializeMyahInboxContactTriageWorkspaceCommand_1789633748001' &&
          step.name !==
            '2.20.0_CatchUpMyahInboxContactTriageWorkspaceCommand_1789633748002' &&
          // Campaign activity control added a metadata sync and a catch-up
          // command in the same timestamp range; neither is an Instagram
          // cutover identity.
          step.name !==
            '2.20.0_SynchronizeCampaignActivityControlMetadataCommand_1789313971536' &&
          step.name !==
            '2.20.0_CatchUpCampaignActivityControlMetadataWorkspaceCommand_1789633748003' &&
          step.name !==
            '2.20.0_AddCampaignOperatorExclusionReasonFastInstanceCommand_1789313971536' &&
          // Same reasoning for MYAH-354's fast-instance triage-mode command,
          // which also lands inside the widened fast-instance window now that
          // MYAH-359's v3-snapshot fast-instance command was renumbered above
          // it.
          step.name !==
            '2.20.0_AddUnipileInstagramTriageModeFastInstanceCommand_1789633748003',
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
    // Both profile commands, Campaign layout and outreach defaults remain append-only.
    const expectedTail = [
      '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534',
      '2.20.0_SynchronizeCampaignLifecycleStatusMetadataCommand_1789313971535',
      '2.20.0_SynchronizeCampaignActivityControlMetadataCommand_1789313971536',
      '2.20.0_InitializeMyahInboxContactTriageWorkspaceCommand_1789633748001',
      '2.20.0_CatchUpMyahInboxContactTriageWorkspaceCommand_1789633748002',
      '2.20.0_CatchUpCampaignActivityControlMetadataWorkspaceCommand_1789633748003',
      '2.20.0_SynchronizeInstagramComposerMetadataCommand_1789633748005',
      '2.20.0_InstallMyahInboxEmailGeneralProvenanceCommand_1789645911004',
      '2.20.0_RefreshMyahAssistantSkillsWorkspaceCommand_1789645911006',
      '2.20.0_MigrateMyahCreatorSocialProfilesCommand_1789645911011',
      '2.20.0_ScopeMyahCreatorSocialProfilesForwardCommand_1789645911012',
      '2.20.0_RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand_1790161829172',
      '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
      '2.20.0_ResynchronizeMyahCampaignLayoutCommand_1790537642854',
      '2.20.0_PrioritizeOutreachComposeWorkspaceCommand_1790553600427',
      '2.20.0_InstallInstagramReactionWorkspaceCommand_1790914739534',
    ];
    expect(
      sequence.slice(-expectedTail.length).map(({ name }) => name),
    ).toEqual(expectedTail);
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
      '2.20.0_SynchronizeInstagramComposerMetadataCommand_1789633748005',
      '2.20.0_InstallMyahInboxEmailGeneralProvenanceCommand_1789645911004',
      '2.20.0_RefreshMyahAssistantSkillsWorkspaceCommand_1789645911006',
      '2.20.0_MigrateMyahCreatorSocialProfilesCommand_1789645911011',
      '2.20.0_ScopeMyahCreatorSocialProfilesForwardCommand_1789645911012',
      '2.20.0_RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand_1790161829172',
      '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
      '2.20.0_ResynchronizeMyahCampaignLayoutCommand_1790537642854',
      '2.20.0_PrioritizeOutreachComposeWorkspaceCommand_1790553600427',
      '2.20.0_InstallInstagramReactionWorkspaceCommand_1790914739534',
    ]);
    // An existing workspace already through Instagram adoption receives the
    // new layout command without moving the upgrade cursor backwards.
    expect(
      reader
        .getPendingWorkspaceCommands({
          workspaceCommands,
          workspaceCursor: {
            name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
            status: 'completed',
          },
        })
        .map(({ name }) => name),
    ).toEqual([
      '2.20.0_ResynchronizeMyahCampaignLayoutCommand_1790537642854',
      '2.20.0_PrioritizeOutreachComposeWorkspaceCommand_1790553600427',
      '2.20.0_InstallInstagramReactionWorkspaceCommand_1790914739534',
    ]);
    expect(
      reader
        .getPendingWorkspaceCommands({
          workspaceCommands,
          workspaceCursor: {
            name: '2.20.0_ResynchronizeMyahCampaignLayoutCommand_1790537642854',
            status: 'completed',
          },
        })
        .map(({ name }) => name),
    ).toEqual([
      '2.20.0_PrioritizeOutreachComposeWorkspaceCommand_1790553600427',
      '2.20.0_InstallInstagramReactionWorkspaceCommand_1790914739534',
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
    ).toHaveLength(10);
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
