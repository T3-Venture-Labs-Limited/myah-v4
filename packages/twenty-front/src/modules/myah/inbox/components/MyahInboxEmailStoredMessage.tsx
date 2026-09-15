import { styled } from '@linaria/react';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { Avatar } from 'twenty-ui/data-display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { EmailThreadMessageBody } from '@/activities/emails/components/EmailThreadMessageBody';
import { EmailThreadMessageLayout } from '@/activities/emails/components/EmailThreadMessageLayout';
import { type MyahInboxEmailStoredMessageFieldsFragment } from '~/generated/graphql';

const StyledMessage = styled.article`
  min-width: 0;
  overflow-wrap: anywhere;
  padding: ${themeCssVariables.spacing[2]};
  & * {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  & header {
    display: flex;
    flex-wrap: wrap;
    gap: ${themeCssVariables.spacing[2]};
  }
`;
const StyledSenderHeader = styled.header`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;
const StyledSenderAvatar = styled.span`
  flex-shrink: 0;
`;
const StyledSenderTimestamp = styled.time`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;
export type MyahInboxEmailStoredMessageProps = {
  message: MyahInboxEmailStoredMessageFieldsFragment;
};
export const MyahInboxEmailStoredMessage = ({
  message,
}: MyahInboxEmailStoredMessageProps) => {
  const sender = message.participants.find(
    ({ role }) => role.toUpperCase() === 'FROM',
  );
  const senderName = sender?.displayName || sender?.handle || 'Unknown sender';
  const header = (
    <StyledSenderHeader>
      <StyledSenderAvatar aria-label={`${senderName} avatar`} role="img">
        <Avatar
          avatarUrl={null}
          placeholder={senderName}
          placeholderColorSeed={sender?.handle || senderName}
          size="sm"
          type="rounded"
        />
      </StyledSenderAvatar>
      <strong>{senderName}</strong>
      <StyledSenderTimestamp dateTime={message.receivedAt}>
        {new Date(message.receivedAt).toLocaleString()}
      </StyledSenderTimestamp>
    </StyledSenderHeader>
  );
  const restricted =
    message.visibility !== 'FULL' ||
    message.text === FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
  return (
    <StyledMessage
      aria-label="Email message"
      data-message-id={message.id}
      tabIndex={-1}
    >
      <EmailThreadMessageLayout header={header}>
        {restricted ? (
          <p>Message content is restricted.</p>
        ) : message.text ? (
          <EmailThreadMessageBody body={message.text} isDisplayed />
        ) : (
          <p>No message body.</p>
        )}
      </EmailThreadMessageLayout>
    </StyledMessage>
  );
};
