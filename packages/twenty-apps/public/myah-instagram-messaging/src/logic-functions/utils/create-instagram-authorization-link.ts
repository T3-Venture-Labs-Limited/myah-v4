import { COMPOSIO_API_BASE_URL } from 'src/logic-functions/constants/composio-instagram.constants';

type ComposioConnectionResponse = {
  id?: string;
  redirect_url?: string;
};

const getRequiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to connect Instagram.`);
  }

  return value;
};

export const createInstagramAuthorizationLink = async ({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<{ connectedAccountId: string; authorizationUrl: string }> => {
  const apiKey = getRequiredEnvironmentVariable('COMPOSIO_API_KEY');
  const authConfigId = getRequiredEnvironmentVariable(
    'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID',
  );

  const response = await fetch(`${COMPOSIO_API_BASE_URL}/connected_accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      auth_config: { id: authConfigId },
      connection: {
        user_id: `workspace:${workspaceId}:instagram`,
        state: { authScheme: 'OAUTH2', val: {} },
      },
    }),
  });

  const body = (await response.json()) as ComposioConnectionResponse;

  if (!response.ok || !body.id || !body.redirect_url) {
    throw new Error('Composio could not create an Instagram authorization link.');
  }

  return {
    connectedAccountId: body.id,
    authorizationUrl: body.redirect_url,
  };
};
