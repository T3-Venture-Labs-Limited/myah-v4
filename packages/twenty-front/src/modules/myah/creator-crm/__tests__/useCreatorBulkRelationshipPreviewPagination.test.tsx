import { renderHook } from '@testing-library/react';

import { useCreatorBulkRelationshipPreview } from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';

const mockUseFindManyRecords = jest.fn();

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (args: unknown) => mockUseFindManyRecords(args),
}));

describe('useCreatorBulkRelationshipPreview pagination', () => {
  it('keeps List removal unavailable while another membership page could contain destroy IDs', () => {
    mockUseFindManyRecords.mockReturnValue({
      records: [
        {
          id: 'membership-a',
          __typename: 'CreatorListMember',
          creatorId: 'creator-a',
        },
      ],
      loading: false,
      hasNextPage: true,
      fetchMoreRecords: jest.fn().mockResolvedValue({ data: undefined }),
      refetch: jest.fn(),
      error: undefined,
      hasReadPermission: true,
    });

    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: {
          kind: 'creator-list',
          id: 'list-a',
          label: 'Spring creators',
        },
        selectedCreatorIds: ['creator-a'],
      }),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.isPreviewUnavailable).toBe(false);
  });

  it('keeps List removal unavailable as soon as the first page signals another page', () => {
    mockUseFindManyRecords.mockReturnValue({
      records: [
        {
          id: 'membership-a',
          __typename: 'CreatorListMember',
          creatorId: 'creator-a',
        },
      ],
      loading: false,
      hasNextPage: false,
      pageInfo: { hasNextPage: true },
      fetchMoreRecords: jest.fn().mockResolvedValue({ data: undefined }),
      refetch: jest.fn(),
      error: undefined,
      hasReadPermission: true,
    });

    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: {
          kind: 'creator-list',
          id: 'list-a',
          label: 'Spring creators',
        },
        selectedCreatorIds: ['creator-a'],
      }),
    );

    expect(result.current.loading).toBe(true);
  });

  it('does not request another page while native pagination is fetching', () => {
    const fetchMoreRecords = jest.fn();

    mockUseFindManyRecords.mockReturnValue({
      records: [],
      loading: false,
      hasNextPage: true,
      isFetchingMoreRecords: true,
      fetchMoreRecords,
      refetch: jest.fn(),
      error: undefined,
      hasReadPermission: true,
    });

    renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: {
          kind: 'creator-list',
          id: 'list-a',
          label: 'Spring creators',
        },
        selectedCreatorIds: ['creator-a'],
      }),
    );

    expect(fetchMoreRecords).not.toHaveBeenCalled();
  });
});
