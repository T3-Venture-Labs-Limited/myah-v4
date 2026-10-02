import { ApplicationRegistrationService } from 'src/engine/core-modules/application/application-registration/application-registration.service';
import { OAuthService } from 'src/engine/core-modules/application/application-oauth/oauth.service';

const retiredId = 'a51fd2e5-b101-48f2-b1f8-cbc0a591e8ef';
const retainedId = '4738ebcd-6662-4ecc-a190-374fa0525951';

const setup = (universalIdentifier: string) => {
  const registration = {
    id: 'registration-id',
    universalIdentifier,
    oAuthClientId: 'client-id',
    oAuthClientSecretHash: 'hash',
    oAuthScopes: ['read'],
    name: 'Installed app',
  };
  const registrationRepository = {
    findOne: jest.fn().mockResolvedValue(registration),
  };
  const registrationService = new ApplicationRegistrationService(
    registrationRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(registrationService, 'verifyClientSecret').mockResolvedValue(true);
  const appTokenRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'auth-code-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      userId: 'user-id',
      workspaceId: 'workspace-id',
      context: {
        clientId: 'client-id',
        redirectUri: 'https://app.example/callback',
      },
    }),
    update: jest.fn(),
  };
  const applicationRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
  };
  const userWorkspaceRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'user-workspace-id' }),
  };
  const applicationService = {
    create: jest.fn().mockResolvedValue({ id: 'installed-id' }),
  };
  const applicationInstallService = {
    installApplication: jest.fn(),
  };
  const applicationTokenService = {
    generateApplicationTokenPair: jest.fn().mockResolvedValue({
      applicationAccessToken: { token: 'access' },
      applicationRefreshToken: { token: 'refresh' },
    }),
    generateApplicationAccessToken: jest.fn().mockResolvedValue({
      token: 'access',
    }),
  };
  const oauth = new OAuthService(
    appTokenRepository as never,
    applicationRepository as never,
    userWorkspaceRepository as never,
    applicationTokenService as never,
    registrationService,
    applicationService as never,
    applicationInstallService as never,
    { get: jest.fn().mockReturnValue('1h') } as never,
  );

  return {
    registrationService,
    registrationRepository,
    appTokenRepository,
    applicationRepository,
    applicationService,
    applicationInstallService,
    applicationTokenService,
    oauth,
  };
};

describe('retired Shopify OAuth registration', () => {
  it('hides the retired registration from both authorization and the public consent lookup', async () => {
    const shopify = setup(retiredId);
    await expect(
      shopify.registrationService.findOneByClientId('client-id'),
    ).resolves.toBeNull();
    await expect(
      shopify.registrationService.findPublicByClientId('client-id'),
    ).resolves.toBeNull();
    expect(shopify.registrationRepository.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.arrayContaining(['universalIdentifier']),
      }),
    );

    const instagram = setup(retainedId);
    await expect(
      instagram.registrationService.findOneByClientId('client-id'),
    ).resolves.toMatchObject({ universalIdentifier: retainedId });
    await expect(
      instagram.registrationService.findPublicByClientId('client-id'),
    ).resolves.toMatchObject({ name: 'Installed app' });
  });

  it('refuses an old Shopify authorization code before revocation or installation', async () => {
    const {
      oauth,
      appTokenRepository,
      applicationRepository,
      applicationService,
      applicationInstallService,
      applicationTokenService,
    } = setup(retiredId);
    await expect(
      oauth.exchangeAuthorizationCode({
        authorizationCode: 'old-code',
        clientId: 'client-id',
        clientSecret: 'valid-secret',
        redirectUri: 'https://app.example/callback',
      }),
    ).resolves.toMatchObject({ error: 'invalid_client' });
    expect(appTokenRepository.findOne).not.toHaveBeenCalled();
    expect(appTokenRepository.update).not.toHaveBeenCalled();
    expect(applicationRepository.findOne).not.toHaveBeenCalled();
    expect(applicationInstallService.installApplication).not.toHaveBeenCalled();
    expect(applicationService.create).not.toHaveBeenCalled();
    expect(
      applicationTokenService.generateApplicationTokenPair,
    ).not.toHaveBeenCalled();
  });

  it('exchanges a retained app code for an existing installation', async () => {
    const {
      oauth,
      appTokenRepository,
      applicationRepository,
      applicationService,
      applicationInstallService,
      applicationTokenService,
    } = setup(retainedId);
    applicationRepository.findOne.mockResolvedValue({
      id: 'installed-id',
      applicationRegistrationId: 'registration-id',
    });
    await expect(
      oauth.exchangeAuthorizationCode({
        authorizationCode: 'valid-code',
        clientId: 'client-id',
        clientSecret: 'valid-secret',
        redirectUri: 'https://app.example/callback',
      }),
    ).resolves.toMatchObject({ access_token: 'access' });
    expect(appTokenRepository.update).toHaveBeenCalledTimes(1);
    expect(applicationInstallService.installApplication).not.toHaveBeenCalled();
    expect(applicationService.create).not.toHaveBeenCalled();
    expect(
      applicationTokenService.generateApplicationTokenPair,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'installed-id',
        workspaceId: 'workspace-id',
      }),
    );
  });

  it('refuses retired client credentials without querying installations or signing', async () => {
    const { oauth, applicationRepository, applicationTokenService } =
      setup(retiredId);
    await expect(
      oauth.clientCredentialsGrant({
        clientId: 'client-id',
        clientSecret: 'old-secret',
      }),
    ).resolves.toMatchObject({ error: 'invalid_client' });
    expect(applicationRepository.find).not.toHaveBeenCalled();
    expect(
      applicationTokenService.generateApplicationAccessToken,
    ).not.toHaveBeenCalled();
  });

  it('preserves retained client-credentials issuance', async () => {
    const { oauth, applicationRepository } = setup(retainedId);
    applicationRepository.find.mockResolvedValue([
      { id: 'installed-id', workspaceId: 'workspace-id' },
    ]);
    await expect(
      oauth.clientCredentialsGrant({
        clientId: 'client-id',
        clientSecret: 'valid-secret',
      }),
    ).resolves.toMatchObject({ access_token: 'access' });
  });
});
