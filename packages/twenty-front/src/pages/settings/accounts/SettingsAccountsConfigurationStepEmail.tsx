import { Trans, useLingui } from '@lingui/react/macro';

import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { SettingsAccountsMessageChannelDetails } from '@/settings/accounts/components/SettingsAccountsMessageChannelDetails';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';

type SettingsAccountsConfigurationStepEmailProps = {
  messageChannel: MessageChannel;
  isSubmitting: boolean;
  onAddAccount: () => void;
};

export const SettingsAccountsConfigurationStepEmail = ({
  messageChannel,
  isSubmitting,
  onAddAccount,
}: SettingsAccountsConfigurationStepEmailProps) => {
  const { t } = useLingui();

  return (
    <SettingsPageLayout
      title={t`1. Email`}
      links={[
        {
          children: <Trans>User</Trans>,
          href: getSettingsPath(SettingsPath.ProfilePage),
        },
        {
          children: <Trans>Account</Trans>,
          href: getSettingsPath(SettingsPath.Accounts),
        },
        {
          children: t`1. Email`,
        },
      ]}
      actionButton={
        <Button
          Icon={IconPlus}
          title={t`Add account`}
          accent="brand"
          size="small"
          variant="primary"
          onClick={onAddAccount}
          disabled={isSubmitting}
        />
      }
    >
      <SettingsPageContainer>
        <SettingsAccountsMessageChannelDetails
          messageChannel={messageChannel}
        />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
