import { Injectable } from '@nestjs/common';
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { MetadataFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/metadata-flat-entity.type';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { getSubFlatEntityMapsByApplicationIdsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-application-ids-or-throw.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { FromToAllUniversalFlatEntityMaps } from 'src/engine/workspace-manager/workspace-migration/types/workspace-migration-orchestrator.type';

export type TwentyStandardApplicationProfile = 'full' | 'myah';

// TODO completely deprecate this file once we've created the twenty-standard twenty-app manifest
@Injectable()
export class TwentyStandardApplicationService {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async synchronizeTwentyStandardApplicationOrThrow({
    workspaceId,
    profile,
  }: {
    workspaceId: string;
    profile: TwentyStandardApplicationProfile;
  }) {
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        {
          workspaceId,
        },
      );
    const { featureFlagsMap, ...fromTwentyStandardAllFlatEntityMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        ...TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
        'featureFlagsMap',
      ]);

    const objectMaps = getSubFlatEntityMapsByApplicationIdsOrThrow({
      applicationIds: [twentyStandardFlatApplication.id],
      flatEntityMaps:
        fromTwentyStandardAllFlatEntityMaps.flatObjectMetadataMaps,
    });
    const installedPartnershipObjects = [
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
    ].filter((id) => objectMaps.byUniversalIdentifier[id] !== undefined);

    const laterObjects = [
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion,
      MYAH_STANDARD_OBJECTS.partnershipObligation,
    ];
    const laterFields = [
      ...laterObjects.flatMap((object) =>
        Object.values(object.fields).map((field) => field.universalIdentifier),
      ),
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
        .universalIdentifier,
      STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
    ];
    const laterIndexes = laterObjects.flatMap((object) =>
      Object.values(object.indexes).map((index) => index.universalIdentifier),
    );
    const fieldMaps = getSubFlatEntityMapsByApplicationIdsOrThrow({
      applicationIds: [twentyStandardFlatApplication.id],
      flatEntityMaps: fromTwentyStandardAllFlatEntityMaps.flatFieldMetadataMaps,
    });
    const indexMaps = getSubFlatEntityMapsByApplicationIdsOrThrow({
      applicationIds: [twentyStandardFlatApplication.id],
      flatEntityMaps: fromTwentyStandardAllFlatEntityMaps.flatIndexMaps,
    });
    const permissionMaps = getSubFlatEntityMapsByApplicationIdsOrThrow({
      applicationIds: [twentyStandardFlatApplication.id],
      flatEntityMaps:
        fromTwentyStandardAllFlatEntityMaps.flatObjectPermissionMaps,
    });
    if (
      installedPartnershipObjects.length === 1 ||
      (installedPartnershipObjects.length === 0 &&
        (laterFields.some(
          (id) => fieldMaps.byUniversalIdentifier[id] !== undefined,
        ) ||
          laterIndexes.some(
            (id) => indexMaps.byUniversalIdentifier[id] !== undefined,
          ) ||
          Object.values(permissionMaps.byUniversalIdentifier).some(
            (permission) =>
              permission !== undefined &&
              laterObjects.some(
                (object) =>
                  permission.objectMetadataUniversalIdentifier ===
                  object.universalIdentifier,
              ),
          )))
    ) {
      throw new Error(
        'Unsupported partial partnership metadata: inspect applied B before standard application synchronization',
      );
    }

    const {
      allFlatEntityMaps: toTwentyStandardAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
    } = computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId,
      twentyStandardApplicationId: twentyStandardFlatApplication.id,
      removeReplacedTwentyCrmMetadata: profile === 'myah',
      omitPartnershipFacts: installedPartnershipObjects.length === 0,
    });

    const fromToAllFlatEntityMaps: FromToAllUniversalFlatEntityMaps = {};

    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      const fromFlatEntityMaps =
        fromTwentyStandardAllFlatEntityMaps[flatEntityMapsKey];
      const fromTo = {
        from: getSubFlatEntityMapsByApplicationIdsOrThrow<
          MetadataFlatEntity<typeof metadataName>
        >({
          applicationIds: [twentyStandardFlatApplication.id],
          flatEntityMaps: fromFlatEntityMaps,
        }),
        to: toTwentyStandardAllFlatEntityMaps[flatEntityMapsKey],
      };

      // @ts-expect-error Metadata flat entity maps cache key and metadataName colliding
      fromToAllFlatEntityMaps[flatEntityMapsKey] = fromTo;
    }

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          buildOptions: {
            isSystemBuild: true,
            inferDeletionFromMissingEntities: true,
            applicationUniversalIdentifier:
              twentyStandardFlatApplication.universalIdentifier,
          },
          fromToAllFlatEntityMaps,
          workspaceId,
          additionalCacheDataMaps: {
            featureFlagsMap,
          },
          idByUniversalIdentifierByMetadataName,
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        validateAndBuildResult,
        'Multiple validation errors occurred while synchronizing twenty-standard application',
      );
    }
  }
}
