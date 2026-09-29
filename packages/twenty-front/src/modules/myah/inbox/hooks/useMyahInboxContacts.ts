import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import { GET_MYAH_INBOX_CONTACTS } from '@/myah/inbox/graphql/operations';
import { type MyahInboxFilters } from '@/myah/inbox/states/myahInboxSelectionState';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

export type MyahInboxContactsQueryVariables = {
  first?: number;
  after?: string;
  contactId?: string;
  owner?: string;
  campaignId?: string;
  states?: MyahInboxFilters['states'];
  snoozeStatus?: Exclude<MyahInboxFilters['snoozeStatus'], ''>;
  search?: string;
};

type MyahInboxContactsQuery = {
  myahInboxContacts: MyahInboxContactsConnection;
};

type MyahInboxContactsConnection = {
  edges: MyahInboxContactEdge[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number;
};

const MYAH_INBOX_CONTACT_PAGE_SIZE = 50;
// Matches the server's contact-list-only ceiling (MYAH_INBOX_CONTACT_MAX_PAGE_SIZE)
// so a depth-preserving refresh never requests more than the server will return.
const MYAH_INBOX_CONTACT_REFRESH_MAX_PAGE_SIZE = 500;

type MyahInboxContactEdge = {
  cursor: string;
  node: MyahInboxContact;
};

export type MyahInboxContactRefreshResult = {
  status: 'success' | 'failed' | 'ignored';
  selectedContact: MyahInboxContact | null;
};

type MyahInboxContactsOperationKind =
  | 'initial'
  | 'loadMore'
  | 'refresh'
  | 'ambient';

type MyahInboxContactsOperation = {
  scopeKey: string;
  kind: MyahInboxContactsOperationKind;
  abortController: AbortController;
};

type ScopedConnection = {
  scopeKey: string;
  connection: MyahInboxContactsConnection;
};

type ScopedLoadingState = {
  scopeKey: string;
  loading: boolean;
};

type ScopedRefreshState = {
  scopeKey: string;
  isRefreshing: boolean;
  status: 'idle' | 'refreshing' | 'succeeded' | 'failed';
  error: Error | null;
};

type ScopedListError = {
  scopeKey: string;
  error: Error | undefined;
};

const mergeEdges = (
  currentEdges: MyahInboxContactEdge[],
  nextEdges: MyahInboxContactEdge[],
) => {
  const edgesByContactId = new Map<string, MyahInboxContactEdge>();

  for (const edge of [...currentEdges, ...nextEdges]) {
    if (!edgesByContactId.has(edge.node.id)) {
      edgesByContactId.set(edge.node.id, edge);
    }
  }

  return [...edgesByContactId.values()];
};

export const useMyahInboxContacts = (
  filters: MyahInboxFilters,
  currentWorkspaceId: string | null,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const baseVariables = useMemo(
    () => ({
      first: MYAH_INBOX_CONTACT_PAGE_SIZE,
      owner: filters.owner || undefined,
      campaignId:
        filters.campaignWorkspaceId === currentWorkspaceId
          ? (filters.campaignId ?? undefined)
          : undefined,
      states: filters.states.length > 0 ? filters.states : undefined,
      snoozeStatus: filters.snoozeStatus || undefined,
      search: filters.search || undefined,
    }),
    [
      currentWorkspaceId,
      filters.campaignId,
      filters.campaignWorkspaceId,
      filters.owner,
      filters.search,
      filters.snoozeStatus,
      filters.states,
    ],
  );
  const scopeKey = JSON.stringify({ currentWorkspaceId, ...baseVariables });
  // Keeps async completions scoped before effects can observe a workspace change.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeKeyRef = useRef(scopeKey);
  // Keeps cacheless requests aligned with the latest contact list scope.
  // oxlint-disable-next-line twenty/no-state-useref
  const baseVariablesRef = useRef(baseVariables);
  // Avoids recreating requests when Apollo's core client identity changes.
  // oxlint-disable-next-line twenty/no-state-useref
  const apolloCoreClientRef = useRef(apolloCoreClient);
  // Serializes pagination against the latest locally fetched connection.
  // oxlint-disable-next-line twenty/no-state-useref
  const connectionRef = useRef<ScopedConnection | null>(null);
  // Arbitrates mutually exclusive network operations synchronously.
  // oxlint-disable-next-line twenty/no-state-useref
  const operationInFlightRef = useRef<MyahInboxContactsOperation | null>(null);
  const [scopedConnection, setScopedConnection] =
    useState<ScopedConnection | null>(null);
  const [initialLoading, setInitialLoading] = useState<ScopedLoadingState>({
    scopeKey,
    loading: true,
  });
  const [loadMoreState, setLoadMoreState] = useState<ScopedLoadingState>({
    scopeKey,
    loading: false,
  });
  const [refreshState, setRefreshState] = useState<ScopedRefreshState>({
    scopeKey,
    isRefreshing: false,
    status: 'idle',
    error: null,
  });
  const [listError, setListError] = useState<ScopedListError>({
    scopeKey,
    error: undefined,
  });
  const [loadMoreError, setLoadMoreError] = useState<ScopedListError>({
    scopeKey,
    error: undefined,
  });

  scopeKeyRef.current = scopeKey;
  baseVariablesRef.current = baseVariables;
  apolloCoreClientRef.current = apolloCoreClient;

  const setConnection = useCallback((connection: ScopedConnection | null) => {
    connectionRef.current = connection;
    setScopedConnection(connection);
  }, []);

  const isOperationCurrent = useCallback(
    (operation: MyahInboxContactsOperation) =>
      operationInFlightRef.current === operation &&
      scopeKeyRef.current === operation.scopeKey,
    [],
  );

  const queryContacts = useCallback(
    (
      variables: MyahInboxContactsQueryVariables,
      abortController: AbortController,
    ) =>
      apolloCoreClientRef.current
        .query<MyahInboxContactsQuery, MyahInboxContactsQueryVariables>({
          query: GET_MYAH_INBOX_CONTACTS,
          variables,
          fetchPolicy: 'no-cache',
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: abortController.signal },
          },
        })
        .then(({ data }) => {
          if (data === undefined) {
            throw new Error('Could not load Inbox contacts.');
          }

          return data;
        }),
    [],
  );

  useEffect(() => {
    operationInFlightRef.current?.abortController.abort();
    operationInFlightRef.current = null;
    setConnection(null);
    setInitialLoading({ scopeKey, loading: true });
    setLoadMoreState({ scopeKey, loading: false });
    setRefreshState({
      scopeKey,
      isRefreshing: false,
      status: 'idle',
      error: null,
    });
    setListError({ scopeKey, error: undefined });
    setLoadMoreError({ scopeKey, error: undefined });

    const operation: MyahInboxContactsOperation = {
      scopeKey,
      kind: 'initial',
      abortController: new AbortController(),
    };
    operationInFlightRef.current = operation;

    void queryContacts(baseVariablesRef.current, operation.abortController)
      .then((data) => {
        if (!isOperationCurrent(operation)) {
          return;
        }

        setConnection({
          scopeKey: operation.scopeKey,
          connection: data.myahInboxContacts,
        });
        setListError({ scopeKey: operation.scopeKey, error: undefined });
      })
      .catch((reason: unknown) => {
        if (
          !isOperationCurrent(operation) ||
          connectionRef.current?.scopeKey === operation.scopeKey
        ) {
          return;
        }

        setListError({
          scopeKey: operation.scopeKey,
          error:
            reason instanceof Error
              ? reason
              : new Error('Could not load Inbox contacts.'),
        });
      })
      .finally(() => {
        if (!isOperationCurrent(operation)) {
          return;
        }

        operationInFlightRef.current = null;
        setInitialLoading({ scopeKey: operation.scopeKey, loading: false });
      });

    return () => {
      if (operationInFlightRef.current?.scopeKey === scopeKey) {
        operationInFlightRef.current.abortController.abort();
        operationInFlightRef.current = null;
      }
    };
  }, [isOperationCurrent, queryContacts, scopeKey, setConnection]);

  const refresh = useCallback(
    async (
      selectedContactId: string | null,
      options?: { force?: boolean },
    ): Promise<MyahInboxContactRefreshResult> => {
      const inFlight = operationInFlightRef.current;

      if (inFlight) {
        // An action refresh takes priority over a next batch or background
        // refresh; it still defers to an initial load or another action refresh.
        const supersedesBackground =
          !options?.force &&
          (inFlight.kind === 'loadMore' || inFlight.kind === 'ambient');

        if (!options?.force && !supersedesBackground) {
          return { status: 'ignored', selectedContact: null };
        }

        inFlight.abortController.abort();
        operationInFlightRef.current = null;
        setLoadMoreState({
          scopeKey: scopeKeyRef.current,
          loading: false,
        });
      }

      const loadedConnection =
        connectionRef.current?.scopeKey === scopeKeyRef.current
          ? connectionRef.current.connection
          : null;
      // ponytail: a 500-row action refresh may drop deeper rows; raise the
      // cap or add cursor-anchored refresh/virtualization if that matters.
      const refreshPageSize = Math.min(
        Math.max(
          loadedConnection?.edges.length ?? 0,
          MYAH_INBOX_CONTACT_PAGE_SIZE,
        ),
        MYAH_INBOX_CONTACT_REFRESH_MAX_PAGE_SIZE,
      );

      const operation: MyahInboxContactsOperation = {
        scopeKey: scopeKeyRef.current,
        kind: 'refresh',
        abortController: new AbortController(),
      };
      operationInFlightRef.current = operation;
      setRefreshState({
        scopeKey: operation.scopeKey,
        isRefreshing: true,
        status: 'refreshing',
        error: null,
      });

      try {
        const data = await queryContacts(
          { ...baseVariablesRef.current, first: refreshPageSize },
          operation.abortController,
        );

        if (!isOperationCurrent(operation)) {
          return { status: 'ignored', selectedContact: null };
        }

        const refreshedConnection = data.myahInboxContacts;
        setConnection({
          scopeKey: operation.scopeKey,
          connection: refreshedConnection,
        });
        setListError({ scopeKey: operation.scopeKey, error: undefined });
        setLoadMoreError({ scopeKey: operation.scopeKey, error: undefined });

        const selectedContact = selectedContactId
          ? refreshedConnection.edges.find(
              ({ node }) => node.id === selectedContactId,
            )?.node
          : null;

        if (selectedContact || !selectedContactId) {
          operationInFlightRef.current = null;
          setRefreshState({
            scopeKey: operation.scopeKey,
            isRefreshing: false,
            status: 'succeeded',
            error: null,
          });

          return {
            status: 'success',
            selectedContact: selectedContact ?? null,
          };
        }

        const validationResult = await queryContacts(
          {
            ...baseVariablesRef.current,
            first: 1,
            after: undefined,
            contactId: selectedContactId,
          },
          operation.abortController,
        );

        if (!isOperationCurrent(operation)) {
          return { status: 'ignored', selectedContact: null };
        }

        operationInFlightRef.current = null;
        setRefreshState({
          scopeKey: operation.scopeKey,
          isRefreshing: false,
          status: 'succeeded',
          error: null,
        });

        return {
          status: 'success',
          selectedContact:
            validationResult.myahInboxContacts.edges[0]?.node ?? null,
        };
      } catch {
        if (!isOperationCurrent(operation)) {
          return { status: 'ignored', selectedContact: null };
        }

        operationInFlightRef.current = null;
        setRefreshState({
          scopeKey: operation.scopeKey,
          isRefreshing: false,
          status: 'failed',
          error: new Error('Could not refresh Inbox contacts.'),
        });

        return { status: 'failed', selectedContact: null };
      }
    },
    [isOperationCurrent, queryContacts, setConnection],
  );

  // Background arrival: re-authorizes every loaded row with fresh cursors in
  // the current scope, without the refresh indicator or list teardown.
  const ambientRefresh = useCallback(
    async (
      selectedContactId: string | null,
    ): Promise<MyahInboxContactRefreshResult> => {
      const current = connectionRef.current;
      if (
        operationInFlightRef.current ||
        current?.scopeKey !== scopeKeyRef.current
      )
        return { status: 'ignored', selectedContact: null };
      const operation: MyahInboxContactsOperation = {
        scopeKey: current.scopeKey,
        kind: 'ambient',
        abortController: new AbortController(),
      };
      operationInFlightRef.current = operation;
      // At least one normal page, so new arrivals never evict retained rows.
      const loaded = Math.max(
        current.connection.edges.length,
        baseVariablesRef.current.first,
      );
      try {
        let edges: MyahInboxContactEdge[] = [];
        let pageInfo = current.connection.pageInfo;
        let totalCount = current.connection.totalCount;
        let after: string | undefined;
        do {
          const data = await queryContacts(
            {
              ...baseVariablesRef.current,
              first: Math.min(
                MYAH_INBOX_CONTACT_REFRESH_MAX_PAGE_SIZE,
                loaded - edges.length,
              ),
              after,
            },
            operation.abortController,
          );
          if (!isOperationCurrent(operation))
            return { status: 'ignored', selectedContact: null };
          edges = mergeEdges(edges, data.myahInboxContacts.edges);
          pageInfo = data.myahInboxContacts.pageInfo;
          totalCount = data.myahInboxContacts.totalCount;
          after = pageInfo.endCursor ?? undefined;
        } while (edges.length < loaded && pageInfo.hasNextPage && after);
        let selectedContact =
          edges.find(({ node }) => node.id === selectedContactId)?.node ?? null;
        if (selectedContactId && !selectedContact) {
          const validation = await queryContacts(
            {
              ...baseVariablesRef.current,
              first: 1,
              after: undefined,
              contactId: selectedContactId,
            },
            operation.abortController,
          );
          if (!isOperationCurrent(operation))
            return { status: 'ignored', selectedContact: null };
          selectedContact = validation.myahInboxContacts.edges[0]?.node ?? null;
        }
        operationInFlightRef.current = null;
        setConnection({
          scopeKey: operation.scopeKey,
          connection: { edges, pageInfo, totalCount },
        });
        setListError({ scopeKey: operation.scopeKey, error: undefined });
        // Keep a failed batch paused while more pages exist; dismiss its
        // stale retry control when the refreshed scope has no next page.
        if (!pageInfo.hasNextPage)
          setLoadMoreError({ scopeKey: operation.scopeKey, error: undefined });
        return { status: 'success', selectedContact };
      } catch {
        if (!isOperationCurrent(operation))
          return { status: 'ignored', selectedContact: null };
        operationInFlightRef.current = null;
        setRefreshState({
          scopeKey: operation.scopeKey,
          isRefreshing: false,
          status: 'failed',
          error: new Error('Could not refresh Inbox contacts.'),
        });
        return { status: 'failed', selectedContact: null };
      }
    },
    [isOperationCurrent, queryContacts, setConnection],
  );

  const loadMore = useCallback(async () => {
    const scopeKey = scopeKeyRef.current;
    const currentConnection = connectionRef.current;
    const inFlight = operationInFlightRef.current;
    // The sentinel is paused while an error exists, so this is an explicit
    // retry. Let it take priority over a background poll of the same scope.
    if (
      inFlight?.kind === 'ambient' &&
      loadMoreError.scopeKey === scopeKey &&
      loadMoreError.error
    ) {
      inFlight.abortController.abort();
      operationInFlightRef.current = null;
    }

    if (
      operationInFlightRef.current ||
      currentConnection?.scopeKey !== scopeKey ||
      !currentConnection.connection.pageInfo.hasNextPage ||
      !currentConnection.connection.pageInfo.endCursor
    ) {
      return;
    }

    const requestedAfter = currentConnection.connection.pageInfo.endCursor;
    const operation: MyahInboxContactsOperation = {
      scopeKey,
      kind: 'loadMore',
      abortController: new AbortController(),
    };
    operationInFlightRef.current = operation;
    setLoadMoreState({ scopeKey, loading: true });
    setLoadMoreError({ scopeKey, error: undefined });

    try {
      const data = await queryContacts(
        {
          ...baseVariablesRef.current,
          after: requestedAfter,
        },
        operation.abortController,
      );

      if (
        !isOperationCurrent(operation) ||
        connectionRef.current?.scopeKey !== operation.scopeKey
      ) {
        return;
      }

      // A next batch whose cursor does not advance past the one just
      // requested indicates the end of the list even when the server
      // reports hasNextPage; stop automatic loading rather than loop.
      const cursorAdvanced =
        data.myahInboxContacts.pageInfo.endCursor !== requestedAfter;
      const pageInfo = cursorAdvanced
        ? data.myahInboxContacts.pageInfo
        : { ...data.myahInboxContacts.pageInfo, hasNextPage: false };

      setConnection({
        scopeKey: operation.scopeKey,
        connection: {
          totalCount: data.myahInboxContacts.totalCount,
          pageInfo,
          edges: mergeEdges(
            connectionRef.current.connection.edges,
            data.myahInboxContacts.edges,
          ),
        },
      });
      setListError({ scopeKey: operation.scopeKey, error: undefined });
    } catch (reason: unknown) {
      if (!isOperationCurrent(operation)) {
        return;
      }

      setLoadMoreError({
        scopeKey: operation.scopeKey,
        error:
          reason instanceof Error
            ? reason
            : new Error('Could not load Inbox contacts.'),
      });
    } finally {
      if (!isOperationCurrent(operation)) {
        return;
      }

      operationInFlightRef.current = null;
      setLoadMoreState({ scopeKey: operation.scopeKey, loading: false });
    }
  }, [isOperationCurrent, loadMoreError, queryContacts, setConnection]);

  const connection =
    scopedConnection?.scopeKey === scopeKey
      ? scopedConnection.connection
      : undefined;
  const contacts = useMemo(
    () => connection?.edges.map(({ node }) => node) ?? [],
    [connection],
  );
  const loading =
    initialLoading.scopeKey !== scopeKey || initialLoading.loading;
  const loadingMore =
    loadMoreState.scopeKey === scopeKey && loadMoreState.loading;
  const currentRefreshState =
    refreshState.scopeKey === scopeKey
      ? refreshState
      : {
          isRefreshing: false,
          status: 'idle' as const,
          error: null,
        };

  return {
    contacts,
    loading,
    loadingMore,
    isLoadingMore: loadingMore,
    error: listError.scopeKey === scopeKey ? listError.error : undefined,
    loadMoreError:
      loadMoreError.scopeKey === scopeKey ? loadMoreError.error : undefined,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
    totalCount: connection?.totalCount ?? 0,
    loadMore,
    refresh,
    ambientRefresh,
    isRefreshing: currentRefreshState.isRefreshing,
    refreshStatus: currentRefreshState.status,
    refreshError: currentRefreshState.error,
  };
};
