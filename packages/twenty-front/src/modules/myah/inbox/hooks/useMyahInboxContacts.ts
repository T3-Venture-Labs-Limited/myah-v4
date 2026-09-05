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
};

type MyahInboxContactEdge = {
  cursor: string;
  node: MyahInboxContact;
};

export type MyahInboxContactRefreshResult = {
  status: 'success' | 'failed' | 'ignored';
  selectedContact: MyahInboxContact | null;
};

type MyahInboxContactsOperation = {
  scopeKey: string;
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
      first: 50,
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

    const operation: MyahInboxContactsOperation = {
      scopeKey,
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
      if (operationInFlightRef.current) {
        if (!options?.force) {
          return { status: 'ignored', selectedContact: null };
        }

        operationInFlightRef.current.abortController.abort();
        operationInFlightRef.current = null;
        setLoadMoreState({
          scopeKey: scopeKeyRef.current,
          loading: false,
        });
      }

      const operation: MyahInboxContactsOperation = {
        scopeKey: scopeKeyRef.current,
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
          baseVariablesRef.current,
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

  const loadMore = useCallback(async () => {
    const scopeKey = scopeKeyRef.current;
    const currentConnection = connectionRef.current;

    if (
      operationInFlightRef.current ||
      currentConnection?.scopeKey !== scopeKey ||
      !currentConnection.connection.pageInfo.hasNextPage ||
      !currentConnection.connection.pageInfo.endCursor
    ) {
      return;
    }

    const operation: MyahInboxContactsOperation = {
      scopeKey,
      abortController: new AbortController(),
    };
    operationInFlightRef.current = operation;
    setLoadMoreState({ scopeKey, loading: true });

    try {
      const data = await queryContacts(
        {
          ...baseVariablesRef.current,
          after: currentConnection.connection.pageInfo.endCursor,
        },
        operation.abortController,
      );

      if (
        !isOperationCurrent(operation) ||
        connectionRef.current?.scopeKey !== operation.scopeKey
      ) {
        return;
      }

      setConnection({
        scopeKey: operation.scopeKey,
        connection: {
          ...data.myahInboxContacts,
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

      setListError({
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
  }, [isOperationCurrent, queryContacts, setConnection]);

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
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
    loadMore,
    refresh,
    isRefreshing: currentRefreshState.isRefreshing,
    refreshStatus: currentRefreshState.status,
    refreshError: currentRefreshState.error,
  };
};
