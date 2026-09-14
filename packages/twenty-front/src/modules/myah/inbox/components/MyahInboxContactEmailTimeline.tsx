import { EmailThreadMessageBody } from '@/activities/emails/components/EmailThreadMessageBody';
import { EmailThreadMessageLayout } from '@/activities/emails/components/EmailThreadMessageLayout';
import { MyahInboxEmailSubjectSeparator } from '@/myah/inbox/components/MyahInboxEmailSubjectSeparator';
import { type MyahInboxContactEmailMessage } from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTimeline = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledScrollArea = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
`;

const StyledMessage = styled.article`
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledMessageHeader = styled.div`
  align-items: baseline;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledSender = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTimestamp = styled.time`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledRestrictedBody = styled.div`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledEmptyBody = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledStatus = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
`;

const StyledStatusTitle = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledLoadMore = styled.div`
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[3]};
`;

export type MyahInboxContactEmailTimelineProps = {
  messages: MyahInboxContactEmailMessage[];
  selectedEmailThreadId: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: { message: string } | undefined;
  hasNextPage: boolean;
  onSelectEmailThread: (messageThreadId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
};

type MyahInboxContactEmailTimelineMessageProps = {
  message: MyahInboxContactEmailMessage;
};

const getSenderLabel = (message: MyahInboxContactEmailMessage) => {
  const sender = message.participants.find(
    (participant) => participant.role === 'FROM',
  );

  return (
    sender?.displayName?.trim() || sender?.handle?.trim() || 'Unknown sender'
  );
};

const MyahInboxContactEmailTimelineMessage = ({
  message,
}: MyahInboxContactEmailTimelineMessageProps) => {
  const senderLabel = getSenderLabel(message);
  const isRestricted =
    message.visibility !== 'FULL' ||
    message.text === FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;

  return (
    <StyledMessage
      data-testid="myah-inbox-email-message"
      data-message-id={message.id}
      aria-label="Email message"
    >
      <EmailThreadMessageLayout
        header={
          <StyledMessageHeader>
            <StyledSender>
              {message.direction === 'OUTGOING'
                ? `Outgoing · ${senderLabel}`
                : senderLabel}
            </StyledSender>
            <StyledTimestamp dateTime={message.receivedAt}>
              {new Date(message.receivedAt).toLocaleString()}
            </StyledTimestamp>
          </StyledMessageHeader>
        }
      >
        {isRestricted ? (
          <StyledRestrictedBody>
            Message content is restricted.
          </StyledRestrictedBody>
        ) : message.text ? (
          <EmailThreadMessageBody body={message.text} isDisplayed />
        ) : (
          <StyledEmptyBody>No message body.</StyledEmptyBody>
        )}
      </EmailThreadMessageLayout>
    </StyledMessage>
  );
};

export const MyahInboxContactEmailTimeline = ({
  messages,
  selectedEmailThreadId,
  loading,
  loadingMore,
  error,
  hasNextPage,
  onSelectEmailThread,
  onLoadMore,
  onRetry,
}: MyahInboxContactEmailTimelineProps) => {
  const renderBody = () => {
    if (loading) {
      return <StyledStatus role="status">Loading email messages</StyledStatus>;
    }

    if (error) {
      return (
        <StyledStatus role="alert">
          <StyledStatusTitle>Could not load email history</StyledStatusTitle>
          <span>{error.message}</span>
          <Button
            title="Try again"
            variant="secondary"
            size="small"
            onClick={onRetry}
          />
        </StyledStatus>
      );
    }

    if (messages.length === 0) {
      return <StyledStatus>No email messages yet.</StyledStatus>;
    }

    return (
      <>
        {messages.map((message, index) => {
          const previousMessage = messages[index - 1];
          const visibleSubject =
            message.visibility === 'METADATA'
              ? FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED
              : message.subject;
          const previousVisibleSubject =
            previousMessage?.visibility === 'METADATA'
              ? FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED
              : previousMessage?.subject;
          const startsBoundary =
            previousMessage === undefined ||
            previousMessage.messageThreadId !== message.messageThreadId ||
            previousVisibleSubject !== visibleSubject;

          return (
            <div key={message.id}>
              {startsBoundary && (
                <MyahInboxEmailSubjectSeparator
                  messageThreadId={message.messageThreadId}
                  subject={visibleSubject}
                  detailLabel={`${getSenderLabel(message)} · ${new Date(
                    message.receivedAt,
                  ).toLocaleString()}`}
                  isSelected={message.messageThreadId === selectedEmailThreadId}
                  onSelectEmailThread={onSelectEmailThread}
                />
              )}
              <MyahInboxContactEmailTimelineMessage message={message} />
            </div>
          );
        })}
        {(hasNextPage || loadingMore) && (
          <StyledLoadMore role={loadingMore ? 'status' : undefined}>
            <Button
              title={
                loadingMore
                  ? 'Loading more email messages'
                  : 'Load more email messages'
              }
              variant="secondary"
              size="small"
              disabled={loadingMore}
              onClick={onLoadMore}
            />
          </StyledLoadMore>
        )}
      </>
    );
  };

  return (
    <StyledTimeline aria-label="Email history">
      <StyledScrollArea>{renderBody()}</StyledScrollArea>
    </StyledTimeline>
  );
};
