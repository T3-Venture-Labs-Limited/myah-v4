import { useEffect, useMemo, useState } from 'react';
import { styled } from '@linaria/react';
import { useBlocker } from 'react-router-dom';
import {
  campaignSequenceSchema,
  validateCampaignSequence,
} from 'twenty-shared/workflow';
import { Status } from 'twenty-ui/data-display';
import { IconSend } from 'twenty-ui/icon';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import { CampaignOutreachWorkflowActionBar } from '@/myah-outreach/components/CampaignOutreachWorkflowActionBar';
import { CampaignSequenceEditor } from '@/myah-outreach/components/CampaignSequenceEditor';
import { CampaignSequenceMessageEditor } from '@/myah-outreach/components/CampaignSequenceMessageEditor';
import { type useCampaignSequence } from '@/myah-outreach/hooks/useCampaignSequence';
import { PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT } from '@/page-layout/constants/PageLayoutSidePanelTabChangeEvent';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';

const StyledEditor = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
`;

const StyledContent = styled.div`
  display: grid;
  flex: 1;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: minmax(280px, 2fr) minmax(320px, 3fr);
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[4]};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledPanel = styled.div`
  min-width: 0;
`;

const StyledNotice = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  margin: 0 0 ${themeCssVariables.spacing[3]};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.color.red};
  margin-bottom: ${themeCssVariables.spacing[3]};
`;

const StyledReview = styled.section`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  margin-bottom: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

type CampaignSequenceState = ReturnType<typeof useCampaignSequence>;

type CampaignOutreachWorkflowEditorProps = {
  campaignId: string;
  isInSidePanel?: boolean;
  sequenceState: CampaignSequenceState;
};

const CampaignSequenceSidePanelGuardEffect = ({
  dirty,
  isInSidePanel,
}: {
  dirty: boolean;
  isInSidePanel: boolean;
}) => {
  useEffect(() => {
    if (!dirty || !isInSidePanel) {
      return;
    }

    const handleSidePanelTabChange = (event: Event) => {
      if (
        !window.confirm(
          'Leave this Campaign? Your unsaved sequence changes will be discarded.',
        )
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener(
      PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT,
      handleSidePanelTabChange,
    );

    return () =>
      window.removeEventListener(
        PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT,
        handleSidePanelTabChange,
      );
  }, [dirty, isInSidePanel]);

  return null;
};

const CampaignSequenceRouterGuardEffect = ({ dirty }: { dirty: boolean }) => {
  const { proceed, reset, state } = useBlocker(dirty);

  useEffect(() => {
    if (state !== 'blocked') {
      return;
    }

    if (
      window.confirm(
        'Leave this Campaign? Your unsaved sequence changes will be discarded.',
      )
    ) {
      proceed();
    } else {
      reset();
    }
  }, [proceed, reset, state]);

  return null;
};

export const CampaignOutreachWorkflowEditor = ({
  campaignId,
  isInSidePanel = false,
  sequenceState,
}: CampaignOutreachWorkflowEditorProps) => {
  const {
    snapshot,
    draft,
    dirty,
    addAttachments,
    error,
    reload,
    reloadGeneration,
    save,
    saving,
    publish,
    publishing,
    selectedMessageId,
    selectMessage,
    setDraft,
  } = sequenceState;
  const [showReview, setShowReview] = useState(false);

  const localIssues = useMemo(
    () => (draft === null ? [] : validateCampaignSequence(draft)),
    [draft],
  );
  const issues = localIssues;
  const selectedMessageIndex =
    draft?.messages.findIndex(({ id }) => id === selectedMessageId) ?? -1;
  const selectedMessage =
    selectedMessageIndex < 0
      ? null
      : (draft?.messages[selectedMessageIndex] ?? null);
  const editable = snapshot?.editable === true;
  const lifecycleLabel =
    snapshot?.lifecycleStatus === 'PAUSED'
      ? 'Stopped'
      : editable
        ? 'Draft'
        : (snapshot?.lifecycleStatus ?? 'Read only');
  const saveAllowed =
    draft !== null && campaignSequenceSchema.safeParse(draft).success;

  if (!snapshot || !draft) {
    return null;
  }

  return (
    <StyledEditor
      data-campaign-id={campaignId}
      data-testid="campaign-outreach-workflow-editor"
    >
      <CampaignSequenceRouterGuardEffect dirty={dirty} />
      <CampaignSequenceSidePanelGuardEffect
        dirty={dirty}
        isInSidePanel={isInSidePanel}
      />
      <PageCardLayout
        header={
          <PageCardHeader
            actionButton={
              <CampaignOutreachWorkflowActionBar
                dirty={dirty}
                editable={editable}
                onReload={reload}
                onReview={() => setShowReview(true)}
                onSave={save}
                onPublish={publish}
                publishAllowed={
                  !dirty &&
                  snapshot.versionStatus === 'DRAFT' &&
                  issues.length === 0 &&
                  draft.messages.length > 0 &&
                  draft.messages.every(
                    (message) =>
                      message.channel === 'EMAIL' && message.files.length === 0,
                  )
                }
                publishing={publishing}
                reviewAllowed={draft.messages.length > 0}
                saveAllowed={saveAllowed}
                saving={saving}
              />
            }
            icon={<IconSend />}
            tag={<Status color="gray" text={lifecycleLabel} weight="medium" />}
            title="Campaign Outreach"
          />
        }
        showInformationBanner={false}
      >
        <StyledContent>
          <StyledPanel>
            <StyledNotice>
              Delays are elapsed-time estimates between positions. Campaign
              sending windows and lifecycle scheduling remain authoritative.
            </StyledNotice>
            {error ? (
              <StyledError role="alert">
                {error} Your local changes are still available. Reload only to
                discard them explicitly.
              </StyledError>
            ) : null}
            {!editable ? (
              <StyledNotice>
                Stop Campaign outreach before editing this saved sequence.
              </StyledNotice>
            ) : null}
            {showReview ? (
              <StyledReview aria-label="Sequence review">
                <strong>Sequence review</strong>
                <p>
                  {issues.length === 0
                    ? 'This saved shape passes authoring validation.'
                    : `${issues.length} authoring issue${issues.length === 1 ? '' : 's'} must be corrected before launch.`}
                </p>
                <p>
                  Review the authoritative eligible and excluded Creator
                  audience in Campaign Operations before Start.
                </p>
                <ul>
                  {issues.map((issue) => (
                    <li
                      key={`${issue.code}-${issue.path}-${issue.messageId ?? ''}`}
                    >
                      {issue.message}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setShowReview(false)} type="button">
                  Close review
                </button>
              </StyledReview>
            ) : null}
            <CampaignSequenceEditor
              editable={editable}
              issues={issues}
              onChange={setDraft}
              onSelectMessage={selectMessage}
              selectedMessageId={selectedMessageId}
              sequence={draft}
            />
          </StyledPanel>
          <StyledPanel>
            {selectedMessage ? (
              <CampaignSequenceMessageEditor
                editable={editable}
                hasPriorEmail={draft.messages
                  .slice(0, selectedMessageIndex)
                  .some(({ channel }) => channel === 'EMAIL')}
                issues={issues}
                key={selectedMessage.id}
                message={selectedMessage}
                messageIndex={selectedMessageIndex}
                onAttachmentsAdded={addAttachments}
                onChange={(nextMessage) =>
                  setDraft({
                    ...draft,
                    messages: draft.messages.map((message) =>
                      message.id === nextMessage.id ? nextMessage : message,
                    ),
                  })
                }
                reloadGeneration={reloadGeneration}
              />
            ) : (
              <StyledNotice>
                Add or select a message to edit its Campaign-controlled content.
              </StyledNotice>
            )}
          </StyledPanel>
        </StyledContent>
      </PageCardLayout>
    </StyledEditor>
  );
};
