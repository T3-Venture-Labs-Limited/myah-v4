import { useMutation } from '@apollo/client/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SEND_INSTAGRAM_MESSAGE } from '@/myah/inbox/graphql/operations';
import { type MyahInboxInstagramDraft } from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import {
  pollInstagramMessageSendStatus,
  type InstagramMessageSendResult,
} from '@/myah/inbox/utils/pollInstagramMessageSendStatus';

const UNKNOWN_SEND_ERROR =
  "We couldn't confirm whether the Instagram message was sent. Check the conversation before trying again.";
export type MyahInboxInstagramSendResult = InstagramMessageSendResult;

type UseMyahInboxInstagramSendParams = {
  draft: Pick<
    MyahInboxInstagramDraft,
    'draftId' | 'revision' | 'executionLocked' | 'flush'
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
}: UseMyahInboxInstagramSendParams) => {
  const apolloCoreClient = useApolloCoreClient();
  const [sendInstagramMessage] = useMutation<
    SendMutationData,
    SendMutationVariables
  >(SEND_INSTAGRAM_MESSAGE, { client: apolloCoreClient });
  const [sending, setSending] = useState(false);
  const [lockedUnknown, setLockedUnknown] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  // Restricts async state publication to the currently mounted draft target.
  // oxlint-disable-next-line twenty/no-state-useref
  const activeDraftIdRef = useRef(draft.draftId);

  activeDraftIdRef.current = draft.draftId;

  useEffect(() => {
    const draftId = draft.draftId;
    const lock = draftId ? locksByDraftId.get(draftId) : undefined;
    const attempt = draftId ? attemptsByDraftId.get(draftId) : undefined;

    setSending(Boolean(attempt));
    setLockedUnknown(draft.executionLocked || lock?.state === 'UNKNOWN');
    setIsBlocked(lock?.state === 'BLOCKED');
    setBlockedUntil(lock?.state === 'BLOCKED' ? lock.nextEligibleAt : null);

    void attempt?.promise?.finally(() => {
      if (activeDraftIdRef.current === draftId) {
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

    return () => {
      const outgoingAttempt = draftId
        ? attemptsByDraftId.get(draftId)
        : undefined;

      if (outgoingAttempt && !outgoingAttempt.providerDispatched) {
        outgoingAttempt.cancelled = true;
      }
    };
  }, [draft.draftId, draft.executionLocked]);

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

  const send = useCallback((): Promise<MyahInboxInstagramSendResult> => {
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
    const execute = async (): Promise<MyahInboxInstagramSendResult> => {
      const saveResult = await draft.flush();

      if (attempt.cancelled) {
        return cancelledResult();
      }
      if (saveResult.status !== 'saved') {
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

      const result = await pollInstagramMessageSendStatus(
        apolloCoreClient,
        initialResult.receiptId,
      );
      if (result.status === 'UNKNOWN') publishUnknownLock(draftId);
      else if (result.status === 'BLOCKED')
        publishBlockedLock(draftId, result.nextEligibleAt);
      else locksByDraftId.delete(draftId);
      return result;
    };

    setSending(true);
    const promise = execute().finally(() => {
      attemptsByDraftId.delete(draftId);
      if (activeDraftIdRef.current === draftId) {
        setSending(false);
      }
    });

    attempt.promise = promise;
    attemptsByDraftId.set(draftId, attempt);

    return promise;
  }, [
    apolloCoreClient,
    draft,
    publishBlockedLock,
    publishUnknownLock,
    sendInstagramMessage,
    unknownResult,
  ]);

  return { send, sending, lockedUnknown, isBlocked, blockedUntil };
};
