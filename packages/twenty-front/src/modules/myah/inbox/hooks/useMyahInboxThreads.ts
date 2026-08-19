import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import { type MyahInboxFilters } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  MyahInboxSnoozeStatus,
  type MyahInboxState,
  MyahInboxThreadsDocument,
  type MyahInboxThreadsQuery,
  type MyahInboxThreadsQueryVariables,
} from '~/generated/graphql';

export type MyahInboxThread = {
  id: string;
  lastActivityAt: string;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  state: 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED';
  snoozedUntil: string | null;
  creator: { id: string; name: string | null } | null;
  campaign: { id: string; name: string | null } | null;
  inboxOwner: { id: string; name: string | null } | null;
};

export type MyahInboxRefreshResult = {
  status: 'success' | 'failed' | 'ignored';
  selectedThread: MyahInboxThread | null;
};

type MyahInboxConnection = MyahInboxThreadsQuery['myahInboxThreads'];

type MyahInboxOperation = {
  kind: 'initial' | 'refresh' | 'load-more';
  scopeKey: string;
  requestId: number;
  abortController: AbortController;
};

type ScopedConnection = {
  scopeKey: string;
  connection: MyahInboxConnection;
};

type ScopedInitialLoading = {
  scopeKey: string;
  loading: boolean;
};

type ScopedLoadMoreState = {
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

export const useMyahInboxThreads = (
  filters: MyahInboxFilters,
  currentWorkspaceId: string | null,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const snoozeStatus =
    filters.snoozeStatus === 'ACTIVE'
      ? MyahInboxSnoozeStatus.ACTIVE
      : filters.snoozeStatus === 'DUE'
        ? MyahInboxSnoozeStatus.DUE
        : undefined;
  const baseVariables = useMemo(
    () =>
      ({
        first: 50,
        owner: filters.owner || undefined,
        campaignId:
          filters.campaignWorkspaceId === currentWorkspaceId
            ? (filters.campaignId ?? undefined)
            : undefined,
        states:
          filters.states.length > 0
            ? (filters.states as MyahInboxState[])
            : undefined,
        snoozeStatus,
        search: filters.search || undefined,
      }) satisfies MyahInboxThreadsQueryVariables,
    [
      currentWorkspaceId,
      filters.campaignId,
      filters.campaignWorkspaceId,
      filters.owner,
      filters.search,
      filters.states,
      snoozeStatus,
    ],
  );
  const scopeKey = JSON.stringify({ currentWorkspaceId, ...baseVariables });
  // Keeps async completions scoped before effects can observe a workspace change.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeKeyRef = useRef(scopeKey);
  // Keeps cacheless requests aligned with the latest query scope.
  // oxlint-disable-next-line twenty/no-state-useref
  const baseVariablesRef = useRef(baseVariables);
  // Avoids recreating the request callback when Apollo's core client identity changes.
  // oxlint-disable-next-line twenty/no-state-useref
  const apolloCoreClientRef = useRef(apolloCoreClient);
  // Serializes pagination against the latest locally fetched connection.
  // oxlint-disable-next-line twenty/no-state-useref
  const connectionRef = useRef<ScopedConnection | null>(null);
  // Arbitrates mutually exclusive network operations synchronously.
  // oxlint-disable-next-line twenty/no-state-useref
  const operationInFlightRef = useRef<MyahInboxOperation | null>(null);
  // Tags async operation completions before React state publishes them.
  // oxlint-disable-next-line twenty/no-state-useref
  const requestIdRef = useRef(0);
  const [scopedConnection, setScopedConnection] =
    useState<ScopedConnection | null>(null);
  const [initialLoading, setInitialLoading] = useState<ScopedInitialLoading>({
    scopeKey,
    loading: true,
  });
  const [loadMoreState, setLoadMoreState] = useState<ScopedLoadMoreState>({
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
    (operation: MyahInboxOperation) =>
      operationInFlightRef.current === operation &&
      scopeKeyRef.current === operation.scopeKey,
    [],
  );

  const queryInboxThreads = useCallback(
    (
      variables: MyahInboxThreadsQueryVariables,
      abortController: AbortController,
    ) =>
      apolloCoreClientRef.current
        .query<MyahInboxThreadsQuery, MyahInboxThreadsQueryVariables>({
          query: MyahInboxThreadsDocument,
          variables,
          fetchPolicy: 'no-cache',
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: abortController.signal },
          },
        })
        .then(({ data }) => {
          if (data === undefined) {
            throw new Error('Could not load Inbox.');
          }

          return data;
        }),
    [],
  );

  useEffect(() => {
    const previousOperation = operationInFlightRef.current;

    previousOperation?.abortController.abort();
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

    const operation: MyahInboxOperation = {
      kind: 'initial',
      scopeKey,
      requestId: ++requestIdRef.current,
      abortController: new AbortController(),
    };

    operationInFlightRef.current = operation;

    void queryInboxThreads(baseVariablesRef.current, operation.abortController)
      .then((data) => {
        if (!isOperationCurrent(operation)) {
          return;
        }

        setConnection({
          scopeKey: operation.scopeKey,
          connection: data.myahInboxThreads,
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
              : new Error('Could not load Inbox.'),
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
      const activeOperation = operationInFlightRef.current;

      if (activeOperation?.scopeKey === scopeKey) {
        activeOperation.abortController.abort();
        operationInFlightRef.current = null;
      }
    };
  }, [isOperationCurrent, queryInboxThreads, scopeKey, setConnection]);

  const refresh = useCallback(
    async (
      selectedThreadId: string | null,
    ): Promise<MyahInboxRefreshResult> => {
      if (operationInFlightRef.current) {
        return { status: 'ignored', selectedThread: null };
      }

      const operation: MyahInboxOperation = {
        kind: 'refresh',
        scopeKey: scopeKeyRef.current,
        requestId: ++requestIdRef.current,
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
        const data = await queryInboxThreads(
          baseVariablesRef.current,
          operation.abortController,
        );

        if (!isOperationCurrent(operation)) {
          return { status: 'ignored', selectedThread: null };
        }

        const refreshedConnection = data.myahInboxThreads;
        setConnection({
          scopeKey: operation.scopeKey,
          connection: refreshedConnection,
        });
        setListError({ scopeKey: operation.scopeKey, error: undefined });

        const selectedThread = selectedThreadId
          ? refreshedConnection.edges.find(
              ({ node }) => node.id === selectedThreadId,
            )?.node
          : null;

        if (selectedThread || !selectedThreadId) {
          operationInFlightRef.current = null;
          setRefreshState({
            scopeKey: operation.scopeKey,
            isRefreshing: false,
            status: 'succeeded',
            error: null,
          });

          return {
            status: 'success',
            selectedThread:
              (selectedThread as MyahInboxThread | undefined) ?? null,
          };
        }

        const validationResult = await queryInboxThreads(
          {
            ...baseVariablesRef.current,
            first: 1,
            threadId: selectedThreadId,
          },
          operation.abortController,
        );

        if (!isOperationCurrent(operation)) {
          return { status: 'ignored', selectedThread: null };
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
          selectedThread:
            (validationResult.myahInboxThreads.edges[0]?.node as
              | MyahInboxThread
              | undefined) ?? null,
        };
      } catch {
        if (!isOperationCurrent(operation)) {
          return { status: 'ignored', selectedThread: null };
        }

        operationInFlightRef.current = null;
        setRefreshState({
          scopeKey: operation.scopeKey,
          isRefreshing: false,
          status: 'failed',
          error: new Error('Could not refresh Inbox.'),
        });

        return { status: 'failed', selectedThread: null };
      }
    },
    [isOperationCurrent, queryInboxThreads, setConnection],
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

    const operation: MyahInboxOperation = {
      kind: 'load-more',
      scopeKey,
      requestId: ++requestIdRef.current,
      abortController: new AbortController(),
    };

    operationInFlightRef.current = operation;
    setLoadMoreState({ scopeKey, loading: true });

    try {
      const data = await queryInboxThreads(
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
          ...data.myahInboxThreads,
          edges: [
            ...connectionRef.current.connection.edges,
            ...data.myahInboxThreads.edges,
          ],
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
          reason instanceof Error ? reason : new Error('Could not load Inbox.'),
      });
    } finally {
      if (!isOperationCurrent(operation)) {
        return;
      }

      operationInFlightRef.current = null;
      setLoadMoreState({ scopeKey: operation.scopeKey, loading: false });
    }
  }, [isOperationCurrent, queryInboxThreads, setConnection]);

  const connection =
    scopedConnection?.scopeKey === scopeKey
      ? scopedConnection.connection
      : undefined;
  const threads = useMemo(
    () => connection?.edges.map(({ node }) => node as MyahInboxThread) ?? [],
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
    threads,
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
