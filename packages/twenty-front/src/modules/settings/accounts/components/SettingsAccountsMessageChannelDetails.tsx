import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';

import { MessageChannelType } from 'twenty-shared/types';
import { IconUsers } from 'twenty-ui/icon';
import { Section } from 'twenty-ui/layout';
import { Card } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { UPDATE_MESSAGE_CHANNEL } from '@/settings/accounts/graphql/mutations/updateMessageChannel';
import { SettingsOptionCardContentToggle } from '@/settings/components/SettingsOptions/SettingsOptionCardContentToggle';

type SettingsAccountsMessageChannelDetailsProps = {
  messageChannel: Pick<
    MessageChannel,
    | 'id'
    | 'visibility'
    | 'contactAutoCreationPolicy'
    | 'excludeNonProfessionalEmails'
    | 'excludeGroupEmails'
    | 'isSyncEnabled'
    | 'messageFolderImportPolicy'
    | 'type'
  >;
};

const StyledDetailsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
`;

// Myah only shows creators' mail, so Twenty's folder import, visibility,
// contact auto-creation and non-professional-email settings are not offered
// (MYAH-469). The channel keeps its existing values.
export const SettingsAccountsMessageChannelDetails = ({
  messageChannel,
}: SettingsAccountsMessageChannelDetailsProps) => {
  const [updateMessageChannel] = useMutation(UPDATE_MESSAGE_CHANNEL);

  const handleIsGroupEmailExcludedToggle = (value: boolean) => {
    updateMessageChannel({
      variables: {
        input: { id: messageChannel.id, update: { excludeGroupEmails: value } },
      },
    });
  };

  if (messageChannel.type === MessageChannelType.EMAIL_GROUP) {
    return null;
  }

  return (
    <StyledDetailsContainer>
      <Section>
        <Card rounded>
          <SettingsOptionCardContentToggle
            Icon={IconUsers}
            title={t`Exclude group emails`}
            description={t`Don't sync emails from team@ support@ noreply@...`}
            checked={messageChannel.excludeGroupEmails}
            onChange={() =>
              handleIsGroupEmailExcludedToggle(
                !messageChannel.excludeGroupEmails,
              )
            }
          />
        </Card>
      </Section>
    </StyledDetailsContainer>
  );
};
