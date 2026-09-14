import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';

const StyledMessageRow = styled.article<{
  $isOutbound: boolean;
  $isUnknown: boolean;
}>`
  align-self: ${({ $isOutbound, $isUnknown }) =>
    $isUnknown ? 'center' : $isOutbound ? 'flex-end' : 'flex-start'};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  max-width: 82%;
`;

const StyledInitial = styled.span<{ $hidden: boolean }>`
  align-self: flex-end;
  background: ${themeCssVariables.background.transparent.lighter};
  border-radius: 50%;
  color: ${themeCssVariables.font.color.secondary};
  display: grid;
  flex: 0 0 ${themeCssVariables.spacing[6]};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  height: ${themeCssVariables.spacing[6]};
  place-items: center;
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
`;

const StyledMessage = styled.div`
  overflow-wrap: anywhere;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
`;

const StyledInboundMessage = styled(StyledMessage)<{ $grouped: boolean }>`
  background: ${themeCssVariables.background.transparent.lighter};
  border-bottom-left-radius: ${themeCssVariables.border.radius.lg};
  border-bottom-right-radius: ${themeCssVariables.border.radius.lg};
  border-top-left-radius: ${({ $grouped }) =>
    $grouped
      ? themeCssVariables.border.radius.sm
      : themeCssVariables.border.radius.lg};
  border-top-right-radius: ${themeCssVariables.border.radius.lg};
  color: ${themeCssVariables.font.color.primary};
`;

const StyledOutboundMessage = styled(StyledMessage)<{ $grouped: boolean }>`
  background: ${themeCssVariables.tag.background.violet};
  border-bottom-left-radius: ${themeCssVariables.border.radius.lg};
  border-bottom-right-radius: ${themeCssVariables.border.radius.lg};
  border-top-left-radius: ${themeCssVariables.border.radius.lg};
  border-top-right-radius: ${({ $grouped }) =>
    $grouped
      ? themeCssVariables.border.radius.sm
      : themeCssVariables.border.radius.lg};
  color: ${themeCssVariables.tag.text.violet};
`;

const StyledUnknownMessage = styled(StyledMessage)`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.lg};
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledMetadata = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  display: block;
  font-size: ${themeCssVariables.font.size.xs};
  margin-top: ${themeCssVariables.spacing[1]};
`;

type MyahInboxInstagramMessageProps = {
  message: MyahInstagramConversationMessage;
  groupedWithPrevious?: boolean;
  inboundSenderName?: string | null;
};

const getExactTimestamp = (message: MyahInstagramConversationMessage) =>
  message.providerCreatedAt ?? message.createdAt;

const getInitials = (name: string | null | undefined) => {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.length === 0
    ? 'IG'
    : parts
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');
};

export const MyahInboxInstagramMessage = ({
  message,
  groupedWithPrevious = false,
  inboundSenderName,
}: MyahInboxInstagramMessageProps) => {
  const isOutbound = message.direction === 'OUTBOUND';
  const isUnknown = message.direction === 'UNKNOWN';
  const direction =
    message.direction.charAt(0) + message.direction.slice(1).toLowerCase();
  const timestamp = getExactTimestamp(message);
  const validTimestamp = !Number.isNaN(Date.parse(timestamp));
  const MessageBubble = isUnknown
    ? StyledUnknownMessage
    : isOutbound
      ? StyledOutboundMessage
      : StyledInboundMessage;

  return (
    <StyledMessageRow
      $isOutbound={isOutbound}
      $isUnknown={isUnknown}
      aria-label={`${direction} Instagram message`}
      data-instagram-message-id={message.id}
    >
      {message.direction === 'INBOUND' ? (
        <StyledInitial $hidden={groupedWithPrevious} aria-hidden="true">
          {getInitials(inboundSenderName)}
        </StyledInitial>
      ) : null}
      <MessageBubble $grouped={groupedWithPrevious}>
        <span>{message.text || 'No message text.'}</span>
        {message.hasAttachments ? (
          <StyledMetadata>
            Attachments are not supported ({message.attachmentCount}).
          </StyledMetadata>
        ) : null}
        <StyledMetadata>
          <time
            aria-label={
              validTimestamp
                ? new Date(timestamp).toLocaleString()
                : 'Unknown time'
            }
            dateTime={validTimestamp ? timestamp : undefined}
          >
            {validTimestamp
              ? new Date(timestamp).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'Unknown time'}
          </time>
        </StyledMetadata>
      </MessageBubble>
    </StyledMessageRow>
  );
};
