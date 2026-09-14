import { type Response } from 'express';

import { MicrosoftAPIsAuthController } from 'src/engine/core-modules/auth/controllers/microsoft-apis-auth.controller';
import { type APIsOAuthRequest } from 'src/engine/core-modules/auth/types/apis-oauth-request.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

const WORKSPACE = {
  customDomain: null,
  id: 'workspace-id',
  subdomain: 'myah',
} as WorkspaceEntity;

const CONNECTED_ACCOUNT_ID = '0560dffc-4a79-4c13-9a11-df2745eab756';

const buildWorkspaceURL = jest.fn(({ pathname }: { pathname: string }) => {
  const url = new URL('https://myah.example.com');

  url.pathname = pathname;

  return url;
});

const createController = () => {
  const microsoftAPIsService = {
    refreshMicrosoftRefreshToken: jest
      .fn()
      .mockResolvedValue(CONNECTED_ACCOUNT_ID),
  };
  const transientTokenService = {
    verifyTransientToken: jest.fn().mockResolvedValue({
      userId: 'user-id',
      workspaceId: WORKSPACE.id,
      workspaceMemberId: 'workspace-member-id',
    }),
  };
  const onboardingService = {
    completeOnboardingConnectAccountStep: jest.fn(),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue(WORKSPACE),
  };

  return {
    controller: new MicrosoftAPIsAuthController(
      microsoftAPIsService as never,
      transientTokenService as never,
      { get: jest.fn().mockReturnValue('default') } as never,
      { buildWorkspaceURL } as never,
      onboardingService as never,
      { getRedirectErrorUrlAndCaptureExceptions: jest.fn() } as never,
      workspaceRepository as never,
    ),
  };
};

const buildRequest = (redirectLocation?: string): APIsOAuthRequest =>
  ({
    user: {
      accessToken: 'access-token',
      emails: [{ value: 'sender@example.com' }],
      picture: null,
      redirectLocation,
      refreshToken: 'refresh-token',
      transientToken: 'transient-token',
    },
  }) as unknown as APIsOAuthRequest;

const createResponse = () => ({ redirect: jest.fn() }) as unknown as Response;

describe('MicrosoftAPIsAuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves the Campaign Operations query and hash after a successful callback', async () => {
    const { controller } = createController();
    const response = createResponse();

    await controller.MicrosoftAuthGetAccessToken(
      buildRequest(
        '/object/campaign/campaign-1?linkConnectedAccount=1#operations',
      ),
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      `https://myah.example.com/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=${CONNECTED_ACCOUNT_ID}#operations`,
    );
  });

  it.each(['/onboarding', '/settings/accounts'])(
    'redirects to the same-origin relative location %s',
    async (redirectLocation) => {
      const { controller } = createController();
      const response = createResponse();

      await controller.MicrosoftAuthGetAccessToken(
        buildRequest(redirectLocation),
        response,
      );

      expect(response.redirect).toHaveBeenCalledWith(
        `https://myah.example.com${redirectLocation}?connectedAccountId=${CONNECTED_ACCOUNT_ID}`,
      );
    },
  );

  it('uses the Settings account fallback when no return location is supplied', async () => {
    const { controller } = createController();
    const response = createResponse();

    await controller.MicrosoftAuthGetAccessToken(buildRequest(), response);

    expect(response.redirect).toHaveBeenCalledWith(
      `https://myah.example.com/settings/accounts/configuration/${CONNECTED_ACCOUNT_ID}`,
    );
  });

  it('returns a Campaign callback failure to the safe Campaign location without linking', async () => {
    const { controller } = createController();
    const response = createResponse();
    (
      controller as unknown as {
        microsoftAPIsService: { refreshMicrosoftRefreshToken: jest.Mock };
      }
    ).microsoftAPIsService.refreshMicrosoftRefreshToken.mockRejectedValueOnce(
      new Error('provider refused'),
    );

    await controller.MicrosoftAuthGetAccessToken(
      buildRequest(
        '/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=old#operations',
      ),
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      'https://myah.example.com/object/campaign/campaign-1?emailAccountConnectionFailed=1#operations',
    );
  });

  it.each([
    'https://evil.example/object/campaign/campaign-1',
    '//evil.example/object/campaign/campaign-1',
    '/object/campaign/%',
  ])('rejects unsafe return location %s', async (redirectLocation) => {
    const { controller } = createController();
    const response = createResponse();

    await controller.MicrosoftAuthGetAccessToken(
      buildRequest(redirectLocation),
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      `https://myah.example.com/settings/accounts/configuration/${CONNECTED_ACCOUNT_ID}`,
    );
  });
});
