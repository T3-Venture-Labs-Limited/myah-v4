import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { buildFromToAllUniversalFlatEntityMaps } from 'src/engine/core-modules/application/application-manifest/utils/build-from-to-all-universal-flat-entity-maps.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import type { FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isMorphOrRelationFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-morph-or-relation-flat-field-metadata.util';
import { getSubFlatEntityMapsByUniversalIdentifiersOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-universal-identifiers-or-throw.util';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type {
  AdditionalCacheDataMaps,
  WorkspaceCacheKeyName,
} from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { flatEntityToScalarFlatEntity } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/flat-entity-to-scalar-flat-entity.util';
import { getWorkspaceSchemaContextForMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/get-workspace-schema-context-for-migration.util';

type SyncableFlatEntityMaps = FlatEntityMaps<SyncableFlatEntity>;
type TwentyStandardMetadataName =
  (typeof TWENTY_STANDARD_ALL_METADATA_NAME)[number];
type MissingRelationPair = {
  source: FlatFieldMetadata;
  target: FlatFieldMetadata;
};

export type SourceControlledMyahMetadataSelection = Partial<
  Record<TwentyStandardMetadataName, ReadonlySet<string>>
>;

@Injectable()
export class SynchronizeSourceControlledMyahMetadataService {
  private readonly logger = new Logger(
    SynchronizeSourceControlledMyahMetadataService.name,
  );

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
  ) {}

  async synchronizeWorkspace(
    { workspaceId, options, dataSource }: RunOnWorkspaceArgs,
    selection: SourceControlledMyahMetadataSelection,
  ): Promise<void> {
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const metadataCacheKeys = [
      ...(TWENTY_STANDARD_ALL_METADATA_NAME.map(
        (metadataName) =>
          `flat${metadataName.charAt(0).toUpperCase()}${metadataName.slice(1)}Maps`,
      ) as WorkspaceCacheKeyName[]),
      'featureFlagsMap',
    ] satisfies WorkspaceCacheKeyName[];
    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      metadataCacheKeys,
    );
    let cachedMetadata = await this.workspaceCacheService.getOrRecompute(
      workspaceId,
      metadataCacheKeys,
    );
    let fromAllFlatEntityMaps =
      cachedMetadata as unknown as TwentyStandardAllFlatEntityMaps;
    const featureFlagsMap =
      cachedMetadata.featureFlagsMap as AdditionalCacheDataMaps['featureFlagsMap'];
    const {
      allFlatEntityMaps: standardAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
    } = computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId,
      twentyStandardApplicationId: twentyStandardFlatApplication.id,
    });

    const restoredRelationMetadata =
      await this.restoreMissingRelationMetadataOverExistingColumns({
        dataSource,
        fromAllFlatEntityMaps,
        isDryRun: options.dryRun ?? false,
        selection,
        standardAllFlatEntityMaps,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
        workspaceId,
      });

    if (restoredRelationMetadata) {
      await this.workspaceCacheService.flush(workspaceId, [
        'flatFieldMetadataMaps',
        'ORMEntityMetadatas',
        'graphQLResolverNameMap',
      ]);
      await this.workspaceMetadataVersionService.incrementMetadataVersion(
        workspaceId,
      );
      await this.workspaceCacheService.invalidateAndRecompute(
        workspaceId,
        metadataCacheKeys,
      );
      cachedMetadata = await this.workspaceCacheService.getOrRecompute(
        workspaceId,
        metadataCacheKeys,
      );
      fromAllFlatEntityMaps =
        cachedMetadata as unknown as TwentyStandardAllFlatEntityMaps;
    }

    const selectedFieldMetadataUniversalIdentifiers = new Set(
      selection.fieldMetadata,
    );
    for (const viewFieldUniversalIdentifier of selection.viewField ?? []) {
      const viewField =
        standardAllFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier[
          viewFieldUniversalIdentifier
        ];

      if (isDefined(viewField?.fieldMetadataUniversalIdentifier)) {
        selectedFieldMetadataUniversalIdentifiers.add(
          viewField.fieldMetadataUniversalIdentifier,
        );
      }
    }
    for (const fieldUniversalIdentifier of selectedFieldMetadataUniversalIdentifiers) {
      const field =
        standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
          fieldUniversalIdentifier
        ];

      if (isDefined(field?.relationTargetFieldMetadataUniversalIdentifier)) {
        selectedFieldMetadataUniversalIdentifiers.add(
          field.relationTargetFieldMetadataUniversalIdentifier,
        );
      }
    }

    const toAllFlatEntityMaps = createEmptyAllFlatEntityMaps();
    const fromSelectedFlatEntityMaps = createEmptyAllFlatEntityMaps();
    const dependencyAllFlatEntityMaps = createEmptyAllFlatEntityMaps();
    const standardFlatEntityMapsByKey =
      standardAllFlatEntityMaps as unknown as Record<
        string,
        SyncableFlatEntityMaps
      >;
    const fromFlatEntityMapsByKey = fromAllFlatEntityMaps as unknown as Record<
      string,
      SyncableFlatEntityMaps
    >;
    const toFlatEntityMapsByKey = toAllFlatEntityMaps as unknown as Record<
      string,
      SyncableFlatEntityMaps
    >;
    const fromSelectedFlatEntityMapsByKey =
      fromSelectedFlatEntityMaps as unknown as Record<
        string,
        SyncableFlatEntityMaps
      >;
    const dependencyAllFlatEntityMapsByKey =
      dependencyAllFlatEntityMaps as unknown as Record<
        string,
        SyncableFlatEntityMaps
      >;

    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      const selectedUniversalIdentifiers =
        metadataName === 'fieldMetadata'
          ? selectedFieldMetadataUniversalIdentifiers
          : selection[metadataName];
      const fromFlatEntityMaps = fromFlatEntityMapsByKey[flatEntityMapsKey];

      dependencyAllFlatEntityMapsByKey[flatEntityMapsKey] = structuredClone(
        fromFlatEntityMaps,
      );

      if (!selectedUniversalIdentifiers || selectedUniversalIdentifiers.size === 0) {
        continue;
      }

      toFlatEntityMapsByKey[flatEntityMapsKey] =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: standardFlatEntityMapsByKey[flatEntityMapsKey],
          universalIdentifiers: selectedUniversalIdentifiers,
        });
      fromSelectedFlatEntityMapsByKey[flatEntityMapsKey] =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: fromFlatEntityMaps,
          universalIdentifiers: selectedUniversalIdentifiers,
        });
    }

    const hasMissingSelectedMetadata =
      TWENTY_STANDARD_ALL_METADATA_NAME.some((metadataName) => {
        const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
        const desiredFlatEntityMaps = toFlatEntityMapsByKey[flatEntityMapsKey];
        const currentFlatEntityMaps = fromFlatEntityMapsByKey[flatEntityMapsKey];

        return Object.keys(desiredFlatEntityMaps.byUniversalIdentifier).some(
          (universalIdentifier) =>
            currentFlatEntityMaps.byUniversalIdentifier[universalIdentifier] ===
            undefined,
        );
      });

    if (!hasMissingSelectedMetadata || options.dryRun) {
      return;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          workspaceId,
          buildOptions: {
            applicationUniversalIdentifier:
              twentyStandardFlatApplication.universalIdentifier,
            inferDeletionFromMissingEntities: {},
            isSystemBuild: true,
          },
          fromToAllFlatEntityMaps: buildFromToAllUniversalFlatEntityMaps({
            fromAllFlatEntityMaps: fromSelectedFlatEntityMaps,
            toAllUniversalFlatEntityMaps: toAllFlatEntityMaps,
          }),
          dependencyAllFlatEntityMaps,
          additionalCacheDataMaps: { featureFlagsMap },
          idByUniversalIdentifierByMetadataName,
          dryRun: false,
        },
      );

    if (result.status === 'fail') {
      const selectedMetadataByName = Object.fromEntries(
        Object.entries(selection).map(
          ([metadataName, universalIdentifiers]) => [
            metadataName,
            [...universalIdentifiers],
          ],
        ),
      );

      this.logger.error(
        `Failed to synchronize source-controlled Myah metadata for workspace ${workspaceId}:\n${JSON.stringify(
          { result, selection: selectedMetadataByName },
          null,
          2,
        )}`,
      );
      throw new Error(
        `Failed to synchronize source-controlled Myah metadata for workspace ${workspaceId}`,
      );
    }
  }

  // Deviation rationale: the normal migration runner creates schema columns with
  // field metadata. Recovery follows the 2-8 metadata-only precedent when a
  // missing relation metadata pair already owns its join column.
  private async restoreMissingRelationMetadataOverExistingColumns({
    dataSource,
    fromAllFlatEntityMaps,
    isDryRun,
    selection,
    standardAllFlatEntityMaps,
    twentyStandardApplicationId,
    workspaceId,
  }: {
    dataSource: RunOnWorkspaceArgs['dataSource'];
    fromAllFlatEntityMaps: TwentyStandardAllFlatEntityMaps;
    isDryRun: boolean;
    selection: SourceControlledMyahMetadataSelection;
    standardAllFlatEntityMaps: TwentyStandardAllFlatEntityMaps;
    twentyStandardApplicationId: string;
    workspaceId: string;
  }): Promise<boolean> {
    const selectedFieldUniversalIdentifiers = selection.fieldMetadata;

    if (
      isDryRun ||
      !isDefined(dataSource) ||
      !isDefined(selectedFieldUniversalIdentifiers) ||
      selectedFieldUniversalIdentifiers.size === 0
    ) {
      return false;
    }

    const standardFields =
      standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
    const currentFields =
      fromAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
    const currentObjects =
      fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier;
    const missingRelationPairs = Object.values(standardFields)
      .filter(isDefined)
      .flatMap((sourceField) => {
        if (isMorphOrRelationFlatFieldMetadata(sourceField) === false) {
          return [];
        }

        const targetUniversalIdentifier =
          sourceField.relationTargetFieldMetadataUniversalIdentifier;
        const isSelectedRelationPair =
          isDefined(targetUniversalIdentifier) &&
          selectedFieldUniversalIdentifiers.has(
            sourceField.universalIdentifier,
          ) &&
          selectedFieldUniversalIdentifiers.has(targetUniversalIdentifier);
        const relationPairIsAlreadyRestored =
          isDefined(currentFields[sourceField.universalIdentifier]) &&
          isDefined(currentFields[targetUniversalIdentifier]);

        if (
          sourceField.settings.relationType !== RelationType.MANY_TO_ONE ||
          isSelectedRelationPair === false ||
          relationPairIsAlreadyRestored
        ) {
          return [];
        }

        const targetField = standardFields[targetUniversalIdentifier];
        const sourceObject =
          currentObjects[sourceField.objectMetadataUniversalIdentifier];
        const targetObject = isDefined(
          sourceField.relationTargetObjectMetadataUniversalIdentifier,
        )
          ? currentObjects[
              sourceField.relationTargetObjectMetadataUniversalIdentifier
            ]
          : undefined;

        if (isDefined(targetField) === false) {
          return [];
        }

        if (isDefined(sourceObject) === false) {
          return [];
        }

        if (isDefined(targetObject) === false) {
          return [];
        }

        return [{ source: sourceField, target: targetField }];
      });

    if (missingRelationPairs.length === 0) {
      return false;
    }

    const queryRunner = dataSource.createQueryRunner();
    const missingRelationPairsWithExistingColumns: MissingRelationPair[] = [];

    try {
      await queryRunner.connect();

      for (const relationPair of missingRelationPairs) {
        const sourceObject =
          currentObjects[
            relationPair.source.objectMetadataUniversalIdentifier
          ];

        if (!isDefined(sourceObject)) {
          continue;
        }

        const { schemaName, tableName } = getWorkspaceSchemaContextForMigration({
          workspaceId,
          objectMetadata: sourceObject,
        });
        const joinColumnName = computeMorphOrRelationFieldJoinColumnName({
          name: relationPair.source.name,
        });
        const [column] = await queryRunner.query(
          `SELECT EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = $1
               AND table_name = $2
               AND column_name = $3
           ) AS "exists"`,
          [schemaName, tableName, joinColumnName],
        );

        if (column?.exists) {
          missingRelationPairsWithExistingColumns.push(relationPair);
        }
      }
    } finally {
      await queryRunner.release();
    }

    if (missingRelationPairsWithExistingColumns.length === 0) {
      return false;
    }

    const restoredFieldIdsByUniversalIdentifier = new Map<string, string>();
    const fieldsToRestore = new Map<string, FlatFieldMetadata>();

    for (const { source, target } of missingRelationPairsWithExistingColumns) {
      for (const field of [source, target]) {
        if (!isDefined(currentFields[field.universalIdentifier])) {
          restoredFieldIdsByUniversalIdentifier.set(
            field.universalIdentifier,
            uuidv4(),
          );
          fieldsToRestore.set(field.universalIdentifier, field);
        }
      }
    }

    const survivingRelationTargetUpdates = new Map<string, string>();

    for (const { source, target } of missingRelationPairsWithExistingColumns) {
      for (const field of [source, target]) {
        const relationTargetFieldUniversalIdentifier =
          field.relationTargetFieldMetadataUniversalIdentifier;

        if (!isDefined(relationTargetFieldUniversalIdentifier)) {
          continue;
        }

        const existingField = currentFields[field.universalIdentifier];
        const restoredRelationTargetFieldId =
          restoredFieldIdsByUniversalIdentifier.get(
            relationTargetFieldUniversalIdentifier,
          );

        if (
          isDefined(existingField) &&
          isDefined(restoredRelationTargetFieldId)
        ) {
          survivingRelationTargetUpdates.set(
            existingField.id,
            restoredRelationTargetFieldId,
          );
        }
      }
    }

    const getFieldId = (universalIdentifier: string) =>
      currentFields[universalIdentifier]?.id ??
      restoredFieldIdsByUniversalIdentifier.get(universalIdentifier);

    const restoredFields = [...fieldsToRestore.values()].map((sourceField) => {
      const objectMetadata =
        currentObjects[sourceField.objectMetadataUniversalIdentifier];
      const relationTargetObjectMetadata = isDefined(
        sourceField.relationTargetObjectMetadataUniversalIdentifier,
      )
        ? currentObjects[
            sourceField.relationTargetObjectMetadataUniversalIdentifier
          ]
        : undefined;
      const relationTargetFieldMetadataId = isDefined(
        sourceField.relationTargetFieldMetadataUniversalIdentifier,
      )
        ? (getFieldId(
            sourceField.relationTargetFieldMetadataUniversalIdentifier,
          ) ?? null)
        : null;

      const fieldId = getFieldId(sourceField.universalIdentifier);

      if (
        !isDefined(fieldId) ||
        !isDefined(objectMetadata) ||
        (isDefined(
          sourceField.relationTargetObjectMetadataUniversalIdentifier,
        ) && !isDefined(relationTargetObjectMetadata)) ||
        (isDefined(
          sourceField.relationTargetFieldMetadataUniversalIdentifier,
        ) && !isDefined(relationTargetFieldMetadataId))
      ) {
        throw new Error(
          `Missing metadata dependency while restoring relation field ${sourceField.universalIdentifier}`,
        );
      }

      return {
        ...sourceField,
        id: fieldId,
        workspaceId,
        applicationId: twentyStandardApplicationId,
        objectMetadataId: objectMetadata.id,
        relationTargetObjectMetadataId:
          relationTargetObjectMetadata?.id ?? null,
        relationTargetFieldMetadataId,
      };
    });

    await this.fieldMetadataRepository.insert(
      restoredFields.map((flatFieldMetadata) =>
        flatEntityToScalarFlatEntity({
          metadataName: 'fieldMetadata',
          flatEntity: flatFieldMetadata,
        }),
      ),
    );

    await Promise.all(
      [...survivingRelationTargetUpdates].map(
        ([fieldId, relationTargetFieldMetadataId]) =>
          this.fieldMetadataRepository.update(
            { id: fieldId },
            { relationTargetFieldMetadataId },
          ),
      ),
    );

    return true;
  }
}
