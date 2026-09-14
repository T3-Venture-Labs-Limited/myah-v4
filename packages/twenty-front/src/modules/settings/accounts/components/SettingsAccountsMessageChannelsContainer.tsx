import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { SettingsAccountSendingPolicy } from '@/settings/accounts/components/SettingsAccountSendingPolicy';
import { SettingsAccountsMessageChannelDetails } from '@/settings/accounts/components/SettingsAccountsMessageChannelDetails';
import { SettingsAccountsSelectedMessageChannelEffect } from '@/settings/accounts/components/SettingsAccountsSelectedMessageChannelEffect';
import { SETTINGS_ACCOUNT_MESSAGE_CHANNELS_TAB_LIST_COMPONENT_ID } from '@/settings/accounts/constants/SettingsAccountMessageChannelsTabListComponentId';
import { useMyConnectedAccounts } from '@/settings/accounts/hooks/useMyConnectedAccounts';
import { useSettingsActiveTabId } from '@/settings/components/layout/useSettingsActiveTabId';
import React from 'react';

type SettingsAccountsMessageChannelsContainerProps = {
  messageChannels: MessageChannel[];
};

export const SettingsAccountsMessageChannelsContainer = ({
  messageChannels,
}: SettingsAccountsMessageChannelsContainerProps) => {
  const activeTabId = useSettingsActiveTabId(
    SETTINGS_ACCOUNT_MESSAGE_CHANNELS_TAB_LIST_COMPONENT_ID,
    messageChannels.map((channel) => channel.id),
  );
  const { accounts } = useMyConnectedAccounts();

  return (
    <>
      <SettingsAccountsSelectedMessageChannelEffect
        messageChannels={messageChannels}
      />
      {messageChannels.map((messageChannel) => {
        const connectedAccount = accounts.find(
          (account) =>
            account.id === messageChannel.connectedAccountId &&
            account.archivedAt === null,
        );

        return (
          <React.Fragment key={messageChannel.id}>
            {messageChannel.id === activeTabId && (
              <>
                <SettingsAccountsMessageChannelDetails
                  messageChannel={messageChannel}
                />
                {connectedAccount && (
                  <SettingsAccountSendingPolicy
                    connectedAccountId={connectedAccount.id}
                    dailySendLimit={connectedAccount.dailySendLimit}
                    minimumSendIntervalMs={
                      connectedAccount.minimumSendIntervalMs
                    }
                  />
                )}
              </>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};
