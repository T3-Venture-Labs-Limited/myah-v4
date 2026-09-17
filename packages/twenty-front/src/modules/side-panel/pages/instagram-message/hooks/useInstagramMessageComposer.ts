import { useEffect, useRef, useState } from 'react';
import { useStore } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { v4 } from 'uuid';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { myahInboxContactSelectionState } from '@/myah/inbox/states/myahInboxSelectionState';
import { myahInboxPendingInstagramSelectionState } from '@/myah/inbox/states/myahInboxPendingInstagramSelectionState';
import {
  pollInstagramMessageSendStatus,
  unconfirmedInstagramMessageResult,
  type InstagramMessageSendResult,
} from '@/myah/inbox/utils/pollInstagramMessageSendStatus';
import { MYAH_NAVIGATION_ROUTES } from '@/myah/navigation/myah-navigation-registry';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import {
  GET_INSTAGRAM_MESSAGE_COMPOSER_ATTEMPT,
  PREPARE_INSTAGRAM_MESSAGE_COMPOSER,
  SEND_INSTAGRAM_MESSAGE_COMPOSER,
} from '@/side-panel/pages/instagram-message/graphql/operations';
import {
  instagramMessageComposerState,
  type InstagramMessageComposerState,
} from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import {
  InstagramMessageComposerAccountDocument,
  type InstagramMessageComposerAccountQuery,
  type InstagramMessageComposerPreparedDto,
  type InstagramMessageComposerAttemptDto,
  type InstagramMessageSendResultDto,
} from '~/generated/graphql';

export const useInstagramMessageComposer = () => {
  const store = useStore();
  const client = useApolloCoreClient();
  const navigate = useNavigate();
  const instanceId = useAvailableComponentInstanceIdOrThrow(
    SidePanelPageComponentInstanceContext,
  );
  const atom = instagramMessageComposerState.atomFamily({ instanceId });
  const instagramMessageComposer = useAtomComponentStateValue(
    instagramMessageComposerState,
  );
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id ?? null;
  const canFirst = useHasPermissionFlag(
    PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL,
  );
  const canReply = useHasPermissionFlag(
    PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
  );
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [accountState, setAccountState] = useState<{
    scope: string;
    account:
      | InstagramMessageComposerAccountQuery['instagramMessageComposerAccount']
      | null;
  } | null>(null);
  const [preparedState, setPreparedState] = useState<{
    scope: string;
    generation: number;
    value: InstagramMessageComposerPreparedDto;
  } | null>(null);
  const [checkingWorkspaceId, setCheckingWorkspaceId] = useState<string | null>(
    null,
  );
  const checking = checkingWorkspaceId === workspaceId && workspaceId !== null;
  const accountScope = JSON.stringify([
    workspaceId,
    canFirst,
    canReply,
    refreshGeneration,
  ]);
  const account =
    accountState?.scope === accountScope ? accountState.account : null;
  const scope = JSON.stringify([
    accountScope,
    account?.sender?.accountRecordId,
    instagramMessageComposer?.recipient,
  ]);
  // Generation invalidation is synchronous, before an old request can publish after a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const lifecycle = useRef({
    scope,
    generation: 0,
    mounted: true,
    workspaceId,
  });
  if (lifecycle.current.scope !== scope) lifecycle.current.generation += 1;
  lifecycle.current.scope = scope;
  lifecycle.current.workspaceId = workspaceId;
  useEffect(() => {
    const currentLifecycle = lifecycle.current;
    currentLifecycle.mounted = true;
    return () => {
      currentLifecycle.mounted = false;
      currentLifecycle.generation += 1;
    };
  }, []);

  useEffect(() => {
    setCheckingWorkspaceId(null);
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    if (workspaceId && (canFirst || canReply)) {
      void client
        .query({
          query: InstagramMessageComposerAccountDocument,
          fetchPolicy: 'network-only',
          context: { queryDeduplication: false },
        })
        .then(({ data }) => {
          if (active)
            setAccountState({
              scope: accountScope,
              account: data?.instagramMessageComposerAccount ?? null,
            });
        })
        .catch(() => {
          if (active) setAccountState({ scope: accountScope, account: null });
        });
    }
    return () => {
      active = false;
    };
  }, [client, accountScope, workspaceId, canFirst, canReply]);

  const refreshPreparation = () => {
    lifecycle.current.generation += 1;
    setPreparedState(null);
    setRefreshGeneration((value) => value + 1);
  };
  useEffect(() => {
    const refresh = () => {
      lifecycle.current.generation += 1;
      setPreparedState(null);
      setRefreshGeneration((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    const currentLifecycle = lifecycle.current;
    const generation = ++currentLifecycle.generation;
    if (
      !instagramMessageComposer?.recipient ||
      instagramMessageComposer.attempt ||
      account?.status !== 'READY'
    )
      return;
    const recipient = instagramMessageComposer.recipient;
    const timer = setTimeout(() => {
      void client
        .query<{
          prepareInstagramMessageComposer: InstagramMessageComposerPreparedDto;
        }>({
          query: PREPARE_INSTAGRAM_MESSAGE_COMPOSER,
          variables: { input: recipient },
          fetchPolicy: 'network-only',
          context: { queryDeduplication: false },
        })
        .then(({ data }) => {
          if (
            lifecycle.current.mounted &&
            lifecycle.current.generation === generation &&
            data
          )
            setPreparedState({
              scope,
              generation,
              value: data.prepareInstagramMessageComposer,
            });
        })
        .catch(() => {
          if (
            lifecycle.current.mounted &&
            lifecycle.current.generation === generation
          )
            setPreparedState({
              scope,
              generation,
              value: { status: 'BLOCKED', code: 'PREPARATION_UNAVAILABLE' },
            });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      currentLifecycle.generation += 1;
    };
  }, [
    scope,
    client,
    instagramMessageComposer?.recipient,
    instagramMessageComposer?.attempt,
    account?.status,
  ]);

  const preparation =
    preparedState?.scope === scope &&
    preparedState.generation === lifecycle.current.generation
      ? preparedState.value
      : null;
  const routeAllowed =
    preparation?.actionKind === 'START_CHAT'
      ? canFirst
      : preparation?.actionKind === 'REPLY'
        ? canReply
        : false;
  const canSend = Boolean(
    workspaceId &&
    instagramMessageComposer &&
    !instagramMessageComposer.attempt &&
    instagramMessageComposer.body.trim() &&
    preparation?.status === 'READY' &&
    account?.status === 'READY' &&
    preparation.sender &&
    preparation.normalizedHandle &&
    preparation.preparationFingerprint &&
    preparation.sender?.accountRecordId === account?.sender?.accountRecordId &&
    routeAllowed,
  );
  const attempt = instagramMessageComposer?.attempt;
  const attemptInWorkspace = attempt?.workspaceId === workspaceId;
  const canStartNewAttempt = Boolean(
    attemptInWorkspace && attempt?.safeToRetry && !checking,
  );

  const setRecipient = (
    recipient: InstagramMessageComposerState['recipient'],
  ) => {
    if (store.get(atom)?.attempt) return;
    lifecycle.current.generation += 1;
    setPreparedState(null);
    store.set(atom, (current) =>
      current ? { ...current, recipient } : current,
    );
  };
  const setBody = (body: string) =>
    store.set(atom, (current) =>
      current && !current.attempt ? { ...current, body } : current,
    );
  const isCurrent = (draftId: string, originWorkspaceId: string) =>
    lifecycle.current.mounted &&
    lifecycle.current.workspaceId === originWorkspaceId &&
    store.get(currentWorkspaceState.atom)?.id === originWorkspaceId &&
    store.get(atom)?.draftId === draftId;
  const publish = (
    draftId: string,
    originWorkspaceId: string,
    result: InstagramMessageSendResult,
    safeToRetry = false,
  ) => {
    if (!isCurrent(draftId, originWorkspaceId)) return;
    store.set(atom, (current) => {
      if (
        !current?.attempt ||
        (current.attempt.result?.status === 'SENT' && result.status !== 'SENT')
      )
        return current;
      const nextEligibleAt =
        result.status === 'BLOCKED'
          ? (result.nextEligibleAt ??
            current.attempt.result?.nextEligibleAt ??
            null)
          : result.nextEligibleAt;
      return {
        ...current,
        attempt: {
          ...current.attempt,
          result: { ...result, nextEligibleAt },
          safeToRetry,
        },
      };
    });
  };
  const openInbox = () => {
    const current = store.get(atom);
    const currentAttempt = current?.attempt;
    if (
      !currentAttempt ||
      !workspaceId ||
      !isCurrent(current.draftId, workspaceId) ||
      currentAttempt.workspaceId !== workspaceId ||
      currentAttempt.result?.status !== 'SENT'
    )
      return;
    const { creatorRecordId, conversationRecordId } = currentAttempt.result;
    if (creatorRecordId && conversationRecordId)
      store.set(myahInboxPendingInstagramSelectionState.atom, {
        workspaceId,
        creatorRecordId,
        conversationRecordId,
      });
    const inbox = MYAH_NAVIGATION_ROUTES.find(({ id }) => id === 'inbox');
    if (inbox) navigate(inbox.entryPath);
  };
  const recover = async (
    draftId: string,
    originWorkspaceId: string,
  ): Promise<InstagramMessageSendResult> => {
    if (!isCurrent(draftId, originWorkspaceId))
      return unconfirmedInstagramMessageResult(null);
    try {
      const { data } = await client.query<{
        instagramMessageComposerAttempt: InstagramMessageComposerAttemptDto | null;
      }>({
        query: GET_INSTAGRAM_MESSAGE_COMPOSER_ATTEMPT,
        variables: { draftId },
        fetchPolicy: 'network-only',
      });
      const receiptId = data?.instagramMessageComposerAttempt?.receiptId;
      if (!receiptId || !isCurrent(draftId, originWorkspaceId))
        return unconfirmedInstagramMessageResult(null);
      const result = await pollInstagramMessageSendStatus(
        client,
        receiptId,
        () => isCurrent(draftId, originWorkspaceId),
      );
      publish(
        draftId,
        originWorkspaceId,
        result,
        ['FAILED', 'BLOCKED'].includes(result.status),
      );
      return result;
    } catch {
      return unconfirmedInstagramMessageResult(null);
    }
  };
  const checkStatus = async () => {
    const current = store.get(atom);
    if (
      !current?.attempt ||
      !workspaceId ||
      current.attempt.workspaceId !== workspaceId ||
      checking
    )
      return;
    const selectionAtCheck = store.get(myahInboxContactSelectionState.atom);
    setCheckingWorkspaceId(workspaceId);
    const result = await recover(current.draftId, workspaceId);
    if (isCurrent(current.draftId, workspaceId)) {
      if (result.status === 'UNKNOWN')
        publish(current.draftId, workspaceId, result);
      setCheckingWorkspaceId(null);
      if (
        result.status === 'SENT' &&
        result.creatorRecordId &&
        result.conversationRecordId &&
        store.get(myahInboxContactSelectionState.atom) === selectionAtCheck
      )
        openInbox();
    }
  };
  const send = async () => {
    const current = store.get(atom);
    if (
      !canSend ||
      preparedState?.generation !== lifecycle.current.generation ||
      !current ||
      !current.body.trim() ||
      store.get(currentWorkspaceState.atom)?.id !== workspaceId ||
      JSON.stringify(current.recipient) !==
        JSON.stringify(instagramMessageComposer?.recipient) ||
      current.attempt ||
      !preparation?.sender ||
      !preparation.preparationFingerprint ||
      !preparation.normalizedHandle ||
      !workspaceId
    )
      return;
    const input = {
      ...current.recipient,
      draftId: current.draftId,
      expectedAccountRecordId: preparation.sender.accountRecordId,
      expectedPreparationFingerprint: preparation.preparationFingerprint,
      body: current.body.trim(),
    };
    const selectionAtClick = store.get(myahInboxContactSelectionState.atom);
    // Store the immutable attempt before the first await; every mounted caller sees this lock.
    store.set(atom, {
      ...current,
      body: input.body,
      attempt: {
        workspaceId,
        input,
        normalizedHandle: preparation.normalizedHandle,
        senderLabel: preparation.sender.label,
        result: null,
        safeToRetry: false,
      },
    });
    let result: InstagramMessageSendResult;
    try {
      const { data } = await client.mutate<{
        sendInstagramMessageComposer: InstagramMessageSendResultDto;
      }>({ mutation: SEND_INSTAGRAM_MESSAGE_COMPOSER, variables: { input } });
      const response = data?.sendInstagramMessageComposer;
      if (!response) throw new Error('Unconfirmed response');
      result = {
        ...response,
        receiptId: response.receiptId ?? null,
        code: response.code ?? null,
        nextEligibleAt: response.nextEligibleAt ?? null,
        error: response.status === 'BLOCKED' ? (response.code ?? null) : null,
      };
      if (
        ['SENT', 'PENDING', 'PROCESSING', 'PROVIDER_ACCEPTED'].includes(
          result.status,
        ) &&
        result.receiptId
      ) {
        publish(current.draftId, workspaceId, result);
        const confirmedSent = result.status === 'SENT';
        const polled = await pollInstagramMessageSendStatus(
          client,
          result.receiptId,
          () => isCurrent(current.draftId, workspaceId),
        );
        result = confirmedSent && polled.status !== 'SENT' ? result : polled;
        publish(
          current.draftId,
          workspaceId,
          result,
          ['FAILED', 'BLOCKED'].includes(result.status),
        );
      } else publish(current.draftId, workspaceId, result);
    } catch {
      result = await recover(current.draftId, workspaceId);
      if (result.status === 'UNKNOWN')
        publish(current.draftId, workspaceId, result);
    }
    if (
      result.status === 'SENT' &&
      result.creatorRecordId &&
      result.conversationRecordId &&
      store.get(myahInboxContactSelectionState.atom) === selectionAtClick
    )
      openInbox();
  };
  const startNewAttempt = () => {
    const current = store.get(atom);
    if (!canStartNewAttempt || !current?.attempt?.safeToRetry) return;
    store.set(atom, {
      recipient: current.recipient,
      body: current.body,
      draftId: v4(),
    });
    refreshPreparation();
  };
  return {
    composer: instagramMessageComposer,
    account,
    preparation,
    canSend,
    canStartNewAttempt,
    checking,
    send,
    checkStatus,
    startNewAttempt,
    setRecipient,
    setBody,
    refreshPreparation,
    openInbox,
    accountLoading: accountState?.scope !== accountScope,
    canMessage: canFirst || canReply,
    attemptInWorkspace,
  };
};
