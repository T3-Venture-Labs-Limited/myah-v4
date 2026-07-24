import { NotesCard } from '@/activities/notes/components/NotesCard';
import { TasksCard } from '@/activities/tasks/components/TasksCard';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import {
  MyahInboxDraftEditor,
  type MyahInboxAppliedProposal,
  type MyahInboxRichText,
} from '@/myah/inbox/components/MyahInboxDraftEditor';
import { MyahInboxProposalPreview } from '@/myah/inbox/components/MyahInboxProposalPreview';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { FormDateTimeFieldInput } from '@/object-record/record-field/ui/form-types/components/FormDateTimeFieldInput';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { Select } from '@/ui/input/components/Select';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type PageLayoutType } from '~/generated-metadata/graphql';
import { type UpdateMyahInboxThreadInput } from '~/generated/graphql';

const StyledContextPanel = styled.aside`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
`;

const StyledSection = styled.section`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledHeading = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledControls = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1fr);
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledTabs = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledActivitySurface = styled.div`
  display: flex;
  min-height: calc(${themeCssVariables.spacing[12]} * 5);
`;

const INBOX_STATE_OPTIONS = [
  { label: 'Needs reply', value: 'NEEDS_REPLY' },
  { label: 'Waiting on creator', value: 'WAITING_ON_CREATOR' },
  { label: 'Snoozed', value: 'SNOOZED' },
  { label: 'Closed', value: 'CLOSED' },
];

type MyahInboxDraftRecord = {
  __typename: string;
  id: string;
  myahReplyDraftBody: MyahInboxRichText | null;
  myahReplyDraftRevision: number;
};

type MyahInboxContextPanelProps = {
  thread: MyahInboxThread | null;
  onTriageSaved?: () => void;
};

export const MyahInboxContextPanel = ({
  thread,
  onTriageSaved,
}: MyahInboxContextPanelProps) => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { updateThread } = useMyahInboxThreadMutations();
  const { record: draftRecord, loading: draftLoading } =
    useFindOneRecord<MyahInboxDraftRecord>({
      objectNameSingular: 'messageThread',
      objectRecordId: thread?.id ?? '',
      recordGqlFields: {
        id: true,
        myahReplyDraftBody: { markdown: true, blocknote: true },
        myahReplyDraftRevision: true,
      },
      skip: !thread,
    });

  const [creatorId, setCreatorId] = useState(thread?.creator?.id ?? null);
  const [campaignId, setCampaignId] = useState(thread?.campaign?.id ?? null);
  const [ownerId, setOwnerId] = useState(thread?.inboxOwner?.id ?? null);
  const [savedOwner, setSavedOwner] = useState(thread?.inboxOwner ?? null);
  const [inboxState, setInboxState] = useState(thread?.state ?? 'NEEDS_REPLY');
  const [snoozedUntil, setSnoozedUntil] = useState(
    thread?.snoozedUntil ?? null,
  );
  const [isSavingTriage, setIsSavingTriage] = useState(false);
  const [triageStatus, setTriageStatus] = useState<string | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [activityTab, setActivityTab] = useState<'tasks' | 'notes'>('tasks');
  const [appliedProposal, setAppliedProposal] =
    useState<MyahInboxAppliedProposal | null>(null);

  if (!thread) {
    return (
      <StyledContextPanel aria-label="Conversation context">
        <StyledSection>
          <StyledStatus>
            Select a conversation to manage its context.
          </StyledStatus>
        </StyledSection>
      </StyledContextPanel>
    );
  }

  const handleSaveTriage = async () => {
    setIsSavingTriage(true);
    setTriageStatus(null);
    setTriageError(null);

    try {
      const updated = await updateThread({
        threadId: thread.id,
        creatorId,
        campaignId,
        inboxOwnerId: ownerId,
        inboxState: inboxState as UpdateMyahInboxThreadInput['inboxState'],
        snoozedUntil,
      });

      setSavedOwner(
        updated.inboxOwner
          ? {
              id: updated.inboxOwner.id,
              name: updated.inboxOwner.name ?? null,
            }
          : null,
      );
      setTriageStatus('Triage saved');
      onTriageSaved?.();
    } catch {
      setTriageError('Could not save triage. Try again.');
    } finally {
      setIsSavingTriage(false);
    }
  };

  const canEditDraft =
    currentWorkspaceMember !== null &&
    savedOwner?.id === currentWorkspaceMember.id;
  const readOnlyReason =
    savedOwner === null
      ? 'Assign this conversation to yourself to edit the shared draft.'
      : canEditDraft
        ? undefined
        : `Only ${savedOwner.name ?? 'the assigned owner'} can edit this shared draft.`;
  const targetRecordIdentifier = thread.creator
    ? { id: thread.creator.id, targetObjectNameSingular: 'creator' }
    : thread.campaign
      ? { id: thread.campaign.id, targetObjectNameSingular: 'campaign' }
      : null;

  return (
    <StyledContextPanel aria-label="Conversation context">
      <StyledSection>
        <StyledHeading>Triage</StyledHeading>
        <StyledControls>
          <FormSingleRecordPicker
            label="Creator"
            objectNameSingulars={['creator']}
            defaultValue={creatorId}
            onChange={setCreatorId}
          />
          <FormSingleRecordPicker
            label="Campaign"
            objectNameSingulars={['campaign']}
            defaultValue={campaignId}
            onChange={setCampaignId}
          />
          <FormSingleRecordPicker
            label="Owner"
            objectNameSingulars={['workspaceMember']}
            defaultValue={ownerId}
            onChange={setOwnerId}
          />
          <Select
            dropdownId={`myah-inbox-state-${thread.id}`}
            label="Inbox state"
            fullWidth
            value={inboxState}
            options={INBOX_STATE_OPTIONS}
            onChange={(state) =>
              setInboxState(state as MyahInboxThread['state'])
            }
          />
          <FormDateTimeFieldInput
            label="Snooze until"
            defaultValue={snoozedUntil ?? undefined}
            onChange={setSnoozedUntil}
          />
        </StyledControls>
        <StyledActions>
          <Button
            title={isSavingTriage ? 'Saving triage' : 'Save triage'}
            variant="secondary"
            size="small"
            disabled={isSavingTriage}
            onClick={handleSaveTriage}
          />
        </StyledActions>
        {triageStatus && (
          <StyledStatus role="status">{triageStatus}</StyledStatus>
        )}
        {triageError && <StyledError role="alert">{triageError}</StyledError>}
      </StyledSection>

      <StyledSection>
        <StyledHeading>Work</StyledHeading>
        {targetRecordIdentifier ? (
          <LayoutRenderingProvider
            value={{
              targetRecordIdentifier,
              layoutType: 'RECORD_PAGE' as PageLayoutType,
              isInSidePanel: false,
            }}
          >
            <StyledTabs aria-label="Related work">
              <Button
                title="Tasks"
                variant={activityTab === 'tasks' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setActivityTab('tasks')}
              />
              <Button
                title="Notes"
                variant={activityTab === 'notes' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setActivityTab('notes')}
              />
            </StyledTabs>
            <StyledActivitySurface>
              {activityTab === 'tasks' ? <TasksCard /> : <NotesCard />}
            </StyledActivitySurface>
          </LayoutRenderingProvider>
        ) : (
          <StyledStatus>
            Link a Creator or Campaign to use related Tasks and Notes.
          </StyledStatus>
        )}
      </StyledSection>

      <StyledSection>
        <StyledHeading>Reply workspace</StyledHeading>
        {draftLoading ? (
          <StyledStatus role="status">Loading shared draft</StyledStatus>
        ) : (
          <MyahInboxDraftEditor
            threadId={thread.id}
            initialBody={draftRecord?.myahReplyDraftBody ?? null}
            initialRevision={draftRecord?.myahReplyDraftRevision ?? 0}
            canEdit={canEditDraft}
            readOnlyReason={readOnlyReason}
            appliedProposal={appliedProposal}
          />
        )}
        <MyahInboxProposalPreview
          threadId={thread.id}
          disabled={!canEditDraft}
          onApply={(body) =>
            setAppliedProposal((current) => ({
              applicationId: (current?.applicationId ?? 0) + 1,
              body,
            }))
          }
        />
      </StyledSection>
    </StyledContextPanel>
  );
};
