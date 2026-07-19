import { type ClientConfig } from '@/client-config/types/ClientConfig';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const getClientConfig = async (): Promise<ClientConfig> => {
  const tokenPair = getTokenPair();
  const token = tokenPair?.accessOrWorkspaceAgnosticToken?.token;
  const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/client-config`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch client config: ${response.status} ${response.statusText}`,
    );
  }

  const clientConfig: ClientConfig = await response.json();

  return clientConfig;
};
