import { useCallback, useEffect, useRef, useState } from 'react';

import { GET_MYAH_INBOX_THREADS } from '@/myah/inbox/graphql/operations';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

type SelectedEmailThreadQuery = {
  myahInboxThreads: {
    edges: Array<{ node: MyahInboxThread }>;
  };
};

export const useMyahInboxSelectedEmailThread = (
  workspaceId: string | null,
  threadId: string | null,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const scopeKey = `${workspaceId ?? ''}:${threadId ?? ''}`;
  // Guards cacheless request completion across exact target changes.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeKeyRef = useRef(scopeKey);
  // Keeps the callback stable if Apollo republishes an equivalent client.
  // oxlint-disable-next-line twenty/no-state-useref
  const apolloCoreClientRef = useRef(apolloCoreClient);
  const [thread, setThread] = useState<MyahInboxThread | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId && threadId));
  const [error, setError] = useState<Error | null>(null);

  scopeKeyRef.current = scopeKey;
  apolloCoreClientRef.current = apolloCoreClient;

  const load = useCallback(
    async (abortController?: AbortController) => {
      if (!workspaceId || !threadId) {
        setThread(null);
        setLoading(false);
        setError(null);

        return null;
      }

      const requestScopeKey = `${workspaceId}:${threadId}`;

      setLoading(true);
      setError(null);

      try {
        const { data } =
          await apolloCoreClientRef.current.query<SelectedEmailThreadQuery>({
            query: GET_MYAH_INBOX_THREADS,
            variables: { first: 1, threadId },
            fetchPolicy: 'no-cache',
            context: {
              queryDeduplication: false,
              fetchOptions: { signal: abortController?.signal },
            },
          });
        const nextThread = data?.myahInboxThreads.edges[0]?.node ?? null;

        if (scopeKeyRef.current !== requestScopeKey) {
          return null;
        }

        setThread(nextThread);

        return nextThread;
      } catch (reason) {
        if (scopeKeyRef.current !== requestScopeKey) {
          return null;
        }

        setThread(null);
        setError(
          reason instanceof Error
            ? reason
            : new Error('Could not load the selected Email thread.'),
        );

        return null;
      } finally {
        if (scopeKeyRef.current === requestScopeKey) {
          setLoading(false);
        }
      }
    },
    [threadId, workspaceId],
  );

  useEffect(() => {
    const abortController = new AbortController();

    setThread(null);
    void load(abortController);

    return () => abortController.abort();
  }, [load]);

  return {
    thread,
    loading,
    error,
    refresh: () => load(),
  };
};
