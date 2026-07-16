import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ALL_MANY_TO_ONE_METADATA_RELATIONS } from 'src/engine/metadata-modules/flat-entity/constant/all-many-to-one-metadata-relations.constant';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { pruneDanglingForeignKeyAggregatorsInAllFlatEntityMapsThroughMutation } from 'src/engine/metadata-modules/flat-entity/utils/prune-dangling-foreign-key-aggregators-in-all-flat-entity-maps-through-mutation.util';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';

type MetadataName = keyof typeof ALL_MANY_TO_ONE_METADATA_RELATIONS;

type UniversalManyToOneRelation = {
  metadataName: MetadataName;
  universalForeignKey: string;
} | null;

type UniversalFlatEntity = {
  id: string;
  universalIdentifier: string;
  [key: string]: unknown;
};

type MutableFlatEntityMaps = {
  byUniversalIdentifier: Partial<Record<string, UniversalFlatEntity>>;
  universalIdentifierById: Partial<Record<string, string>>;
  universalIdentifiersByApplicationId: Partial<Record<string, string[]>>;
};

const REPLACED_CRM_OBJECT_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.person.universalIdentifier,
  STANDARD_OBJECTS.company.universalIdentifier,
  STANDARD_OBJECTS.opportunity.universalIdentifier,
] as const;

const referencesRemovedEntity = ({
  flatEntity,
  metadataName,
  removedUniversalIdentifiersByMetadataName,
}: {
  flatEntity: UniversalFlatEntity;
  metadataName: MetadataName;
  removedUniversalIdentifiersByMetadataName: Partial<
    Record<MetadataName, Set<string>>
  >;
}): boolean => {
  const relations = Object.values(
    ALL_MANY_TO_ONE_METADATA_RELATIONS[metadataName],
  ) as UniversalManyToOneRelation[];

  if (
    relations.some((relation) => {
      if (!isDefined(relation)) {
        return false;
      }

      const referencedUniversalIdentifier =
        flatEntity[relation.universalForeignKey];

      return (
        typeof referencedUniversalIdentifier === 'string' &&
        removedUniversalIdentifiersByMetadataName[relation.metadataName]?.has(
          referencedUniversalIdentifier,
        ) === true
      );
    })
  ) {
    return true;
  }

  if (
    metadataName === 'fieldMetadata' &&
    isDefined(flatEntity.universalSettings) &&
    typeof flatEntity.universalSettings === 'object' &&
    'junctionTargetFieldUniversalIdentifier' in
      flatEntity.universalSettings &&
    typeof flatEntity.universalSettings
      .junctionTargetFieldUniversalIdentifier === 'string' &&
    removedUniversalIdentifiersByMetadataName.fieldMetadata?.has(
      flatEntity.universalSettings.junctionTargetFieldUniversalIdentifier,
    ) === true
  ) {
    return true;
  }

  if (
    metadataName === 'pageLayoutWidget' &&
    isDefined(flatEntity.universalConfiguration) &&
    typeof flatEntity.universalConfiguration === 'object' &&
    'configurationType' in flatEntity.universalConfiguration &&
    flatEntity.universalConfiguration.configurationType === 'FIELD' &&
    'fieldMetadataId' in flatEntity.universalConfiguration &&
    typeof flatEntity.universalConfiguration.fieldMetadataId === 'string' &&
    removedUniversalIdentifiersByMetadataName.fieldMetadata?.has(
      flatEntity.universalConfiguration.fieldMetadataId,
    ) === true
  ) {
    return true;
  }

  if (
    metadataName !== 'index' ||
    !('universalFlatIndexFieldMetadatas' in flatEntity) ||
    !Array.isArray(flatEntity.universalFlatIndexFieldMetadatas)
  ) {
    return false;
  }

  const removedFieldUniversalIdentifiers =
    removedUniversalIdentifiersByMetadataName.fieldMetadata;

  if (!isDefined(removedFieldUniversalIdentifiers)) {
    return false;
  }

  return flatEntity.universalFlatIndexFieldMetadatas.some((indexField) => {
    if (
      !isDefined(indexField) ||
      typeof indexField !== 'object' ||
      !('fieldMetadataUniversalIdentifier' in indexField)
    ) {
      return false;
    }

    const fieldMetadataUniversalIdentifier =
      indexField.fieldMetadataUniversalIdentifier;

    return (
      typeof fieldMetadataUniversalIdentifier === 'string' &&
      removedFieldUniversalIdentifiers.has(fieldMetadataUniversalIdentifier)
    );
  });
};

export const getReplacedTwentyCrmMetadataUniversalIdentifiers = (
  allFlatEntityMaps: TwentyStandardAllFlatEntityMaps,
): Partial<Record<MetadataName, Set<string>>> => {
  const removedUniversalIdentifiersByMetadataName: Partial<
    Record<MetadataName, Set<string>>
  > = {
    objectMetadata: new Set(REPLACED_CRM_OBJECT_UNIVERSAL_IDENTIFIERS),
  };

  let removedAnEntity = true;

  while (removedAnEntity) {
    removedAnEntity = false;

    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      // Every standard metadata category has the same FlatEntityMaps indexes.
      const flatEntityMaps = allFlatEntityMaps[
        flatEntityMapsKey
      ] as unknown as MutableFlatEntityMaps;
      const removedUniversalIdentifiers =
        removedUniversalIdentifiersByMetadataName[metadataName] ??
        new Set<string>();

      removedUniversalIdentifiersByMetadataName[metadataName] =
        removedUniversalIdentifiers;

      for (const flatEntity of Object.values(
        flatEntityMaps.byUniversalIdentifier,
      ).filter(isDefined)) {
        if (
          removedUniversalIdentifiers.has(flatEntity.universalIdentifier) ||
          !referencesRemovedEntity({
            flatEntity,
            metadataName,
            removedUniversalIdentifiersByMetadataName,
          })
        ) {
          continue;
        }

        removedUniversalIdentifiers.add(flatEntity.universalIdentifier);
        removedAnEntity = true;
      }
    }
  }

  return removedUniversalIdentifiersByMetadataName;
};

export const removeReplacedTwentyCrmMetadata = (
  allFlatEntityMaps: TwentyStandardAllFlatEntityMaps,
): TwentyStandardAllFlatEntityMaps => {
  const removedUniversalIdentifiersByMetadataName =
    getReplacedTwentyCrmMetadataUniversalIdentifiers(allFlatEntityMaps);

  for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
    const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
    // Every standard metadata category has the same FlatEntityMaps indexes.
    const flatEntityMaps = allFlatEntityMaps[
      flatEntityMapsKey
    ] as unknown as MutableFlatEntityMaps;
    const removedUniversalIdentifiers =
      removedUniversalIdentifiersByMetadataName[metadataName];

    if (!isDefined(removedUniversalIdentifiers)) {
      continue;
    }

    for (const universalIdentifier of removedUniversalIdentifiers) {
      const flatEntity =
        flatEntityMaps.byUniversalIdentifier[universalIdentifier];

      if (!isDefined(flatEntity)) {
        continue;
      }

      delete flatEntityMaps.byUniversalIdentifier[universalIdentifier];
      delete flatEntityMaps.universalIdentifierById[flatEntity.id];
    }

    for (const [applicationId, universalIdentifiers] of Object.entries(
      flatEntityMaps.universalIdentifiersByApplicationId,
    )) {
      if (!isDefined(universalIdentifiers)) {
        continue;
      }

      const retainedUniversalIdentifiers = universalIdentifiers.filter(
        (universalIdentifier) =>
          !removedUniversalIdentifiers.has(universalIdentifier),
      );

      if (retainedUniversalIdentifiers.length === 0) {
        delete flatEntityMaps.universalIdentifiersByApplicationId[applicationId];
      } else {
        flatEntityMaps.universalIdentifiersByApplicationId[applicationId] =
          retainedUniversalIdentifiers;
      }
    }
  }

  pruneDanglingForeignKeyAggregatorsInAllFlatEntityMapsThroughMutation({
    allFlatEntityMapsToMutate: allFlatEntityMaps,
  });

  return allFlatEntityMaps;
};
