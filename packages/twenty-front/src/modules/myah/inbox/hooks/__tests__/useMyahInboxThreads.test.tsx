import { act, renderHook, waitFor } from '@testing-library/react';

import { useMyahInboxThreads } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { type MyahInboxFilters } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  MyahInboxSnoozeStatus,
  MyahInboxState,
  MyahInboxThreadsDocument,
  type MyahInboxThreadsQueryVariables,
} from '~/generated/graphql';

const mockQuery = jest.fn();
const mockApolloCoreClient = { query: mockQuery };

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

jest.mock('~/generated/graphql', () => ({
  MyahInboxSnoozeStatus: { ACTIVE: 'ACTIVE', DUE: 'DUE' },
  MyahInboxState: {
    CLOSED: 'CLOSED',
    NEEDS_REPLY: 'NEEDS_REPLY',
    SNOOZED: 'SNOOZED',
    WAITING_ON_CREATOR: 'WAITING_ON_CREATOR',
  },
  MyahInboxThreadsDocument: {
    kind: 'Document',
    name: 'MyahInboxThreadsDocument',
  },
}));

const filters = {
  owner: 'ME',
  campaignId: 'campaign-1',
  campaignWorkspaceId: 'workspace-1',
  states: ['NEEDS_REPLY' as const],
  snoozeStatus: 'DUE' as const,
  search: 'Ada',
};

type InboxHookProps = {
  currentFilters: MyahInboxFilters;
  workspaceId: string | null;
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

type RefreshResult = {
  status: 'success' | 'failed' | 'ignored';
  selectedThread: typeof thread | null;
};

type RefreshableInbox = {
  threads: (typeof thread)[];
  loading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  refreshStatus: 'idle' | 'refreshing' | 'succeeded' | 'failed';
  refreshError: Error | null;
  error: Error | undefined;
  hasNextPage: boolean;
  loadMore: () => Promise<void>;
  refresh: (selectedThreadId: string | null) => Promise<RefreshResult>;
};

type InboxQueryResponse = {
  data: {
    myahInboxThreads: {
      edges: Array<{ cursor: string; node: typeof thread }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const baseVariables = (
  overrides: Partial<MyahInboxThreadsQueryVariables> = {},
) =>
  ({
    first: 50,
    owner: 'ME',
    campaignId: 'campaign-1',
    states: [MyahInboxState.NEEDS_REPLY],
    snoozeStatus: MyahInboxSnoozeStatus.DUE,
    search: 'Ada',
    ...overrides,
  }) satisfies MyahInboxThreadsQueryVariables;

const inboxQueryResponse = (
  threads: (typeof thread)[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
): InboxQueryResponse => ({
  data: {
    myahInboxThreads: {
      edges: threads.map((node, index) => ({
        cursor: `cursor-${index + 1}`,
        node,
      })),
      pageInfo,
    },
  },
});

const inbox = (value: unknown) => value as RefreshableInbox;

const expectInboxQuery = (
  call: unknown[],
  variables: MyahInboxThreadsQueryVariables,
) => {
  expect(call[0]).toEqual(
    expect.objectContaining({
      query: MyahInboxThreadsDocument,
      variables,
      fetchPolicy: 'no-cache',
      context: expect.objectContaining({
        queryDeduplication: false,
        fetchOptions: expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      }),
    }),
  );
};

const expectAllInboxQueriesToBypassCache = () => {
  for (const call of mockQuery.mock.calls) {
    expectInboxQuery(call, call[0].variables);
  }
};

const renderLoadedInbox = async (pageInfo?: {
  hasNextPage: boolean;
  endCursor: string | null;
}) => {
  mockQuery.mockResolvedValueOnce(inboxQueryResponse([thread], pageInfo));

  const hook = renderHook(() => useMyahInboxThreads(filters, 'workspace-1'));

  await waitFor(() =>
    expect(inbox(hook.result.current).threads).toEqual([thread]),
  );
  mockQuery.mockClear();

  return hook;
};

describe('useMyahInboxThreads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('loads the current scope through a cacheless Apollo core request', async () => {
    mockQuery.mockResolvedValueOnce(inboxQueryResponse([thread]));

    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );

    await waitFor(() =>
      expect(inbox(result.current).threads).toEqual([thread]),
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expectInboxQuery(mockQuery.mock.calls[0], baseVariables());
  });

  it('refreshes, then validates a selected thread missing from the refreshed first page', async () => {
    const { result } = await renderLoadedInbox();
    const nextThread = { ...thread, id: 'thread-2' };
    mockQuery
      .mockResolvedValueOnce(inboxQueryResponse([thread]))
      .mockResolvedValueOnce(inboxQueryResponse([nextThread]));

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expectInboxQuery(mockQuery.mock.calls[0], baseVariables());
    expectInboxQuery(
      mockQuery.mock.calls[1],
      baseVariables({ first: 1, threadId: 'thread-2' }),
    );
    expect(refreshResult).toEqual({
      status: 'success',
      selectedThread: nextThread,
    });
    expectAllInboxQueriesToBypassCache();
  });

  it('uses the refreshed first page as selection validation when it contains the selected thread', async () => {
    const { result } = await renderLoadedInbox();
    const nextThread = { ...thread, id: 'thread-2' };
    mockQuery.mockResolvedValueOnce(inboxQueryResponse([nextThread]));

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expectInboxQuery(mockQuery.mock.calls[0], baseVariables());
    expect(refreshResult).toEqual({
      status: 'success',
      selectedThread: nextThread,
    });
  });

  it('skips selected-thread validation for a null selection', async () => {
    const { result } = await renderLoadedInbox();
    mockQuery.mockResolvedValueOnce(inboxQueryResponse([thread]));

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh(null);
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expectInboxQuery(mockQuery.mock.calls[0], baseVariables());
    expect(refreshResult).toEqual({
      status: 'success',
      selectedThread: null,
    });
  });

  it('clears selection when selected-thread validation is empty', async () => {
    const { result } = await renderLoadedInbox();
    mockQuery
      .mockResolvedValueOnce(inboxQueryResponse([thread]))
      .mockResolvedValueOnce(inboxQueryResponse([]));

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expectInboxQuery(
      mockQuery.mock.calls[1],
      baseVariables({ first: 1, threadId: 'thread-2' }),
    );
    expect(refreshResult).toEqual({
      status: 'success',
      selectedThread: null,
    });
  });

  it('keeps rows and reports a refresh-only error when the refreshed first page fails', async () => {
    const { result } = await renderLoadedInbox();
    const refreshError = new Error('Refresh failed');
    mockQuery.mockRejectedValueOnce(refreshError);

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(refreshResult).toEqual({ status: 'failed', selectedThread: null });
    expect(inbox(result.current).threads).toEqual([thread]);
    expect(inbox(result.current).error).toBeUndefined();
    expect(inbox(result.current).refreshError).toEqual(
      expect.objectContaining({ message: 'Could not refresh Inbox.' }),
    );
    expect(inbox(result.current).refreshStatus).toBe('failed');
  });

  it('keeps rows and reports a refresh-only error when selection validation fails', async () => {
    const { result } = await renderLoadedInbox();
    const refreshError = new Error('Selection validation failed');
    mockQuery
      .mockResolvedValueOnce(inboxQueryResponse([thread]))
      .mockRejectedValueOnce(refreshError);

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(refreshResult).toEqual({ status: 'failed', selectedThread: null });
    expect(inbox(result.current).threads).toEqual([thread]);
    expect(inbox(result.current).error).toBeUndefined();
    expect(inbox(result.current).refreshError).toEqual(
      expect.objectContaining({ message: 'Could not refresh Inbox.' }),
    );
  });

  it('keeps an initial failure list-level with no local connection', async () => {
    const initialError = new Error('Initial load failed');
    mockQuery.mockRejectedValueOnce(initialError);

    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );

    await waitFor(() => expect(inbox(result.current).error).toBe(initialError));

    expect(inbox(result.current).threads).toEqual([]);
    expect(inbox(result.current).hasNextPage).toBe(false);
    expect(inbox(result.current).refreshError).toBeNull();
    expect(inbox(result.current).isRefreshing).toBe(false);
    expect(inbox(result.current).isLoadingMore).toBe(false);
  });

  it('ignores refresh while the initial request is pending', async () => {
    const initialRequest = createDeferred<InboxQueryResponse>();
    mockQuery.mockReturnValueOnce(initialRequest.promise);

    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );

    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(refreshResult).toEqual({ status: 'ignored', selectedThread: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialRequest.resolve(inboxQueryResponse([thread]));
      await initialRequest.promise;
    });

    expect(inbox(result.current).isRefreshing).toBe(false);
    expect(inbox(result.current).isLoadingMore).toBe(false);
  });

  it('ignores refresh while loading more', async () => {
    const { result } = await renderLoadedInbox({
      hasNextPage: true,
      endCursor: 'cursor-1',
    });
    const nextPageRequest = createDeferred<InboxQueryResponse>();
    mockQuery.mockReturnValueOnce(nextPageRequest.promise);

    let loadMorePromise!: Promise<void>;
    act(() => {
      loadMorePromise = inbox(result.current).loadMore();
    });

    await waitFor(() => expect(inbox(result.current).isLoadingMore).toBe(true));

    let refreshResult!: RefreshResult;
    await act(async () => {
      refreshResult = await inbox(result.current).refresh('thread-2');
    });

    expect(refreshResult).toEqual({ status: 'ignored', selectedThread: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);

    await act(async () => {
      nextPageRequest.resolve(
        inboxQueryResponse([{ ...thread, id: 'thread-2' }]),
      );
      await loadMorePromise;
    });

    expect(inbox(result.current).isLoadingMore).toBe(false);
    expect(inbox(result.current).isRefreshing).toBe(false);
  });

  it('blocks load-more while refresh is pending', async () => {
    const { result } = await renderLoadedInbox();
    const refreshRequest = createDeferred<InboxQueryResponse>();
    mockQuery.mockReturnValueOnce(refreshRequest.promise);

    let refreshPromise!: Promise<RefreshResult>;
    act(() => {
      refreshPromise = inbox(result.current).refresh(null);
    });

    await waitFor(() => expect(inbox(result.current).isRefreshing).toBe(true));

    await act(async () => {
      await inbox(result.current).loadMore();
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);

    await act(async () => {
      refreshRequest.resolve(inboxQueryResponse([thread]));
      await refreshPromise;
    });

    expect(inbox(result.current).isRefreshing).toBe(false);
    expect(inbox(result.current).isLoadingMore).toBe(false);
  });

  it.each<[string, MyahInboxFilters, MyahInboxFilters, string]>([
    [
      'workspace',
      { ...filters, campaignId: null, campaignWorkspaceId: null },
      { ...filters, campaignId: null, campaignWorkspaceId: null },
      'workspace-2',
    ],
    ['state', filters, { ...filters, states: ['CLOSED'] }, 'workspace-1'],
    [
      'campaign',
      filters,
      { ...filters, campaignId: 'campaign-2' },
      'workspace-1',
    ],
    ['owner', filters, { ...filters, owner: 'ALL' }, 'workspace-1'],
    ['snooze', filters, { ...filters, snoozeStatus: 'ACTIVE' }, 'workspace-1'],
    ['search', filters, { ...filters, search: 'Grace' }, 'workspace-1'],
  ])(
    'does not publish a stale refresh after the %s scope changes',
    async (_scopePart, initialFilters, nextFilters, nextWorkspaceId) => {
      mockQuery.mockResolvedValueOnce(inboxQueryResponse([thread]));
      const { result, rerender } = renderHook(
        ({ currentFilters, workspaceId }: InboxHookProps) =>
          useMyahInboxThreads(currentFilters, workspaceId),
        {
          initialProps: {
            currentFilters: initialFilters,
            workspaceId: 'workspace-1',
          },
        },
      );
      await waitFor(() =>
        expect(inbox(result.current).threads).toEqual([thread]),
      );

      const staleRefresh = createDeferred<InboxQueryResponse>();
      mockQuery.mockReset();
      mockQuery.mockReturnValueOnce(staleRefresh.promise);

      let refreshPromise!: Promise<RefreshResult>;
      act(() => {
        refreshPromise = inbox(result.current).refresh('thread-2');
      });
      await waitFor(() =>
        expect(inbox(result.current).isRefreshing).toBe(true),
      );

      const newScopeThread = { ...thread, id: 'new-scope-thread' };
      mockQuery.mockResolvedValue(inboxQueryResponse([newScopeThread]));
      rerender({ currentFilters: nextFilters, workspaceId: nextWorkspaceId });

      await waitFor(() =>
        expect(inbox(result.current).threads).toEqual([newScopeThread]),
      );
      expect(inbox(result.current).isRefreshing).toBe(false);
      expect(inbox(result.current).isLoadingMore).toBe(false);

      await act(async () => {
        staleRefresh.resolve(
          inboxQueryResponse([{ ...thread, id: 'thread-2' }]),
        );
      });

      await expect(refreshPromise).resolves.toEqual({
        status: 'ignored',
        selectedThread: null,
      });
      expect(inbox(result.current).threads).toEqual([newScopeThread]);
      expect(inbox(result.current).error).toBeUndefined();
      expect(inbox(result.current).refreshError).toBeNull();
      expect(inbox(result.current).refreshStatus).toBe('idle');
      expectAllInboxQueriesToBypassCache();
    },
  );

  it('becomes loading synchronously when a scope change starts a new initial request', async () => {
    mockQuery.mockResolvedValueOnce(inboxQueryResponse([thread]));
    const { result, rerender } = renderHook(
      ({ currentFilters }: Pick<InboxHookProps, 'currentFilters'>) =>
        useMyahInboxThreads(currentFilters, 'workspace-1'),
      { initialProps: { currentFilters: filters } },
    );
    await waitFor(() =>
      expect(inbox(result.current).threads).toEqual([thread]),
    );

    const nextScopeRequest = createDeferred<InboxQueryResponse>();
    mockQuery.mockReset();
    mockQuery.mockReturnValueOnce(nextScopeRequest.promise);
    rerender({ currentFilters: { ...filters, search: 'Grace' } });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(inbox(result.current).loading).toBe(true);

    await act(async () => {
      nextScopeRequest.resolve(
        inboxQueryResponse([{ ...thread, id: 'new-scope-thread' }]),
      );
      await nextScopeRequest.promise;
    });

    await waitFor(() => expect(inbox(result.current).loading).toBe(false));
  });

  it('aborts an in-flight refresh on unmount without publishing its result', async () => {
    const { result, unmount } = await renderLoadedInbox();
    const refreshRequest = createDeferred<InboxQueryResponse>();
    mockQuery.mockReturnValueOnce(refreshRequest.promise);

    let refreshPromise!: Promise<RefreshResult>;
    act(() => {
      refreshPromise = inbox(result.current).refresh('thread-2');
    });
    await waitFor(() => expect(inbox(result.current).isRefreshing).toBe(true));

    const refreshCall = mockQuery.mock.calls[0];
    expectInboxQuery(refreshCall, baseVariables());
    const signal = refreshCall[0].context.fetchOptions.signal as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);

    await act(async () => {
      refreshRequest.resolve(
        inboxQueryResponse([{ ...thread, id: 'thread-2' }]),
      );
    });

    await expect(refreshPromise).resolves.toEqual({
      status: 'ignored',
      selectedThread: null,
    });
  });

  it('loads the current end cursor and appends only to the current local connection', async () => {
    mockQuery.mockResolvedValueOnce(
      inboxQueryResponse([thread], {
        hasNextPage: true,
        endCursor: 'opaque-next-cursor',
      }),
    );
    const { result } = renderHook(() =>
      useMyahInboxThreads(filters, 'workspace-1'),
    );
    await waitFor(() =>
      expect(inbox(result.current).threads).toEqual([thread]),
    );

    const nextThread = { ...thread, id: 'thread-2' };
    mockQuery.mockClear();
    mockQuery.mockResolvedValueOnce(inboxQueryResponse([nextThread]));

    await act(async () => {
      await inbox(result.current).loadMore();
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expectInboxQuery(
      mockQuery.mock.calls[0],
      baseVariables({ after: 'opaque-next-cursor' }),
    );
    expect(inbox(result.current).threads).toEqual([thread, nextThread]);
    expectAllInboxQueriesToBypassCache();
  });

  it('does not append a stale load-more page after the scope changes', async () => {
    mockQuery.mockResolvedValueOnce(
      inboxQueryResponse([thread], {
        hasNextPage: true,
        endCursor: 'opaque-next-cursor',
      }),
    );
    const { result, rerender } = renderHook(
      ({ currentFilters }: Pick<InboxHookProps, 'currentFilters'>) =>
        useMyahInboxThreads(currentFilters, 'workspace-1'),
      { initialProps: { currentFilters: filters } },
    );
    await waitFor(() =>
      expect(inbox(result.current).threads).toEqual([thread]),
    );

    const stalePage = createDeferred<InboxQueryResponse>();
    mockQuery.mockReset();
    mockQuery.mockReturnValueOnce(stalePage.promise);
    let loadMorePromise!: Promise<void>;
    act(() => {
      loadMorePromise = inbox(result.current).loadMore();
    });
    await waitFor(() => expect(inbox(result.current).isLoadingMore).toBe(true));

    const newScopeThread = { ...thread, id: 'new-scope-thread' };
    mockQuery.mockResolvedValue(inboxQueryResponse([newScopeThread]));
    rerender({ currentFilters: { ...filters, search: 'Grace' } });
    await waitFor(() =>
      expect(inbox(result.current).threads).toEqual([newScopeThread]),
    );

    await act(async () => {
      stalePage.resolve(inboxQueryResponse([{ ...thread, id: 'thread-2' }]));
      await loadMorePromise;
    });

    expect(inbox(result.current).threads).toEqual([newScopeThread]);
    expect(inbox(result.current).isLoadingMore).toBe(false);
  });
});
