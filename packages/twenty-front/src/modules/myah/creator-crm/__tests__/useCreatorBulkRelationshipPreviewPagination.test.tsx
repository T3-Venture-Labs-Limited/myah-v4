import { act, renderHook, waitFor } from '@testing-library/react';

jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
}));

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

  it('rechecks the same selected Campaign membership after a failed later page before enabling direct add', async () => {
    let hasNextPage = true;
    const fetchMoreRecords = jest
      .fn()
      .mockResolvedValueOnce({ error: new Error('later page failed') })
      .mockImplementationOnce(async () => {
        hasNextPage = false;
        return { data: { edges: [] } };
      });
    const refetch = jest
      .fn()
      .mockResolvedValue({ data: { campaignCreators: {} } });
    mockUseFindManyRecords.mockImplementation(() => ({
      records: [],
      loading: false,
      hasNextPage,
      pageInfo: { hasNextPage },
      fetchMoreRecords,
      refetch,
      error: undefined,
      hasReadPermission: true,
    }));

    const { result, rerender } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
        selectedCreatorIds: ['creator-a'],
      }),
    );

    await waitFor(() => expect(result.current.isPreviewUnavailable).toBe(true));
    expect(result.current.canRetry).toBe(true);
    await act(async () => {
      await result.current.retryPreview();
    });
    await waitFor(() => expect(fetchMoreRecords).toHaveBeenCalledTimes(2));
    rerender();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.isPreviewUnavailable).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.unlinkedCreatorIds).toEqual(['creator-a']);
  });

  it('does not carry a failed page into a different selected Creator scope', async () => {
    const fetchMoreRecords = jest
      .fn()
      .mockResolvedValue({ error: new Error('later page failed') });
    mockUseFindManyRecords.mockImplementation(
      ({
        filter,
      }: {
        filter: { and: Array<{ creatorId?: { in: string[] } }> };
      }) => {
        const hasNextPage =
          filter.and[1].creatorId?.in.includes('creator-a') ?? false;
        return {
          records: [],
          loading: false,
          hasNextPage,
          pageInfo: { hasNextPage },
          fetchMoreRecords,
          refetch: jest.fn(),
          error: undefined,
          hasReadPermission: true,
        };
      },
    );
    const target = {
      kind: 'campaign' as const,
      id: 'campaign-a',
      label: 'Campaign',
    };
    const { result, rerender } = renderHook(
      ({ selectedCreatorIds }) =>
        useCreatorBulkRelationshipPreview({ target, selectedCreatorIds }),
      { initialProps: { selectedCreatorIds: ['creator-a'] } },
    );
    await waitFor(() => expect(result.current.isPreviewUnavailable).toBe(true));
    rerender({ selectedCreatorIds: ['creator-b'] });
    expect(result.current.isPreviewUnavailable).toBe(false);
    expect(result.current.canRetry).toBe(false);
    expect(result.current.unlinkedCreatorIds).toEqual(['creator-b']);
  });

  it('does not retry an unavailable preview after native membership read access is denied', async () => {
    const refetch = jest.fn();
    mockUseFindManyRecords.mockReturnValue({
      records: [],
      loading: false,
      hasNextPage: false,
      refetch,
      error: new Error('FORBIDDEN'),
      hasReadPermission: false,
    });
    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
        selectedCreatorIds: ['creator-a'],
      }),
    );
    expect(result.current.isPreviewUnavailable).toBe(true);
    expect(result.current.canRetry).toBe(false);
    await act(async () => {
      await result.current.retryPreview();
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('does not fetch another retained page after membership read access is revoked', () => {
    let hasReadPermission = true;
    let records = [
      {
        id: 'membership-a',
        __typename: 'CampaignCreator',
        creatorId: 'creator-a',
        isDirectlyAdded: true,
      },
    ];
    const fetchMoreRecords = jest.fn().mockResolvedValue({ data: {} });
    mockUseFindManyRecords.mockImplementation(() => ({
      records,
      loading: false,
      hasNextPage: true,
      pageInfo: { hasNextPage: true },
      fetchMoreRecords,
      refetch: jest.fn(),
      error: undefined,
      hasReadPermission,
    }));
    const { result, rerender } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
        selectedCreatorIds: ['creator-a'],
      }),
    );
    expect(fetchMoreRecords).toHaveBeenCalledTimes(1);

    hasReadPermission = false;
    records = [];
    rerender();
    expect(result.current.isPreviewUnavailable).toBe(true);
    expect(fetchMoreRecords).toHaveBeenCalledTimes(1);
  });

  it('does not paginate a Campaign relationship whose direct-source field is unreadable', () => {
    const fetchMoreRecords = jest.fn().mockResolvedValue({ data: undefined });
    mockUseFindManyRecords.mockReturnValue({
      records: [
        {
          id: 'membership-a',
          __typename: 'CampaignCreator',
          creatorId: 'creator-a',
        },
      ],
      loading: false,
      hasNextPage: true,
      pageInfo: { hasNextPage: true },
      fetchMoreRecords,
      refetch: jest.fn(),
      error: undefined,
      hasReadPermission: true,
    });
    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
        selectedCreatorIds: ['creator-a'],
      }),
    );
    expect(result.current.isPreviewUnavailable).toBe(true);
    expect(fetchMoreRecords).not.toHaveBeenCalled();
  });

  it('does not continue pagination after the scoped first-page query errors', () => {
    const fetchMoreRecords = jest.fn().mockResolvedValue({ data: undefined });
    mockUseFindManyRecords.mockReturnValue({
      records: [],
      loading: false,
      hasNextPage: true,
      pageInfo: { hasNextPage: true },
      fetchMoreRecords,
      refetch: jest.fn(),
      error: new Error('FORBIDDEN'),
      hasReadPermission: true,
    });
    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: { kind: 'campaign', id: 'campaign-a', label: 'Campaign' },
        selectedCreatorIds: ['creator-a'],
      }),
    );
    expect(result.current.isPreviewUnavailable).toBe(true);
    expect(fetchMoreRecords).not.toHaveBeenCalled();
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
