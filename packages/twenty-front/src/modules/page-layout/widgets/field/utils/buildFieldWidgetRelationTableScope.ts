import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { FieldMetadataType, ViewFilterOperand } from 'twenty-shared/types';
import {
  computeRecordGqlOperationFilter,
  isValidUuid,
} from 'twenty-shared/utils';
import { RelationType } from '~/generated-metadata/graphql';

type RelationField = {
  id: string;
  name: string;
  label: string;
  type: FieldMetadataType;
  isActive?: boolean | null;
  relation?: {
    type: RelationType;
    targetObjectMetadata: { id: string };
    targetFieldMetadata: { id: string };
  } | null;
};
type ObjectWithRelation = {
  id: string;
  readableFields: { id: string; isActive?: boolean | null }[];
  fields?: RelationField[];
};

type RelationScopeInput = {
  recordId: string;
  source?: ObjectWithRelation;
  target?: ObjectWithRelation;
  definition: {
    fieldMetadataId: string;
    metadata: {
      relationType?: RelationType;
      relationFieldMetadataId?: string;
      relationObjectMetadataId?: string;
    };
  };
  permissions?: Record<
    string,
    {
      canReadObjectRecords?: boolean | null;
      restrictedFields?: Record<string, { canRead?: boolean | null }> | null;
    }
  >;
};

// A relation widget must never mount its query subtree without a compilable,
// readable inverse foreign-key predicate. Saved view filters are not authority.
export const buildFieldWidgetRelationTableScope = ({
  recordId,
  source,
  target,
  definition,
  permissions,
}: RelationScopeInput):
  | { filter: RecordFilter; creationInput: Record<string, string> }
  | undefined => {
  const inverseId = definition.metadata.relationFieldMetadataId;
  const sourceFieldId = definition.fieldMetadataId;
  if (
    !isValidUuid(recordId) ||
    !source ||
    !target ||
    !permissions ||
    definition.metadata.relationType !== RelationType.ONE_TO_MANY ||
    definition.metadata.relationObjectMetadataId !== target.id ||
    !inverseId ||
    !source.readableFields.some(
      (field) => field.id === sourceFieldId && field.isActive,
    ) ||
    !target.readableFields.some(
      (field) => field.id === inverseId && field.isActive,
    )
  )
    return;

  const inverse = target.fields?.find((field) => field.id === inverseId);
  if (
    !inverse ||
    !inverse.isActive ||
    inverse.type !== FieldMetadataType.RELATION ||
    inverse.relation?.type !== RelationType.MANY_TO_ONE ||
    inverse.relation.targetObjectMetadata.id !== source.id ||
    inverse.relation.targetFieldMetadata.id !== sourceFieldId
  )
    return;

  for (const [objectId, fieldId] of [
    [source.id, sourceFieldId],
    [target.id, inverseId],
  ]) {
    const permission = permissions[objectId];
    // The workspace permission map is sparse: an absent object entry means
    // unrestricted only after the workspace's permissions have loaded.
    if (
      permission?.canReadObjectRecords === false ||
      permission?.restrictedFields?.[fieldId]?.canRead === false
    )
      return;
  }

  const filter: RecordFilter = {
    id: `widget-relation-${sourceFieldId}-${recordId}`,
    fieldMetadataId: inverse.id,
    value: JSON.stringify({
      selectedRecordIds: [recordId],
      isCurrentRecordSelected: false,
      isCurrentWorkspaceMemberSelected: false,
    }),
    displayValue: '',
    type: 'RELATION',
    operand: ViewFilterOperand.IS,
    label: inverse.label,
  };
  const compiled = computeRecordGqlOperationFilter({
    fieldMetadataItems: [inverse],
    recordFilters: [filter],
    recordFilterGroups: [],
    filterValueDependencies: {},
  });
  const joinColumn = `${inverse.name}Id`;
  if (
    Object.keys(compiled).length !== 1 ||
    JSON.stringify(compiled) !==
      JSON.stringify({ [joinColumn]: { in: [recordId] } })
  )
    return;
  return { filter, creationInput: { [joinColumn]: recordId } };
};
