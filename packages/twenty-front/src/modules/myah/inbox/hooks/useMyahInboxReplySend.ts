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

export type MyahInboxReplySendResult = {
  outcome: MyahInboxReplySendOutcome;
  receiptId: string | null;
  revision: number;
  body: MyahInboxReplyBody | null;
  error: string | null;
};

const toSafeResult = (
  result: MyahInboxReplySendResponse,
): MyahInboxReplySendResult => ({
  outcome: result.outcome,
  receiptId: result.receiptId ?? null,
  revision: result.revision,
  body: result.body
    ? {
        markdown: result.body.markdown,
        blocknote: result.body.blocknote ?? null,
      }
    : null,
  error: null,
});

export const useMyahInboxReplySend = (threadId: string) => {
  const apolloCoreClient = useApolloCoreClient();
  const { data: readinessData, loading: readinessLoading } = useQuery(
    MyahInboxReplySendReadinessDocument,
    {
      client: apolloCoreClient,
      variables: { threadId },
    },
  );
  const [sendMyahInboxReply, { loading: sending }] = useMutation(
    SendMyahInboxReplyDocument,
    { client: apolloCoreClient },
  );
  // oxlint-disable-next-line twenty/no-state-useref
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const pollingResolverRef = useRef<((shouldPoll: boolean) => void) | null>(
    null,
  );

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    pollingResolverRef.current?.(false);
    pollingResolverRef.current = null;
  }, []);

  const waitForNextPoll = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pollingResolverRef.current = resolve;
        pollingTimerRef.current = setTimeout(() => {
          pollingTimerRef.current = null;
          pollingResolverRef.current = null;
          resolve(true);
        }, POLL_INTERVAL_MS);
      }),
    [],
  );

  useEffect(() => stopPolling, [stopPolling]);

  const send = useCallback(
    async ({
      threadId: draftThreadId,
      expectedDraftRevision,
    }: SendMyahInboxReplyInput): Promise<MyahInboxReplySendResult> => {
      stopPolling();

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
          return {
            outcome: MyahInboxReplySendOutcome.UNKNOWN,
            receiptId: null,
            revision: expectedDraftRevision,
            body: null,
            error: UNKNOWN_SEND_ERROR,
          };
        }

        let lastResult = toSafeResult(directResult);

        if (
          lastResult.outcome !== MyahInboxReplySendOutcome.SENDING ||
          !lastResult.receiptId
        ) {
          return lastResult;
        }

        for (let attempt = 0; attempt < MAX_STATUS_POLL_ATTEMPTS; attempt++) {
          if (!(await waitForNextPoll())) {
            return lastResult;
          }

          try {
            const response = await apolloCoreClient.query({
              query: MyahInboxReplySendStatusDocument,
              variables: {
                input: {
                  threadId: draftThreadId,
                  receiptId: lastResult.receiptId,
                },
              },
              fetchPolicy: 'network-only',
            });

            const statusResult = response.data?.myahInboxReplySendStatus;

            if (!statusResult) {
              return {
                ...lastResult,
                outcome: MyahInboxReplySendOutcome.UNKNOWN,
                error: UNKNOWN_SEND_ERROR,
              };
            }

            lastResult = toSafeResult(statusResult);

            if (
              lastResult.outcome !== MyahInboxReplySendOutcome.SENDING ||
              !lastResult.receiptId
            ) {
              stopPolling();

              return lastResult;
            }
          } catch {
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
          outcome: MyahInboxReplySendOutcome.UNKNOWN,
          receiptId: null,
          revision: expectedDraftRevision,
          body: null,
          error: UNKNOWN_SEND_ERROR,
        };
      }
    },
    [apolloCoreClient, sendMyahInboxReply, stopPolling, waitForNextPoll],
  );

  return {
    readiness: readinessData?.myahInboxReplySendReadiness ?? null,
    readinessLoading,
    send,
    sending,
  };
};
