import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationBuildOrchestratorService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-build-orchestrator.service';
import { type WorkspaceMigrationBuilderAdditionalCacheDataMaps } from 'src/engine/workspace-manager/workspace-migration/types/workspace-migration-builder-additional-cache-data-maps.type';

it('keeps cached dependency maps unchanged while planning a fresh-workspace create', async () => {
  const cachedMaps = createEmptyAllFlatEntityMaps();
  const standardMaps = computeTwentyStandardApplicationAllFlatEntityMaps({
    now: '2026-01-01T00:00:00.000Z',
    workspaceId: '20202020-0000-0000-0000-000000000001',
    twentyStandardApplicationId: '20202020-0000-0000-0000-000000000002',
    removeReplacedTwentyCrmMetadata: true,
    omitDashboardComposition: true,
  }).allFlatEntityMaps;
  const searchField = Object.values(
    standardMaps.flatSearchFieldMetadataMaps.byUniversalIdentifier,
  )[0]!;

  expect(searchField).toBeDefined();
  expect(
    standardMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      searchField.objectMetadataUniversalIdentifier
    ],
  ).toBeDefined();
  const builder = Object.create(
    WorkspaceMigrationBuildOrchestratorService.prototype,
  ) as WorkspaceMigrationBuildOrchestratorService;

  // The real entity builders add planned creates to these optimistic maps.
  Reflect.set(builder, 'entityActionsBuilderTasksInExecutionOrder', [
    {
      metadataName: 'searchFieldMetadata',
      run: async ({
        optimisticAllFlatEntityMaps,
      }: {
        optimisticAllFlatEntityMaps: typeof cachedMaps;
      }) => {
        optimisticAllFlatEntityMaps.flatSearchFieldMetadataMaps.byUniversalIdentifier[
          searchField.universalIdentifier
        ] = searchField;
      },
    },
  ]);

  await builder.buildWorkspaceMigration({
    workspaceId: '20202020-0000-0000-0000-000000000001',
    buildOptions: {
      isSystemBuild: true,
      inferDeletionFromMissingEntities: true,
      applicationUniversalIdentifier: '20202020-0000-0000-0000-000000000002',
    },
    fromToAllFlatEntityMaps: {},
    dependencyAllFlatEntityMaps: cachedMaps,
    additionalCacheDataMaps: {
      featureFlagsMap:
        {} as WorkspaceMigrationBuilderAdditionalCacheDataMaps['featureFlagsMap'],
    },
  });

  expect(
    cachedMaps.flatSearchFieldMetadataMaps.byUniversalIdentifier[
      searchField.universalIdentifier
    ],
  ).toBeUndefined();
});
