import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { SettingsAccountsMessageChannelsContainer } from '@/settings/accounts/components/SettingsAccountsMessageChannelsContainer';
import { render, screen } from '@testing-library/react';

jest.mock('@/settings/components/layout/useSettingsActiveTabId', () => ({
  useSettingsActiveTabId: () => 'channel-id',
}));

jest.mock(
  '@/settings/accounts/components/SettingsAccountsSelectedMessageChannelEffect',
  () => ({ SettingsAccountsSelectedMessageChannelEffect: () => null }),
);

jest.mock(
  '@/settings/accounts/components/SettingsAccountsMessageChannelDetails',
  () => ({ SettingsAccountsMessageChannelDetails: () => <div>Details</div> }),
);

jest.mock(
  '@/settings/accounts/components/SettingsAccountSendingPolicy',
  () => ({
    SettingsAccountSendingPolicy: ({
      connectedAccountId,
      dailySendLimit,
      minimumSendIntervalMs,
    }: {
      connectedAccountId: string;
      dailySendLimit: number;
      minimumSendIntervalMs: number;
    }) => (
      <div>{`${connectedAccountId}:${dailySendLimit}:${minimumSendIntervalMs}`}</div>
    ),
  }),
);

jest.mock('@/settings/accounts/hooks/useMyConnectedAccounts', () => ({
  useMyConnectedAccounts: () => ({
    accounts: [
      {
        id: 'account-id',
        archivedAt: null,
        dailySendLimit: 75,
        minimumSendIntervalMs: 120_000,
      },
    ],
    loading: false,
  }),
}));

describe('SettingsAccountsMessageChannelsContainer', () => {
  it('shows the active channel connected account sending policy', () => {
    render(
      <SettingsAccountsMessageChannelsContainer
        messageChannels={
          [
            {
              id: 'channel-id',
              connectedAccountId: 'account-id',
            },
          ] as MessageChannel[]
        }
      />,
    );

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('account-id:75:120000')).toBeInTheDocument();
  });
});
