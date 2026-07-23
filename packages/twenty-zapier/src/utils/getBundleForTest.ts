import { type Bundle } from 'zapier-platform-core';

import { type InputData } from 'src/utils/data.types';

const TEST_URL = 'http://localhost:3000';
const TEST_ORIGIN = 'http://apple.localhost:3000';

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

const requestMetadataApi = async <T>(
  query: string,
  variables: Record<string, string>,
): Promise<T> => {
  const response = await fetch(`${TEST_URL}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: TEST_ORIGIN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GraphQLResponse<T>;

  if (!response.ok || body.data === undefined) {
    throw new Error(body.errors?.[0]?.message ?? 'Metadata request failed.');
  }

  return body.data;
};

const getAdminTestToken = async (): Promise<string> => {
  const loginTokenResponse = await requestMetadataApi<{
    getLoginTokenFromCredentials: { loginToken: { token: string } };
  }>(
    `mutation GetLoginTokenFromCredentials($email: String!, $password: String!, $origin: String!) {
      getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
        loginToken {
          token
        }
      }
    }`,
    {
      email: 'jane.austen@apple.dev',
      password: 'tim@apple.dev',
      origin: TEST_ORIGIN,
    },
  );
  const loginToken =
    loginTokenResponse.getLoginTokenFromCredentials.loginToken.token;
  const authTokensResponse = await requestMetadataApi<{
    getAuthTokensFromLoginToken: {
      tokens: { accessOrWorkspaceAgnosticToken: { token: string } };
    };
  }>(
    `mutation GetAuthTokensFromLoginToken($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens {
          accessOrWorkspaceAgnosticToken {
            token
          }
        }
      }
    }`,
    { loginToken, origin: TEST_ORIGIN },
  );

  return authTokensResponse.getAuthTokensFromLoginToken.tokens
    .accessOrWorkspaceAgnosticToken.token;
};

let adminTestTokenPromise: Promise<string> | undefined;

export const getBundleForTest = async (
  inputData?: InputData,
): Promise<Bundle> => {
  adminTestTokenPromise ??= getAdminTestToken();
  const adminTestToken = await adminTestTokenPromise;

  return {
    authData: {
      apiKey: adminTestToken,
      apiUrl: TEST_URL,
    },
    inputData: inputData || {},
    cleanedRequest: {},
    inputDataRaw: {},
    meta: {
      isBulkRead: false,
      isFillingDynamicDropdown: false,
      isLoadingSample: false,
      isPopulatingDedupe: false,
      isTestingAuth: false,
      limit: 1,
      page: 1,
      timezone: null,
      inputFields: {},
    },
  };
};
