import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { Button } from 'twenty-ui/input';
import { AppPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxDraftEditor } from '@/myah/inbox/components/MyahInboxDraftEditor';
import { getMyahInboxSafeEmailSubject } from '@/myah/inbox/components/MyahInboxEmailSubjectSeparator';
import { MyahInboxReplySendAction } from '@/myah/inbox/components/MyahInboxReplySendAction';
import { MyahInboxProposalPreview } from '@/myah/inbox/components/MyahInboxProposalPreview';
import { useMyahInboxDraftAutosaveControllerContext } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import { myahInboxDraftEditorModeFamilyState } from '@/myah/inbox/states/myahInboxDraftEditorModeFamilyState';
import { myahInboxPreserveSelectionOnUnmountState } from '@/myah/inbox/states/myahInboxSelectionState';
import { type MyahInboxDraftAutosaveKey } from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { pageLayoutsWithRelationsSelector } from '@/page-layout/states/pageLayoutsWithRelationsSelector';
import { type PageLayout } from '@/page-layout/types/PageLayout';
import { MyahInboxEmailDraftDocument } from '~/generated/graphql';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledReplyWorkspace = styled.section`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const MYAH_REPLY_CARD_SURFACE = themeCssVariables.background.primary;

const StyledMainReplyWorkspace = styled(StyledReplyWorkspace)`
  animation: myahReplyCardBorder 12s ease-in-out infinite alternate;
  background:
    linear-gradient(${MYAH_REPLY_CARD_SURFACE}, ${MYAH_REPLY_CARD_SURFACE})
      padding-box,
    linear-gradient(
        120deg,
        ${themeCssVariables.color.pink},
        ${themeCssVariables.color.sky},
        ${themeCssVariables.color.pink}
      )
      border-box;
  background-size:
    100% 100%,
    200% 200%;
  border-color: transparent;

  @keyframes myahReplyCardBorder {
    from {
      background-position:
        0 0,
        0% 50%;
    }
    to {
      background-position:
        0 0,
        100% 50%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const StyledComposerHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledComposerTitle = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const getMainReplyDisplaySubject = (subject: string | null) => {
  const safeSubject = getMyahInboxSafeEmailSubject(subject);
  const subjectWithoutReplyPrefixes = safeSubject
    .replace(/^(?:re:\s*)+/i, '')
    .trim();

  return subjectWithoutReplyPrefixes || 'No subject';
};

const getActiveCampaignAgentTabId = (pageLayouts: PageLayout[]) => {
  const campaignLayout = pageLayouts.find(
    ({ deletedAt, universalIdentifier }) =>
      !isDefined(deletedAt) &&
      universalIdentifier ===
        MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  );

  return campaignLayout?.tabs.find(
    ({ isActive, universalIdentifier }) =>
      isActive &&
      universalIdentifier === MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
  )?.id;
};

export type MyahInboxReplyWorkspaceProps = {
  thread: MyahInboxThread;
  targetAvailable?: boolean;
  scopeGeneration?: string;
  presentation?: 'default' | 'main';
  onSent?: () => void | Promise<void>;
};

type MyahInboxReplyWorkspaceContentProps = MyahInboxReplyWorkspaceProps & {
  workspaceId: string;
};

const MyahInboxReplyWorkspaceContent = ({
  thread,
  onSent,
  workspaceId,
  targetAvailable = true,
  scopeGeneration = '',
  presentation = 'default',
}: MyahInboxReplyWorkspaceContentProps) => {
  const client = useApolloCoreClient();
  const navigate = useNavigate();
  const store = useStore();
  const pageLayoutsWithRelations = useAtomStateValue(
    pageLayoutsWithRelationsSelector,
  );
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const authorizationKey = JSON.stringify([
    currentWorkspaceMember?.id ?? null,
    currentUserWorkspace,
  ]);
  const draftAutosaveController = useMyahInboxDraftAutosaveControllerContext();
  const draftKey = useMemo<MyahInboxDraftAutosaveKey>(
    () => ({ workspaceId, threadId: thread.id }),
    [thread.id, workspaceId],
  );
  const draftEntry = useAtomValue(
    myahInboxDraftAutosaveFamilyState.atomFamily(draftKey),
  );
  const [isEditing, setIsEditing] = useAtom(
    myahInboxDraftEditorModeFamilyState.atomFamily(draftKey),
  );
  const [editorOwner] = useState(() => Symbol('Inbox draft editor'));
  const [readEpoch, setReadEpoch] = useState(0);
  const [isOpeningGuidance, setIsOpeningGuidance] = useState(false);
  // Guards repeated activations before React commits the disabled state.
  // oxlint-disable-next-line twenty/no-state-useref
  const isOpeningGuidanceRef = useRef(false);
  const readContext = useMemo(
    () => ({
      thread,
      workspaceId,
      targetAvailable,
      scopeGeneration,
      readEpoch,
      client,
      authorizationKey,
    }),
    [
      thread,
      workspaceId,
      targetAvailable,
      scopeGeneration,
      readEpoch,
      client,
      authorizationKey,
    ],
  );
  // The render-time predicate closes the interval before effect cleanup on scope loss.
  // oxlint-disable-next-line twenty/no-state-useref
  const contextRef = useRef(readContext);
  contextRef.current = readContext;
  const [readState, setReadState] = useState<{
    context: typeof readContext;
    status: 'ready' | 'denied' | 'occupied';
  } | null>(null);

  useEffect(() => {
    if (!targetAvailable) return;
    if (!draftAutosaveController.claimEditor(draftKey, editorOwner)) {
      setReadState({ context: readContext, status: 'occupied' });
      return;
    }
    const abort = new AbortController();
    const capture = draftAutosaveController.beginTargetRead(
      draftKey,
      () =>
        contextRef.current === readContext &&
        !abort.signal.aborted &&
        targetAvailable,
    );
    void client
      .query({
        query: MyahInboxEmailDraftDocument,
        variables: {
          threadId: draftKey.threadId,
          expectedWorkspaceId: workspaceId,
        },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
        context: {
          queryDeduplication: false,
          fetchOptions: { signal: abort.signal },
        },
      })
      .then((response) => {
        if (abort.signal.aborted || contextRef.current !== readContext) return;
        const draft = response.data?.myahInboxEmailDraft;
        if (
          isDefined(response.error) ||
          !isDefined(draft) ||
          draft.workspaceId !== workspaceId ||
          draft.threadId !== draftKey.threadId ||
          !draftAutosaveController.authorizeTarget(capture, {
            key: draftKey,
            revision: draft.revision,
            body: draft.body
              ? {
                  markdown: draft.body.markdown,
                  blocknote: draft.body.blocknote ?? null,
                }
              : null,
          })
        ) {
          draftAutosaveController.invalidateTarget(capture);
          setReadState({ context: readContext, status: 'denied' });
          return;
        }
        setReadState({ context: readContext, status: 'ready' });
      })
      .catch(() => {
        if (abort.signal.aborted || contextRef.current !== readContext) return;
        draftAutosaveController.invalidateTarget(capture);
        setReadState({ context: readContext, status: 'denied' });
      });
    return () => {
      abort.abort();
      draftAutosaveController.invalidateTarget(capture);
      draftAutosaveController.releaseEditor(draftKey, editorOwner);
    };
  }, [
    client,
    draftAutosaveController,
    draftKey,
    editorOwner,
    readContext,
    targetAvailable,
    workspaceId,
  ]);

  const campaignId = thread.campaign?.id;
  const runtimeAgentTabId = getActiveCampaignAgentTabId(
    pageLayoutsWithRelations,
  );
  const openAiGuidance = async () => {
    if (
      isOpeningGuidanceRef.current ||
      !campaignId ||
      !runtimeAgentTabId ||
      contextRef.current !== readContext ||
      !draftAutosaveController.isTargetAuthorized(draftKey)
    )
      return;

    isOpeningGuidanceRef.current = true;
    setIsOpeningGuidance(true);
    let markedForPreservation = false;
    try {
      const flushedEntry = await draftAutosaveController.flush(draftKey);
      const currentRuntimeAgentTabId = getActiveCampaignAgentTabId(
        store.get(pageLayoutsWithRelationsSelector.atom),
      );
      if (
        contextRef.current !== readContext ||
        !draftAutosaveController.isTargetAuthorized(draftKey) ||
        flushedEntry.dirty ||
        flushedEntry.operation ||
        !['idle', 'saved'].includes(flushedEntry.status) ||
        currentRuntimeAgentTabId !== runtimeAgentTabId
      )
        return;

      store.set(myahInboxPreserveSelectionOnUnmountState.atom, true);
      markedForPreservation = true;
      navigate(
        `${getAppPath(AppPath.RecordShowPage, {
          objectNameSingular: 'campaign',
          objectRecordId: campaignId,
        })}#${runtimeAgentTabId}`,
        {
          state: { myahCampaignAgentGuidanceFocusCampaignId: campaignId },
        },
      );
    } catch {
      if (markedForPreservation)
        store.set(myahInboxPreserveSelectionOnUnmountState.atom, false);
    } finally {
      isOpeningGuidanceRef.current = false;
      setIsOpeningGuidance(false);
    }
  };

  if (
    !targetAvailable ||
    readState?.context !== readContext ||
    readState.status !== 'ready' ||
    !draftEntry ||
    draftEntry.editorOwner !== editorOwner ||
    !draftAutosaveController.isTargetAuthorized(draftKey)
  ) {
    const status = readState?.context === readContext ? readState.status : null;
    return (
      <StyledStatus role="status">
        {!targetAvailable || status === 'denied'
          ? 'Shared draft unavailable. Your local recovery is retained.'
          : status === 'occupied'
            ? 'This draft is open in another editor.'
            : 'Loading shared draft'}
        {targetAvailable && (status === 'denied' || status === 'occupied') && (
          <Button
            title="Retry shared draft"
            variant="secondary"
            size="small"
            onClick={() => setReadEpoch((epoch) => epoch + 1)}
          />
        )}
      </StyledStatus>
    );
  }

  const subject =
    presentation === 'main'
      ? getMainReplyDisplaySubject(thread.subject)
      : undefined;
  const hasDraftContent = draftEntry.localBody.markdown.trim().length > 0;
  const campaignRequiredReason = thread.campaign
    ? undefined
    : 'Link an exact readable Campaign to generate a reply or open AI guidance.';
  const guidanceUnavailableReason =
    campaignRequiredReason ??
    (runtimeAgentTabId
      ? undefined
      : 'Campaign AI guidance is unavailable because the active Agent tab could not be found.');

  return (
    <MyahInboxProposalPreview
      draftKey={draftKey}
      editorOwner={editorOwner}
      disabled={
        Boolean(draftEntry.operation) ||
        draftEntry.status === 'saving' ||
        draftEntry.status === 'error' ||
        draftEntry.status === 'conflict' ||
        isOpeningGuidance
      }
      generateUnavailableReason={campaignRequiredReason}
      renderGenerateAction={(generateAction, isGenerating) => {
        const sendAction = (
          <MyahInboxReplySendAction
            draftKey={draftKey}
            editorOwner={editorOwner}
            entry={draftEntry}
            disabled={isGenerating || isOpeningGuidance}
            label={presentation === 'main' ? t`Send reply` : undefined}
            onSent={onSent}
          />
        );

        return (
          <MyahInboxDraftEditor
            entry={draftEntry}
            presentation={presentation}
            previewScope={`${draftKey.workspaceId}:${draftKey.threadId}`}
            subject={subject}
            guidanceUnavailableReason={guidanceUnavailableReason}
            onOpenAiGuidance={
              campaignId && runtimeAgentTabId
                ? () => void openAiGuidance()
                : undefined
            }
            initialIsEditing={isEditing}
            onEditingChange={setIsEditing}
            onDraftChange={(body) =>
              draftAutosaveController.updateDraft({
                key: draftKey,
                body,
                editorOwner,
              })
            }
            onRetry={() => {
              void draftAutosaveController.retry(draftKey);
            }}
            onReloadConflict={() =>
              draftAutosaveController.reloadConflict(draftKey)
            }
            disabled={
              Boolean(draftEntry.operation) || isGenerating || isOpeningGuidance
            }
            actions={
              presentation === 'main' ? (
                hasDraftContent ? (
                  sendAction
                ) : (
                  generateAction
                )
              ) : (
                <>
                  {generateAction}
                  {sendAction}
                </>
              )
            }
          />
        );
      }}
    />
  );
};

export const MyahInboxReplyWorkspace = ({
  thread,
  onSent,
  targetAvailable,
  scopeGeneration,
  presentation = 'default',
}: MyahInboxReplyWorkspaceProps) => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const ReplyWorkspace =
    presentation === 'main' ? StyledMainReplyWorkspace : StyledReplyWorkspace;

  return (
    <ReplyWorkspace
      aria-label="Reply composer"
      id={`myah-inbox-reply-workspace-${thread.id}`}
      tabIndex={-1}
    >
      {presentation !== 'main' && (
        <StyledComposerHeader>
          <StyledComposerTitle>Reply draft</StyledComposerTitle>
          <StyledStatus>
            Shared workspace draft · revision protected
          </StyledStatus>
        </StyledComposerHeader>
      )}
      {currentWorkspace ? (
        <MyahInboxReplyWorkspaceContent
          key={`${currentWorkspace.id}:${thread.id}`}
          thread={thread}
          onSent={onSent}
          targetAvailable={targetAvailable}
          scopeGeneration={scopeGeneration}
          presentation={presentation}
          workspaceId={currentWorkspace.id}
        />
      ) : (
        <StyledStatus role="status">Loading shared draft</StyledStatus>
      )}
    </ReplyWorkspace>
  );
};
