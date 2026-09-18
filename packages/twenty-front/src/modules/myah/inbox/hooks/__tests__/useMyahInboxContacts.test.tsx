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
  instagramUsername: id,
  creator: { id: `creator-${id}`, name: id },
  lastActivityAt: '2026-09-05T12:00:00.000Z',
  latestChannel: 'EMAIL',
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
) => ({
  data: {
    myahInboxContacts: {
      edges: contacts.map((node, index) => ({
        cursor: `cursor-${index + 1}`,
        node,
      })),
      pageInfo,
    },
  },
});

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
});
