import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';
import {
  MyahInboxInstagramMessagesDocument,
  type MyahInboxInstagramMessagesQuery,
  type MyahInboxInstagramMessagesQueryVariables,
} from '~/generated/graphql';

const MESSAGE_LIMIT = 100;

type MyahInstagramMessageConnection =
  MyahInboxInstagramMessagesQuery['myahInboxInstagramMessages'];
type MyahInstagramMessageEdge = MyahInstagramMessageConnection['edges'][number];

type InstagramConversationOperation = {
  scopeKey: string;
  abortController: AbortController;
  // Intent belongs to this operation, so cancellation discards it too.
  refreshRequested?: boolean;
};

const effectiveTimestamp = (message: {
  providerCreatedAt?: string | null;
  createdAt: string;
}) => message.providerCreatedAt ?? message.createdAt;

const toInstagramConversationMessage = (
  message: MyahInstagramMessageEdge['node'],
): MyahInstagramConversationMessage => ({
  id: message.id,
  text: message.text ?? null,
  direction: message.direction as MyahInstagramConversationMessage['direction'],
  sentVia: message.sentVia as MyahInstagramConversationMessage['sentVia'],
  provider: message.provider as MyahInstagramConversationMessage['provider'],
  deliveryState:
    message.deliveryState as MyahInstagramConversationMessage['deliveryState'],
  providerCreatedAt: message.providerCreatedAt ?? null,
  createdAt: message.createdAt,
  hasAttachments: message.hasAttachments,
  attachmentCount: message.attachmentCount,
});

const mergeChronologically = (
  currentEdges: MyahInstagramMessageEdge[],
  nextEdges: MyahInstagramMessageEdge[],
) => {
  const edgesById = new Map<string, MyahInstagramMessageEdge>();

  for (const edge of [...currentEdges, ...nextEdges]) {
    if (!edgesById.has(edge.node.id)) {
      edgesById.set(edge.node.id, edge);
    }
  }

  return [...edgesById.values()].sort(
    (left, right) =>
      Date.parse(effectiveTimestamp(left.node)) -
        Date.parse(effectiveTimestamp(right.node)) ||
      left.node.id.localeCompare(right.node.id),
  );
};

export const useMyahInstagramConversation = (conversationId: string | null) => {
  const apolloCoreClient = useApolloCoreClient();
  const scopeKey = conversationId ?? '';
  // Keeps network completions scoped to the selected Instagram conversation.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeKeyRef = useRef(scopeKey);
  // Prevents concurrent page reads from sharing or replacing cursors.
  // oxlint-disable-next-line twenty/no-state-useref
  const operationRef = useRef<InstagramConversationOperation | null>(null);
  // Keeps pagination based on the latest accepted native page connection.
  // oxlint-disable-next-line twenty/no-state-useref
  const connectionRef = useRef<MyahInstagramMessageConnection | null>(null);
  // Avoids turning an Apollo client identity change into a stale request.
  // oxlint-disable-next-line twenty/no-state-useref
  const apolloCoreClientRef = useRef(apolloCoreClient);
  const [connection, setConnection] =
    useState<MyahInstagramMessageConnection | null>(null);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  scopeKeyRef.current = scopeKey;
  apolloCoreClientRef.current = apolloCoreClient;

  const queryMessages = useCallback(
    (
      variables: MyahInboxInstagramMessagesQueryVariables,
      abortController: AbortController,
    ) =>
      apolloCoreClientRef.current
        .query({
          query: MyahInboxInstagramMessagesDocument,
          variables,
          fetchPolicy: 'no-cache',
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: abortController.signal },
          },
        })
        .then(({ data }) => {
          if (!data) {
            throw new Error('Could not load Instagram messages.');
          }

          return data.myahInboxInstagramMessages;
        }),
    [],
  );

  const publishConnection = useCallback(
    (nextConnection: MyahInstagramMessageConnection) => {
      const chronologicalConnection = {
        ...nextConnection,
        edges: mergeChronologically([], nextConnection.edges),
      };

      connectionRef.current = chronologicalConnection;
      setConnection(chronologicalConnection);
    },
    [],
  );

  const startInitialRead = useCallback(
    async function readInitialPage() {
      const requestedConversationId = scopeKeyRef.current;

      if (!requestedConversationId) return;
      if (operationRef.current) {
        if (operationRef.current.scopeKey === requestedConversationId) {
          operationRef.current.refreshRequested = true;
        }
        // Preserve the existing immediate settlement for busy refetch callers.
        return;
      }

      const operation: InstagramConversationOperation = {
        scopeKey: requestedConversationId,
        abortController: new AbortController(),
      };
      operationRef.current = operation;
      setLoading(true);
      setError(null);

      try {
        const nextConnection = await queryMessages(
          { conversationId: requestedConversationId, first: MESSAGE_LIMIT },
          operation.abortController,
        );
        if (
          operationRef.current !== operation ||
          scopeKeyRef.current !== operation.scopeKey
        ) {
          return;
        }
        publishConnection(nextConnection);
      } catch (reason: unknown) {
        if (
          operationRef.current !== operation ||
          scopeKeyRef.current !== operation.scopeKey
        ) {
          return;
        }
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not load Instagram messages.',
        );
      } finally {
        if (operationRef.current === operation) {
          operationRef.current = null;
          setLoading(false);
          if (
            operation.refreshRequested &&
            scopeKeyRef.current === operation.scopeKey
          ) {
            void readInitialPage();
          }
        }
      }
    },
    [publishConnection, queryMessages],
  );

  useEffect(() => {
    operationRef.current?.abortController.abort();
    operationRef.current = null;
    connectionRef.current = null;
    setConnection(null);
    setError(null);
    setLoadingMore(false);

    if (!conversationId) {
      setLoading(false);

      return;
    }

    void startInitialRead();

    return () => {
      if (operationRef.current?.scopeKey === scopeKey) {
        operationRef.current.abortController.abort();
        operationRef.current = null;
      }
    };
  }, [conversationId, scopeKey, startInitialRead]);

  const loadMore = useCallback(async () => {
    const currentConnection = connectionRef.current;
    const currentConversationId = scopeKeyRef.current;

    if (
      !currentConversationId ||
      operationRef.current ||
      !currentConnection?.pageInfo.hasNextPage ||
      !currentConnection.pageInfo.endCursor
    ) {
      return;
    }

    const operation: InstagramConversationOperation = {
      scopeKey: currentConversationId,
      abortController: new AbortController(),
    };
    operationRef.current = operation;
    setLoadingMore(true);
    setError(null);

    try {
      const nextPage = await queryMessages(
        {
          conversationId: currentConversationId,
          first: MESSAGE_LIMIT,
          after: currentConnection.pageInfo.endCursor,
        },
        operation.abortController,
      );
      if (
        operationRef.current !== operation ||
        scopeKeyRef.current !== operation.scopeKey ||
        connectionRef.current !== currentConnection
      ) {
        return;
      }
      publishConnection({
        ...nextPage,
        edges: mergeChronologically(currentConnection.edges, nextPage.edges),
      });
    } catch (reason: unknown) {
      if (operationRef.current !== operation) return;
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not load older Instagram messages.',
      );
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        setLoadingMore(false);
        if (
          operation.refreshRequested &&
          scopeKeyRef.current === operation.scopeKey
        ) {
          void startInitialRead();
        }
      }
    }
  }, [publishConnection, queryMessages, startInitialRead]);

  const messages = useMemo(
    () =>
      connection?.edges.map(({ node }) =>
        toInstagramConversationMessage(node),
      ) ?? [],
    [connection],
  );

  return {
    messages,
    loading,
    error,
    refetch: startInitialRead,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
    loadingMore,
    loadMore,
  };
};
