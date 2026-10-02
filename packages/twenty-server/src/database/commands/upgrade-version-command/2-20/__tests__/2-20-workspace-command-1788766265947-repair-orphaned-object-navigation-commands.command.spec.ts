import { MODULE_METADATA } from '@nestjs/common/constants';
import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { CommandLogger } from 'src/database/commands/logger';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { RepairOrphanedObjectNavigationCommandsCommand, assertPinnedOrphanNavigationActions } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788766265947-repair-orphaned-object-navigation-commands.command';
import { buildOrphanedObjectNavigationCommandRepairPlan } from 'src/database/commands/upgrade-version-command/2-20/utils/build-orphaned-object-navigation-command-repair-plan.util';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { buildNavigationFlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/utils/build-navigation-flat-command-menu-item.util';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = 'workspace-id';
const APPLICATION_ID = 'standard-app';
const object = getFlatObjectMetadataMock({
  universalIdentifier: 'object-uid',
  id: 'current-id',
});
const navigation = buildNavigationFlatCommandMenuItem({
  objectMetadata: { ...object, id: 'missing-id' },
  commandMenuItemId: 'command-id',
  applicationId: APPLICATION_ID,
  applicationUniversalIdentifier:
    TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
  workspaceId: WORKSPACE_ID,
  position: 1,
  now: '2026-01-01T00:00:00.000Z',
});
const createCommand = (commands = [navigation]) => {
  const maps = {
    flatObjectMetadataMaps: {
      byUniversalIdentifier: { [object.universalIdentifier]: object },
      universalIdentifierById: { [object.id]: object.universalIdentifier },
      universalIdentifiersByApplicationId: {},
    },
    flatCommandMenuItemMaps: {
      byUniversalIdentifier: Object.fromEntries(
        commands.map((command) => [command.universalIdentifier, command]),
      ),
      universalIdentifierById: Object.fromEntries(
        commands.map((command) => [command.id, command.universalIdentifier]),
      ),
      universalIdentifiersByApplicationId: {},
    },
  };
  const findWorkspaceTwentyStandardAndCustomApplicationOrThrow = jest
    .fn()
    .mockResolvedValue({
      twentyStandardFlatApplication: {
        id: APPLICATION_ID,
        universalIdentifier: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      },
    });
  const getOrRecompute = jest.fn().mockResolvedValue(maps);
  const flush = jest.fn();
  const load = jest.fn().mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    allFlatEntityMaps: maps,
    flatApplicationMaps: {
      byId: { [APPLICATION_ID]: {
        id: APPLICATION_ID,
        universalIdentifier: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      } },
      idByUniversalIdentifier: {
        [TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER]: APPLICATION_ID,
      },
    },
    featureFlagsMap: {},
  });
  const validateBuildAndRunWorkspaceMigrationFromTo = jest.fn();
  const validateBuildAndRunWorkspaceMigration = jest.fn().mockResolvedValue({
    status: 'success',
    workspaceMigration: { actions: [] },
  });
  const command = new RepairOrphanedObjectNavigationCommandsCommand(
    {} as WorkspaceIteratorService,
    {
      findWorkspaceTwentyStandardAndCustomApplicationOrThrow,
    } as unknown as ApplicationService,
    { getOrRecompute, flush } as unknown as WorkspaceCacheService,
    {
      validateBuildAndRunWorkspaceMigration,
      validateBuildAndRunWorkspaceMigrationFromTo,
    } as unknown as WorkspaceMigrationValidateBuildAndRunService,
    { load } as never,
    { publishCommittedMetadataVersion: jest.fn() } as never,
  );
  return {
    command,
    maps,
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow,
    getOrRecompute,
    load,
    validateBuildAndRunWorkspaceMigrationFromTo,
    validateBuildAndRunWorkspaceMigration,
  };
};
const args = { workspaceId: WORKSPACE_ID, options: {}, index: 0, total: 1 };

describe('RepairOrphanedObjectNavigationCommandsCommand', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers the new latest 2.20 command and is discoverable as a Nest provider', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RepairOrphanedObjectNavigationCommandsCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1788766265947 });
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).toContain(RepairOrphanedObjectNavigationCommandsCommand);
  });

  it('requires a pinned transaction for a mutating repair', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand();
    await expect(command.runOnWorkspace(args)).rejects.toThrow('pinned upgrade transaction');
    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    expect(command.runOnWorkspaceInUpgradeTransaction).toBeDefined();
  });

  it('allows only the exact planned native navigation payload update', () => {
    const { maps } = createCommand();
    const plan = buildOrphanedObjectNavigationCommandRepairPlan({
      ...maps,
      twentyStandardApplicationId: APPLICATION_ID,
    });
    const after = plan.operations.flatEntityToUpdate[0];
    const action = {
      type: 'update', metadataName: 'commandMenuItem',
      universalIdentifier: navigation.universalIdentifier,
      update: { payload: after.payload },
      diff: { payload: { before: navigation.payload, after: after.payload } },
      flatEntity: after,
    };
    const migration = {
      applicationUniversalIdentifier: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      actions: [action],
    };
    const input = {
      migration: migration as never,
      plan,
      current: maps.flatCommandMenuItemMaps,
      standardApplicationId: APPLICATION_ID,
    };
    expect(() => assertPinnedOrphanNavigationActions(input)).not.toThrow();
    expect(() => assertPinnedOrphanNavigationActions({
      ...input, migration: { ...migration, actions: [
        { ...action, update: { payload: after.payload, label: 'unrelated' } },
      ] } as never,
    })).toThrow('Unsafe pinned navigation repair');
    expect(() => assertPinnedOrphanNavigationActions({
      ...input, migration: { ...migration, actions: [
        { ...action, type: 'delete' },
      ] } as never,
    })).toThrow('Unsafe pinned navigation repair');
  });

  it('uses a transaction-bound snapshot and no pooled cache for a pinned no-op', async () => {
    const { command, load, getOrRecompute, validateBuildAndRunWorkspaceMigrationFromTo } = createCommand([]);
    const manager = { queryRunner: null as unknown };
    const runner = { isTransactionActive: true, isReleased: false, manager };
    manager.queryRunner = runner;
    await command.runOnWorkspaceInUpgradeTransaction(args, runner as never, jest.fn());
    expect(load).toHaveBeenCalledWith(WORKSPACE_ID, runner);
    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('logs a no-op without invoking migration', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand(
      [],
    );
    const log = jest.spyOn(CommandLogger.prototype, 'log').mockImplementation();
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('No orphaned object-navigation commands'),
    );
  });

  it('fails closed with workspace-scoped drift identities before executing even classified operations', async () => {
    const unknown = {
      ...navigation,
      id: 'unknown-id',
      universalIdentifier: 'unknown-command',
    };
    const { command, maps, validateBuildAndRunWorkspaceMigration } =
      createCommand([navigation, unknown]);
    const before = structuredClone(maps);
    const error = jest
      .spyOn(CommandLogger.prototype, 'error')
      .mockImplementation();
    await expect(command.runOnWorkspace({ ...args, options: { dryRun: true } })).rejects.toThrow(
      'Unclassified orphaned object-navigation commands',
    );
    expect(error).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'object-navigation-repair.unclassified',
        workspaceId: WORKSPACE_ID,
        count: 1,
        commandUniversalIdentifiers: ['unknown-command'],
      }),
    );
    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    expect(maps).toEqual(before);
  });

  it(
    'passes only command-menu operations to a read-only system migration',
    async () => {
      const dryRun = true;
      const {
        command,
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow,
        getOrRecompute,
        validateBuildAndRunWorkspaceMigration,
      } = createCommand();
      await command.runOnWorkspace({ ...args, options: { dryRun } });
      expect(
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow,
      ).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
      expect(getOrRecompute).toHaveBeenCalledWith(WORKSPACE_ID, [
        'flatObjectMetadataMaps',
        'flatCommandMenuItemMaps',
      ]);
      expect(validateBuildAndRunWorkspaceMigration).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        isSystemBuild: true,
        dryRun,
        allFlatEntityOperationByMetadataName: {
          commandMenuItem: {
            flatEntityToCreate: [],
            flatEntityToDelete: [],
            flatEntityToUpdate: [
              { ...navigation, payload: { objectMetadataItemId: object.id } },
            ],
          },
        },
      });
    },
  );

  it('reports validated actions rather than planner input and preserves seed maps during dry-run', async () => {
    const { command, maps, validateBuildAndRunWorkspaceMigration } =
      createCommand();
    const before = structuredClone(maps);
    const log = jest.spyOn(CommandLogger.prototype, 'log').mockImplementation();
    // Deliberately differs from planner input to prove the report uses the validated result.
    validateBuildAndRunWorkspaceMigration.mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        actions: [
          {
            type: 'update',
            metadataName: 'commandMenuItem',
            universalIdentifier: 'validated-command',
            update: { payload: { objectMetadataItemId: 'validated-target' } },
          },
          {
            type: 'delete',
            metadataName: 'commandMenuItem',
            universalIdentifier: 'validated-deletion',
          },
        ],
      },
    });
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'object-navigation-repair.validated-dry-run',
        workspaceId: WORKSPACE_ID,
        actions: [
          {
            type: 'update',
            metadataName: 'commandMenuItem',
            universalIdentifier: 'validated-command',
            objectMetadataItemId: 'validated-target',
          },
          {
            type: 'delete',
            metadataName: 'commandMenuItem',
            universalIdentifier: 'validated-deletion',
            objectMetadataItemId: null,
          },
        ],
      }),
    );
    expect(maps).toEqual(before);
  });

  it('preserves the original migration failure report in the typed exception', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand();
    const failure = {
      status: 'fail',
      report: {
        commandMenuItem: [{ errors: [{ message: 'validation details' }] }],
      },
    };
    validateBuildAndRunWorkspaceMigration.mockResolvedValue(failure);
    const error: unknown = await command
      .runOnWorkspace({ ...args, options: { dryRun: true } })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkspaceMigrationBuilderException);
    expect(
      (error as WorkspaceMigrationBuilderException)
        .failedWorkspaceMigrationBuildResult,
    ).toBe(failure);
  });
});
