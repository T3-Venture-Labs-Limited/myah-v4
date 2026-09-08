import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { SECRET_ENCRYPTION_ENVELOPE_V2_PREFIX } from 'src/engine/core-modules/secret-encryption/constants/secret-encryption.constant';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import {
  ConnectedAccountRefreshAccessTokenException,
  ConnectedAccountRefreshAccessTokenExceptionCode,
} from 'src/engine/metadata-modules/connected-account/exceptions/connected-account-refresh-tokens.exception';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { ConnectedAccountRefreshTokensService } from 'src/modules/connected-account/refresh-tokens-manager/services/connected-account-refresh-tokens.service';

import { GoogleOAuth2ClientProvider } from './google-oauth2-client.provider';

const FAKE_CIPHER_PREFIX = `${SECRET_ENCRYPTION_ENVELOPE_V2_PREFIX}keyid:`;

const wrap = (value: string) => `${FAKE_CIPHER_PREFIX}CIPHER(${value})`;

const buildEncryptionStub = () => ({
  decrypt: jest.fn(
    ({ ciphertext }: { ciphertext: string; workspaceId: string }) => {
      const match = ciphertext.match(
        new RegExp(`^${FAKE_CIPHER_PREFIX}CIPHER\\((.*)\\)$`),
      );

      if (!isDefined(match)) {
        throw new Error(
          `fake encryption stub: decrypt called with a non-CIPHER value: ${ciphertext}`,
        );
      }

      return match[1];
    },
  ),
});

describe('GoogleOAuth2ClientProvider', () => {
  const originalFetch = global.fetch;
  let provider: GoogleOAuth2ClientProvider;
  let connectedAccountRepository: { findOne: jest.Mock };
  let connectedAccountRefreshTokensService: { resolveTokens: jest.Mock };
  let connectedAccountTokenEncryptionService: { decrypt: jest.Mock };

  const mockWorkspaceId = 'workspace-123';
  const mockConnectedAccountId = 'account-456';
  const mockRefreshTokenPlaintext = 'valid-refresh-token';
  const mockEncryptedRefreshToken = wrap(mockRefreshTokenPlaintext);

  const mockConnectedAccount = {
    id: mockConnectedAccountId,
    workspaceId: mockWorkspaceId,
    provider: ConnectedAccountProvider.GOOGLE,
    refreshToken: mockEncryptedRefreshToken,
    accessToken: wrap('access-token'),
  } as ConnectedAccountEntity;

  beforeEach(async () => {
    connectedAccountTokenEncryptionService = buildEncryptionStub();

    connectedAccountRepository = {
      findOne: jest.fn().mockResolvedValue(mockConnectedAccount),
    };

    connectedAccountRefreshTokensService = {
      resolveTokens: jest.fn().mockResolvedValue({
        refreshToken: mockEncryptedRefreshToken,
        accessToken: wrap('access-token'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuth2ClientProvider,
        {
          provide: TwentyConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'AUTH_GOOGLE_CLIENT_ID') return 'google-client-id';
              if (key === 'AUTH_GOOGLE_CLIENT_SECRET')
                return 'google-client-secret';

              return undefined;
            }),
          },
        },
        {
          provide: Logger,
          useValue: { error: jest.fn() },
        },
        {
          provide: ConnectedAccountRefreshTokensService,
          useValue: connectedAccountRefreshTokensService,
        },
        {
          provide: ConnectedAccountTokenEncryptionService,
          useValue: connectedAccountTokenEncryptionService,
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: connectedAccountRepository,
        },
      ],
    }).compile();

    provider = module.get<GoogleOAuth2ClientProvider>(
      GoogleOAuth2ClientProvider,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('getClient', () => {
    it('preserves refresh-token-only client construction without options', async () => {
      const client = await provider.getClient(mockConnectedAccountId);

      expect(connectedAccountRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockConnectedAccountId },
      });
      expect(
        connectedAccountRefreshTokensService.resolveTokens,
      ).toHaveBeenCalledWith(mockConnectedAccount, mockWorkspaceId);
      expect(
        connectedAccountTokenEncryptionService.decrypt,
      ).toHaveBeenCalledWith({
        ciphertext: mockEncryptedRefreshToken,
        workspaceId: mockWorkspaceId,
      });
      expect(
        connectedAccountTokenEncryptionService.decrypt,
      ).toHaveBeenCalledTimes(1);
      expect(client.credentials).toEqual({
        refresh_token: mockRefreshTokenPlaintext,
      });
    });

    it('passes the outbound abort signal through token resolution', async () => {
      const abortController = new AbortController();

      const client = await provider.getClient(mockConnectedAccountId, {
        abortSignal: abortController.signal,
      });

      expect(
        connectedAccountRefreshTokensService.resolveTokens,
      ).toHaveBeenCalledWith(mockConnectedAccount, mockWorkspaceId, {
        abortSignal: abortController.signal,
      });
      expect(client.credentials).toEqual({
        access_token: 'access-token',
      });
      expect(client.refreshHandler).toBeUndefined();
    });

    it.each([401, 403])(
      'does not refresh or replay an installed-SDK request after a %i response',
      async (status) => {
        const apiUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

        global.fetch = jest.fn((input) => {
          const requestUrl = String(input);

          if (requestUrl === apiUrl) {
            return Promise.resolve(
              new Response(JSON.stringify({ error: 'unauthorized' }), {
                status,
                headers: { 'content-type': 'application/json' },
              }),
            );
          }

          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: 'implicitly-refreshed-token' }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        }) as typeof fetch;

        const client = await provider.getClient(mockConnectedAccountId, {
          abortSignal: new AbortController().signal,
        });

        await expect(
          client.request({ url: apiUrl, retry: false }),
        ).rejects.toMatchObject({ response: { status } });

        const requestedUrls = jest
          .mocked(fetch)
          .mock.calls.map(([input]) => String(input));

        expect(requestedUrls).toEqual([apiUrl]);
        expect(
          requestedUrls.filter((url) =>
            url.startsWith('https://oauth2.googleapis.com/token'),
          ),
        ).toHaveLength(0);
      },
    );

    it('should throw when the connected account does not exist', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(null);

      await expect(provider.getClient(mockConnectedAccountId)).rejects.toThrow(
        ConnectedAccountRefreshAccessTokenException,
      );

      await expect(
        provider.getClient(mockConnectedAccountId),
      ).rejects.toMatchObject({
        code: ConnectedAccountRefreshAccessTokenExceptionCode.REFRESH_TOKEN_NOT_FOUND,
      });
    });

    it('should throw when resolveTokens returns no refresh token', async () => {
      connectedAccountRefreshTokensService.resolveTokens.mockResolvedValue({
        refreshToken: null,
        accessToken: wrap('access-token'),
      });

      await expect(provider.getClient(mockConnectedAccountId)).rejects.toThrow(
        ConnectedAccountRefreshAccessTokenException,
      );

      await expect(
        provider.getClient(mockConnectedAccountId),
      ).rejects.toMatchObject({
        code: ConnectedAccountRefreshAccessTokenExceptionCode.REFRESH_TOKEN_NOT_FOUND,
      });
    });
  });
});
