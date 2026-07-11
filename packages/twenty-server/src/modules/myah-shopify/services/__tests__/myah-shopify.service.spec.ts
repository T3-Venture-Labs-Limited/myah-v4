import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { MyahShopifyService } from 'src/modules/myah-shopify/services/myah-shopify.service';
import { type Repository } from 'typeorm';

const hmacFor = (params: Record<string, string>, secret: string) => {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHmac('sha256', secret).update(message).digest('hex');
};

const createService = () => {
  let storedConnection: ConnectedAccountEntity | null = null;
  const repository = {
    findOne: jest.fn(async ({ where }: { where?: unknown } = {}) => {
      if (!storedConnection) {
        return null;
      }

      if (
        JSON.stringify(where).includes('archivedAt') &&
        storedConnection.archivedAt
      ) {
        return null;
      }

      return storedConnection;
    }),
    save: jest.fn(async (connection: ConnectedAccountEntity) => {
      storedConnection = {
        ...storedConnection,
        ...connection,
        id:
          connection.id ??
          storedConnection?.id ??
          'shopify-connected-account-id',
        createdAt:
          storedConnection?.createdAt ?? new Date('2026-07-07T00:00:00Z'),
        updatedAt: new Date('2026-07-07T00:00:01Z'),
      } as ConnectedAccountEntity;

      return storedConnection;
    }),
    update: jest.fn(async (_criteria, update) => {
      if (storedConnection) {
        storedConnection = {
          ...storedConnection,
          ...update,
          updatedAt: new Date('2026-07-07T00:00:02Z'),
        } as ConnectedAccountEntity;
      }

      return { affected: storedConnection ? 1 : 0, raw: [], generatedMaps: [] };
    }),
  };
  const encryptionService: jest.Mocked<
    Pick<
      ConnectedAccountTokenEncryptionService,
      'decrypt' | 'encrypt' | 'encryptTokenPair'
    >
  > = {
    decrypt: jest.fn(() => 'shpat_decrypted_token' as never),
    encrypt: jest.fn(({ plaintext }) => `enc:v2:test:${plaintext}` as never),
    encryptTokenPair: jest.fn(({ accessToken, refreshToken, workspaceId }) => ({
      encryptedAccessToken: encryptionService.encrypt({
        plaintext: accessToken,
        workspaceId,
      }),
      encryptedRefreshToken: refreshToken
        ? encryptionService.encrypt({ plaintext: refreshToken, workspaceId })
        : null,
    })),
  };
  const service = new MyahShopifyService(
    repository as unknown as Repository<ConnectedAccountEntity>,
    encryptionService as unknown as ConnectedAccountTokenEncryptionService,
  );

  return { repository, encryptionService, service };
};

describe('MyahShopifyService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    const { MYAH_SHOPIFY_SCOPES: _shopifyScopes, ...envWithoutShopifyScopes } =
      originalEnv;

    process.env = {
      ...envWithoutShopifyScopes,
      MYAH_SHOPIFY_CLIENT_ID: 'shopify-client-id',
      MYAH_SHOPIFY_CLIENT_SECRET: 'shopify-client-secret',
      MYAH_SHOPIFY_SCOPES: 'read_products,read_content',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('creates a first-party Shopify OAuth URL with read-only scopes and normalized shop domain', () => {
    const { service } = createService();

    const result = service.startOAuth({
      shop: 'myah-9821',
      workspaceId: 'workspace-id',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });

    const authorizationUrl = new URL(result.authorizationUrl);

    expect(authorizationUrl.origin).toBe('https://myah-9821.myshopify.com');
    expect(authorizationUrl.pathname).toBe('/admin/oauth/authorize');
    expect(authorizationUrl.searchParams.get('client_id')).toBe(
      'shopify-client-id',
    );
    expect(authorizationUrl.searchParams.get('scope')).toBe(
      'read_products,read_content',
    );
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:2022/rest/myah/shopify/oauth/callback',
    );
    expect(authorizationUrl.searchParams.get('state')).toBe(result.state);
    expect(result.shopDomain).toBe('myah-9821.myshopify.com');
  });

  it('fails closed when first-party Shopify app credentials are missing', () => {
    delete process.env.MYAH_SHOPIFY_CLIENT_ID;

    const { service } = createService();

    expect(() =>
      service.startOAuth({
        shop: 'myah-9821',
        workspaceId: 'workspace-id',
        userId: 'user-workspace-id',
        callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('rejects invalid Shopify shop domains before generating OAuth state', () => {
    const { service } = createService();

    expect(() =>
      service.startOAuth({
        shop: 'https://evil.example.com',
        workspaceId: 'workspace-id',
        userId: 'user-workspace-id',
        callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects write scopes because the Shopify spike is read-only', () => {
    process.env.MYAH_SHOPIFY_SCOPES = 'read_products,write_themes';

    const { service } = createService();

    expect(() =>
      service.startOAuth({
        shop: 'myah-9821',
        workspaceId: 'workspace-id',
        userId: 'user-workspace-id',
        callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('rejects configured Shopify scopes outside the approved shortlist', () => {
    process.env.MYAH_SHOPIFY_SCOPES = 'read_products,read_themes';

    const { service } = createService();

    expect(() =>
      service.startOAuth({
        shop: 'myah-9821',
        workspaceId: 'workspace-id',
        userId: 'user-workspace-id',
        callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('exchanges a verified callback code for an access token and stores a redacted connection status', async () => {
    const { service } = createService();
    const started = service.startOAuth({
      shop: 'myah-9821.myshopify.com',
      workspaceId: 'workspace-id',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });
    const callbackParams = {
      code: 'temporary-code',
      shop: 'myah-9821.myshopify.com',
      state: started.state,
      timestamp: '1780000000',
    };
    const hmac = hmacFor(callbackParams, 'shopify-client-secret');

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'shpat_secret_token',
          scope: 'read_products,read_content',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            shop: {
              name: 'Myah Store',
              myshopifyDomain: 'myah-9821.myshopify.com',
              primaryDomain: {
                url: 'https://myah.example',
                host: 'myah.example',
              },
              currencyCode: 'USD',
              contactEmail: 'owner@example.com',
            },
          },
        }),
      });

    const result = await service.completeOAuthCallback({
      ...callbackParams,
      hmac,
    });

    expect(result).toEqual({
      connected: true,
      shopDomain: 'myah-9821.myshopify.com',
      shopName: 'Myah Store',
      scopes: ['read_products', 'read_content'],
    });
    await expect(
      service.getStatus({ workspaceId: 'workspace-id' }),
    ).resolves.toEqual(result);
    expect(JSON.stringify(result)).not.toContain('shpat_secret_token');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://myah-9821.myshopify.com/admin/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
      }),
    );
  });

  it('keeps the connection when the optional shop profile probe fails after token exchange', async () => {
    const { service } = createService();
    const started = service.startOAuth({
      shop: 'myah-9821.myshopify.com',
      workspaceId: 'workspace-id-profile-failure',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });
    const callbackParams = {
      code: 'temporary-code',
      shop: 'myah-9821.myshopify.com',
      state: started.state,
      timestamp: '1780000000',
    };
    const hmac = hmacFor(callbackParams, 'shopify-client-secret');

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'shpat_secret_token',
          scope: 'read_products,read_content',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ errors: [{ message: 'probe failed' }] }),
      });

    const result = await service.completeOAuthCallback({
      ...callbackParams,
      hmac,
    });

    expect(result).toEqual({
      connected: true,
      shopDomain: 'myah-9821.myshopify.com',
      shopName: undefined,
      scopes: ['read_products', 'read_content'],
    });
    await expect(
      service.getStatus({ workspaceId: 'workspace-id-profile-failure' }),
    ).resolves.toEqual(result);
  });
  it('returns a fixed non-sensitive error when protected customer data is unavailable', async () => {
    const { service, repository } = createService();

    await repository.save({
      workspaceId: 'workspace-id-customer-data',
      handle: 'myah-9821.myshopify.com',
      accessToken: 'shpat_test_token',
      archivedAt: null,
    } as ConnectedAccountEntity);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        errors: [
          {
            message:
              'Customer email jane.doe@example.com leaked with token shpat_live_secret',
          },
        ],
      }),
    });

    const result = await service.getCustomerSummary({
      first: 1,
      workspaceId: 'workspace-id-customer-data',
    });

    expect(result.data).toEqual({
      unavailable: {
        customers: 'Shopify customer data is currently unavailable.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('jane.doe@example.com');
    expect(JSON.stringify(result)).not.toContain('shpat_live_secret');
  });


  it('surfaces rejected Shopify callback codes as a bad request instead of a gateway error', async () => {
    const { service } = createService();
    const started = service.startOAuth({
      shop: 'myah-9821.myshopify.com',
      workspaceId: 'workspace-id-rejected-code',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });
    const callbackParams = {
      code: 'already-used-code',
      shop: 'myah-9821.myshopify.com',
      state: started.state,
      timestamp: '1780000000',
    };
    const hmac = hmacFor(callbackParams, 'shopify-client-secret');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'invalid_request',
        error_description:
          'The authorization code was not found or was already used',
      }),
    });

    await expect(
      service.completeOAuthCallback({
        ...callbackParams,
        hmac,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.getStatus({ workspaceId: 'workspace-id-rejected-code' }),
    ).resolves.toEqual({ connected: false });
  });

  it('still treats non-JSON Shopify token responses as an upstream gateway issue', async () => {
    const { service } = createService();
    const started = service.startOAuth({
      shop: 'myah-9821.myshopify.com',
      workspaceId: 'workspace-id-html-code',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });
    const callbackParams = {
      code: 'html-code',
      shop: 'myah-9821.myshopify.com',
      state: started.state,
      timestamp: '1780000000',
    };
    const hmac = hmacFor(callbackParams, 'shopify-client-secret');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    await expect(
      service.completeOAuthCallback({
        ...callbackParams,
        hmac,
      }),
    ).rejects.toThrow(BadGatewayException);
  });

  it('rejects callbacks with an invalid Shopify hmac', async () => {
    const { service } = createService();
    const started = service.startOAuth({
      shop: 'myah-9821.myshopify.com',
      workspaceId: 'workspace-id',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });

    await expect(
      service.completeOAuthCallback({
        code: 'temporary-code',
        shop: 'myah-9821.myshopify.com',
        state: started.state,
        timestamp: '1780000000',
        hmac: 'invalid-hmac',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
