import { EmailThreadMessage } from '@/activities/emails/components/EmailThreadMessage';
import { useEmailThread } from '@/activities/emails/hooks/useEmailThread';
import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';

const StyledThreadPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledHeader = styled.header`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
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

const StyledFooter = styled.footer`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[2]};
`;

type MyahInboxThreadPanelProps = {
  thread: MyahInboxThread | null;
};

export const MyahInboxThreadPanel = ({ thread }: MyahInboxThreadPanelProps) => {
  const { messages, threadLoading, fetchMoreMessages } = useEmailThread(
    thread?.id ?? null,
  );

  if (!thread) {
    return (
      <StyledThreadPanel aria-label="Conversation">
        <StyledStatus>Select a conversation to read its history.</StyledStatus>
      </StyledThreadPanel>
    );
  }

  return (
    <StyledThreadPanel aria-label="Conversation">
      <StyledHeader>
        <StyledSubject>{thread.subject || 'No subject'}</StyledSubject>
        <StyledContext>
          {thread.creator?.name ?? 'Unmatched creator'}
          {thread.campaign?.name ? ` · ${thread.campaign.name}` : ''}
        </StyledContext>
      </StyledHeader>
      {threadLoading ? (
        <StyledStatus role="status">Loading conversation history</StyledStatus>
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
      <StyledFooter>
        <Button
          title="Load older messages"
          variant="secondary"
          size="small"
          onClick={fetchMoreMessages}
          disabled={threadLoading}
        />
      </StyledFooter>
    </StyledThreadPanel>
  );
};
