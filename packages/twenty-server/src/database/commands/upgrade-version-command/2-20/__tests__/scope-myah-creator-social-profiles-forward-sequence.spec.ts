import { MODULE_METADATA } from '@nestjs/common/constants';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { DiscoveryService } from '@nestjs/core';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { ScopeMyahCreatorSocialProfilesForwardCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789645911012-scope-myah-creator-social-profiles-forward.command';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { WorkspaceCommandProviderModule } from 'src/database/commands/upgrade-version-command/workspace-command-provider.module';
import { InstanceCommandProviderModule } from 'src/database/commands/upgrade-version-command/instance-command-provider.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';
import { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const PREVIOUS = '2.20.0_MigrateMyahCreatorSocialProfilesCommand_1789645911011';
const FORWARD =
  '2.20.0_ScopeMyahCreatorSocialProfilesForwardCommand_1789645911012';
const WORKSPACE_ID = 'workspace-a';

// Discover the actual production module providers without bootstrapping the API or DB.
const buildReader = () => {
  const modules = Reflect.getMetadata(
    MODULE_METADATA.IMPORTS,
    WorkspaceCommandProviderModule,
  ) as Function[];
  expect(modules).toContain(V2_20_UpgradeVersionCommandModule);
  const providers = [
    ...(Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      InstanceCommandProviderModule,
    ) as Function[]),
    ...modules.flatMap(
      (module) =>
        (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ??
          []) as Function[],
    ),
  ].filter((provider) => typeof provider === 'function');
  const registry = new UpgradeCommandRegistryService({
    getProviders: () =>
      providers.map((metatype) => ({
        metatype,
        instance: Object.create(metatype.prototype),
      })),
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  return new UpgradeSequenceReaderService(registry);
};

describe('MYAH-409 2.20 forward scope upgrade', () => {
  it('reuses only the selected canonical filter sync, without replacing saved view configuration', async () => {
    const profile = MYAH_STANDARD_OBJECTS.socialProfile;
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new ScopeMyahCreatorSocialProfilesForwardCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: { [profile.universalIdentifier]: {} },
          },
          flatViewMaps: {
            byUniversalIdentifier: {
              [profile.views.socialProfiles.universalIdentifier]: {},
            },
          },
          flatFieldMetadataMaps: {
            byUniversalIdentifier: {
              [profile.fields.creator.universalIdentifier]: {},
            },
          },
        }),
      } as unknown as WorkspaceCacheService,
    );
    const args = {
      workspaceId: WORKSPACE_ID,
      options: { dryRun: true },
      dataSource: {} as never,
      index: 0,
      total: 1,
    };
    await command.runOnWorkspace(args);
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(synchronizeWorkspace).toHaveBeenCalledWith(
      args,
      {
        viewFilter: new Set([
          profile.views.socialProfiles.viewFilters.creatorCurrentRecord
            .universalIdentifier,
        ]),
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  });

  it('discovers one append-only workspace identity after the applied profile migration', () => {
    const sequence = buildReader().getUpgradeSequence();
    const previousIndex = sequence.findIndex((step) => step.name === PREVIOUS);
    expect(previousIndex).toBeGreaterThan(-1);
    expect(sequence.filter((step) => step.name === FORWARD)).toHaveLength(1);
    expect(sequence[previousIndex + 1]).toMatchObject({
      name: FORWARD,
      kind: 'workspace',
      version: '2.20.0',
      timestamp: 1789645911012,
    });
  });

  it.each([
    { cursor: PREVIOUS, status: 'completed' as const, expected: [FORWARD] },
    { cursor: FORWARD, status: 'failed' as const, expected: [FORWARD] },
    { cursor: FORWARD, status: 'completed' as const, expected: [] },
  ])(
    'resumes $cursor ($status) through the real reader and runner',
    async ({ cursor, status, expected }) => {
      const reader = buildReader();
      const sequence = reader.getUpgradeSequence();
      const forwardIndex = sequence.findIndex((step) => step.name === FORWARD);
      expect(forwardIndex).toBeGreaterThan(-1);
      const segmentThroughForward = sequence.slice(0, forwardIndex + 1);
      const forwardStep = segmentThroughForward[forwardIndex];
      expect(forwardStep?.kind).toBe('workspace');
      const execute = jest.fn().mockResolvedValue(undefined);
      // The production command body would mutate metadata; intercept only that external effect.
      if (forwardStep?.kind === 'workspace') {
        forwardStep.command.runOnWorkspace = execute;
      }
      const historicalCursor = Object.freeze({
        createdAt: new Date('2026-09-23T00:00:00Z'),
        errorMessage: null,
        executedByVersion: '2.20.0',
        isInitial: false,
        name: cursor,
        status,
        workspaceId: WORKSPACE_ID,
      });
      const recordUpgradeMigration = jest.fn().mockResolvedValue(undefined);
      const migration = {
        getLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue({ name: cursor, status }),
        getWorkspaceLastAttemptedCommandNameOrThrow: jest
          .fn()
          .mockResolvedValue(new Map([[WORKSPACE_ID, historicalCursor]])),
        recordUpgradeMigration,
      } as unknown as UpgradeMigrationService;
      const workspaceRunner = new WorkspaceCommandRunnerService(
        {
          get: jest.fn().mockReturnValue('2.20.0'),
        } as unknown as TwentyConfigService,
        migration,
        {
          invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
        } as unknown as UpgradeStatusService,
      );
      const runner = new UpgradeSequenceRunnerService(
        migration,
        {
          runFastInstanceCommand: jest.fn(),
          runSlowInstanceCommand: jest.fn(),
        } as never,
        workspaceRunner,
        reader,
        {
          refresh: jest.fn().mockResolvedValue(undefined),
        } as unknown as UpgradeAwareEntityMetadataAdapter,
        {
          iterate: jest.fn(async ({ callback }) => {
            await callback({ workspaceId: WORKSPACE_ID, index: 0, total: 1 });
            return { fail: [], success: [{ workspaceId: WORKSPACE_ID }] };
          }),
        } as unknown as WorkspaceIteratorService,
        {
          getActiveOrSuspendedWorkspaceIds: jest
            .fn()
            .mockResolvedValue([WORKSPACE_ID]),
        } as unknown as WorkspaceVersionService,
      );
      await expect(
        runner.run({ sequence: segmentThroughForward, options: {} }),
      ).resolves.toEqual({
        // The iterator reports the workspace as visited even with no pending command.
        totalSuccesses: 1,
        totalFailures: 0,
      });
      expect(execute).toHaveBeenCalledTimes(expected.length);
      expect(
        recordUpgradeMigration.mock.calls.map(([entry]) => entry.name),
      ).toEqual(expected);
      expect(historicalCursor.name).toBe(cursor);
    },
  );
});
