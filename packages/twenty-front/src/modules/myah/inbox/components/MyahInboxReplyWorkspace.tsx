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
import { myahInboxDraftEditorModeFamilyState } from '@/myah/inbox/states/myahInboxDraftEditorModeFamilyState';
import { myahInboxPreserveSelectionOnUnmountState } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  myahInboxDraftKeyId,
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveKey,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useMyahInboxReplyDraft } from '@/myah/inbox/hooks/useMyahInboxReplyDraft';
import { useMyahInboxReplyContextOptions } from '@/myah/inbox/hooks/useMyahInboxReplyContextOptions';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { pageLayoutsWithRelationsSelector } from '@/page-layout/states/pageLayoutsWithRelationsSelector';
import { type PageLayout } from '@/page-layout/types/PageLayout';
import { ReplyChannel, type ReplyContextInput } from '~/generated/graphql';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useAtom, useStore } from 'jotai';
import { useMemo, useRef, useState } from 'react';
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

// Rendered only when no shared draft can be loaded: the composer keeps its
// normal surface and controls instead of printing status copy.
const UNAVAILABLE_DRAFT_ENTRY: MyahInboxDraftAutosaveEntry = {
  proposalContextFingerprint: null,
  operation: null,
  editorOwner: null,
  localBody: { markdown: '', blocknote: null },
  confirmedBody: null,
  confirmedRevision: 0,
  dirty: false,
  status: 'idle',
  error: null,
  conflict: null,
  debounceVersion: 0,
  pendingDebounceVersion: null,
  editorVersion: 0,
};

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
  contactId?: string;
  replyContext?: ReplyContextInput | null;
  targetAvailable?: boolean;
  scopeGeneration?: string;
  presentation?: 'default' | 'main';
  replyTargets?: Array<{
    threadId: string;
    subject?: string | null;
    campaignLabel?: string | null;
  }>;
  onReplyTargetChange?: (threadId: string) => void | Promise<void>;
  onSent?: () => void | Promise<void>;
};

type MyahInboxReplyWorkspaceContentProps = MyahInboxReplyWorkspaceProps & {
  workspaceId: string;
};

const MyahInboxReplyWorkspaceContent = ({
  thread,
  contactId,
  replyContext,
  onSent,
  workspaceId,
  targetAvailable = true,
  scopeGeneration = '',
  presentation = 'default',
  replyTargets = [],
  onReplyTargetChange,
}: MyahInboxReplyWorkspaceContentProps) => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const pageLayoutsWithRelations = useAtomStateValue(
    pageLayoutsWithRelationsSelector,
  );
  const store = useStore();
  const navigate = useNavigate();
  const authorizationKey = JSON.stringify([
    currentWorkspaceMember?.id ?? null,
    currentUserWorkspace,
  ]);
  const draftAutosaveController = useMyahInboxDraftAutosaveControllerContext();
  // One control decides the reply: the exact Email thread. The Campaign travels
  // with that thread (a Campaign sequence can emit several subjects), so the
  // drafting context is resolved from the selected target rather than chosen
  // separately.
  const optionsInput = useMemo(
    () =>
      contactId && targetAvailable
        ? {
            expectedWorkspaceId: workspaceId,
            target: {
              channel: ReplyChannel.EMAIL,
              contactId,
              threadId: thread.id,
            },
          }
        : null,
    [contactId, targetAvailable, thread.id, workspaceId],
  );
  const contexts = useMyahInboxReplyContextOptions(optionsInput);
  const defaultContext = contexts.defaultContext;
  const selectedContext =
    replyContext === undefined ? defaultContext : replyContext;
  const input = useMemo(() => {
    if (!optionsInput || !selectedContext) return null;
    return {
      ...optionsInput,
      replyContext: {
        kind: selectedContext.kind,
        ...(selectedContext.campaignId
          ? { campaignId: selectedContext.campaignId }
          : {}),
      },
    };
  }, [optionsInput, selectedContext]);
  const {
    key: draftKey,
    entry: draftEntry,
    editorOwner,
    status,
  } = useMyahInboxReplyDraft(
    input,
    draftAutosaveController,
    JSON.stringify([scopeGeneration, authorizationKey]),
  );

  // Edit mode is owned outside the editor so it survives the guidance round trip.
  const unavailableModeKey = useMemo<MyahInboxDraftAutosaveKey>(
    () => ({
      workspaceId,
      contactAnchorKind: 'UNAVAILABLE',
      contactAnchorId: 'UNAVAILABLE',
      channel: 'EMAIL',
      deliveryTargetId: thread.id,
      contextKind: 'GENERAL',
      campaignId: null,
    }),
    [thread.id, workspaceId],
  );
  const [isEditing, setIsEditing] = useAtom(
    myahInboxDraftEditorModeFamilyState.atomFamily(
      draftKey ?? unavailableModeKey,
    ),
  );
  const [isOpeningGuidance, setIsOpeningGuidance] = useState(false);
  // Guards repeated activations before React commits the disabled state.
  // oxlint-disable-next-line twenty/no-state-useref
  const isOpeningGuidanceRef = useRef(false);

  const subject =
    presentation === 'main'
      ? getMainReplyDisplaySubject(thread.subject)
      : undefined;
  const subjectOptions = useMemo(() => {
    const targets = replyTargets.some(({ threadId }) => threadId === thread.id)
      ? replyTargets
      : [
          {
            threadId: thread.id,
            subject: thread.subject,
            campaignLabel: thread.campaign?.name ?? null,
          },
          ...replyTargets,
        ];

    return targets.map((target) => ({
      value: target.threadId,
      label: getMainReplyDisplaySubject(target.subject ?? null),
      contextualText: target.campaignLabel?.trim() || undefined,
      searchKeywords: `${target.subject ?? ''} ${target.campaignLabel ?? ''}`,
    }));
  }, [replyTargets, thread.campaign?.name, thread.id, thread.subject]);

  const campaignId = thread.campaign?.id ?? selectedContext?.campaignId;
  const runtimeAgentTabId = getActiveCampaignAgentTabId(
    pageLayoutsWithRelations,
  );
  const openAiGuidance = async () => {
    if (
      isOpeningGuidanceRef.current ||
      !campaignId ||
      !runtimeAgentTabId ||
      !draftKey ||
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

  // The composer keeps its normal surface and controls when no draft can load;
  // only the status copy is omitted. Multi-editor contention still reports.
  if (
    !targetAvailable ||
    !draftKey ||
    status === 'denied' ||
    !draftEntry ||
    draftEntry.editorOwner !== editorOwner ||
    !draftAutosaveController.isTargetAuthorized(draftKey)
  ) {
    if (status === 'occupied') {
      return (
        <StyledStatus role="status">
          This draft is open in another editor.
        </StyledStatus>
      );
    }

    // Only the main Inbox composer keeps its surface without a draft; the
    // legacy thread panel keeps its previous graceful degradation.
    if (presentation !== 'main') return null;

    return (
      <MyahInboxDraftEditor
        entry={UNAVAILABLE_DRAFT_ENTRY}
        presentation={presentation}
        previewScope={`unavailable:${thread.id}`}
        // The thread selector and its options stay withheld until a draft is
        // authorized; the container and its controls still render.
        onDraftChange={() => undefined}
        onRetry={() => undefined}
        onReloadConflict={() => undefined}
        disabled
        actions={
          <Button
            title={presentation === 'main' ? t`Send reply` : t`Send`}
            variant="primary"
            accent="brand"
            size="small"
            disabled
          />
        }
      />
    );
  }

  const hasDraftContent = draftEntry.localBody.markdown.trim().length > 0;
  const campaignRequiredReason = campaignId
    ? undefined
    : 'Link an exact readable Campaign to generate a reply or open AI guidance.';
  const guidanceUnavailableReason =
    campaignRequiredReason ??
    (runtimeAgentTabId
      ? undefined
      : 'Campaign AI guidance is unavailable because the active Agent tab could not be found.');

  return (
    <MyahInboxProposalPreview
      key={myahInboxDraftKeyId(draftKey)}
      draftKey={draftKey}
      editorOwner={editorOwner}
      disabled={
        draftEntry.executionState !== 'READY' ||
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
            previewScope={myahInboxDraftKeyId(draftKey)}
            subject={subject}
            subjectOptions={
              presentation === 'main' ? subjectOptions : undefined
            }
            subjectValue={presentation === 'main' ? thread.id : undefined}
            onSubjectChange={
              presentation === 'main' ? onReplyTargetChange : undefined
            }
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
            onReloadConflict={() => {
              void draftAutosaveController.reloadConflict(draftKey);
            }}
            disabled={
              draftEntry.executionState !== 'READY' ||
              Boolean(draftEntry.operation) ||
              isGenerating ||
              isOpeningGuidance
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
  contactId,
  replyContext,
  onSent,
  targetAvailable,
  scopeGeneration,
  presentation = 'default',
  replyTargets,
  onReplyTargetChange,
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
          contactId={contactId}
          replyContext={replyContext}
          onSent={onSent}
          targetAvailable={targetAvailable}
          scopeGeneration={scopeGeneration}
          presentation={presentation}
          replyTargets={replyTargets}
          onReplyTargetChange={onReplyTargetChange}
          workspaceId={currentWorkspace.id}
        />
      ) : (
        <StyledStatus role="status">Loading shared draft</StyledStatus>
      )}
    </ReplyWorkspace>
  );
};
