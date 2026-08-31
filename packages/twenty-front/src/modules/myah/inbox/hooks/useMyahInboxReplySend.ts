import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback, useEffect, useRef } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  MyahInboxReplySendOutcome,
  MyahInboxReplySendReadinessDocument,
  MyahInboxReplySendStatusDocument,
  SendMyahInboxReplyDocument,
  type SendMyahInboxReplyInput,
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
  threadId: string,
  confirmedRevision: number,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const {
    data: readinessData,
    loading: readinessLoading,
    refetch: refetchReadiness,
  } = useQuery(MyahInboxReplySendReadinessDocument, {
    client: apolloCoreClient,
    variables: { threadId },
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
  const readinessKeyRef = useRef({ threadId, confirmedRevision });

  useEffect(() => {
    const activePollingOperations = activePollingOperationsRef.current;

    return () => {
      activePollingOperations.forEach(cancelPollingOperation);
      activePollingOperations.clear();
    };
  }, []);

  useEffect(() => {
    const previousReadinessKey = readinessKeyRef.current;

    readinessKeyRef.current = { threadId, confirmedRevision };
    if (
      previousReadinessKey.threadId === threadId &&
      previousReadinessKey.confirmedRevision !== confirmedRevision
    ) {
      void refetchReadiness();
    }
  }, [confirmedRevision, refetchReadiness, threadId]);

  const send = useCallback(
    async ({
      threadId: draftThreadId,
      expectedDraftRevision,
    }: SendMyahInboxReplyInput): Promise<MyahInboxReplySendResult> => {
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
              threadId: draftThreadId,
              expectedDraftRevision,
            },
          },
        });
        const directResult = response.data?.sendMyahInboxReply;

        if (!directResult) {
          return lastResult;
        }

        lastResult = toSafeResult(directResult);

        if (operation.cancelled) {
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
          if (!(await waitForNextPoll(operation)) || operation.cancelled) {
            return lastResult;
          }

          try {
            const response = await apolloCoreClient.query({
              query: MyahInboxReplySendStatusDocument,
              variables: {
                input: {
                  threadId: draftThreadId,
                  receiptId: initialReceiptId,
                },
              },
              fetchPolicy: 'network-only',
            });

            if (operation.cancelled) {
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
            if (operation.cancelled) {
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
    [apolloCoreClient, sendMyahInboxReply],
  );

  return {
    readiness: readinessData?.myahInboxReplySendReadiness ?? null,
    readinessLoading,
    send,
    sending,
  };
};
