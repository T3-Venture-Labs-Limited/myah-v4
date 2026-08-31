import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxDraftEditor } from '@/myah/inbox/components/MyahInboxDraftEditor';
import { MyahInboxReplySendAction } from '@/myah/inbox/components/MyahInboxReplySendAction';
import { MyahInboxProposalPreview } from '@/myah/inbox/components/MyahInboxProposalPreview';
import { useMyahInboxDraftAutosaveControllerContext } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
  type MyahInboxDraftAutosaveKey,
  type MyahInboxRichText,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

import { styled } from '@linaria/react';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
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
  workspaceId: string;
};

const MyahInboxReplyWorkspaceContent = ({
  thread,
  workspaceId,
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
  const draftAutosaveController = useMyahInboxDraftAutosaveControllerContext();
  const draftKey = useMemo<MyahInboxDraftAutosaveKey>(
    () => ({ workspaceId, threadId: thread.id }),
    [thread.id, workspaceId],
  );
  const draftEntry = useAtomValue(
    myahInboxDraftAutosaveFamilyState.atomFamily(draftKey),
  );
  const [isApplyingProposal, setIsApplyingProposal] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!draftRecord) {
      return;
    }

    draftAutosaveController.reconcile({
      key: draftKey,
      revision: draftRecord.myahReplyDraftRevision,
      body: draftRecord.myahReplyDraftBody,
    });
  }, [draftAutosaveController, draftKey, draftRecord]);

  if (draftLoading || !draftEntry) {
    return <StyledStatus role="status">Loading shared draft</StyledStatus>;
  }

  const handleApplyProposal = (body: MyahInboxRichText) => {
    setIsApplyingProposal(true);

    void draftAutosaveController
      .applyProposal({ key: draftKey, body })
      .finally(() => setIsApplyingProposal(false));
  };

  return (
    <MyahInboxProposalPreview
      threadId={thread.id}
      disabled={
        isApplyingProposal ||
        isSending ||
        draftEntry.status === 'saving' ||
        draftEntry.status === 'error' ||
        draftEntry.status === 'conflict'
      }
      onApply={handleApplyProposal}
      renderGenerateAction={(generateAction) => (
        <MyahInboxDraftEditor
          entry={draftEntry}
          onDraftChange={(body) =>
            draftAutosaveController.updateDraft({ key: draftKey, body })
          }
          onRetry={() => {
            void draftAutosaveController.retry(draftKey);
          }}
          onReloadConflict={() =>
            draftAutosaveController.reloadConflict(draftKey)
          }
          actions={
            <>
              {generateAction}
              <MyahInboxReplySendAction
                draftKey={draftKey}
                entry={draftEntry}
                onDraftReconciled={draftAutosaveController.reconcile}
                onSendingChange={setIsSending}
              />
            </>
          }
        />
      )}
    />
  );
};

export const MyahInboxReplyWorkspace = ({
  thread,
}: MyahInboxReplyWorkspaceProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
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
      {isMessageThreadMetadataReady && currentWorkspace ? (
        <MyahInboxReplyWorkspaceContent
          thread={thread}
          workspaceId={currentWorkspace.id}
        />
      ) : (
        <StyledStatus role="status">Loading shared draft</StyledStatus>
      )}
    </StyledReplyWorkspace>
  );
};
