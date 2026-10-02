import { useLingui } from '@lingui/react/macro';
import { useNavigate, useParams } from 'react-router-dom';

import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { SettingsPath } from 'twenty-shared/types';
import { GET_MY_MESSAGE_CHANNELS } from '@/settings/accounts/graphql/queries/getMyMessageChannels';
import { useMutation, useQuery } from '@apollo/client/react';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { StartChannelSyncDocument } from '~/generated-metadata/graphql';
import { SettingsAccountsConfigurationSelectedMessageChannelEffect } from '~/pages/settings/accounts/SettingsAccountsConfigurationSelectedMessageChannelEffect';
import { SettingsAccountsConfigurationStepEmail } from '~/pages/settings/accounts/SettingsAccountsConfigurationStepEmail';

export const SettingsAccountsConfiguration = () => {
  const { t } = useLingui();
  const { connectedAccountId } = useParams<{
    connectedAccountId: string;
  }>();
  const navigate = useNavigate();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [startChannelSyncMutation, { loading: isSubmitting }] = useMutation(
    StartChannelSyncDocument,
  );

  const { data: metadataMessageChannelData } = useQuery<{
    myMessageChannels: MessageChannel[];
  }>(GET_MY_MESSAGE_CHANNELS, {
    variables: { connectedAccountId },
    skip: !connectedAccountId,
  });

  const messageChannels = metadataMessageChannelData?.myMessageChannels ?? [];

  const messageChannel = messageChannels[0];

  const handleAddAccount = async () => {
    if (!connectedAccountId) return;

    await startChannelSyncMutation({
      variables: {
        connectedAccountId,
      },
      onCompleted: () => {
        enqueueSuccessSnackBar({
          message: t`Account added successfully. Sync started.`,
        });
        navigate(getSettingsPath(SettingsPath.Accounts));
      },
      onError: (error) => {
        enqueueErrorSnackBar({
          apolloError: error,
        });
      },
    });
  };

  if (!isDefined(messageChannel)) {
    return null;
  }

  return (
    <>
      <SettingsAccountsConfigurationSelectedMessageChannelEffect
        messageChannel={messageChannel}
      />
      <SettingsAccountsConfigurationStepEmail
        messageChannel={messageChannel}
        isSubmitting={isSubmitting}
        onAddAccount={handleAddAccount}
      />
    </>
  );
};
