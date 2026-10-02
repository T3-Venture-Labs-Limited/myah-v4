import { act, renderHook, waitFor } from '@testing-library/react';

import { useMyahInboxContacts } from '@/myah/inbox/hooks/useMyahInboxContacts';
import { GET_MYAH_INBOX_CONTACTS } from '@/myah/inbox/graphql/operations';
import { type MyahInboxFilters } from '@/myah/inbox/states/myahInboxSelectionState';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const mockQuery = jest.fn();
const mockApolloCoreClient = { query: mockQuery };

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

const filters: MyahInboxFilters = {
  owner: 'ME',
  campaignId: 'campaign-1',
  campaignWorkspaceId: 'workspace-1',
  states: ['NEEDS_REPLY'],
  snoozeStatus: 'DUE',
  search: 'Ada',
};

type InboxHookProps = {
  currentFilters: MyahInboxFilters;
  workspaceId: string | null;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> =>
  (
    Promise as PromiseConstructor & {
      withResolvers<Value>(): Deferred<Value>;
    }
  ).withResolvers<T>();

const contact = (id: string): MyahInboxContact => ({
  id,
  identityKind: 'CREATOR',
  displayName: id,
  instagramDisplayHandle: id,
  creator: { id: `creator-${id}`, name: id },
  lastActivityAt: '2026-09-05T12:00:00.000Z',
  latestChannel: 'EMAIL',
  initialSelection: {
    channel: 'EMAIL',
    emailThreadId: `thread-${id}`,
    instagramConversationId: null,
  },
  preview: 'Hello',
  sender: 'Ada',
  needsAttention: true,
  triage: {
    isAvailable: true,
    inboxOwnerId: null,
    inboxState: 'NEEDS_REPLY',
    snoozedUntil: null,
    revision: 1,
    identityGeneration: '1',
  },
  email: {
    isAvailable: true,
    threadCount: 1,
    threadIds: [`thread-${id}`],
    latestThreadId: `thread-${id}`,
    needsAttention: true,
  },
  instagram: {
    isAvailable: false,
    state: 'UNAVAILABLE',
    needsAttention: false,
    conversations: [],
  },
});

const contactsResponse = (
  contacts: MyahInboxContact[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
  totalCount?: number,
) => ({
  data: {
    myahInboxContacts: {
      edges: contacts.map((node, index) => ({
        cursor: `cursor-${index + 1}`,
        node,
      })),
      pageInfo,
      totalCount: totalCount ?? contacts.length,
    },
  },
});

const contactsRange = (count: number, prefix: string): MyahInboxContact[] =>
  Array.from({ length: count }, (_, index) => contact(`${prefix}-${index}`));

describe('useMyahInboxContacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('resets by workspace and ignores a stale completion', async () => {
    const firstWorkspace =
      createDeferred<ReturnType<typeof contactsResponse>>();
    const secondWorkspace =
      createDeferred<ReturnType<typeof contactsResponse>>();
    mockQuery
      .mockReturnValueOnce(firstWorkspace.promise)
      .mockReturnValueOnce(secondWorkspace.promise);

    const hook = renderHook(
      ({ currentFilters, workspaceId }: InboxHookProps) =>
        useMyahInboxContacts(currentFilters, workspaceId),
      { initialProps: { currentFilters: filters, workspaceId: 'workspace-1' } },
    );

    hook.rerender({ currentFilters: filters, workspaceId: 'workspace-2' });
    secondWorkspace.resolve(contactsResponse([contact('workspace-2')]));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('workspace-2')]),
    );

    firstWorkspace.resolve(contactsResponse([contact('workspace-1')]));

    await waitFor(() => {
      expect(hook.result.current.contacts).toEqual([contact('workspace-2')]);
      expect(mockQuery.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          query: GET_MYAH_INBOX_CONTACTS,
          fetchPolicy: 'no-cache',
          context: expect.objectContaining({
            queryDeduplication: false,
            fetchOptions: expect.objectContaining({
              signal: expect.any(AbortSignal),
            }),
          }),
        }),
      );
    });
  });

  it('reauthorizes every loaded page in the background with fresh cursors and drops revoked rows', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('a'), contact('b')], {
          hasNextPage: true,
          endCursor: 'page-1',
        }),
      )
      .mockResolvedValueOnce(contactsResponse([contact('c')]));
    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(2));
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.contacts.map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    const retained = createDeferred<ReturnType<typeof contactsResponse>>();
    mockQuery.mockReturnValueOnce(retained.promise);
    let result!: Promise<unknown>;
    act(() => {
      result = hook.result.current.ambientRefresh('a');
    });
    // No routine teardown or refresh indicator while re-authorizing.
    expect(hook.result.current.isRefreshing).toBe(false);
    expect(hook.result.current.contacts).toHaveLength(3);
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        // Never fewer than one normal page: an arrival must not evict rows.
        variables: expect.objectContaining({ first: 50, after: undefined }),
      }),
    );
    await act(async () => {
      retained.resolve(
        contactsResponse([contact('a'), contact('c')], undefined, 42),
      );
      await result;
    });
    expect(hook.result.current.contacts.map(({ id }) => id)).toEqual([
      'a',
      'c',
    ]);
    expect(hook.result.current.totalCount).toBe(42);
    await expect(result).resolves.toMatchObject({
      status: 'success',
      selectedContact: { id: 'a' },
    });
  });

  it('reauthorizes a deep list in contact-sized pages instead of repeated 100-row projections', async () => {
    mockQuery
      .mockResolvedValueOnce(contactsResponse(contactsRange(650, 'loaded')))
      .mockResolvedValueOnce(
        contactsResponse(contactsRange(500, 'fresh'), {
          hasNextPage: true,
          endCursor: 'after-500',
        }),
      )
      .mockResolvedValueOnce(contactsResponse(contactsRange(150, 'tail')));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(650));
    await act(async () => {
      expect(await hook.result.current.ambientRefresh(null)).toMatchObject({
        status: 'success',
      });
    });

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[1][0].variables.first).toBe(500);
    expect(mockQuery.mock.calls[2][0].variables).toEqual(
      expect.objectContaining({ first: 150, after: 'after-500' }),
    );
    expect(hook.result.current.contacts).toHaveLength(650);
  });

  it('lets an action refresh supersede an in-flight ambient refresh', async () => {
    const pendingAmbient =
      createDeferred<ReturnType<typeof contactsResponse>>();
    mockQuery
      .mockResolvedValueOnce(contactsResponse([contact('initial')]))
      .mockReturnValueOnce(pendingAmbient.promise)
      .mockResolvedValueOnce(
        contactsResponse([contact('action')], undefined, 42),
      );
    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(1));

    let ambientResult!: Promise<unknown>;
    act(() => {
      ambientResult = hook.result.current.ambientRefresh(null);
    });
    let actionResult!: Awaited<ReturnType<typeof hook.result.current.refresh>>;
    await act(async () => {
      actionResult = await hook.result.current.refresh(null);
    });
    expect(actionResult).toMatchObject({ status: 'success' });
    expect(mockQuery.mock.calls[1][0].context.fetchOptions.signal.aborted).toBe(
      true,
    );
    expect(hook.result.current.contacts).toEqual([contact('action')]);
    expect(hook.result.current.totalCount).toBe(42);
    await act(async () => {
      pendingAmbient.resolve(contactsResponse([contact('stale')]));
      await ambientResult;
    });
    expect(hook.result.current.contacts).toEqual([contact('action')]);
  });

  it('keeps a failed next-batch error through ambient refresh to prevent automatic retry', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('initial')], {
          hasNextPage: true,
          endCursor: 'cursor-initial',
        }),
      )
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockResolvedValueOnce(
        contactsResponse(contactsRange(50, 'refreshed'), {
          hasNextPage: true,
          endCursor: 'cursor-refreshed',
        }),
      );
    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(1));
    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(hook.result.current.loadMoreError?.message).toBe('batch failed');
    await act(async () => {
      expect(await hook.result.current.ambientRefresh(null)).toMatchObject({
        status: 'success',
      });
    });
    expect(hook.result.current.loadMoreError?.message).toBe('batch failed');
    expect(hook.result.current.contacts).toHaveLength(50);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('dismisses a failed batch after ambient refresh confirms there are no more contacts', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse(contactsRange(50, 'initial'), {
          hasNextPage: true,
          endCursor: 'cursor-50',
        }),
      )
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockResolvedValueOnce(
        contactsResponse(contactsRange(40, 'remaining'), {
          hasNextPage: false,
          endCursor: 'cursor-40',
        }),
      );
    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(50));
    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(hook.result.current.loadMoreError?.message).toBe('batch failed');

    await act(async () => {
      expect(await hook.result.current.ambientRefresh(null)).toMatchObject({
        status: 'success',
      });
    });
    expect(hook.result.current.contacts).toHaveLength(40);
    expect(hook.result.current.hasNextPage).toBe(false);
    expect(hook.result.current.loadMoreError).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('lets an explicit failed-batch retry supersede an in-flight ambient poll', async () => {
    const pendingAmbient =
      createDeferred<ReturnType<typeof contactsResponse>>();
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('initial')], {
          hasNextPage: true,
          endCursor: 'cursor-initial',
        }),
      )
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockReturnValueOnce(pendingAmbient.promise)
      .mockResolvedValueOnce(contactsResponse([contact('next')]));
    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(1));
    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(hook.result.current.loadMoreError?.message).toBe('batch failed');

    let ambientResult!: Promise<unknown>;
    act(() => {
      ambientResult = hook.result.current.ambientRefresh(null);
    });
    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockQuery.mock.calls[2][0].context.fetchOptions.signal.aborted).toBe(
      true,
    );
    expect(hook.result.current.contacts.map(({ id }) => id)).toEqual([
      'initial',
      'next',
    ]);
    expect(hook.result.current.loadMoreError).toBeUndefined();
    await act(async () => {
      pendingAmbient.resolve(contactsResponse([contact('stale')]));
      await ambientResult;
    });
    expect(hook.result.current.contacts.map(({ id }) => id)).toEqual([
      'initial',
      'next',
    ]);
  });

  it('discards an ambient response that completes after the workspace scope changed', async () => {
    mockQuery.mockResolvedValueOnce(contactsResponse([contact('a')]));
    const hook = renderHook(
      ({ currentFilters, workspaceId }: InboxHookProps) =>
        useMyahInboxContacts(currentFilters, workspaceId),
      { initialProps: { currentFilters: filters, workspaceId: 'workspace-1' } },
    );
    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(1));
    const stale = createDeferred<ReturnType<typeof contactsResponse>>();
    mockQuery
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(contactsResponse([contact('other')]));
    let result!: Promise<unknown>;
    act(() => {
      result = hook.result.current.ambientRefresh('a');
    });
    hook.rerender({ currentFilters: filters, workspaceId: 'workspace-2' });
    await waitFor(() =>
      expect(hook.result.current.contacts.map(({ id }) => id)).toEqual([
        'other',
      ]),
    );
    await act(async () => {
      stale.resolve(contactsResponse([contact('a'), contact('leak')]));
      await result;
    });
    await expect(result).resolves.toMatchObject({ status: 'ignored' });
    expect(hook.result.current.contacts.map(({ id }) => id)).toEqual(['other']);
  });

  it('merges the next page using the current cursor', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockResolvedValueOnce(
        contactsResponse([contact('second')], {
          hasNextPage: false,
          endCursor: 'second-page-cursor',
        }),
      );

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(mockQuery.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        query: GET_MYAH_INBOX_CONTACTS,
        variables: expect.objectContaining({ after: 'first-page-cursor' }),
        fetchPolicy: 'no-cache',
      }),
    );
    expect(hook.result.current.contacts).toEqual([
      contact('first'),
      contact('second'),
    ]);
    expect(hook.result.current.hasNextPage).toBe(false);
  });

  it('retains a selected contact validated outside the refreshed page', async () => {
    mockQuery
      .mockResolvedValueOnce(contactsResponse([contact('initial')]))
      .mockResolvedValueOnce(contactsResponse([contact('other')]))
      .mockResolvedValueOnce(contactsResponse([contact('selected')]));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('initial')]),
    );

    let refreshResult: Awaited<ReturnType<typeof hook.result.current.refresh>>;
    await act(async () => {
      refreshResult = await hook.result.current.refresh('selected');
    });

    expect(mockQuery.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        query: GET_MYAH_INBOX_CONTACTS,
        variables: expect.objectContaining({
          contactId: 'selected',
          first: 1,
        }),
        fetchPolicy: 'no-cache',
      }),
    );
    expect(refreshResult!).toEqual({
      status: 'success',
      selectedContact: contact('selected'),
    });
  });

  it('removes a selected contact when validation no longer finds it', async () => {
    mockQuery
      .mockResolvedValueOnce(contactsResponse([contact('initial')]))
      .mockResolvedValueOnce(contactsResponse([contact('other')]))
      .mockResolvedValueOnce(contactsResponse([]));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('initial')]),
    );

    let refreshResult: Awaited<ReturnType<typeof hook.result.current.refresh>>;
    await act(async () => {
      refreshResult = await hook.result.current.refresh('selected');
    });

    expect(refreshResult!).toEqual({
      status: 'success',
      selectedContact: null,
    });
    expect(hook.result.current.contacts).toEqual([contact('other')]);
  });

  it('forces the mandatory regroup refresh behind an in-flight list operation', async () => {
    const inFlight = createDeferred<ReturnType<typeof contactsResponse>>();

    mockQuery
      .mockResolvedValueOnce(contactsResponse([contact('initial')]))
      .mockReturnValueOnce(inFlight.promise)
      .mockResolvedValueOnce(contactsResponse([contact('regrouped')]));
    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts[0]?.id).toBe('initial'),
    );
    let manualRefresh: Promise<unknown>;
    let regroupRefresh: Promise<unknown>;

    act(() => {
      manualRefresh = hook.result.current.refresh('initial');
      regroupRefresh = hook.result.current.refresh('regrouped', {
        force: true,
      });
    });
    let regroupResult: unknown;

    await act(async () => {
      regroupResult = await regroupRefresh!;
    });
    expect(regroupResult).toEqual({
      status: 'success',
      selectedContact: contact('regrouped'),
    });
    let manualResult: unknown;

    await act(async () => {
      inFlight.resolve(contactsResponse([contact('stale')]));
      manualResult = await manualRefresh!;
    });
    expect(manualResult).toEqual({
      status: 'ignored',
      selectedContact: null,
    });
  });

  it('keeps loaded contacts and stores a separate error when a next batch fails', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockRejectedValueOnce(new Error('network unavailable'));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(hook.result.current.contacts).toEqual([contact('first')]);
    expect(hook.result.current.error).toBeUndefined();
    expect(hook.result.current.loadMoreError).toBeInstanceOf(Error);
    expect(hook.result.current.hasNextPage).toBe(true);
  });

  it('clears loadMoreError and retries the same cursor on a successful retry', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(
        contactsResponse([contact('second')], {
          hasNextPage: false,
          endCursor: 'second-page-cursor',
        }),
      );

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(hook.result.current.loadMoreError).toBeInstanceOf(Error);

    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(mockQuery.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        variables: expect.objectContaining({ after: 'first-page-cursor' }),
      }),
    );
    expect(hook.result.current.loadMoreError).toBeUndefined();
    expect(hook.result.current.contacts).toEqual([
      contact('first'),
      contact('second'),
    ]);
  });

  it('clears loadMoreError when the scope changes', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(contactsResponse([contact('other-workspace')]));

    const hook = renderHook(
      ({ currentFilters, workspaceId }: InboxHookProps) =>
        useMyahInboxContacts(currentFilters, workspaceId),
      { initialProps: { currentFilters: filters, workspaceId: 'workspace-1' } },
    );

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(hook.result.current.loadMoreError).toBeInstanceOf(Error);

    hook.rerender({ currentFilters: filters, workspaceId: 'workspace-2' });

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([
        contact('other-workspace'),
      ]),
    );
    expect(hook.result.current.loadMoreError).toBeUndefined();
  });

  it('clears loadMoreError after a successful refresh', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(contactsResponse([contact('refreshed')]));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    await act(async () => {
      await hook.result.current.loadMore();
    });
    expect(hook.result.current.loadMoreError).toBeInstanceOf(Error);

    await act(async () => {
      await hook.result.current.refresh(null);
    });

    expect(hook.result.current.loadMoreError).toBeUndefined();
    expect(hook.result.current.contacts).toEqual([contact('refreshed')]);
  });

  it('stops pagination when the next batch returns a cursor that does not advance', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'cursor-a',
        }),
      )
      .mockResolvedValueOnce(
        contactsResponse([contact('second')], {
          hasNextPage: true,
          endCursor: 'cursor-a',
        }),
      );

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(hook.result.current.hasNextPage).toBe(false);
    expect(hook.result.current.contacts).toEqual([
      contact('first'),
      contact('second'),
    ]);

    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('refreshes the exact loaded count once more than the default batch is loaded', async () => {
    mockQuery
      .mockResolvedValueOnce(contactsResponse(contactsRange(150, 'loaded')))
      .mockResolvedValueOnce(contactsResponse(contactsRange(150, 'refreshed')));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(150));

    await act(async () => {
      await hook.result.current.refresh(null);
    });

    expect(mockQuery.mock.calls[1][0].variables).toEqual(
      expect.objectContaining({ first: 150 }),
    );
    expect(mockQuery.mock.calls[1][0].variables.after).toBeUndefined();
  });

  it('refreshes with the default batch size when fewer contacts are loaded', async () => {
    mockQuery
      .mockResolvedValueOnce(contactsResponse(contactsRange(30, 'loaded')))
      .mockResolvedValueOnce(contactsResponse(contactsRange(30, 'refreshed')));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(30));

    await act(async () => {
      await hook.result.current.refresh(null);
    });

    expect(mockQuery.mock.calls[1][0].variables).toEqual(
      expect.objectContaining({ first: 50 }),
    );
  });

  it('caps the refresh at 500 when more contacts are loaded', async () => {
    mockQuery
      .mockResolvedValueOnce(contactsResponse(contactsRange(650, 'loaded')))
      .mockResolvedValueOnce(contactsResponse(contactsRange(500, 'refreshed')));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() => expect(hook.result.current.contacts).toHaveLength(650));

    await act(async () => {
      await hook.result.current.refresh(null);
    });

    expect(mockQuery.mock.calls[1][0].variables).toEqual(
      expect.objectContaining({ first: 500 }),
    );
  });

  it('lets a non-forced refresh supersede an in-flight next batch', async () => {
    const loadMoreCall = createDeferred<ReturnType<typeof contactsResponse>>();

    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockReturnValueOnce(loadMoreCall.promise)
      .mockResolvedValueOnce(contactsResponse([contact('refreshed')]));

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    act(() => {
      void hook.result.current.loadMore();
    });
    await waitFor(() => expect(hook.result.current.loadingMore).toBe(true));

    let refreshResult: Awaited<ReturnType<typeof hook.result.current.refresh>>;
    await act(async () => {
      refreshResult = await hook.result.current.refresh(null);
    });

    expect(refreshResult!).toEqual({
      status: 'success',
      selectedContact: null,
    });
    expect(hook.result.current.loadingMore).toBe(false);
    expect(hook.result.current.contacts).toEqual([contact('refreshed')]);

    await act(async () => {
      loadMoreCall.resolve(contactsResponse([contact('stale')]));
    });
    expect(hook.result.current.contacts).toEqual([contact('refreshed')]);
  });

  it('still ignores a non-forced refresh behind an in-flight initial load', async () => {
    const initialCall = createDeferred<ReturnType<typeof contactsResponse>>();

    mockQuery.mockReturnValueOnce(initialCall.promise);

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    let refreshResult: Awaited<ReturnType<typeof hook.result.current.refresh>>;
    await act(async () => {
      refreshResult = await hook.result.current.refresh(null);
    });

    expect(refreshResult!).toEqual({
      status: 'ignored',
      selectedContact: null,
    });

    await act(async () => {
      initialCall.resolve(contactsResponse([contact('initial')]));
    });
  });

  it('exposes the server-reported total count and updates it from the latest response', async () => {
    mockQuery
      .mockResolvedValueOnce(
        contactsResponse(
          [contact('first')],
          { hasNextPage: true, endCursor: 'first-page-cursor' },
          1234,
        ),
      )
      .mockResolvedValueOnce(
        contactsResponse(
          [contact('second')],
          { hasNextPage: false, endCursor: 'second-page-cursor' },
          1235,
        ),
      );

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() => expect(hook.result.current.totalCount).toBe(1234));

    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(hook.result.current.totalCount).toBe(1235);
  });

  it('does not issue a second query while a next batch request is already in flight', async () => {
    const loadMoreCall = createDeferred<ReturnType<typeof contactsResponse>>();

    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockReturnValueOnce(loadMoreCall.promise);

    const hook = renderHook(() => useMyahInboxContacts(filters, 'workspace-1'));

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    act(() => {
      void hook.result.current.loadMore();
      void hook.result.current.loadMore();
    });
    await waitFor(() => expect(hook.result.current.loadingMore).toBe(true));

    expect(mockQuery).toHaveBeenCalledTimes(2);

    await act(async () => {
      loadMoreCall.resolve(
        contactsResponse([contact('second')], {
          hasNextPage: false,
          endCursor: 'second-page-cursor',
        }),
      );
    });
  });

  it('discards a late next-batch response from a previous filter scope', async () => {
    const loadMoreCall = createDeferred<ReturnType<typeof contactsResponse>>();

    mockQuery
      .mockResolvedValueOnce(
        contactsResponse([contact('first')], {
          hasNextPage: true,
          endCursor: 'first-page-cursor',
        }),
      )
      .mockReturnValueOnce(loadMoreCall.promise)
      .mockResolvedValueOnce(contactsResponse([contact('new-scope')]));

    const hook = renderHook(
      ({ currentFilters, workspaceId }: InboxHookProps) =>
        useMyahInboxContacts(currentFilters, workspaceId),
      { initialProps: { currentFilters: filters, workspaceId: 'workspace-1' } },
    );

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('first')]),
    );

    act(() => {
      void hook.result.current.loadMore();
    });
    await waitFor(() => expect(hook.result.current.loadingMore).toBe(true));

    hook.rerender({ currentFilters: filters, workspaceId: 'workspace-2' });

    await waitFor(() =>
      expect(hook.result.current.contacts).toEqual([contact('new-scope')]),
    );

    await act(async () => {
      loadMoreCall.resolve(contactsResponse([contact('stale-second-page')]));
    });
    expect(hook.result.current.contacts).toEqual([contact('new-scope')]);
  });
});
