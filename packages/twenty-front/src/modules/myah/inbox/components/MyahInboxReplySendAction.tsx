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

import { useEffect, useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';

export type MyahInboxReplySendActionProps = {
  draftKey: MyahInboxDraftAutosaveKey;
  editorOwner?: symbol;
  disabled?: boolean;
  label?: string;
  entry: MyahInboxDraftAutosaveEntry;
  onDraftReconciled?: (thread: MyahInboxDraftAutosaveThread) => void;
  onSendingChange?: (sending: boolean) => void;
  onSent?: () => void | Promise<void>;
};

export const MyahInboxReplySendAction = ({
  draftKey,
  editorOwner,
  disabled = false,
  label,
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
    draftKey.workspaceId,
    draftKey.threadId,
    entry.confirmedRevision,
  );
  // oxlint-disable-next-line twenty/no-state-useref
  const mountedRef = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(draftKey);
  scopeRef.current = draftKey;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [draftKey.workspaceId, draftKey.threadId]);
  const [isSending, setIsSending] = useState(false);
  const [localIsUnknown, setIsUnknown] = useState(false);
  const [localIsPending, setIsPending] = useState(false);

  const isUnknown = localIsUnknown || entry.operation?.kind === 'unknown';
  const isPending = localIsPending || entry.operation?.kind === 'pending';
  useEffect(() => {
    if (readinessLoading) return;
    if (readiness?.status === MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN)
      autosaveController.setReadinessLock(draftKey, 'unknown');
    if (readiness?.status === MyahInboxReplySendReadinessStatus.OUTCOME_PENDING)
      autosaveController.setReadinessLock(draftKey, 'pending');
  }, [autosaveController, draftKey, readiness, readinessLoading]);

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
  const canAttemptSend =
    !disabled &&
    !entry.operation &&
    autosaveController.isTargetAuthorized(draftKey) &&
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

    const capture = autosaveController.acquire(
      draftKey,
      'sending',
      editorOwner,
    );
    if (!capture) return;
    const isCurrent = () =>
      mountedRef.current &&
      scopeRef.current.workspaceId === capture.key.workspaceId &&
      scopeRef.current.threadId === capture.key.threadId &&
      autosaveController.isOperationCurrent(capture);
    setIsSending(true);
    onSendingChange?.(true);

    let keepSharedDraftLocked = false;

    try {
      const flushed = await autosaveController.flush(capture.key);

      if (
        !isCurrent() ||
        flushed.dirty ||
        flushed.status === 'saving' ||
        flushed.status === 'error' ||
        flushed.status === 'conflict' ||
        !flushed.confirmedBody?.markdown.trim()
      ) {
        return;
      }

      const result = await send({
        expectedWorkspaceId: capture.key.workspaceId,
        threadId: capture.key.threadId,
        expectedDraftRevision: flushed.confirmedRevision,
      });
      if (
        result.body !== null ||
        result.outcome === MyahInboxReplySendOutcome.SENT
      ) {
        autosaveController.reconcileOperation(capture, {
          key: capture.key,
          revision: result.revision,
          body: result.body,
        });
      }
      const remainsPending =
        result.outcome === MyahInboxReplySendOutcome.SENDING;
      if (remainsPending) autosaveController.setOutcomeLock(capture, 'pending');
      if (result.outcome === MyahInboxReplySendOutcome.UNKNOWN)
        autosaveController.setOutcomeLock(capture, 'unknown');
      if (!isCurrent()) return;
      setIsPending(remainsPending);
      if (
        result.body !== null ||
        result.outcome === MyahInboxReplySendOutcome.SENT
      )
        onDraftReconciled?.({
          key: capture.key,
          revision: result.revision,
          body: result.body,
        });
      keepSharedDraftLocked =
        remainsPending || result.outcome === MyahInboxReplySendOutcome.UNKNOWN;
      handleOutcome(result);
    } catch {
      autosaveController.setOutcomeLock(capture, 'unknown');
      keepSharedDraftLocked = true;
      if (isCurrent()) setIsUnknown(true);
    } finally {
      if (isCurrent()) {
        setIsSending(false);
        if (!keepSharedDraftLocked) onSendingChange?.(false);
      }
      autosaveController.release(capture);
    }
  };

  return (
    <Button
      title={label ?? t`Send`}
      variant="primary"
      accent="brand"
      size="small"
      disabled={!canAttemptSend}
      onClick={handleSend}
    />
  );
};
