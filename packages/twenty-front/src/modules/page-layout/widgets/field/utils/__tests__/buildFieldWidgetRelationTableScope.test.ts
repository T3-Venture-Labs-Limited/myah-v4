import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { buildFieldWidgetRelationTableScope } from '@/page-layout/widgets/field/utils/buildFieldWidgetRelationTableScope';
import { computeRecordGqlOperationFilter } from 'twenty-shared/utils';
import { FieldMetadataType, ViewFilterOperand } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

const recordId = '048c7cbe-676d-40f1-98a2-4c3444996381';
const otherId = '148c7cbe-676d-40f1-98a2-4c3444996381';
const source = {
  id: 'creator-object',
  readableFields: [{ id: 'profiles-field', isActive: true }],
};
const inverse = {
  id: 'creator-field',
  name: 'creator',
  label: 'Creator',
  type: FieldMetadataType.RELATION,
  isActive: true,
  relation: {
    type: RelationType.MANY_TO_ONE,
    targetObjectMetadata: { id: 'creator-object' },
    targetFieldMetadata: { id: 'profiles-field' },
  },
};
const target = {
  id: 'profile-object',
  fields: [inverse],
  readableFields: [inverse],
};
const definition = {
  fieldMetadataId: 'profiles-field',
  metadata: {
    relationType: RelationType.ONE_TO_MANY,
    relationFieldMetadataId: 'creator-field',
    relationObjectMetadataId: 'profile-object',
  },
};
const permissions = {
  'creator-object': { canReadObjectRecords: true, restrictedFields: {} },
  'profile-object': { canReadObjectRecords: true, restrictedFields: {} },
};
const makeScope = (overrides: Record<string, unknown> = {}) =>
  buildFieldWidgetRelationTableScope({
    recordId,
    source,
    target,
    definition,
    permissions,
    ...overrides,
  });

describe('FIELD/TABLE mandatory relation scope', () => {
  it('compiles the inverse creator relation synchronously and conjoins conflicting saved filters', () => {
    const scope = makeScope();
    expect(scope).toBeDefined();
    const savedFilter: RecordFilter = {
      id: 'edited-saved-filter',
      fieldMetadataId: inverse.id,
      value: JSON.stringify({ selectedRecordIds: [otherId] }),
      displayValue: '',
      type: 'RELATION',
      operand: ViewFilterOperand.IS,
      label: 'Creator',
    };
    const compiled = computeRecordGqlOperationFilter({
      fieldMetadataItems: [inverse],
      recordFilterGroups: [],
      filterValueDependencies: {},
      recordFilters: [scope!.filter, savedFilter],
    });
    expect(compiled).toEqual({
      and: [
        { creatorId: { in: [recordId] } },
        { creatorId: { in: [otherId] } },
      ],
    });
    expect(scope!.creationInput).toEqual({ creatorId: recordId });
    expect(
      computeRecordGqlOperationFilter({
        fieldMetadataItems: [inverse],
        recordFilterGroups: [],
        filterValueDependencies: {},
        recordFilters: [scope!.filter],
      }),
    ).toEqual({ creatorId: { in: [recordId] } });
  });

  it.each([
    { recordId: '' },
    { recordId: 'invalid' },
    { source: undefined },
    { target: undefined },
    { permissions: undefined },
    {
      permissions: {
        ...permissions,
        'creator-object': { canReadObjectRecords: false },
      },
    },
    {
      permissions: {
        ...permissions,
        'profile-object': { canReadObjectRecords: false },
      },
    },
    { source: { ...source, readableFields: [] } },
    { target: { ...target, readableFields: [] } },
    {
      definition: {
        ...definition,
        metadata: { ...definition.metadata, relationFieldMetadataId: 'wrong' },
      },
    },
    {
      target: {
        ...target,
        fields: [
          {
            ...inverse,
            relation: { ...inverse.relation, type: RelationType.ONE_TO_MANY },
          },
        ],
      },
    },
  ])('fails closed for unavailable context %#', (overrides) => {
    expect(makeScope(overrides)).toBeUndefined();
  });
});
