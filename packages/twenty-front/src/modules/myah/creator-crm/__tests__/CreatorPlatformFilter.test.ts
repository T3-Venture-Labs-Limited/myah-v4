import { computeRecordGqlOperationFilter } from 'twenty-shared/utils';
import { FieldMetadataType, ViewFilterOperand } from 'twenty-shared/types';

const fieldMetadataItems = [
  {
    id: 'creator-social-profiles',
    name: 'socialProfiles',
    label: 'Social profiles',
    type: FieldMetadataType.RELATION,
  },
  {
    id: 'social-profile-platform',
    name: 'platform',
    label: 'Platform',
    type: FieldMetadataType.SELECT,
  },
  {
    id: 'creator-list-memberships',
    name: 'listMemberships',
    label: 'List memberships',
    type: FieldMetadataType.RELATION,
  },
  {
    id: 'membership-list',
    name: 'creatorList',
    label: 'Creator List',
    type: FieldMetadataType.RELATION,
  },
] as never;

const platformFilter = {
  fieldMetadataId: 'creator-social-profiles',
  relationTargetFieldMetadataId: 'social-profile-platform',
  value: JSON.stringify(['INSTAGRAM']),
  displayValue: 'Instagram',
  operand: ViewFilterOperand.IS,
  type: 'RELATION' as const,
  label: 'Social profiles → Platform',
};

const filterValueDependencies = {
  currentWorkspaceMemberId: 'workspace-member-id',
  timeZone: 'UTC',
};

describe('Creator platform filters', () => {
  it('uses relation traversal on the Creator surface', () => {
    expect(
      computeRecordGqlOperationFilter({
        filterValueDependencies,
        recordFilters: [platformFilter],
        recordFilterGroups: [],
        fieldMetadataItems,
      }),
    ).toEqual({ socialProfiles: { platform: { in: ['INSTAGRAM'] } } });
  });

  it('keeps Creator List scope and platform matching in the same query', () => {
    expect(
      computeRecordGqlOperationFilter({
        filterValueDependencies,
        recordFilters: [
          platformFilter,
          {
            fieldMetadataId: 'creator-list-memberships',
            relationTargetFieldMetadataId: 'membership-list',
            value: '11111111-1111-4111-8111-111111111111',
            displayValue: 'Creator List',
            operand: ViewFilterOperand.IS,
            type: 'RELATION',
            label: 'List memberships → Creator List',
          },
        ],
        recordFilterGroups: [],
        fieldMetadataItems,
      }),
    ).toEqual({
      and: [
        { socialProfiles: { platform: { in: ['INSTAGRAM'] } } },
        {
          listMemberships: {
            creatorListId: {
              in: ['11111111-1111-4111-8111-111111111111'],
            },
          },
        },
      ],
    });
  });
});
