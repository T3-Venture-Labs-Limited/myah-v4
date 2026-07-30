import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { getClientConfig } from '@/client-config/utils/getClientConfig';
import { getTokenPair } from '@/apollo/utils/getTokenPair';

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn(),
}));

global.fetch = jest.fn();

const mockClientConfig = {
  aiModels: [],
  billing: {
    isBillingEnabled: true,
    billingUrl: 'https://billing.example.com',
    trialPeriods: [],
  },
  authProviders: {
    google: true,
    magicLink: false,
    password: true,
    microsoft: false,
    sso: [],
  },
  signInPrefilled: false,
  isMultiWorkspaceEnabled: true,
  isEmailVerificationRequired: false,
  defaultSubdomain: 'app',
  frontDomain: 'localhost',
  support: {
    supportDriver: 'none',
    supportFrontChatId: undefined,
  },
  sentry: {
    environment: 'development',
    release: '1.0.0',
    dsn: undefined,
  },
  captcha: {
    provider: undefined,
    siteKey: undefined,
  },
  api: {
    mutationMaximumAffectedRecords: 100,
  },
  isAttachmentPreviewEnabled: true,
  analyticsEnabled: false,
  canManageFeatureFlags: true,
  publicFeatureFlags: [],
  isMicrosoftMessagingEnabled: false,
  isMicrosoftCalendarEnabled: false,
  isGoogleMessagingEnabled: false,
  isGoogleCalendarEnabled: false,
  isConfigVariablesInDbEnabled: false,
  isImapSmtpCaldavEnabled: false,
  isEmailingDomainInDemoMode: false,
  isCloudflareIntegrationEnabled: false,
  isClickHouseConfigured: false,
  isWorkspaceSchemaDDLLocked: false,
  onboarding: {},
  isTwoFactorAuthenticationEnabled: false,
  allowRequestsToTwentyIcons: false,
};

describe('getClientConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTokenPair as jest.Mock).mockReturnValue(null);
  });

  it('keeps bootstrap config available without authentication', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockClientConfig,
    });

    const result = await getClientConfig();

    expect(fetch).toHaveBeenCalledWith(
      `${REACT_APP_SERVER_BASE_URL}/client-config`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
    expect(result).toEqual(mockClientConfig);
  });

  it('sends the authenticated access token', async () => {
    (getTokenPair as jest.Mock).mockReturnValue({
      accessOrWorkspaceAgnosticToken: { token: 'access-token' },
    });
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockClientConfig,
    });

    await getClientConfig();

    expect(fetch).toHaveBeenCalledWith(
      `${REACT_APP_SERVER_BASE_URL}/client-config`,
      expect.objectContaining({
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer access-token',
        },
      }),
    );
  });

  it('rejects an unauthenticated API payload returned with HTTP 200', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [
          {
            extensions: { code: 'UNAUTHENTICATED' },
            message: 'Token has expired.',
          },
        ],
      }),
    });

    await expect(getClientConfig()).rejects.toMatchObject({
      name: 'ClientConfigUnauthenticatedError',
    });
  });

  it('rejects an unexpected HTTP-200 response body', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'unexpected' }),
    });

    await expect(getClientConfig()).rejects.toThrow(
      'Invalid client config response',
    );
  });

  it('rejects a malformed config payload with incomplete workspace settings', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aiModels: [],
        authProviders: {},
      }),
    });

    await expect(getClientConfig()).rejects.toThrow(
      'Invalid client config response',
    );
  });

  it('rejects a config payload with an invalid sign-in preference', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockClientConfig,
        signInPrefilled: 'invalid',
      }),
    });

    await expect(getClientConfig()).rejects.toThrow(
      'Invalid client config response',
    );
  });

  it('should handle fetch errors', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(getClientConfig()).rejects.toThrow(
      'Failed to fetch client config: 500 Internal Server Error',
    );
  });

  it('should handle network errors', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(getClientConfig()).rejects.toThrow('Network error');
  });
});
