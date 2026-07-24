import { act, renderHook } from '@testing-library/react';

import { useMyahInboxThreads } from '@/myah/inbox/hooks/useMyahInboxThreads';

const mockUseQuery = jest.fn();
const mockApolloCoreClient = { name: 'core-client' };

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

jest.mock('~/generated/graphql', () => ({
  MyahInboxThreadsDocument: {
    kind: 'Document',
    name: 'MyahInboxThreadsDocument',
  },
}));

const filters = {
  queue: 'CREATOR_LINKED' as const,
  owner: 'ME',
  campaignId: 'campaign-1',
  campaignWorkspaceId: 'workspace-1',
  states: ['NEEDS_REPLY' as const],
  search: 'Ada',
};

const thread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  subject: 'First conversation',
  lastMessagePreview: 'First preview',
  lastMessageSender: 'Ada',
  state: 'NEEDS_REPLY',
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Ada Creator' },
  campaign: { id: 'campaign-1', name: 'Spring campaign' },
  inboxOwner: { id: 'member-1', name: 'Zachary' },
};

describe('useMyahInboxThreads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps server data in Apollo and maps all active filters into the query', () => {
    mockUseQuery.mockReturnValue({
      data: {
        myahInboxThreads: {
          edges: [{ cursor: 'cursor-1', node: thread }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      },
      loading: false,
      error: undefined,
      fetchMore: jest.fn(),
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MyahInboxThreadsDocument' }),
      {
        variables: {
          first: 50,
          queue: 'CREATOR_LINKED',
          owner: 'ME',
          campaignId: 'campaign-1',
          states: ['NEEDS_REPLY'],
          search: 'Ada',
        },
        notifyOnNetworkStatusChange: true,
        client: mockApolloCoreClient,
      },
    );
    expect(result.current.threads).toEqual([thread]);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('loads the next page with the opaque end cursor and appends its edges', async () => {
    const fetchMore = jest.fn().mockResolvedValue(undefined);
    mockUseQuery.mockReturnValue({
      data: {
        myahInboxThreads: {
          edges: [{ cursor: 'cursor-1', node: thread }],
          pageInfo: { hasNextPage: true, endCursor: 'opaque-next-cursor' },
        },
      },
      loading: false,
      error: undefined,
      fetchMore,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );

    await act(async () => {
      await result.current.loadMore();
    });

    expect(fetchMore).toHaveBeenCalledWith({
      variables: { after: 'opaque-next-cursor' },
      updateQuery: expect.any(Function),
    });

    const updateQuery = fetchMore.mock.calls[0][0].updateQuery;
    const previous = {
      myahInboxThreads: {
        edges: [{ cursor: 'cursor-1', node: thread }],
        pageInfo: { hasNextPage: true, endCursor: 'opaque-next-cursor' },
      },
    };
    const nextThread = { ...thread, id: 'thread-2' };
    const fetchMoreResult = {
      myahInboxThreads: {
        edges: [{ cursor: 'cursor-2', node: nextThread }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };

    expect(updateQuery(previous, { fetchMoreResult })).toEqual({
      myahInboxThreads: {
        edges: [
          { cursor: 'cursor-1', node: thread },
          { cursor: 'cursor-2', node: nextThread },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
  });

  it('reports incremental loading without replacing existing rows', () => {
    mockUseQuery.mockReturnValue({
      data: {
        myahInboxThreads: {
          edges: [{ cursor: 'cursor-1', node: thread }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      },
      loading: true,
      error: undefined,
      fetchMore: jest.fn(),
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.loadingMore).toBe(true);
    expect(result.current.threads).toEqual([thread]);
  });

  it('omits empty optional filters instead of sending empty server values', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
      fetchMore: jest.fn(),
      refetch: jest.fn(),
    });

    renderHook(() =>
      useMyahInboxThreads(
        {
          queue: 'UNMATCHED',
          owner: '',
          campaignId: null,
          campaignWorkspaceId: null,
          states: [],
          search: '',
        },
        'workspace-1',
      ),
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MyahInboxThreadsDocument' }),
      {
        variables: {
          first: 50,
          queue: 'UNMATCHED',
          owner: undefined,
          campaignId: undefined,
          states: undefined,
          search: undefined,
        },
        notifyOnNetworkStatusChange: true,
        client: mockApolloCoreClient,
      },
    );
  });

  it('never submits a campaign selected in another workspace', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
      fetchMore: jest.fn(),
      refetch: jest.fn(),
    });
    const scopedFilters = {
      ...filters,
      campaignWorkspaceId: 'workspace-1',
    };
    const { rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string }) =>
        useMyahInboxThreads(scopedFilters, workspaceId),
      { initialProps: { workspaceId: 'workspace-1' } },
    );

    expect(mockUseQuery.mock.lastCall?.[1]).toEqual(
      expect.objectContaining({
        variables: expect.objectContaining({ campaignId: 'campaign-1' }),
      }),
    );

    rerender({ workspaceId: 'workspace-2' });

    expect(mockUseQuery.mock.lastCall?.[1]).toEqual(
      expect.objectContaining({
        variables: {
          first: 50,
          queue: 'CREATOR_LINKED',
          owner: 'ME',
          campaignId: undefined,
          states: ['NEEDS_REPLY'],
          search: 'Ada',
        },
      }),
    );
  });
});
