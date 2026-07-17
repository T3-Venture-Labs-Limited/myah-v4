import { Command } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { In, type DataSource } from 'typeorm';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

import { buildFromToAllUniversalFlatEntityMaps } from 'src/engine/core-modules/application/application-manifest/utils/build-from-to-all-universal-flat-entity-maps.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getSubFlatEntityMapsByUniversalIdentifiersOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-universal-identifiers-or-throw.util';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { ALL_METADATA_ENTITY_BY_METADATA_NAME } from 'src/engine/metadata-modules/flat-entity/constant/all-metadata-entity-by-metadata-name.constant';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { getReplacedTwentyCrmMetadataUniversalIdentifiers } from 'src/engine/workspace-manager/twenty-standard-application/utils/remove-replaced-twenty-crm-metadata.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type {
  AdditionalCacheDataMaps,
  WorkspaceCacheKeyName,
} from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const MYAH_ROLE_UNIVERSAL_IDENTIFIERS = new Set<string>([
  STANDARD_ROLE.brandBrainAdmin.universalIdentifier,
  STANDARD_ROLE.creatorOpsDefault.universalIdentifier,
]);

const LEGACY_MYAH_APPLICATION_UNIVERSAL_IDENTIFIERS = [
  '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991',
  '72f2fd16-880c-4c63-852f-dbf63f51c152',
] as const;

type UniversalMetadataEntity = {
  universalIdentifier: string;
  objectMetadataUniversalIdentifier?: string | null;
  relationTargetObjectMetadataUniversalIdentifier?: string | null;
  fieldMetadataUniversalIdentifier?: string | null;
  viewUniversalIdentifier?: string | null;
  pageLayoutUniversalIdentifier?: string | null;
  pageLayoutTabUniversalIdentifier?: string | null;
  targetObjectMetadataUniversalIdentifier?: string | null;
  universalFlatIndexFieldMetadatas?: {
    fieldMetadataUniversalIdentifier: string;
  }[];
};

const getUniversalMetadataEntities = (
  byUniversalIdentifier: unknown,
): UniversalMetadataEntity[] =>
  Object.values(
    byUniversalIdentifier as Partial<
      Record<string, UniversalMetadataEntity>
    >,
  ).filter(isDefined);

const toUniversalIdentifiers = (
  entities: readonly UniversalMetadataEntity[],
) => new Set(entities.map(({ universalIdentifier }) => universalIdentifier));

type SyncableFlatEntityMaps = FlatEntityMaps<SyncableFlatEntity>;


@RegisteredWorkspaceCommand('2.20.0', 1784266302001)
@Command({
  name: 'upgrade:2-20:synchronize-myah-standard-metadata',
  description:
    'Synchronize source-controlled Myah standard metadata for existing workspaces',
})
export class SynchronizeMyahStandardMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
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

    const legacyMyahApplications = (
      await Promise.all(
        LEGACY_MYAH_APPLICATION_UNIVERSAL_IDENTIFIERS.map(
          async (universalIdentifier) =>
            await this.applicationService.findByUniversalIdentifier({
              universalIdentifier,
              workspaceId,
            }),
        ),
      )
    ).filter(isDefined);
    const legacyMyahApplicationIds = legacyMyahApplications.map(
      ({ id }) => id,
    );
    const hasLegacyMyahApplication = legacyMyahApplicationIds.length > 0;
    const metadataCacheKeys: WorkspaceCacheKeyName[] = [
      ...TWENTY_STANDARD_ALL_METADATA_NAME.map(
        (metadataName) => `flat${metadataName.charAt(0).toUpperCase()}${metadataName.slice(1)}Maps`,
      ),
      'featureFlagsMap',
    ];
    const cachedMetadata =
      await this.workspaceCacheService.getOrRecompute(
        workspaceId,
        metadataCacheKeys,
      );
    const featureFlagsMap =
      cachedMetadata.featureFlagsMap as AdditionalCacheDataMaps['featureFlagsMap'];
    const fromAllFlatEntityMaps =
      cachedMetadata as unknown as TwentyStandardAllFlatEntityMaps;
    const {
      allFlatEntityMaps: standardAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
    } = computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId,
      twentyStandardApplicationId: twentyStandardFlatApplication.id,
      removeReplacedTwentyCrmMetadata: hasLegacyMyahApplication,
    });

    const objectUniversalIdentifiers = new Set<string>(
      Object.values(MYAH_STANDARD_OBJECTS).map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
    );
    const standardFields = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    );
    const fieldUniversalIdentifiers = toUniversalIdentifiers(
      standardFields.filter(
        (field) =>
          objectUniversalIdentifiers.has(
            field.objectMetadataUniversalIdentifier ?? '',
          ) ||
          objectUniversalIdentifiers.has(
            field.relationTargetObjectMetadataUniversalIdentifier ?? '',
          ),
      ),
    );
    const standardIndexes = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
    );
    const indexUniversalIdentifiers = toUniversalIdentifiers(
      standardIndexes.filter(
        (index) =>
          objectUniversalIdentifiers.has(
            index.objectMetadataUniversalIdentifier ?? '',
          ) ||
          index.universalFlatIndexFieldMetadatas?.some((indexField) =>
            fieldUniversalIdentifiers.has(
              indexField.fieldMetadataUniversalIdentifier,
            ),
          ) === true,
      ),
    );
    const standardViewFields = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    );
    const standardViews = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatViewMaps.byUniversalIdentifier,
    );
    const viewUniversalIdentifiers = toUniversalIdentifiers(
      standardViews.filter(
        (view) =>
          objectUniversalIdentifiers.has(
            view.objectMetadataUniversalIdentifier ?? '',
          ) ||
          standardViewFields.some(
            (viewField) =>
              viewField.viewUniversalIdentifier === view.universalIdentifier &&
              fieldUniversalIdentifiers.has(
                viewField.fieldMetadataUniversalIdentifier ?? '',
              ),
          ),
      ),
    );
    const viewFilterUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatViewFilterMaps.byUniversalIdentifier,
      ).filter((viewFilter) =>
        viewUniversalIdentifiers.has(
          viewFilter.viewUniversalIdentifier ?? '',
        ),
      ),
    );
    const viewFieldUniversalIdentifiers = toUniversalIdentifiers(
      standardViewFields.filter((viewField) =>
        viewUniversalIdentifiers.has(
          viewField.viewUniversalIdentifier ?? '',
        ),
      ),
    );
    const pageLayoutUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier,
      ).filter((pageLayout) =>
        objectUniversalIdentifiers.has(
          pageLayout.objectMetadataUniversalIdentifier ?? '',
        ),
      ),
    );
    const pageLayoutTabUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatPageLayoutTabMaps.byUniversalIdentifier,
      ).filter((pageLayoutTab) =>
        pageLayoutUniversalIdentifiers.has(
          pageLayoutTab.pageLayoutUniversalIdentifier ?? '',
        ),
      ),
    );
    const pageLayoutWidgetUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatPageLayoutWidgetMaps
          .byUniversalIdentifier,
      ).filter((pageLayoutWidget) =>
        pageLayoutTabUniversalIdentifiers.has(
          pageLayoutWidget.pageLayoutTabUniversalIdentifier ?? '',
        ),
      ),
    );
    const navigationMenuItemUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatNavigationMenuItemMaps
          .byUniversalIdentifier,
      ).filter(
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
    const standardFlatEntityMapsByKey =
      standardAllFlatEntityMaps as unknown as Record<
        string,
        SyncableFlatEntityMaps
      >;
    const toFlatEntityMapsByKey = toAllFlatEntityMaps as unknown as Record<
      string,
      SyncableFlatEntityMaps
    >;
    const selectMetadata = (
      metadataName: (typeof TWENTY_STANDARD_ALL_METADATA_NAME)[number],
      universalIdentifiers: ReadonlySet<string>,
    ) => {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);

      toFlatEntityMapsByKey[flatEntityMapsKey] =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: standardFlatEntityMapsByKey[flatEntityMapsKey],
          universalIdentifiers,
        });
    };

    selectMetadata('objectMetadata', objectUniversalIdentifiers);
    selectMetadata('fieldMetadata', fieldUniversalIdentifiers);
    selectMetadata('index', indexUniversalIdentifiers);
    selectMetadata('view', viewUniversalIdentifiers);
    selectMetadata('viewFilter', viewFilterUniversalIdentifiers);
    selectMetadata('viewField', viewFieldUniversalIdentifiers);
    selectMetadata('role', MYAH_ROLE_UNIVERSAL_IDENTIFIERS);
    selectMetadata(
      'objectPermission',
      toUniversalIdentifiers(
        getUniversalMetadataEntities(
          standardAllFlatEntityMaps.flatObjectPermissionMaps
            .byUniversalIdentifier,
        ),
      ),
    );
    selectMetadata(
      'fieldPermission',
      toUniversalIdentifiers(
        getUniversalMetadataEntities(
          standardAllFlatEntityMaps.flatFieldPermissionMaps.byUniversalIdentifier,
        ),
      ),
    );
    selectMetadata('pageLayout', pageLayoutUniversalIdentifiers);
    selectMetadata('pageLayoutTab', pageLayoutTabUniversalIdentifiers);
    selectMetadata('pageLayoutWidget', pageLayoutWidgetUniversalIdentifiers);
    selectMetadata(
      'navigationMenuItem',
      navigationMenuItemUniversalIdentifiers,
    );



    const obsoleteUniversalIdentifiersByMetadataName =
      hasLegacyMyahApplication
        ? getReplacedTwentyCrmMetadataUniversalIdentifiers(
            fromAllFlatEntityMaps as TwentyStandardAllFlatEntityMaps,
          )
        : {};

    const fromMyahFlatEntityMaps = createEmptyAllFlatEntityMaps();
    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      const toFlatEntityMaps = toAllFlatEntityMaps[
        flatEntityMapsKey
      ] as unknown as SyncableFlatEntityMaps;
      const fromFlatEntityMaps = fromAllFlatEntityMaps[
        flatEntityMapsKey
      ] as unknown as SyncableFlatEntityMaps;
      const universalIdentifiers = new Set([
        ...Object.keys(toFlatEntityMaps.byUniversalIdentifier),
        ...(obsoleteUniversalIdentifiersByMetadataName[metadataName] ?? []),
      ]);

      const fromFlatEntitySubMaps =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: fromFlatEntityMaps,
          universalIdentifiers,
        });

      (
        fromMyahFlatEntityMaps as unknown as Record<
          string,
          SyncableFlatEntityMaps
        >
      )[flatEntityMapsKey] = fromFlatEntitySubMaps;
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
            fromAllFlatEntityMaps: fromMyahFlatEntityMaps,
            toAllUniversalFlatEntityMaps: toAllFlatEntityMaps,
          }),
          additionalCacheDataMaps: { featureFlagsMap },
          idByUniversalIdentifierByMetadataName,
          dryRun: options.dryRun,
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

    if (options.dryRun || legacyMyahApplicationIds.length === 0) {
      return;
    }

    const queryRunner = this.coreDataSource.createQueryRunner();

    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
        const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
        const targetUniversalIdentifiers = Object.keys(
          (
            toAllFlatEntityMaps as unknown as Record<
              string,
              SyncableFlatEntityMaps
            >
          )[flatEntityMapsKey].byUniversalIdentifier,
        );

        if (targetUniversalIdentifiers.length === 0) {
          continue;
        }

        await queryRunner.manager.update(
          ALL_METADATA_ENTITY_BY_METADATA_NAME[metadataName],
          {
            workspaceId,
            applicationId: In(legacyMyahApplicationIds),
            universalIdentifier: In(targetUniversalIdentifiers),
          },
          { applicationId: twentyStandardFlatApplication.id },
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.workspaceCacheService.flush(
      workspaceId,
      TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
    );
    await this.workspaceMetadataVersionService.incrementMetadataVersion(
      workspaceId,
    );
  }
}
