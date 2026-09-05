import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';

const StyledMessage = styled.article`
  align-self: flex-start;
  background: ${themeCssVariables.background.transparent.lighter};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  max-width: 80%;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledOutboundMessage = styled(StyledMessage)`
  align-self: flex-end;
`;

const StyledMetadata = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

type MyahInboxInstagramMessageProps = {
  message: MyahInstagramConversationMessage;
};

export const MyahInboxInstagramMessage = ({
  message,
}: MyahInboxInstagramMessageProps) => {
  const MessageContainer =
    message.direction === 'OUTBOUND' ? StyledOutboundMessage : StyledMessage;
  const direction =
    message.direction.charAt(0) + message.direction.slice(1).toLowerCase();
  const delivery =
    message.deliveryState.charAt(0) +
    message.deliveryState.slice(1).toLowerCase();

  return (
    <MessageContainer aria-label={`${direction} Instagram message`}>
      <span>{message.text || 'No message text.'}</span>
      {message.hasAttachments && (
        <StyledMetadata>
          Attachments are not supported ({message.attachmentCount}).
        </StyledMetadata>
      )}
      <StyledMetadata>{delivery}</StyledMetadata>
    </MessageContainer>
  );
};
