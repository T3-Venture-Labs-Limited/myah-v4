import { Fragment } from 'react';

import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { MyahInboxInstagramMessage } from '@/myah/inbox/components/MyahInboxInstagramMessage';
import {
  type MyahInboxInstagramChannelState,
  type MyahInstagramConversationMessage,
} from '@/myah/inbox/types/MyahInboxContact';

const StyledTimeline = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} 0;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledTimestamp = styled.time`
  align-self: center;
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: ${themeCssVariables.spacing[2]} 0;
`;

type MyahInboxInstagramTimelineProps = {
  channelState: MyahInboxInstagramChannelState;
  messages: MyahInstagramConversationMessage[];
  inboundSenderName?: string | null;
  error?: string | null;
  provider?: 'COMPOSIO_HISTORY' | 'UNIPILE';
  lifecycle?: 'ACTIVE' | 'HISTORICAL';
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

const getTimestamp = (message: MyahInstagramConversationMessage) =>
  message.providerCreatedAt ?? message.createdAt;

const getTimestampLabel = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? 'Unknown time'
    : date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
};

const needsTimestampSeparator = (
  previous: MyahInstagramConversationMessage | undefined,
  message: MyahInstagramConversationMessage,
) => {
  if (!previous) return true;
  const previousTime = Date.parse(getTimestamp(previous));
  const messageTime = Date.parse(getTimestamp(message));
  return (
    Number.isNaN(previousTime) ||
    Number.isNaN(messageTime) ||
    new Date(previousTime).toDateString() !==
      new Date(messageTime).toDateString() ||
    messageTime - previousTime > 5 * 60 * 1000
  );
};

export const MyahInboxInstagramTimeline = ({
  channelState,
  messages,
  inboundSenderName,
  error = null,
  provider,
  lifecycle,
  hasNextPage = false,
  loadingMore = false,
  onLoadMore,
}: MyahInboxInstagramTimelineProps) => {
  if (channelState === 'UNAVAILABLE') {
    return <StyledStatus>Instagram is disconnected.</StyledStatus>;
  }

  const isComposioHistory =
    provider === 'COMPOSIO_HISTORY' ||
    lifecycle === 'HISTORICAL' ||
    (messages.length > 0 &&
      messages.every((message) => message.provider === 'COMPOSIO_HISTORY'));

  return (
    <StyledTimeline aria-label="Instagram conversation">
      {error ? <StyledStatus role="alert">{error}</StyledStatus> : null}
      {channelState === 'AMBIGUOUS' ? (
        <StyledStatus>
          Multiple Instagram conversations found (read-only).
        </StyledStatus>
      ) : isComposioHistory ? (
        <StyledStatus>Read-only Instagram history</StyledStatus>
      ) : null}
      {(hasNextPage || loadingMore) && onLoadMore ? (
        <Button
          title={
            loadingMore
              ? 'Loading more Instagram messages'
              : 'Load more Instagram messages'
          }
          variant="secondary"
          size="small"
          disabled={loadingMore}
          onClick={onLoadMore}
        />
      ) : null}
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const groupedWithPrevious =
          !needsTimestampSeparator(previous, message) &&
          previous?.direction === message.direction;
        const timestamp = getTimestamp(message);
        const validTimestamp = !Number.isNaN(Date.parse(timestamp));
        return (
          <Fragment key={message.id}>
            {needsTimestampSeparator(previous, message) ? (
              <StyledTimestamp
                aria-label={getTimestampLabel(timestamp)}
                dateTime={validTimestamp ? timestamp : undefined}
              >
                {getTimestampLabel(timestamp)}
              </StyledTimestamp>
            ) : null}
            <MyahInboxInstagramMessage
              message={message}
              groupedWithPrevious={groupedWithPrevious}
              inboundSenderName={inboundSenderName}
            />
          </Fragment>
        );
      })}
    </StyledTimeline>
  );
};
