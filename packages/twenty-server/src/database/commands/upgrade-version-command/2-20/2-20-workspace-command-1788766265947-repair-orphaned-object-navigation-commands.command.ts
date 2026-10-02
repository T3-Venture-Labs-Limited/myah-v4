import { isDeepStrictEqual } from 'node:util';

import { Command } from 'nest-commander';
import { type QueryRunner } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { buildOrphanedObjectNavigationCommandRepairPlan, type OrphanedObjectNavigationCommandRepairPlan } from 'src/database/commands/upgrade-version-command/2-20/utils/build-orphaned-object-navigation-command-repair-plan.util';
import { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { isObjectMetadataCommandMenuItemPayload } from 'src/engine/metadata-modules/command-menu-item/utils/is-object-metadata-command-menu-item-payload.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const collectCommands = (commands: FlatCommandMenuItem[]): FlatEntityMaps<FlatCommandMenuItem> =>
  commands.reduce<FlatEntityMaps<FlatCommandMenuItem>>(
    (maps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntityMaps: maps, flatEntity }),
    createEmptyFlatEntityMaps(),
  );

export const assertPinnedOrphanNavigationActions = ({
  migration,
  plan,
  current,
  standardApplicationId,
}: {
  migration: WorkspaceMigration;
  plan: OrphanedObjectNavigationCommandRepairPlan;
  current: FlatEntityMaps<FlatCommandMenuItem>;
  standardApplicationId: string;
}): void => {
  const updates = new Map(plan.operations.flatEntityToUpdate.map((row) => [row.universalIdentifier, row]));
  const deletions = new Map(plan.operations.flatEntityToDelete.map((row) => [row.universalIdentifier, row]));
  if (
    migration.applicationUniversalIdentifier !== TWENTY_STANDARD_APPLICATION.universalIdentifier ||
    migration.actions.length !== updates.size + deletions.size
  ) throw new Error('Unsafe pinned navigation repair: native action count or owner');
  const seen = new Set<string>();
  for (const action of migration.actions) {
    if (action.metadataName !== 'commandMenuItem' || action.type === 'create')
      throw new Error('Unsafe pinned navigation repair: unexpected native action');
    const uid = action.universalIdentifier;
    const before = current.byUniversalIdentifier[uid];
    if (
      seen.has(uid) || !before || before.applicationId !== standardApplicationId ||
      before.applicationUniversalIdentifier !== TWENTY_STANDARD_APPLICATION.universalIdentifier
    ) throw new Error('Unsafe pinned navigation repair: missing Standard-owned source');
    if (action.type === 'update') {
      const after = updates.get(uid);
      if (
        !after || after.id !== before.id || after.applicationId !== before.applicationId ||
        !isDeepStrictEqual(action.update, { payload: after.payload }) ||
        !isDeepStrictEqual(action.diff, { payload: { before: before.payload, after: after.payload } }) ||
        !action.flatEntity ||
        action.flatEntity.universalIdentifier !== uid ||
        action.flatEntity.applicationUniversalIdentifier !== TWENTY_STANDARD_APPLICATION.universalIdentifier ||
        !isDeepStrictEqual(action.flatEntity.payload, after.payload)
      ) throw new Error('Unsafe pinned navigation repair: native update differs from plan');
    } else if (!deletions.has(uid)) {
      throw new Error('Unsafe pinned navigation repair: unclassified deletion');
    }
    seen.add(uid);
  }
};

@RegisteredWorkspaceCommand('2.20.0', 1788766265947)
@Command({
  name: 'upgrade:2-20:repair-orphaned-object-navigation-commands',
  description: 'Repair orphaned standard object-navigation command payloads',
})
export class RepairOrphanedObjectNavigationCommandsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly pinnedSnapshotLoader: PinnedWorkspaceMetadataSnapshotLoaderService,
    private readonly metadataVersion: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  async reconcileCommittedUpgrade(workspaceId: string): Promise<void> {
    await this.workspaceCacheService.flush(workspaceId, [
      ...ALL_FLAT_ENTITY_MAPS_PROPERTIES,
      'flatApplicationMaps',
      'featureFlagsMap',
    ]);
    await this.metadataVersion.publishCommittedMetadataVersion(workspaceId);
  }

  override async runOnWorkspaceInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    queryRunner: QueryRunner,
    afterCommit: (effect: () => Promise<void> | void) => void,
  ): Promise<void> {
    if (
      args.options.dryRun === true ||
      !queryRunner?.isTransactionActive ||
      queryRunner.isReleased ||
      queryRunner.manager?.queryRunner !== queryRunner ||
      typeof afterCommit !== 'function'
    ) throw new Error('Object-navigation repair requires a pinned upgrade transaction');

    const snapshot = await this.pinnedSnapshotLoader.load(args.workspaceId, queryRunner);
    const applicationId = snapshot.flatApplicationMaps.idByUniversalIdentifier[
      TWENTY_STANDARD_APPLICATION.universalIdentifier
    ];
    const standard = applicationId && snapshot.flatApplicationMaps.byId[applicationId];
    if (!applicationId || !standard || standard.universalIdentifier !== TWENTY_STANDARD_APPLICATION.universalIdentifier)
      throw new Error('Pinned object-navigation repair missing Standard application');
    const current = snapshot.allFlatEntityMaps.flatCommandMenuItemMaps;
    const plan = buildOrphanedObjectNavigationCommandRepairPlan({
      flatObjectMetadataMaps: snapshot.allFlatEntityMaps.flatObjectMetadataMaps,
      flatCommandMenuItemMaps: current,
      twentyStandardApplicationId: applicationId,
    });
    if (plan.unclassifiedOrphanCommandUniversalIdentifiers.length)
      throw new Error('Unclassified orphaned object-navigation commands in pinned upgrade');
    const { flatEntityToUpdate: updates, flatEntityToDelete: deletions } = plan.operations;
    if (updates.length + deletions.length === 0) return;
    const from = [...updates, ...deletions].map((row) => {
      const original = current.byUniversalIdentifier[row.universalIdentifier];
      if (!original || original.id !== row.id || original.applicationId !== applicationId)
        throw new Error('Pinned object-navigation source identity or owner mismatch');
      return structuredClone(original);
    });
    const result = await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo({
      workspaceId: args.workspaceId,
      buildOptions: {
        applicationUniversalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
        inferDeletionFromMissingEntities: { commandMenuItem: true },
        isSystemBuild: true,
      },
      fromToAllFlatEntityMaps: {
        flatCommandMenuItemMaps: {
          from: collectCommands(from),
          to: collectCommands(structuredClone(updates)),
        },
      },
      dependencyAllFlatEntityMaps: structuredClone(snapshot.allFlatEntityMaps),
      additionalCacheDataMaps: { featureFlagsMap: snapshot.featureFlagsMap },
      dryRun: false,
      pinnedSnapshot: snapshot,
      upgradeTransaction: { queryRunner, afterCommit },
      assertBeforeRun: (migration) => assertPinnedOrphanNavigationActions({
        migration, plan, current, standardApplicationId: applicationId,
      }),
    });
    if (result.status === 'fail')
      throw new WorkspaceMigrationBuilderException(result, 'Pinned object-navigation repair native validation failed');
    const persisted = (await this.pinnedSnapshotLoader.load(args.workspaceId, queryRunner))
      .allFlatEntityMaps.flatCommandMenuItemMaps.byUniversalIdentifier;
    const expectedUpdates = new Map(updates.map((row) => [row.universalIdentifier, row]));
    const deleted = new Set(deletions.map((row) => row.universalIdentifier));
    const originals = current.byUniversalIdentifier;
    if (Object.keys(persisted).length !== Object.keys(originals).length - deleted.size)
      throw new Error('Pinned object-navigation repair changed unrelated command count');
    const withoutTime = (row: FlatCommandMenuItem) => {
      const { updatedAt: _updatedAt, ...stable } = row;
      return stable;
    };
    for (const [uid, original] of Object.entries(originals)) {
      if (!original) continue;
      if (deleted.has(uid)) {
        if (persisted[uid]) throw new Error('Pinned object-navigation deletion did not persist');
      } else if (
        !persisted[uid] ||
        !isDeepStrictEqual(withoutTime(persisted[uid]), withoutTime(expectedUpdates.get(uid) ?? original))
      ) throw new Error('Pinned object-navigation repair changed a protected command value');
    }
    afterCommit(() => this.reconcileCommittedUpgrade(args.workspaceId));
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun !== true)
      throw new Error('Object-navigation repair requires a pinned upgrade transaction');
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const { flatObjectMetadataMaps, flatCommandMenuItemMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatCommandMenuItemMaps',
      ]);
    const { operations, unclassifiedOrphanCommandUniversalIdentifiers } =
      buildOrphanedObjectNavigationCommandRepairPlan({
        flatObjectMetadataMaps,
        flatCommandMenuItemMaps,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });

    if (unclassifiedOrphanCommandUniversalIdentifiers.length > 0) {
      this.logger.error(
        JSON.stringify({
          event: 'object-navigation-repair.unclassified',
          workspaceId,
          count: unclassifiedOrphanCommandUniversalIdentifiers.length,
          commandUniversalIdentifiers:
            unclassifiedOrphanCommandUniversalIdentifiers,
        }),
      );
      throw new Error(
        `Unclassified orphaned object-navigation commands for workspace ${workspaceId}`,
      );
    }

    if (
      operations.flatEntityToUpdate.length +
        operations.flatEntityToDelete.length ===
      0
    ) {
      this.logger.log(
        `No orphaned object-navigation commands to repair for workspace ${workspaceId}`,
      );
      return;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          workspaceId,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          isSystemBuild: true,
          dryRun: options.dryRun,
          allFlatEntityOperationByMetadataName: { commandMenuItem: operations },
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        `Failed to repair orphaned object-navigation commands for workspace ${workspaceId}`,
      );
    }

    if (options.dryRun) {
      const actions = result.workspaceMigration.actions.map((action) => {
        const payload =
          action.metadataName === 'commandMenuItem'
            ? action.type === 'update'
              ? action.update.payload
              : action.type === 'create'
                ? action.flatEntity.payload
                : undefined
            : undefined;

        return {
          type: action.type,
          metadataName: action.metadataName,
          universalIdentifier:
            action.type === 'create'
              ? action.flatEntity.universalIdentifier
              : action.universalIdentifier,
          objectMetadataItemId: isObjectMetadataCommandMenuItemPayload(payload)
            ? payload.objectMetadataItemId
            : null,
        };
      });

      this.logger.log(
        JSON.stringify({
          event: 'object-navigation-repair.validated-dry-run',
          workspaceId,
          actions,
        }),
      );
    }
  }
}
