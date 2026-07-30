import {
  MyahInboxDraftEditor,
  type MyahInboxAppliedProposal,
  type MyahInboxRichText,
} from '@/myah/inbox/components/MyahInboxDraftEditor';
import { MyahInboxProposalPreview } from '@/myah/inbox/components/MyahInboxProposalPreview';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';

import { styled } from '@linaria/react';
import { useState } from 'react';
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

type MyahInboxDraftRecord = {
  __typename: string;
  id: string;
  myahReplyDraftBody: MyahInboxRichText | null;
  myahReplyDraftRevision: number;
};

export type MyahInboxReplyWorkspaceProps = {
  thread: MyahInboxThread;
};

type MyahInboxReplyWorkspaceContentProps = {
  thread: MyahInboxThread;
};

const MyahInboxReplyWorkspaceContent = ({
  thread,
}: MyahInboxReplyWorkspaceContentProps) => {
  const { record: draftRecord, loading: draftLoading } =
    useFindOneRecord<MyahInboxDraftRecord>({
      objectNameSingular: 'messageThread',
      objectRecordId: thread.id,
      recordGqlFields: {
        id: true,
        myahReplyDraftBody: { markdown: true, blocknote: true },
        myahReplyDraftRevision: true,
      },
      skip: false,
    });
  const [appliedProposal, setAppliedProposal] =
    useState<MyahInboxAppliedProposal | null>(null);
  const canEditDraft = true;

  if (draftLoading) {
    return <StyledStatus role="status">Loading shared draft</StyledStatus>;
  }

  return (
    <MyahInboxProposalPreview
      threadId={thread.id}
      disabled={!canEditDraft}
      onApply={(body) =>
        setAppliedProposal((current) => ({
          applicationId: (current?.applicationId ?? 0) + 1,
          body,
        }))
      }
      renderGenerateAction={(generateAction) => (
        <MyahInboxDraftEditor
          threadId={thread.id}
          initialBody={draftRecord?.myahReplyDraftBody ?? null}
          initialRevision={draftRecord?.myahReplyDraftRevision ?? 0}
          canEdit={canEditDraft}
          appliedProposal={appliedProposal}
          proposalAction={generateAction}
        />
      )}
    />
  );
};

export const MyahInboxReplyWorkspace = ({
  thread,
}: MyahInboxReplyWorkspaceProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const isMessageThreadMetadataReady = objectMetadataItems.some(
    (item) => item.nameSingular === 'messageThread',
  );

  return (
    <StyledReplyWorkspace
      aria-label="Reply composer"
      id={`myah-inbox-reply-workspace-${thread.id}`}
      tabIndex={-1}
    >
      <StyledComposerHeader>
        <StyledComposerTitle>Reply draft</StyledComposerTitle>
        <StyledStatus>Shared workspace draft · revision protected</StyledStatus>
      </StyledComposerHeader>
      {isMessageThreadMetadataReady ? (
        <MyahInboxReplyWorkspaceContent thread={thread} />
      ) : (
        <StyledStatus role="status">Loading shared draft</StyledStatus>
      )}
    </StyledReplyWorkspace>
  );
};
