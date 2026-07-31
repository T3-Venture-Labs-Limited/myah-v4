import { renderHook } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';

import { useCreatorListContext } from '@/myah/creator-crm/hooks/useCreatorListContext';

import { FieldMetadataType } from 'twenty-shared/types';

const creatorObjectMetadataItem = {
  id: 'creator-object',
  nameSingular: 'creator',
  fields: [
    {
      id: 'creator-list-memberships',
      name: 'listMemberships',
      relation: {
        targetObjectMetadata: {
          id: 'creator-list-member-object',
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
      type: FieldMetadataType.RELATION,
    },
  ],
};

const mockUseObjectMetadataItems = jest.fn();
const mockUseFindOneRecord = jest.fn();
const mockUseRecordIndexIdFromCurrentContextStore = jest.fn();

jest.mock('react-router-dom', () => ({
  useSearchParams: jest.fn(),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => mockUseObjectMetadataItems(),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (args: unknown) => mockUseFindOneRecord(args),
}));

jest.mock(
  '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore',
  () => ({
    useRecordIndexIdFromCurrentContextStore: () =>
      mockUseRecordIndexIdFromCurrentContextStore(),
  }),
);

describe('useCreatorListContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchParams as jest.Mock).mockReturnValue([
      new URLSearchParams('creatorListId=list-id'),
    ]);
    mockUseObjectMetadataItems.mockReturnValue({
      objectMetadataItems: [
        creatorObjectMetadataItem,
        creatorListMemberObjectMetadataItem,
      ],
    });
    mockUseRecordIndexIdFromCurrentContextStore.mockReturnValue({
      objectMetadataItem: creatorObjectMetadataItem,
    });
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-id', name: 'MYAH-228 UAT List' },
    });
  });

  it('returns the exact List relationship filter target for a contextual Creator view', () => {
    const { result } = renderHook(() => useCreatorListContext());

    expect(result.current).toEqual({
      target: {
        kind: 'creator-list',
        id: 'list-id',
        label: 'MYAH-228 UAT List',
      },
      filter: {
        fieldMetadataId: 'creator-list-memberships',
        relationTargetFieldMetadataId: 'creator-list-member-creator-list',
      },
    });
  });

  it.each([
    [
      'the route has no Creator List target',
      new URLSearchParams(''),
      creatorObjectMetadataItem,
      creatorListMemberObjectMetadataItem,
      { id: 'list-id', name: 'MYAH-228 UAT List' },
    ],
    [
      'the active index is not Creators',
      new URLSearchParams('creatorListId=list-id'),
      { id: 'campaign-object', nameSingular: 'campaign', fields: [] },
      creatorListMemberObjectMetadataItem,
      { id: 'list-id', name: 'MYAH-228 UAT List' },
    ],
    [
      'the Creator List relation metadata is absent',
      new URLSearchParams('creatorListId=list-id'),
      { ...creatorObjectMetadataItem, fields: [] },
      creatorListMemberObjectMetadataItem,
      { id: 'list-id', name: 'MYAH-228 UAT List' },
    ],
    [
      'the membership target field is not a relation',
      new URLSearchParams('creatorListId=list-id'),
      creatorObjectMetadataItem,
      {
        ...creatorListMemberObjectMetadataItem,
        fields: [
          {
            id: 'creator-list-member-creator-list',
            name: 'creatorList',
            type: FieldMetadataType.TEXT,
          },
        ],
      },
      { id: 'list-id', name: 'MYAH-228 UAT List' },
    ],
    [
      'the List has no usable name',
      new URLSearchParams('creatorListId=list-id'),
      creatorObjectMetadataItem,
      creatorListMemberObjectMetadataItem,
      { id: 'list-id', name: '   ' },
    ],
  ])(
    'returns no removal scope when %s',
    (_reason, searchParams, objectMetadataItem, membershipObject, record) => {
      (useSearchParams as jest.Mock).mockReturnValue([searchParams]);
      mockUseObjectMetadataItems.mockReturnValue({
        objectMetadataItems: [objectMetadataItem, membershipObject],
      });
      mockUseRecordIndexIdFromCurrentContextStore.mockReturnValue({
        objectMetadataItem,
      });
      mockUseFindOneRecord.mockReturnValue({ record });

      const { result } = renderHook(() => useCreatorListContext());

      expect(result.current).toBeUndefined();
    },
  );
});
