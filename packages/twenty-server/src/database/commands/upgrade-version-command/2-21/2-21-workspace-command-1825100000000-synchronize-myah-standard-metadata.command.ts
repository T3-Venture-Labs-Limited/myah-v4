import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

import { buildFromToAllUniversalFlatEntityMaps } from 'src/engine/core-modules/application/application-manifest/utils/build-from-to-all-universal-flat-entity-maps.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { getSubFlatEntityMapsByUniversalIdentifiersOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-universal-identifiers-or-throw.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const MYAH_ROLE_UNIVERSAL_IDENTIFIERS = new Set([
  STANDARD_ROLE.brandBrainAdmin.universalIdentifier,
  STANDARD_ROLE.creatorOpsDefault.universalIdentifier,
]);

const toUniversalIdentifiers = <T extends { universalIdentifier: string }>(
  entities: readonly T[],
) => new Set(entities.map(({ universalIdentifier }) => universalIdentifier));

@RegisteredWorkspaceCommand('2.21.0', 1825100000000)
@Command({
  name: 'upgrade:2-21:synchronize-myah-standard-metadata',
  description:
    'Synchronize source-controlled Myah standard metadata for existing workspaces',
})
export class SynchronizeMyahStandardMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would synchronize Myah standard metadata for workspace ${workspaceId}`,
      );

      return;
    }

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow({
        workspaceId,
      });
    const { featureFlagsMap, ...fromAllFlatEntityMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        ...TWENTY_STANDARD_ALL_METADATA_NAME.map(
          (metadataName) => `flat${metadataName.charAt(0).toUpperCase()}${metadataName.slice(1)}Maps`,
        ),
        'featureFlagsMap',
      ]);
    const {
      allFlatEntityMaps: standardAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
    } = computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId,
      twentyStandardApplicationId: twentyStandardFlatApplication.id,
    });

    const objectUniversalIdentifiers = new Set(
      Object.values(MYAH_STANDARD_OBJECTS).map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
    );
    const fieldUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter((field) =>
          objectUniversalIdentifiers.has(field.objectMetadataUniversalIdentifier),
        ),
    );
    const indexUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(standardAllFlatEntityMaps.flatIndexMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter((index) =>
          objectUniversalIdentifiers.has(index.objectMetadataUniversalIdentifier),
        ),
    );
    const viewUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(standardAllFlatEntityMaps.flatViewMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter((view) =>
          objectUniversalIdentifiers.has(view.objectMetadataUniversalIdentifier),
        ),
    );
    const viewFilterUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatViewFilterMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter((viewFilter) =>
          viewUniversalIdentifiers.has(viewFilter.viewUniversalIdentifier),
        ),
    );
    const viewFieldUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter((viewField) =>
          viewUniversalIdentifiers.has(viewField.viewUniversalIdentifier),
        ),
    );
    const pageLayoutUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter((pageLayout) =>
          objectUniversalIdentifiers.has(
            pageLayout.objectMetadataUniversalIdentifier,
          ),
        ),
    );
    const pageLayoutTabUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatPageLayoutTabMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter((pageLayoutTab) =>
          pageLayoutUniversalIdentifiers.has(
            pageLayoutTab.pageLayoutUniversalIdentifier,
          ),
        ),
    );
    const pageLayoutWidgetUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter((pageLayoutWidget) =>
          pageLayoutTabUniversalIdentifiers.has(
            pageLayoutWidget.pageLayoutTabUniversalIdentifier,
          ),
        ),
    );
    const navigationMenuItemUniversalIdentifiers = toUniversalIdentifiers(
      Object.values(
        standardAllFlatEntityMaps.flatNavigationMenuItemMaps
          .byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          (navigationMenuItem) =>
            objectUniversalIdentifiers.has(
              navigationMenuItem.targetObjectMetadataUniversalIdentifier ?? '',
            ) ||
            viewUniversalIdentifiers.has(
              navigationMenuItem.viewUniversalIdentifier ?? '',
            ),
        ),
    );

    const toAllFlatEntityMaps = createEmptyAllFlatEntityMaps();
    toAllFlatEntityMaps.flatObjectMetadataMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatObjectMetadataMaps,
        universalIdentifiers: objectUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatFieldMetadataMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatFieldMetadataMaps,
        universalIdentifiers: fieldUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatIndexMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatIndexMaps,
        universalIdentifiers: indexUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatViewMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatViewMaps,
        universalIdentifiers: viewUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatViewFilterMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatViewFilterMaps,
        universalIdentifiers: viewFilterUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatViewFieldMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatViewFieldMaps,
        universalIdentifiers: viewFieldUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatRoleMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatRoleMaps,
        universalIdentifiers: MYAH_ROLE_UNIVERSAL_IDENTIFIERS,
      });
    toAllFlatEntityMaps.flatPageLayoutMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatPageLayoutMaps,
        universalIdentifiers: pageLayoutUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatPageLayoutTabMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatPageLayoutTabMaps,
        universalIdentifiers: pageLayoutTabUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatPageLayoutWidgetMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatPageLayoutWidgetMaps,
        universalIdentifiers: pageLayoutWidgetUniversalIdentifiers,
      });
    toAllFlatEntityMaps.flatNavigationMenuItemMaps =
      getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
        flatEntityMaps: standardAllFlatEntityMaps.flatNavigationMenuItemMaps,
        universalIdentifiers: navigationMenuItemUniversalIdentifiers,
      });

    const fromMyahFlatEntityMaps = createEmptyAllFlatEntityMaps();
    for (const [flatEntityMapsKey, toFlatEntityMaps] of Object.entries(
      toAllFlatEntityMaps,
    )) {
      const fromFlatEntityMaps = fromAllFlatEntityMaps[flatEntityMapsKey];

      if (!fromFlatEntityMaps) {
        continue;
      }

      fromMyahFlatEntityMaps[flatEntityMapsKey] =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: fromFlatEntityMaps,
          universalIdentifiers: new Set(
            Object.keys(toFlatEntityMaps.byUniversalIdentifier),
          ),
        });
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          workspaceId,
          buildOptions: {
            applicationUniversalIdentifier:
              twentyStandardFlatApplication.universalIdentifier,
            inferDeletionFromMissingEntities: false,
            isSystemBuild: true,
          },
          fromToAllFlatEntityMaps: buildFromToAllUniversalFlatEntityMaps({
            fromAllFlatEntityMaps: fromMyahFlatEntityMaps,
            toAllUniversalFlatEntityMaps: toAllFlatEntityMaps,
          }),
          additionalCacheDataMaps: { featureFlagsMap },
          idByUniversalIdentifierByMetadataName,
        },
      );

    if (result.status === 'fail') {
      this.logger.error(
        `Failed to synchronize Myah standard metadata:\n${JSON.stringify(result, null, 2)}`,
      );
      throw new Error(
        `Failed to synchronize Myah standard metadata for workspace ${workspaceId}`,
      );
    }
  }
}
