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
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

type MyahInboxInstagramTimelineProps = {
  channelState: MyahInboxInstagramChannelState;
  messages: MyahInstagramConversationMessage[];
  error?: string | null;
  provider?: 'COMPOSIO_HISTORY' | 'UNIPILE';
  lifecycle?: 'ACTIVE' | 'HISTORICAL';
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export const MyahInboxInstagramTimeline = ({
  channelState,
  messages,
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

  if (error) {
    return <StyledStatus role="alert">{error}</StyledStatus>;
  }

  const isComposioHistory =
    provider === 'COMPOSIO_HISTORY' ||
    lifecycle === 'HISTORICAL' ||
    (messages.length > 0 &&
      messages.every((message) => message.provider === 'COMPOSIO_HISTORY'));

  return (
    <StyledTimeline aria-label="Instagram conversation">
      {channelState === 'AMBIGUOUS' ? (
        <StyledStatus>
          Multiple Instagram conversations found (read-only).
        </StyledStatus>
      ) : isComposioHistory ? (
        <StyledStatus>Read-only Instagram history</StyledStatus>
      ) : (
        <StyledStatus>Unipile Instagram (active)</StyledStatus>
      )}
      {messages.map((message) => (
        <MyahInboxInstagramMessage key={message.id} message={message} />
      ))}
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
    </StyledTimeline>
  );
};
