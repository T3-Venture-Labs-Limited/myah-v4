import { useMyahInboxDraftAutosaveControllerContext } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import {
  type MyahInboxReplySendResult,
  useMyahInboxReplySend,
} from '@/myah/inbox/hooks/useMyahInboxReplySend';
import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveKey,
  type MyahInboxDraftAutosaveThread,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { t } from '@lingui/core/macro';
import {
  MyahInboxReplySendOutcome,
  MyahInboxReplySendReadinessStatus,
} from '~/generated/graphql';

import { useState } from 'react';
import { Button } from 'twenty-ui/input';

export type MyahInboxReplySendActionProps = {
  draftKey: MyahInboxDraftAutosaveKey;
  disabled?: boolean;
  entry: MyahInboxDraftAutosaveEntry;
  onDraftReconciled: (thread: MyahInboxDraftAutosaveThread) => void;
  onSendingChange: (sending: boolean) => void;
  onSent?: () => void | Promise<void>;
};

const SEND_READINESS_DESCRIPTION_ID = 'myah-inbox-send-readiness';

const getReadinessMessage = (
  status: MyahInboxReplySendReadinessStatus | undefined,
  hasPendingFirstSave: boolean,
): string | null => {
  switch (status) {
    case MyahInboxReplySendReadinessStatus.READY:
    case undefined:
      return null;
    case MyahInboxReplySendReadinessStatus.RECONNECT_REQUIRED:
      return 'Reconnect the sending mailbox before sending.';
    case MyahInboxReplySendReadinessStatus.MAILBOX_INELIGIBLE:
      return 'This mailbox cannot send this reply.';
    case MyahInboxReplySendReadinessStatus.OUTCOME_PENDING:
      return 'A previous send is still being confirmed. Sending is locked.';
    case MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN:
      return 'A previous delivery outcome is unknown. Check Sent mail before taking any further action; sending is locked here.';
    case MyahInboxReplySendReadinessStatus.RECIPIENT_UNAVAILABLE:
      return 'This conversation has no readable recipient.';
    case MyahInboxReplySendReadinessStatus.SENDER_UNAVAILABLE:
      return 'No eligible sending mailbox is available.';
    case MyahInboxReplySendReadinessStatus.THREAD_UNAVAILABLE:
      return hasPendingFirstSave
        ? 'Saving the first shared draft…'
        : 'This Email conversation is unavailable.';
  }
};

export const MyahInboxReplySendAction = ({
  draftKey,
  disabled = false,
  entry,
  onDraftReconciled,
  onSendingChange,
  onSent,
}: MyahInboxReplySendActionProps) => {
  const autosaveController = useMyahInboxDraftAutosaveControllerContext();
  const apolloCoreClient = useApolloCoreClient();
  const {
    enqueueErrorSnackBar,
    enqueueInfoSnackBar,
    enqueueSuccessSnackBar,
    enqueueWarningSnackBar,
  } = useSnackBar();
  const { readiness, readinessLoading, send, sending } = useMyahInboxReplySend(
    draftKey.threadId,
    entry.confirmedRevision,
  );
  const [isSending, setIsSending] = useState(false);
  const [isUnknown, setIsUnknown] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const hasPendingFirstSave =
    (entry.dirty || entry.status === 'saving') &&
    !entry.confirmedBody?.markdown.trim();
  const hasEligibleReadiness =
    readiness?.status === MyahInboxReplySendReadinessStatus.READY ||
    (hasPendingFirstSave &&
      readiness?.status ===
        MyahInboxReplySendReadinessStatus.THREAD_UNAVAILABLE);
  const hasPersistedUnknownOutcome =
    readiness?.status === MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN;
  const readinessMessage = readinessLoading
    ? 'Checking Email send readiness…'
    : getReadinessMessage(readiness?.status, hasPendingFirstSave);
  const canAttemptSend =
    !disabled &&
    !isSending &&
    !sending &&
    !isPending &&
    !isUnknown &&
    !hasPersistedUnknownOutcome &&
    !readinessLoading &&
    hasEligibleReadiness &&
    entry.status !== 'error' &&
    entry.status !== 'conflict' &&
    Boolean(entry.localBody.markdown.trim());

  const handleOutcome = (result: MyahInboxReplySendResult) => {
    switch (result.outcome) {
      case MyahInboxReplySendOutcome.SENT:
        enqueueSuccessSnackBar({ message: t`Email sent` });
        void onSent?.();
        void apolloCoreClient
          .refetchQueries({
            include: [
              'MyahInboxThreads',
              'FindManyMessages',
              'FindManyMessageParticipants',
              'FindManyMessageChannelMessageAssociations',
            ],
          })
          .catch(() => undefined);
        return;
      case MyahInboxReplySendOutcome.STALE:
        enqueueWarningSnackBar({
          message: t`Draft changed. Review and send again.`,
        });
        return;
      case MyahInboxReplySendOutcome.FAILED:
        enqueueErrorSnackBar({
          message: t`Email was not sent. Your draft is still available.`,
        });
        return;
      case MyahInboxReplySendOutcome.SENDING:
        enqueueInfoSnackBar({
          message: t`Email accepted. Confirming delivery record…`,
        });
        return;
      case MyahInboxReplySendOutcome.UNKNOWN:
        setIsUnknown(true);
        enqueueWarningSnackBar({
          message: t`Delivery outcome is unknown. This draft is locked to prevent a duplicate send.`,
        });
        return;
    }
  };

  const handleSend = async () => {
    if (!canAttemptSend) {
      return;
    }

    setIsSending(true);
    onSendingChange(true);

    let keepSharedDraftLocked = false;

    try {
      const flushed = await autosaveController.flush(draftKey);

      if (
        flushed.dirty ||
        flushed.status === 'saving' ||
        flushed.status === 'error' ||
        flushed.status === 'conflict' ||
        !flushed.confirmedBody?.markdown.trim()
      ) {
        return;
      }

      const result = await send({
        threadId: draftKey.threadId,
        expectedDraftRevision: flushed.confirmedRevision,
      });
      if (
        result.body !== null ||
        result.outcome === MyahInboxReplySendOutcome.SENT
      ) {
        onDraftReconciled({
          key: draftKey,
          revision: result.revision,
          body: result.body,
        });
      }
      const remainsPending =
        result.outcome === MyahInboxReplySendOutcome.SENDING;
      setIsPending(remainsPending);
      keepSharedDraftLocked =
        remainsPending || result.outcome === MyahInboxReplySendOutcome.UNKNOWN;
      handleOutcome(result);
    } finally {
      setIsSending(false);
      if (!keepSharedDraftLocked) {
        onSendingChange(false);
      }
    }
  };

  return (
    <>
      <Button
        title={t`Send`}
        variant="primary"
        accent="brand"
        size="small"
        aria-describedby={
          readinessMessage || isUnknown
            ? SEND_READINESS_DESCRIPTION_ID
            : undefined
        }
        disabled={!canAttemptSend}
        onClick={handleSend}
      />
      {(readinessMessage || isUnknown) && (
        <span
          id={SEND_READINESS_DESCRIPTION_ID}
          role={isUnknown || hasPersistedUnknownOutcome ? 'alert' : 'status'}
        >
          {isUnknown
            ? t`Delivery outcome is unknown. Check Sent mail before taking any further action; sending is locked here.`
            : readinessMessage}
        </span>
      )}
    </>
  );
};
