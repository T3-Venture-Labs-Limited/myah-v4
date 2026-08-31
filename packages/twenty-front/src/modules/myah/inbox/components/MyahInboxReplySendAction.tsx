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
  entry: MyahInboxDraftAutosaveEntry;
  onDraftReconciled: (thread: MyahInboxDraftAutosaveThread) => void;
  onSendingChange: (sending: boolean) => void;
};

export const MyahInboxReplySendAction = ({
  draftKey,
  entry,
  onDraftReconciled,
  onSendingChange,
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
  );
  const [isSending, setIsSending] = useState(false);
  const [isUnknown, setIsUnknown] = useState(false);

  const canSend =
    !isSending &&
    !sending &&
    !isUnknown &&
    !readinessLoading &&
    readiness?.status === MyahInboxReplySendReadinessStatus.READY &&
    !entry.dirty &&
    entry.status !== 'saving' &&
    entry.status !== 'error' &&
    entry.status !== 'conflict' &&
    Boolean(entry.confirmedBody?.markdown.trim());

  const handleOutcome = (result: MyahInboxReplySendResult) => {
    switch (result.outcome) {
      case MyahInboxReplySendOutcome.SENT:
        enqueueSuccessSnackBar({ message: t`Email sent` });
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
    if (!canSend) {
      return;
    }

    setIsSending(true);
    onSendingChange(true);

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
      onDraftReconciled({
        key: draftKey,
        revision: result.revision,
        body: result.body ?? null,
      });
      handleOutcome(result);
    } finally {
      setIsSending(false);
      onSendingChange(false);
    }
  };

  return (
    <>
      <Button
        title="Send"
        variant="primary"
        size="small"
        disabled={!canSend}
        onClick={handleSend}
      />
      {isUnknown && (
        <span role="alert">
          {t`Delivery outcome is unknown. This draft is locked to prevent a duplicate send.`}
        </span>
      )}
    </>
  );
};
