import { type ConnectedAccount } from '@/accounts/types/ConnectedAccount';
import { GET_MY_CONNECTED_ACCOUNTS } from '@/settings/accounts/graphql/queries/getMyConnectedAccounts';
import { useMyMessageChannels } from '@/settings/accounts/hooks/useMyMessageChannels';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { useMemo } from 'react';
import { ConnectedAccountProvider } from 'twenty-shared/types';

type CoreConnectedAccount = Omit<
  ConnectedAccount,
  'messageChannels' | 'calendarChannels'
>;

const EMAIL_PROVIDERS: ReadonlySet<ConnectedAccountProvider> = new Set([
  ConnectedAccountProvider.GOOGLE,
  ConnectedAccountProvider.MICROSOFT,
  ConnectedAccountProvider.IMAP_SMTP_CALDAV,
]);

// SSO providers and app-managed OAuth live in connectedAccount too, but this
// page only surfaces email credentials.
export const useMyConnectedAccounts = () => {
  const apolloClient = useApolloClient();

  const { data, loading: accountsLoading } = useQuery<{
    myConnectedAccounts: CoreConnectedAccount[];
  }>(GET_MY_CONNECTED_ACCOUNTS, {
    client: apolloClient,
  });

  const { channels: messageChannels, loading: messageChannelsLoading } =
    useMyMessageChannels();
  const accounts = useMemo<ConnectedAccount[]>(() => {
    if (!data?.myConnectedAccounts) {
      return [];
    }

    return data.myConnectedAccounts
      .filter((account) => EMAIL_PROVIDERS.has(account.provider))
      .map((account) => ({
        ...account,
        messageChannels: messageChannels.filter(
          (channel) => channel.connectedAccountId === account.id,
        ),
        calendarChannels: [],
      }));
  }, [data, messageChannels]);

  return {
    accounts,
    loading: accountsLoading || messageChannelsLoading,
  };
};
