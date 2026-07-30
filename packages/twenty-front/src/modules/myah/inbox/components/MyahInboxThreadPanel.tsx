import { EmailThreadMessage } from '@/activities/emails/components/EmailThreadMessage';
import { useEmailThread } from '@/activities/emails/hooks/useEmailThread';
import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';
import { MyahInboxThreadActions } from '@/myah/inbox/components/MyahInboxThreadActions';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useEffect, useState } from 'react';
import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledThreadPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledHeader = styled.header`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledHeaderDetails = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledHeaderActions = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSubject = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledContext = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledMessages = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const StyledStatus = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
`;

type MyahInboxThreadPanelProps = {
  thread: MyahInboxThread | null;
  onThreadUpdated: (message: string) => void;
};

type MyahInboxThreadPanelContentProps = {
  thread: MyahInboxThread;
  onThreadUpdated: (message: string) => void;
};

const MyahInboxThreadPanelContent = ({
  thread,
  onThreadUpdated,
}: MyahInboxThreadPanelContentProps) => {
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const {
    messages,
    threadLoading,
    hasNextPage,
    isMessagesFetchComplete,
    historyError,
    refetchMessages,
    fetchMoreMessages,
  } = useEmailThread(thread.id);

  useEffect(() => {
    if (!threadLoading && !historyError && hasNextPage) {
      fetchMoreMessages();
    }
  }, [fetchMoreMessages, hasNextPage, historyError, threadLoading]);

  const handleThreadUpdated = (message: string) => {
    setUpdateStatus(message);
    onThreadUpdated(message);
  };

  return (
    <StyledThreadPanel aria-label="Conversation">
      <StyledHeader>
        <StyledHeaderDetails>
          <StyledSubject>{thread.subject || 'No subject'}</StyledSubject>
          <StyledContext>
            {thread.creator?.name ?? 'Unlinked creator'}
            {thread.campaign?.name ? ` · ${thread.campaign.name}` : ''}
          </StyledContext>
          {updateStatus && (
            <StyledContext role="status">{updateStatus}</StyledContext>
          )}
        </StyledHeaderDetails>
        <StyledHeaderActions>
          <MyahInboxThreadActions
            thread={thread}
            onThreadUpdated={handleThreadUpdated}
            onUpdateFailed={setUpdateStatus}
          />
        </StyledHeaderActions>
      </StyledHeader>
      {threadLoading ? (
        <StyledStatus role="status">Loading conversation history</StyledStatus>
      ) : historyError ? (
        <StyledStatus role="status">
          Unable to load conversation history.
          <Button
            title="Retry conversation history"
            variant="secondary"
            size="small"
            onClick={refetchMessages}
          />
        </StyledStatus>
      ) : messages.length === 0 ? (
        <StyledStatus>No visible messages in this conversation.</StyledStatus>
      ) : (
        <StyledMessages aria-label="Email messages">
          {messages.map((message, index) => (
            <EmailThreadMessage
              key={message.id}
              message={message}
              isExpanded={index === messages.length - 1}
              hideBottomBorder={index === messages.length - 1}
              onDraftClick={() => undefined}
            />
          ))}
        </StyledMessages>
      )}
      {!threadLoading && isMessagesFetchComplete && !historyError && (
        <MyahInboxReplyWorkspace key={thread.id} thread={thread} />
      )}
    </StyledThreadPanel>
  );
};

export const MyahInboxThreadPanel = ({
  thread,
  onThreadUpdated,
}: MyahInboxThreadPanelProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const isMessageThreadMetadataReady = objectMetadataItems.some(
    (item) => item.nameSingular === 'messageThread',
  );

  if (!thread) {
    return (
      <StyledThreadPanel aria-label="Conversation">
        <StyledStatus>Select a conversation to read its history.</StyledStatus>
      </StyledThreadPanel>
    );
  }

  if (!isMessageThreadMetadataReady) {
    return (
      <StyledThreadPanel aria-label="Conversation">
        <StyledStatus role="status">Loading conversation</StyledStatus>
      </StyledThreadPanel>
    );
  }

  return (
    <MyahInboxThreadPanelContent
      key={thread.id}
      thread={thread}
      onThreadUpdated={onThreadUpdated}
    />
  );
};
