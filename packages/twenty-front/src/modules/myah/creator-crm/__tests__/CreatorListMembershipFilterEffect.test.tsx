import { render } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';

import { CreatorListMembershipFilterEffect } from '@/myah/creator-crm/components/CreatorListMembershipFilterEffect';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { FieldMetadataType, ViewFilterOperand } from 'twenty-shared/types';

const mockUpsertRecordFilter = jest.fn();
const mockRemoveRecordFilter = jest.fn();

const creatorObjectMetadataItem = {
  id: 'creator-object',
  nameSingular: 'creator',
  fields: [
    {
      id: 'creator-list-memberships',
      name: 'listMemberships',
      label: 'List memberships',
      relation: {
        targetObjectMetadata: {
          id: 'creator-list-member-object',
          nameSingular: 'creatorListMember',
          namePlural: 'creatorListMembers',
        },
      },
    },
  ],
};

const creatorListMemberObjectMetadataItem = {
  id: 'creator-list-member-object',
  nameSingular: 'creatorListMember',
  fields: [
    {
      id: 'creator-list-member-creator-list',
      name: 'creatorList',
      label: 'Creator list',
      type: FieldMetadataType.RELATION,
    },
  ],
};

const nonCreatorObjectMetadataItem = {
  id: 'campaign-object',
  nameSingular: 'campaign',
  fields: [],
};

jest.mock('react-router-dom', () => ({
  useSearchParams: jest.fn(),
}));

jest.mock(
  '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore',
  () => ({
    useRecordIndexIdFromCurrentContextStore: jest.fn(),
  }),
);

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      creatorObjectMetadataItem,
      creatorListMemberObjectMetadataItem,
      nonCreatorObjectMetadataItem,
    ],
  }),
}));

jest.mock('@/object-record/record-filter/hooks/useUpsertRecordFilter', () => ({
  useUpsertRecordFilter: () => ({
    upsertRecordFilter: mockUpsertRecordFilter,
  }),
}));

jest.mock('@/object-record/record-filter/hooks/useRemoveRecordFilter', () => ({
  useRemoveRecordFilter: () => ({
    removeRecordFilter: mockRemoveRecordFilter,
  }),
}));

describe('CreatorListMembershipFilterEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams('creatorListId=list-id'),
    ]);
    (useRecordIndexIdFromCurrentContextStore as jest.Mock).mockReturnValue({
      recordIndexId: 'creator-index',
      objectMetadataItem: creatorObjectMetadataItem,
    });
  });

  it('upserts a Creator list-membership relation traversal filter', () => {
    render(<CreatorListMembershipFilterEffect />);

    expect(mockUpsertRecordFilter).toHaveBeenCalledTimes(1);
    expect(mockUpsertRecordFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMetadataId: 'creator-list-memberships',
        relationTargetFieldMetadataId: 'creator-list-member-creator-list',
        type: FieldMetadataType.RELATION,
        operand: ViewFilterOperand.IS,
        value: 'list-id',
      }),
    );
  });

  it('replaces and clears the transient filter when the query parameter changes', () => {
    const { rerender } = render(<CreatorListMembershipFilterEffect />);

    (useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams('creatorListId=next-list-id'),
    ]);
    rerender(<CreatorListMembershipFilterEffect />);

    expect(mockRemoveRecordFilter).toHaveBeenCalledWith(
      expect.objectContaining({ recordFilterId: expect.any(String) }),
    );
    expect(mockUpsertRecordFilter).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 'next-list-id' }),
    );

    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams('')]);
    rerender(<CreatorListMembershipFilterEffect />);

    expect(mockRemoveRecordFilter).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['the active index is not Creators', nonCreatorObjectMetadataItem, 'creatorListId=list-id'],
    ['the Creator List query parameter is absent', creatorObjectMetadataItem, ''],
  ])('does not add a filter when %s', (_reason, objectMetadataItem, query) => {
    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams(query)]);
    (useRecordIndexIdFromCurrentContextStore as jest.Mock).mockReturnValue({
      recordIndexId: 'record-index',
      objectMetadataItem,
    });

    render(<CreatorListMembershipFilterEffect />);

    expect(mockUpsertRecordFilter).not.toHaveBeenCalled();
  });
});
