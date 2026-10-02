import { useMutation } from '@apollo/client/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { v4 } from 'uuid';

import {
  GET_INSTAGRAM_MESSAGE_SEND_STATUS,
  SEND_INSTAGRAM_MESSAGE,
} from '@/myah/inbox/graphql/operations';
import { type MyahInboxInstagramDraft } from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import {
  pollInstagramMessageSendStatus,
  type InstagramMessageSendResult,
} from '@/myah/inbox/utils/pollInstagramMessageSendStatus';

const UNKNOWN_SEND_ERROR =
  "We couldn't confirm whether the Instagram message was sent. Check the conversation before trying again.";
export type MyahInboxInstagramSendResult = InstagramMessageSendResult;

export type PendingInstagramMessage = {
  localId: string;
  text: string;
  createdAt: string;
  receiptId: string | null;
  providerMessageId: string | null;
  accepted: boolean;
};

type UseMyahInboxInstagramSendParams = {
  conversationId: string;
  draft: Pick<
    MyahInboxInstagramDraft,
    'draftId' | 'revision' | 'executionLocked' | 'flush' | 'resetAfterSend'
  >;
};

type InstagramSendResponse = {
  status: string;
  receiptId: string | null;
  code: string | null;
  nextEligibleAt: string | null;
};

type SendMutationData = {
  sendInstagramMessage: InstagramSendResponse;
};

type SendMutationVariables = {
  input: { draftId: string; expectedRevision: number };
};

type SendAttempt = {
  draftId: string;
  cancelled: boolean;
  providerDispatched: boolean;
  promise?: Promise<MyahInboxInstagramSendResult>;
};

type SendLock =
  | { state: 'IN_FLIGHT' }
  | { state: 'UNKNOWN' }
  | { state: 'BLOCKED'; nextEligibleAt: string | null };

const attemptsByDraftId = new Map<string, SendAttempt>();
const locksByDraftId = new Map<string, SendLock>();
const pendingByConversationId = new Map<string, PendingInstagramMessage[]>();
const pendingListeners = new Map<string, Set<() => void>>();
const noPending: PendingInstagramMessage[] = [];

const updatePending = (
  conversationId: string,
  update: (entries: PendingInstagramMessage[]) => PendingInstagramMessage[],
) => {
  const entries = update(
    pendingByConversationId.get(conversationId) ?? noPending,
  );
  if (entries.length) pendingByConversationId.set(conversationId, entries);
  else pendingByConversationId.delete(conversationId);
  pendingListeners.get(conversationId)?.forEach((listener) => listener());
};

const toResult = (
  response: InstagramSendResponse,
): MyahInboxInstagramSendResult => ({
  status: response.status,
  receiptId: response.receiptId,
  code: response.code,
  nextEligibleAt: response.nextEligibleAt,
  error: response.status === 'BLOCKED' ? response.code : null,
});

const cancelledResult = (): MyahInboxInstagramSendResult => ({
  status: 'CANCELLED',
  receiptId: null,
  code: null,
  nextEligibleAt: null,
  error: null,
});

const blockedResult = (
  nextEligibleAt: string | null,
): MyahInboxInstagramSendResult => ({
  status: 'BLOCKED',
  receiptId: null,
  code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
  nextEligibleAt,
  error: 'INSTAGRAM_ACTION_LIMIT_REACHED',
});

export const useMyahInboxInstagramSend = ({
  draft,
  conversationId,
}: UseMyahInboxInstagramSendParams) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      const listeners = pendingListeners.get(conversationId) ?? new Set();
      listeners.add(listener);
      pendingListeners.set(conversationId, listeners);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) pendingListeners.delete(conversationId);
      };
    },
    [conversationId],
  );
  const getPending = useCallback(
    () => pendingByConversationId.get(conversationId) ?? noPending,
    [conversationId],
  );
  const pendingMessages = useSyncExternalStore(
    subscribe,
    getPending,
    () => noPending,
  );
  const dismissPending = useCallback(
    (localId: string) =>
      updatePending(conversationId, (entries) =>
        entries.filter((entry) => entry.localId !== localId),
      ),
    [conversationId],
  );
  const apolloCoreClient = useApolloCoreClient();
  const [sendInstagramMessage] = useMutation<
    SendMutationData,
    SendMutationVariables
  >(SEND_INSTAGRAM_MESSAGE, { client: apolloCoreClient });
  const refreshPendingProviderIds = useCallback(async () => {
    for (const pending of getPending()) {
      if (!pending.accepted || pending.providerMessageId || !pending.receiptId)
        continue;
      try {
        const response = await apolloCoreClient.query<{
          instagramMessageSendStatus: {
            providerMessageId: string | null;
          };
        }>({
          query: GET_INSTAGRAM_MESSAGE_SEND_STATUS,
          variables: { input: { receiptId: pending.receiptId } },
          fetchPolicy: 'network-only',
        });
        const providerMessageId =
          response.data?.instagramMessageSendStatus?.providerMessageId;
        if (providerMessageId)
          updatePending(conversationId, (entries) =>
            entries.map((entry) =>
              entry.localId === pending.localId &&
              entry.receiptId === pending.receiptId
                ? { ...entry, providerMessageId }
                : entry,
            ),
          );
      } catch {
        // Keep the accepted bubble while a status read is unavailable.
      }
    }
    return getPending().every(
      (pending) => !pending.accepted || Boolean(pending.providerMessageId),
    );
  }, [apolloCoreClient, conversationId, getPending]);
  const [sending, setSending] = useState(false);
  const [lockedUnknown, setLockedUnknown] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  // Restricts async state publication to the currently mounted draft target.
  // oxlint-disable-next-line twenty/no-state-useref
  const activeDraftIdRef = useRef(draft.draftId);
  // Only a remounted panel must clear its own draft when an older send finishes.
  // oxlint-disable-next-line twenty/no-state-useref
  const ownedAttemptRef = useRef<SendAttempt | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const joinedAttemptRef = useRef<SendAttempt | null>(null);
  const resetAfterSend = draft.resetAfterSend;

  activeDraftIdRef.current = draft.draftId;

  useEffect(() => {
    let isActive = true;
    const draftId = draft.draftId;
    const lock = draftId ? locksByDraftId.get(draftId) : undefined;
    const attempt = draftId ? attemptsByDraftId.get(draftId) : undefined;

    setSending(Boolean(attempt));
    setLockedUnknown(draft.executionLocked || lock?.state === 'UNKNOWN');
    setIsBlocked(lock?.state === 'BLOCKED');
    setBlockedUntil(lock?.state === 'BLOCKED' ? lock.nextEligibleAt : null);

    void attempt?.promise?.finally(() => {
      if (isActive && activeDraftIdRef.current === draftId) {
        setSending(false);
        const currentLock = draftId ? locksByDraftId.get(draftId) : undefined;
        setLockedUnknown(
          draft.executionLocked || currentLock?.state === 'UNKNOWN',
        );
        setIsBlocked(currentLock?.state === 'BLOCKED');
        setBlockedUntil(
          currentLock?.state === 'BLOCKED' ? currentLock.nextEligibleAt : null,
        );
      }
    });
    if (
      attempt?.promise &&
      attempt !== ownedAttemptRef.current &&
      attempt !== joinedAttemptRef.current
    ) {
      joinedAttemptRef.current = attempt;
      void attempt.promise.then((result) => {
        if (
          isActive &&
          activeDraftIdRef.current === draftId &&
          (result.status === 'SENT' || result.status === 'PROVIDER_ACCEPTED')
        ) {
          resetAfterSend();
          setLockedUnknown(false);
        }
      });
    }

    return () => {
      isActive = false;
      if (joinedAttemptRef.current === attempt) joinedAttemptRef.current = null;
      const outgoingAttempt = draftId
        ? attemptsByDraftId.get(draftId)
        : undefined;

      if (outgoingAttempt && !outgoingAttempt.providerDispatched) {
        outgoingAttempt.cancelled = true;
      }
    };
  }, [draft.draftId, draft.executionLocked, resetAfterSend]);

  useEffect(() => {
    const draftId = draft.draftId;

    if (!draftId || !isBlocked || !blockedUntil) {
      return;
    }

    const delay = Date.parse(blockedUntil) - Date.now();

    if (delay <= 0) {
      locksByDraftId.delete(draftId);
      setIsBlocked(false);
      setBlockedUntil(null);
      return;
    }

    const blockedTimer = setTimeout(() => {
      locksByDraftId.delete(draftId);
      if (activeDraftIdRef.current === draftId) {
        setIsBlocked(false);
        setBlockedUntil(null);
      }
    }, delay);

    return () => clearTimeout(blockedTimer);
  }, [blockedUntil, draft.draftId, isBlocked]);

  const publishUnknownLock = useCallback((draftId: string) => {
    locksByDraftId.set(draftId, { state: 'UNKNOWN' });
    if (activeDraftIdRef.current === draftId) {
      setLockedUnknown(true);
    }
  }, []);

  const publishBlockedLock = useCallback(
    (draftId: string, nextEligibleAt: string | null) => {
      locksByDraftId.set(draftId, { state: 'BLOCKED', nextEligibleAt });
      if (activeDraftIdRef.current === draftId) {
        setIsBlocked(true);
        setBlockedUntil(nextEligibleAt);
      }
    },
    [],
  );

  const unknownResult = useCallback(
    (receiptId: string | null): MyahInboxInstagramSendResult => ({
      status: 'UNKNOWN',
      receiptId,
      code: null,
      nextEligibleAt: null,
      error: UNKNOWN_SEND_ERROR,
    }),
    [],
  );

  const send = useCallback(
    (text = ''): Promise<MyahInboxInstagramSendResult> => {
      const draftId = draft.draftId;

      if (!draftId) {
        return Promise.resolve({
          status: 'DRAFT_NOT_SAVED',
          receiptId: null,
          code: null,
          nextEligibleAt: null,
          error: 'Save the Instagram draft before sending.',
        });
      }

      const existingAttempt = attemptsByDraftId.get(draftId);

      if (existingAttempt?.promise) {
        return existingAttempt.promise;
      }

      if (draft.executionLocked) {
        return Promise.resolve(unknownResult(null));
      }

      const lock = locksByDraftId.get(draftId);

      if (lock?.state === 'UNKNOWN' || lock?.state === 'IN_FLIGHT') {
        return Promise.resolve(unknownResult(null));
      }
      if (lock?.state === 'BLOCKED') {
        return Promise.resolve(blockedResult(lock.nextEligibleAt));
      }

      const attempt: SendAttempt = {
        draftId,
        cancelled: false,
        providerDispatched: false,
      };
      const localId = v4();
      if (text.trim())
        updatePending(conversationId, (entries) => [
          ...entries,
          {
            localId,
            text: text.trim(),
            createdAt: new Date().toISOString(),
            receiptId: null,
            providerMessageId: null,
            accepted: false,
          },
        ]);
      const execute = async (): Promise<MyahInboxInstagramSendResult> => {
        const saveResult = await draft.flush().catch(() => null);

        if (attempt.cancelled) {
          return cancelledResult();
        }
        if (saveResult?.status !== 'saved') {
          return {
            status: 'DRAFT_NOT_SAVED',
            receiptId: null,
            code: null,
            nextEligibleAt: null,
            error: 'Save the Instagram draft before sending.',
          };
        }

        let initialResult: MyahInboxInstagramSendResult;

        try {
          attempt.providerDispatched = true;
          locksByDraftId.set(draftId, { state: 'IN_FLIGHT' });
          const response = await sendInstagramMessage({
            variables: {
              input: { draftId, expectedRevision: saveResult.revision },
            },
          });
          const directResult = response.data?.sendInstagramMessage;

          if (!directResult) {
            publishUnknownLock(draftId);
            return unknownResult(null);
          }

          initialResult = toResult(directResult);
        } catch {
          publishUnknownLock(draftId);
          return unknownResult(null);
        }

        if (initialResult.status === 'UNKNOWN') {
          publishUnknownLock(draftId);
          return { ...initialResult, error: UNKNOWN_SEND_ERROR };
        }
        if (initialResult.status === 'BLOCKED') {
          publishBlockedLock(draftId, initialResult.nextEligibleAt);
          return initialResult;
        }
        if (
          initialResult.status !== 'SENT' &&
          initialResult.status !== 'PENDING' &&
          initialResult.status !== 'PROVIDER_ACCEPTED'
        ) {
          locksByDraftId.delete(draftId);
          return initialResult;
        }
        if (!initialResult.receiptId) {
          publishUnknownLock(draftId);
          return unknownResult(null);
        }

        updatePending(conversationId, (entries) =>
          entries.map((entry) =>
            entry.localId === localId
              ? { ...entry, receiptId: initialResult.receiptId }
              : entry,
          ),
        );
        const result = await pollInstagramMessageSendStatus(
          apolloCoreClient,
          initialResult.receiptId,
          () => true,
          ['SENT', 'PROVIDER_ACCEPTED'].includes(initialResult.status),
        );
        if (result.status === 'UNKNOWN') publishUnknownLock(draftId);
        else if (result.status === 'BLOCKED')
          publishBlockedLock(draftId, result.nextEligibleAt);
        else locksByDraftId.delete(draftId);
        return result;
      };

      setSending(true);
      const promise = execute()
        .then((result) => {
          if (['SENT', 'PROVIDER_ACCEPTED'].includes(result.status)) {
            updatePending(conversationId, (entries) =>
              entries.map((entry) =>
                entry.localId === localId
                  ? {
                      ...entry,
                      accepted: true,
                      receiptId: result.receiptId,
                      providerMessageId: result.providerMessageId ?? null,
                    }
                  : entry,
              ),
            );
          } else dismissPending(localId);
          return result;
        })
        .finally(() => {
          attemptsByDraftId.delete(draftId);
          if (activeDraftIdRef.current === draftId) {
            setSending(false);
          }
        });

      attempt.promise = promise;
      ownedAttemptRef.current = attempt;
      attemptsByDraftId.set(draftId, attempt);

      return promise;
    },
    [
      apolloCoreClient,
      conversationId,
      dismissPending,
      draft,
      publishBlockedLock,
      publishUnknownLock,
      sendInstagramMessage,
      unknownResult,
    ],
  );

  return {
    send,
    sending,
    lockedUnknown,
    isBlocked,
    blockedUntil,
    pendingMessages,
    dismissPending,
    refreshPendingProviderIds,
  };
};
