import {
  myahInboxDraftKeyId,
  type MyahInboxDraftAutosaveKey,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useStore } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback, useEffect, useRef } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  MyahInboxReplySendOutcome,
  MyahInboxReplySendReadinessDocument,
  MyahInboxReplySendStatusDocument,
  SendMyahInboxReplyDocument,
  type MyahInboxReplyDraftInput,
} from '~/generated/graphql';

const POLL_INTERVAL_MS = 1_000;
const MAX_STATUS_POLL_ATTEMPTS = 15;
const UNKNOWN_SEND_ERROR =
  "We couldn't confirm whether the reply was sent. Check the thread before trying again.";

type MyahInboxReplyBody = {
  markdown: string;
  blocknote: string | null;
};

type MyahInboxReplySendResponse = {
  outcome: MyahInboxReplySendOutcome;
  receiptId?: string | null;
  revision: number;
  body?: {
    markdown: string;
    blocknote?: string | null;
  } | null;
};

type PollingOperation = {
  cancelled: boolean;
  resolver: ((shouldPoll: boolean) => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
};

export type MyahInboxReplySendResult = {
  outcome: MyahInboxReplySendOutcome;
  receiptId: string | null;
  revision: number;
  body: MyahInboxReplyBody | null;
  error: string | null;
};

const toSafeResult = (
  result: MyahInboxReplySendResponse,
  receiptId = result.receiptId ?? null,
): MyahInboxReplySendResult => ({
  outcome: result.outcome,
  receiptId,
  revision: result.revision,
  body: result.body
    ? {
        markdown: result.body.markdown,
        blocknote: result.body.blocknote ?? null,
      }
    : null,
  error: null,
});

const cancelPollingOperation = (operation: PollingOperation) => {
  operation.cancelled = true;

  if (operation.timer !== null) {
    clearTimeout(operation.timer);
    operation.timer = null;
  }

  operation.resolver?.(false);
  operation.resolver = null;
};

const waitForNextPoll = (operation: PollingOperation) => {
  if (operation.cancelled) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    operation.resolver = resolve;
    operation.timer = setTimeout(() => {
      operation.timer = null;
      operation.resolver = null;
      resolve(!operation.cancelled);
    }, POLL_INTERVAL_MS);
  });
};

export const useMyahInboxReplySend = (
  key: MyahInboxDraftAutosaveKey,
  input: MyahInboxReplyDraftInput | undefined,
  confirmedRevision: number,
) => {
  const { workspaceId } = key;
  const identity = myahInboxDraftKeyId(key);
  const store = useStore();
  const apolloCoreClient = useApolloCoreClient();
  const {
    data: readinessData,
    loading: readinessLoading,
    refetch: refetchReadiness,
  } = useQuery(MyahInboxReplySendReadinessDocument, {
    client: apolloCoreClient,
    fetchPolicy: 'network-only',
    variables: { input: input! },
    skip: !input,
  });
  const [sendMyahInboxReply, { loading: sending }] = useMutation(
    SendMyahInboxReplyDocument,
    { client: apolloCoreClient },
  );
  // oxlint-disable-next-line twenty/no-state-useref
  const activePollingOperationsRef = useRef(
    new Map<number, PollingOperation>(),
  );
  // oxlint-disable-next-line twenty/no-state-useref
  const nextPollingOperationTokenRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const readinessKeyRef = useRef({ identity, confirmedRevision });
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(identity);
  scopeRef.current = identity;

  useEffect(() => {
    const activePollingOperations = activePollingOperationsRef.current;

    return () => {
      activePollingOperations.forEach(cancelPollingOperation);
      activePollingOperations.clear();
    };
  }, [identity]);

  useEffect(() => {
    const previousReadinessKey = readinessKeyRef.current;

    readinessKeyRef.current = { identity, confirmedRevision };
    if (
      previousReadinessKey.identity === identity &&
      previousReadinessKey.confirmedRevision !== confirmedRevision
    ) {
      void refetchReadiness();
    }
  }, [confirmedRevision, refetchReadiness, identity]);

  const send = useCallback(
    async ({
      expectedDraftRevision,
    }: {
      expectedDraftRevision: number;
    }): Promise<MyahInboxReplySendResult> => {
      if (
        store.get(currentWorkspaceState.atom)?.id !== workspaceId ||
        !input ||
        scopeRef.current !== identity
      ) {
        throw new Error('Inbox send target changed');
      }
      const isScopeCurrent = () =>
        store.get(currentWorkspaceState.atom)?.id === workspaceId &&
        scopeRef.current === identity;
      const token = nextPollingOperationTokenRef.current++;
      const operation: PollingOperation = {
        cancelled: false,
        resolver: null,
        timer: null,
      };
      const activePollingOperations = activePollingOperationsRef.current;
      activePollingOperations.set(token, operation);
      let lastResult: MyahInboxReplySendResult = {
        outcome: MyahInboxReplySendOutcome.UNKNOWN,
        receiptId: null,
        revision: expectedDraftRevision,
        body: null,
        error: UNKNOWN_SEND_ERROR,
      };

      try {
        const response = await sendMyahInboxReply({
          variables: {
            input: {
              ...input,
              expectedDraftRevision,
            },
          },
        });
        const directResult = response.data?.sendMyahInboxReply;

        if (!directResult) {
          return lastResult;
        }

        lastResult = toSafeResult(directResult);

        if (operation.cancelled || !isScopeCurrent()) {
          return lastResult;
        }

        if (lastResult.outcome !== MyahInboxReplySendOutcome.SENDING) {
          return lastResult;
        }

        const initialReceiptId = lastResult.receiptId;

        if (!initialReceiptId) {
          return {
            ...lastResult,
            outcome: MyahInboxReplySendOutcome.UNKNOWN,
            error: UNKNOWN_SEND_ERROR,
          };
        }

        for (let attempt = 0; attempt < MAX_STATUS_POLL_ATTEMPTS; attempt++) {
          if (
            !(await waitForNextPoll(operation)) ||
            operation.cancelled ||
            !isScopeCurrent()
          ) {
            return lastResult;
          }

          try {
            const response = await apolloCoreClient.query({
              query: MyahInboxReplySendStatusDocument,
              variables: {
                input: {
                  ...input,
                  receiptId: initialReceiptId,
                },
              },
              fetchPolicy: 'network-only',
            });

            if (operation.cancelled || !isScopeCurrent()) {
              return lastResult;
            }

            const statusResult = response.data?.myahInboxReplySendStatus;

            if (!statusResult) {
              return {
                ...lastResult,
                outcome: MyahInboxReplySendOutcome.UNKNOWN,
                error: UNKNOWN_SEND_ERROR,
              };
            }

            lastResult = toSafeResult(statusResult, initialReceiptId);

            if (lastResult.outcome !== MyahInboxReplySendOutcome.SENDING) {
              return lastResult;
            }
          } catch {
            if (operation.cancelled || !isScopeCurrent()) {
              return lastResult;
            }

            return {
              ...lastResult,
              outcome: MyahInboxReplySendOutcome.UNKNOWN,
              error: UNKNOWN_SEND_ERROR,
            };
          }
        }

        return lastResult;
      } catch {
        return {
          ...lastResult,
          outcome: MyahInboxReplySendOutcome.UNKNOWN,
          error: UNKNOWN_SEND_ERROR,
        };
      } finally {
        cancelPollingOperation(operation);
        activePollingOperations.delete(token);
      }
    },
    [apolloCoreClient, sendMyahInboxReply, store, identity, input, workspaceId],
  );

  return {
    readiness:
      readinessLoading || !input
        ? null
        : (readinessData?.myahInboxReplySendReadiness ?? null),
    readinessLoading,
    send,
    sending,
  };
};
