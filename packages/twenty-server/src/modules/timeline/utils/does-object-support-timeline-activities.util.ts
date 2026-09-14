import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { buildTimelineActivityRelatedMorphFieldMetadataName } from 'src/modules/timeline/utils/timeline-activity-related-morph-field-metadata-name-builder.util';

export const doesObjectSupportTimelineActivities = ({
  objectSingularName,
  objectFields,
  flatFieldMetadataMaps,
}: {
  objectSingularName: string;
  objectFields: FlatFieldMetadata[];
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}): boolean => {
  const timelineActivitiesField = objectFields.find(
    (field) =>
      field.isActive &&
      field.name === 'timelineActivities' &&
      field.type === FieldMetadataType.RELATION,
  );

  if (!isDefined(timelineActivitiesField?.relationTargetFieldMetadataId)) {
    return false;
  }

  const targetField = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: timelineActivitiesField.relationTargetFieldMetadataId,
    flatEntityMaps: flatFieldMetadataMaps,
  });

  return (
    isDefined(targetField) &&
    timelineActivitiesField.relationTargetObjectMetadataUniversalIdentifier ===
      STANDARD_OBJECTS.timelineActivity.universalIdentifier &&
    targetField.objectMetadataUniversalIdentifier ===
      STANDARD_OBJECTS.timelineActivity.universalIdentifier &&
    targetField.isActive &&
    targetField.type === FieldMetadataType.MORPH_RELATION &&
    targetField.name ===
      buildTimelineActivityRelatedMorphFieldMetadataName(objectSingularName) &&
    targetField.relationTargetFieldMetadataId === timelineActivitiesField.id
  );
};
