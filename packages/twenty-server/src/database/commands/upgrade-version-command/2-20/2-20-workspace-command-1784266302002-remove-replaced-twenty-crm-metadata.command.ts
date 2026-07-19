import { Command } from 'nest-commander';

import { buildFromToAllUniversalFlatEntityMaps } from 'src/engine/core-modules/application/application-manifest/utils/build-from-to-all-universal-flat-entity-maps.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { getSubFlatEntityMapsByUniversalIdentifiersOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-universal-identifiers-or-throw.util';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type {
  AdditionalCacheDataMaps,
  WorkspaceCacheKeyName,
} from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { getReplacedTwentyCrmMetadataUniversalIdentifiers } from 'src/engine/workspace-manager/twenty-standard-application/utils/remove-replaced-twenty-crm-metadata.util';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

type SyncableFlatEntityMaps = FlatEntityMaps<SyncableFlatEntity>;

@RegisteredWorkspaceCommand('2.20.0', 1784266302002)
@Command({
  name: 'upgrade:2-20:remove-replaced-twenty-crm-metadata',
  description:
    'Permanently remove replaced Company, Person, and Opportunity metadata from Myah workspaces',
})
export class RemoveReplacedTwentyCrmMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow({
        workspaceId,
      });
    const metadataCacheKeys = [
      ...(TWENTY_STANDARD_ALL_METADATA_NAME.map(
        (metadataName) =>
          `flat${metadataName.charAt(0).toUpperCase()}${metadataName.slice(1)}Maps`,
      ) as WorkspaceCacheKeyName[]),
      'featureFlagsMap',
    ] satisfies WorkspaceCacheKeyName[];
    const cachedMetadata = await this.workspaceCacheService.getOrRecompute(
      workspaceId,
      metadataCacheKeys,
    );
    const fromAllFlatEntityMaps =
      cachedMetadata as unknown as TwentyStandardAllFlatEntityMaps;
    const featureFlagsMap =
      cachedMetadata.featureFlagsMap as AdditionalCacheDataMaps['featureFlagsMap'];
    const obsoleteUniversalIdentifiersByMetadataName =
      getReplacedTwentyCrmMetadataUniversalIdentifiers(fromAllFlatEntityMaps);
    const hasReplacedTwentyCrmMetadata = [
      ...(obsoleteUniversalIdentifiersByMetadataName.objectMetadata ?? []),
    ].some(
      (universalIdentifier) =>
        fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
          universalIdentifier
        ] !== undefined,
    );

    if (!hasReplacedTwentyCrmMetadata) {
      this.logger.log(
        `Skipping replaced Twenty CRM metadata removal for workspace ${workspaceId}: CRM metadata is already absent`,
      );

      return;
    }

    const fromAllUniversalFlatEntityMaps = createEmptyAllFlatEntityMaps();
    const dependencyAllFlatEntityMaps = createEmptyAllFlatEntityMaps();

    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      const fromFlatEntityMaps = fromAllFlatEntityMaps[
        flatEntityMapsKey
      ] as unknown as SyncableFlatEntityMaps;
      const obsoleteUniversalIdentifiers =
        obsoleteUniversalIdentifiersByMetadataName[metadataName] ??
        new Set<string>();

      (
        fromAllUniversalFlatEntityMaps as unknown as Record<
          string,
          SyncableFlatEntityMaps
        >
      )[flatEntityMapsKey] = getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: fromFlatEntityMaps,
        universalIdentifiers: obsoleteUniversalIdentifiers,
      });
      (
        dependencyAllFlatEntityMaps as unknown as Record<
          string,
          SyncableFlatEntityMaps
        >
      )[flatEntityMapsKey] = structuredClone(fromFlatEntityMaps);
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          workspaceId,
          buildOptions: {
            applicationUniversalIdentifier:
              twentyStandardFlatApplication.universalIdentifier,
            inferDeletionFromMissingEntities: true,
            isSystemBuild: true,
          },
          fromToAllFlatEntityMaps: buildFromToAllUniversalFlatEntityMaps({
            fromAllFlatEntityMaps: fromAllUniversalFlatEntityMaps,
            toAllUniversalFlatEntityMaps: createEmptyAllFlatEntityMaps(),
          }),
          dependencyAllFlatEntityMaps,
          additionalCacheDataMaps: { featureFlagsMap },
          idByUniversalIdentifierByMetadataName: {},
          dryRun: options.dryRun,
        },
      );

    if (result.status === 'fail') {
      this.logger.error(
        `Failed to remove replaced Twenty CRM metadata:\n${JSON.stringify(result, null, 2)}`,
      );
      throw new Error(
        `Failed to remove replaced Twenty CRM metadata for workspace ${workspaceId}`,
      );
    }

    if (options.dryRun) {
      return;
    }

    await this.workspaceCacheService.flush(workspaceId, [
      ...TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
    ]);
    await this.workspaceMetadataVersionService.incrementMetadataVersion(
      workspaceId,
    );
  }
}
