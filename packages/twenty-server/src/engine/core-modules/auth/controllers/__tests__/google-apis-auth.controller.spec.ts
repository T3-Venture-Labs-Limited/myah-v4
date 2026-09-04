import { type Response } from 'express';

import { GoogleAPIsAuthController } from 'src/engine/core-modules/auth/controllers/google-apis-auth.controller';
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
  const googleAPIsService = {
    refreshGoogleRefreshToken: jest
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
    controller: new GoogleAPIsAuthController(
      googleAPIsService as never,
      transientTokenService as never,
      { get: jest.fn().mockReturnValue('default') } as never,
      onboardingService as never,
      { buildWorkspaceURL } as never,
      { getRedirectErrorUrlAndCaptureExceptions: jest.fn() } as never,
      workspaceRepository as never,
    ),
    onboardingService,
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

describe('GoogleAPIsAuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves the Campaign Operations query and hash after a successful callback', async () => {
    const { controller } = createController();
    const response = createResponse();

    await controller.googleAuthGetAccessToken(
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

      await controller.googleAuthGetAccessToken(
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

    await controller.googleAuthGetAccessToken(buildRequest(), response);

    expect(response.redirect).toHaveBeenCalledWith(
      `https://myah.example.com/settings/accounts/configuration/${CONNECTED_ACCOUNT_ID}`,
    );
  });

  it.each([
    'https://evil.example/object/campaign/campaign-1',
    '//evil.example/object/campaign/campaign-1',
    '/object/campaign/%',
  ])('rejects unsafe return location %s', async (redirectLocation) => {
    const { controller } = createController();
    const response = createResponse();

    await controller.googleAuthGetAccessToken(
      buildRequest(redirectLocation),
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      `https://myah.example.com/settings/accounts/configuration/${CONNECTED_ACCOUNT_ID}`,
    );
  });
});
