import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import { GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGES } from '@/myah/inbox/graphql/operations';
import { type MyahInboxContactEmailMessage } from '@/myah/inbox/types/MyahInboxContact';

export type MyahInboxContactEmailMessagesQueryVariables = {
  contactId: string;
  first?: number;
  after?: string;
};

type MyahInboxContactEmailMessagesQuery = {
  myahInboxContactEmailMessages: MyahInboxContactEmailMessagesConnection;
};

type MyahInboxContactEmailMessagesConnection = {
  edges: MyahInboxContactEmailMessageEdge[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type MyahInboxContactEmailMessageEdge = {
  cursor: string;
  node: MyahInboxContactEmailMessage;
};

type MyahInboxContactEmailMessagesOperation = {
  scopeKey: string;
  abortController: AbortController;
};

type ScopedConnection = {
  scopeKey: string;
  connection: MyahInboxContactEmailMessagesConnection;
};

type ScopedLoadingState = {
  scopeKey: string;
  loading: boolean;
};

type ScopedErrorState = {
  scopeKey: string;
  error: Error | undefined;
};

const mergeMessagesChronologically = (
  currentEdges: MyahInboxContactEmailMessageEdge[],
  nextEdges: MyahInboxContactEmailMessageEdge[],
) => {
  const edgesByMessageId = new Map<string, MyahInboxContactEmailMessageEdge>();

  for (const edge of [...currentEdges, ...nextEdges]) {
    if (!edgesByMessageId.has(edge.node.id)) {
      edgesByMessageId.set(edge.node.id, edge);
    }
  }

  return [...edgesByMessageId.values()].sort(
    (left, right) =>
      Date.parse(left.node.receivedAt) - Date.parse(right.node.receivedAt),
  );
};

export const useMyahInboxContactEmailMessages = (
  currentWorkspaceId: string | null,
  contactId: string | null,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const scopeKey = JSON.stringify({ currentWorkspaceId, contactId });
  // Keeps async completions scoped before effects can observe a contact change.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeKeyRef = useRef(scopeKey);
  // Keeps cacheless requests aligned with the latest contact.
  // oxlint-disable-next-line twenty/no-state-useref
  const contactIdRef = useRef(contactId);
  // Avoids recreating requests when Apollo's core client identity changes.
  // oxlint-disable-next-line twenty/no-state-useref
  const apolloCoreClientRef = useRef(apolloCoreClient);
  // Serializes pagination against the latest locally fetched connection.
  // oxlint-disable-next-line twenty/no-state-useref
  const connectionRef = useRef<ScopedConnection | null>(null);
  // Arbitrates mutually exclusive network operations synchronously.
  const operationInFlightRef =
    // oxlint-disable-next-line twenty/no-state-useref
    useRef<MyahInboxContactEmailMessagesOperation | null>(null);
  const [scopedConnection, setScopedConnection] =
    useState<ScopedConnection | null>(null);
  const [initialLoading, setInitialLoading] = useState<ScopedLoadingState>({
    scopeKey,
    loading: Boolean(currentWorkspaceId && contactId),
  });
  const [loadMoreState, setLoadMoreState] = useState<ScopedLoadingState>({
    scopeKey,
    loading: false,
  });
  const [errorState, setErrorState] = useState<ScopedErrorState>({
    scopeKey,
    error: undefined,
  });

  scopeKeyRef.current = scopeKey;
  contactIdRef.current = contactId;
  apolloCoreClientRef.current = apolloCoreClient;

  const setConnection = useCallback((connection: ScopedConnection | null) => {
    connectionRef.current = connection;
    setScopedConnection(connection);
  }, []);

  const isOperationCurrent = useCallback(
    (operation: MyahInboxContactEmailMessagesOperation) =>
      operationInFlightRef.current === operation &&
      scopeKeyRef.current === operation.scopeKey,
    [],
  );

  const queryMessages = useCallback(
    (
      variables: MyahInboxContactEmailMessagesQueryVariables,
      abortController: AbortController,
    ) =>
      apolloCoreClientRef.current
        .query<
          MyahInboxContactEmailMessagesQuery,
          MyahInboxContactEmailMessagesQueryVariables
        >({
          query: GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGES,
          variables,
          fetchPolicy: 'no-cache',
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: abortController.signal },
          },
        })
        .then(({ data }) => {
          if (data === undefined) {
            throw new Error('Could not load contact email messages.');
          }

          return data;
        }),
    [],
  );

  const queryAllMessages = useCallback(
    async (
      requestedContactId: string,
      abortController: AbortController,
    ): Promise<MyahInboxContactEmailMessagesQuery> => {
      let data = await queryMessages(
        { contactId: requestedContactId, first: 50 },
        abortController,
      );
      let connection = data.myahInboxContactEmailMessages;

      while (
        connection.pageInfo.hasNextPage &&
        connection.pageInfo.endCursor !== null
      ) {
        data = await queryMessages(
          {
            contactId: requestedContactId,
            first: 50,
            after: connection.pageInfo.endCursor,
          },
          abortController,
        );
        connection = {
          ...data.myahInboxContactEmailMessages,
          edges: mergeMessagesChronologically(
            connection.edges,
            data.myahInboxContactEmailMessages.edges,
          ),
        };
      }

      return { myahInboxContactEmailMessages: connection };
    },
    [queryMessages],
  );

  useEffect(() => {
    operationInFlightRef.current?.abortController.abort();
    operationInFlightRef.current = null;
    setConnection(null);
    setLoadMoreState({ scopeKey, loading: false });
    setErrorState({ scopeKey, error: undefined });

    if (!currentWorkspaceId || !contactId) {
      setInitialLoading({ scopeKey, loading: false });

      return;
    }

    setInitialLoading({ scopeKey, loading: true });
    const operation: MyahInboxContactEmailMessagesOperation = {
      scopeKey,
      abortController: new AbortController(),
    };
    operationInFlightRef.current = operation;

    void queryAllMessages(contactId, operation.abortController)
      .then((data) => {
        if (!isOperationCurrent(operation)) {
          return;
        }

        setConnection({
          scopeKey: operation.scopeKey,
          connection: {
            ...data.myahInboxContactEmailMessages,
            edges: mergeMessagesChronologically(
              [],
              data.myahInboxContactEmailMessages.edges,
            ),
          },
        });
        setErrorState({ scopeKey: operation.scopeKey, error: undefined });
      })
      .catch((reason: unknown) => {
        if (
          !isOperationCurrent(operation) ||
          connectionRef.current?.scopeKey === operation.scopeKey
        ) {
          return;
        }

        setErrorState({
          scopeKey: operation.scopeKey,
          error:
            reason instanceof Error
              ? reason
              : new Error('Could not load contact email messages.'),
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
  }, [
    contactId,
    currentWorkspaceId,
    isOperationCurrent,
    queryAllMessages,
    scopeKey,
    setConnection,
  ]);

  const loadMore = useCallback(async () => {
    const scopeKey = scopeKeyRef.current;
    const currentConnection = connectionRef.current;
    const currentContactId = contactIdRef.current;

    if (
      !currentContactId ||
      operationInFlightRef.current ||
      currentConnection?.scopeKey !== scopeKey ||
      !currentConnection.connection.pageInfo.hasNextPage ||
      !currentConnection.connection.pageInfo.endCursor
    ) {
      return;
    }

    const operation: MyahInboxContactEmailMessagesOperation = {
      scopeKey,
      abortController: new AbortController(),
    };
    operationInFlightRef.current = operation;
    setLoadMoreState({ scopeKey, loading: true });

    try {
      const data = await queryMessages(
        {
          contactId: currentContactId,
          first: 50,
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
          ...data.myahInboxContactEmailMessages,
          edges: mergeMessagesChronologically(
            connectionRef.current.connection.edges,
            data.myahInboxContactEmailMessages.edges,
          ),
        },
      });
      setErrorState({ scopeKey: operation.scopeKey, error: undefined });
    } catch (reason: unknown) {
      if (!isOperationCurrent(operation)) {
        return;
      }

      setErrorState({
        scopeKey: operation.scopeKey,
        error:
          reason instanceof Error
            ? reason
            : new Error('Could not load contact email messages.'),
      });
    } finally {
      if (!isOperationCurrent(operation)) {
        return;
      }

      operationInFlightRef.current = null;
      setLoadMoreState({ scopeKey: operation.scopeKey, loading: false });
    }
  }, [isOperationCurrent, queryMessages, setConnection]);

  const refresh = useCallback(async () => {
    const currentScopeKey = scopeKeyRef.current;
    const currentContactId = contactIdRef.current;

    if (!currentContactId || operationInFlightRef.current) {
      return;
    }

    const operation: MyahInboxContactEmailMessagesOperation = {
      scopeKey: currentScopeKey,
      abortController: new AbortController(),
    };

    operationInFlightRef.current = operation;

    try {
      const data = await queryAllMessages(
        currentContactId,
        operation.abortController,
      );

      if (!isOperationCurrent(operation)) {
        return;
      }

      setConnection({
        scopeKey: operation.scopeKey,
        connection: {
          ...data.myahInboxContactEmailMessages,
          edges: mergeMessagesChronologically(
            [],
            data.myahInboxContactEmailMessages.edges,
          ),
        },
      });
      setErrorState({ scopeKey: operation.scopeKey, error: undefined });
    } catch (reason) {
      if (!isOperationCurrent(operation)) {
        return;
      }

      setErrorState({
        scopeKey: operation.scopeKey,
        error:
          reason instanceof Error
            ? reason
            : new Error('Could not refresh contact email messages.'),
      });
    } finally {
      if (isOperationCurrent(operation)) {
        operationInFlightRef.current = null;
      }
    }
  }, [isOperationCurrent, queryAllMessages, setConnection]);

  const connection =
    scopedConnection?.scopeKey === scopeKey
      ? scopedConnection.connection
      : undefined;
  const messages = useMemo(
    () => connection?.edges.map(({ node }) => node) ?? [],
    [connection],
  );
  const loading =
    initialLoading.scopeKey !== scopeKey || initialLoading.loading;
  const loadingMore =
    loadMoreState.scopeKey === scopeKey && loadMoreState.loading;

  return {
    messages,
    loading,
    loadingMore,
    isLoadingMore: loadingMore,
    error: errorState.scopeKey === scopeKey ? errorState.error : undefined,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
    loadMore,
    refresh,
  };
};
