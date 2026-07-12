import { InternalServerErrorException } from '@nestjs/common';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { MyahShopifyService } from 'src/modules/myah-shopify/services/myah-shopify.service';
import { ConnectedAccountProvider } from 'twenty-shared/types';
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
    decrypt: jest.fn(({ ciphertext }) =>
      String(ciphertext).replace('enc:v2:test:', ''),
    ) as never,
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

  return {
    repository,
    encryptionService,
    service,
    getStoredConnection: () => storedConnection,
    setStoredConnection: (connection: ConnectedAccountEntity | null) => {
      storedConnection = connection;
    },
  };
};

describe('MyahShopifyService persistence', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    const { MYAH_SHOPIFY_SCOPES: _shopifyScopes, ...envWithoutShopifyScopes } =
      originalEnv;

    process.env = {
      ...envWithoutShopifyScopes,
      MYAH_SHOPIFY_CLIENT_ID: 'shopify-client-id',
      MYAH_SHOPIFY_CLIENT_SECRET: 'shopify-client-secret',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses Zachary's trimmed Shopify read-only scope set by default", () => {
    const { service } = createService();

    const result = service.startOAuth({
      shop: 'myah-9821',
      workspaceId: 'workspace-id',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });

    const authorizationUrl = new URL(result.authorizationUrl);

    expect(authorizationUrl.searchParams.get('scope')).toBe(
      'read_analytics,read_customer_events,read_channels,read_checkouts,read_customers,read_price_rules,read_discounts,read_draft_orders,read_files,read_inventory,read_locales,read_metaobject_definitions,read_metaobjects,read_orders,read_product_listings,read_products,read_reports,read_content',
    );
  });

  it('allows configured Shopify scopes when they remain read-only', () => {
    process.env.MYAH_SHOPIFY_SCOPES = 'read_products,read_orders';
    const { service } = createService();

    const result = service.startOAuth({
      shop: 'myah-9821',
      workspaceId: 'workspace-id',
      userId: 'user-workspace-id',
      callbackUrl: 'http://localhost:2022/rest/myah/shopify/oauth/callback',
    });

    const authorizationUrl = new URL(result.authorizationUrl);

    expect(authorizationUrl.searchParams.get('scope')).toBe(
      'read_products,read_orders',
    );
  });

  it('persists an encrypted workspace Shopify connection after OAuth completes', async () => {
    const { encryptionService, getStoredConnection, service } = createService();
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

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'shpat_secret_token',
          refresh_token: 'shprt_secret_refresh',
          expires_in: 3600,
          refresh_token_expires_in: 7776000,
          scope: 'read_products,read_content',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { shop: { name: 'Myah Store' } } }),
      });

    await service.completeOAuthCallback({
      ...callbackParams,
      hmac: hmacFor(callbackParams, 'shopify-client-secret'),
    });

    expect(encryptionService.encrypt).toHaveBeenCalledWith({
      plaintext: 'shpat_secret_token',
      workspaceId: 'workspace-id',
    });
    expect(encryptionService.encrypt).toHaveBeenCalledWith({
      plaintext: 'shprt_secret_refresh',
      workspaceId: 'workspace-id',
    });
    expect(getStoredConnection()).toMatchObject({
      accessToken: 'enc:v2:test:shpat_secret_token',
      archivedAt: null,
      connectionParameters: { shopify: { shopName: 'Myah Store' } },
      handle: 'myah-9821.myshopify.com',
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      refreshToken: 'enc:v2:test:shprt_secret_refresh',
      scopes: ['read_products', 'read_content'],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    });
    expect(getStoredConnection()?.lastCredentialsRefreshedAt).toBeInstanceOf(
      Date,
    );
  });

  it('persists returned Shopify scopes when they remain read-only', async () => {
    const { getStoredConnection, service } = createService();
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

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'shpat_secret_token',
          scope: 'read_products,read_orders',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { shop: { name: 'Myah Store' } } }),
      });

    await service.completeOAuthCallback({
      ...callbackParams,
      hmac: hmacFor(callbackParams, 'shopify-client-secret'),
    });

    expect(getStoredConnection()).toMatchObject({
      accessToken: 'enc:v2:test:shpat_secret_token',
      scopes: ['read_products', 'read_orders'],
    });
  });

  it('rejects returned Shopify read scopes outside the approved shortlist without saving', async () => {
    const { getStoredConnection, repository, service } = createService();
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

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'shpat_secret_token',
        scope: 'read_products,read_themes',
      }),
    });

    await expect(
      service.completeOAuthCallback({
        ...callbackParams,
        hmac: hmacFor(callbackParams, 'shopify-client-secret'),
      }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(repository.save).not.toHaveBeenCalled();
    expect(getStoredConnection()).toBeNull();
  });

  it('rejects returned Shopify write scopes without saving', async () => {
    const { getStoredConnection, repository, service } = createService();
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

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'shpat_secret_token',
        scope: 'read_products,write_themes',
      }),
    });

    await expect(
      service.completeOAuthCallback({
        ...callbackParams,
        hmac: hmacFor(callbackParams, 'shopify-client-secret'),
      }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(repository.save).not.toHaveBeenCalled();
    expect(getStoredConnection()).toBeNull();
  });

  it('reads Shopify status from the database without returning the encrypted token', async () => {
    const { service, setStoredConnection } = createService();

    setStoredConnection({
      id: 'shopify-connected-account-id',
      accessToken: 'enc:v2:test:shpat_secret_token',
      archivedAt: null,
      connectionParameters: { shopify: { shopName: 'Myah Store' } },
      handle: 'myah-9821.myshopify.com',
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      scopes: ['read_products'],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as unknown as ConnectedAccountEntity);

    await expect(
      service.getStatus({ workspaceId: 'workspace-id' }),
    ).resolves.toEqual({
      connected: true,
      shopDomain: 'myah-9821.myshopify.com',
      shopName: 'Myah Store',
      scopes: ['read_products'],
    });
  });

  it('returns compact Shopify store context for agent tools without exposing token material', async () => {
    const { encryptionService, service, setStoredConnection } = createService();

    setStoredConnection({
      id: 'shopify-connected-account-id',
      accessToken: 'enc:v2:test:shpat_secret_token',
      archivedAt: null,
      connectionParameters: { shopify: { shopName: 'Myah Store' } },
      handle: 'myah-9821.myshopify.com',
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      scopes: ['read_products', 'read_content'],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as unknown as ConnectedAccountEntity);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          shop: {
            name: 'Myah Store',
            myshopifyDomain: 'myah-9821.myshopify.com',
            primaryDomain: { host: 'example.com', url: 'https://example.com' },
            currencyCode: 'USD',
            contactEmail: 'owner@example.com',
          },
          products: {
            nodes: [
              {
                id: 'gid://shopify/Product/1',
                title: 'Starter Kit',
                handle: 'starter-kit',
                status: 'ACTIVE',
                vendor: 'Myah',
                productType: 'Bundle',
                tags: ['starter'],
                totalInventory: 12,
                onlineStoreUrl: 'https://example.com/products/starter-kit',
              },
            ],
          },
        },
      }),
    });

    await expect(
      service.getStoreContext({
        productsFirst: 5,
        workspaceId: 'workspace-id',
      }),
    ).resolves.toEqual({
      success: true,
      connected: true,
      shop: {
        name: 'Myah Store',
        myshopifyDomain: 'myah-9821.myshopify.com',
        primaryDomain: { host: 'example.com', url: 'https://example.com' },
        currencyCode: 'USD',
        contactEmail: 'owner@example.com',
      },
      products: [
        {
          id: 'gid://shopify/Product/1',
          title: 'Starter Kit',
          handle: 'starter-kit',
          status: 'ACTIVE',
          vendor: 'Myah',
          productType: 'Bundle',
          tags: ['starter'],
          totalInventory: 12,
          onlineStoreUrl: 'https://example.com/products/starter-kit',
        },
      ],
      scopes: ['read_products', 'read_content'],
    });
    expect(encryptionService.decrypt).toHaveBeenCalledWith({
      ciphertext: 'enc:v2:test:shpat_secret_token',
      workspaceId: 'workspace-id',
    });
    expect(
      JSON.stringify((global.fetch as jest.Mock).mock.calls),
    ).not.toContain('enc:v2:test:shpat_secret_token');
  });

  it('returns bounded Shopify product search results for agent tools', async () => {
    const { encryptionService, service, setStoredConnection } = createService();

    setStoredConnection({
      id: 'shopify-connected-account-id',
      accessToken: 'enc:v2:test:shpat_secret_token',
      archivedAt: null,
      connectionParameters: { shopify: { shopName: 'Myah Store' } },
      handle: 'myah-9821.myshopify.com',
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      scopes: ['read_products', 'read_content'],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as unknown as ConnectedAccountEntity);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          products: {
            nodes: [
              {
                id: 'gid://shopify/Product/1',
                title: 'Starter Kit',
                handle: 'starter-kit',
                status: 'ACTIVE',
                vendor: 'Myah',
                productType: 'Bundle',
                tags: ['starter'],
                totalInventory: 12,
                onlineStoreUrl: 'https://example.com/products/starter-kit',
              },
            ],
          },
        },
      }),
    });

    await expect(
      service.searchProducts({
        productsFirst: 5,
        query: 'starter',
        workspaceId: 'workspace-id',
      }),
    ).resolves.toEqual({
      success: true,
      connected: true,
      products: [
        {
          id: 'gid://shopify/Product/1',
          title: 'Starter Kit',
          handle: 'starter-kit',
          status: 'ACTIVE',
          vendor: 'Myah',
          productType: 'Bundle',
          tags: ['starter'],
          totalInventory: 12,
          onlineStoreUrl: 'https://example.com/products/starter-kit',
        },
      ],
      query: 'starter',
      scopes: ['read_products', 'read_content'],
    });

    expect(encryptionService.decrypt).toHaveBeenCalledWith({
      ciphertext: 'enc:v2:test:shpat_secret_token',
      workspaceId: 'workspace-id',
    });
    expect(JSON.stringify((global.fetch as jest.Mock).mock.calls[0])).toContain(
      'starter',
    );
  });

  it('returns bounded read-only Shopify data for the expanded agent tools', async () => {
    const { service, setStoredConnection } = createService();

    setStoredConnection({
      id: 'shopify-connected-account-id',
      accessToken: 'enc:v2:test:shpat_secret_token',
      archivedAt: null,
      connectionParameters: { shopify: { shopName: 'Myah Store' } },
      handle: 'myah-9821.myshopify.com',
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      scopes: [
        'read_products',
        'read_content',
        'read_metaobjects',
        'read_metaobject_definitions',
        'read_files',
        'read_inventory',
        'read_locales',
        'read_channels',
        'read_price_rules',
        'read_discounts',
        'read_orders',
        'read_checkouts',
        'read_draft_orders',
        'read_reports',
        'read_analytics',
        'read_customers',
        'read_customer_events',
        'read_product_listings',
      ],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as unknown as ConnectedAccountEntity);
    const graphQlResponses = [
      {
        data: {
          products: {
            nodes: [
              {
                id: 'gid://shopify/Product/1',
                title: 'Starter Kit',
                handle: 'starter-kit',
                description: 'Plain description',
                priceRangeV2: {
                  minVariantPrice: { amount: '10.00', currencyCode: 'USD' },
                  maxVariantPrice: { amount: '15.00', currencyCode: 'USD' },
                },
              },
            ],
          },
        },
      },
      { data: { pages: { nodes: [{ title: 'About us' }] } } },
      {
        data: { metaobjectDefinitions: { nodes: [{ type: 'brand_profile' }] } },
      },
      { data: { orders: { nodes: [{ name: '#1001' }] } } },
      { data: { customers: { nodes: [{ id: 'gid://shopify/Customer/1' }] } } },
      { data: { priceRules: { nodes: [{ title: 'WELCOME10' }] } } },
      { data: { publications: { nodes: [{ name: 'Online Store' }] } } },
    ];

    for (const body of graphQlResponses) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => body,
      });
    }

    await expect(
      service.getProductDetail({
        handle: 'starter-kit',
        workspaceId: 'workspace-id',
      }),
    ).resolves.toMatchObject({ connected: true, success: true });
    await expect(
      service.getBrandContent({ first: 5, workspaceId: 'workspace-id' }),
    ).resolves.toMatchObject({ connected: true, success: true });
    await expect(
      service.getCustomData({ first: 5, workspaceId: 'workspace-id' }),
    ).resolves.toMatchObject({ connected: true, success: true });
    await expect(
      service.getCommerceSummary({ first: 5, workspaceId: 'workspace-id' }),
    ).resolves.toMatchObject({ connected: true, success: true });
    await expect(
      service.getCustomerSummary({ first: 5, workspaceId: 'workspace-id' }),
    ).resolves.toMatchObject({ connected: true, success: true });
    await expect(
      service.getPromotionsSummary({ first: 5, workspaceId: 'workspace-id' }),
    ).resolves.toMatchObject({ connected: true, success: true });
    await expect(
      service.getChannelContext({ first: 5, workspaceId: 'workspace-id' }),
    ).resolves.toMatchObject({ connected: true, success: true });

    expect(global.fetch).toHaveBeenCalledTimes(7);
    expect(
      JSON.stringify((global.fetch as jest.Mock).mock.calls),
    ).not.toContain('enc:v2:test:shpat_secret_token');
  });

  it('refreshes a stale expiring offline token before reading Shopify store context', async () => {
    const {
      encryptionService,
      getStoredConnection,
      service,
      setStoredConnection,
    } = createService();

    setStoredConnection({
      id: 'shopify-connected-account-id',
      accessToken: 'enc:v2:test:old_access_token',
      archivedAt: null,
      connectionParameters: { shopify: { shopName: 'Myah Store' } },
      handle: 'myah-9821.myshopify.com',
      lastCredentialsRefreshedAt: new Date('2026-07-07T00:00:00Z'),
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      refreshToken: 'enc:v2:test:old_refresh_token',
      scopes: ['read_products', 'read_content'],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as unknown as ConnectedAccountEntity);
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-07T02:00:00Z').getTime());
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          refresh_token_expires_in: 7776000,
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
            },
            products: { nodes: [] },
          },
        }),
      });

    await expect(
      service.getStoreContext({
        productsFirst: 5,
        workspaceId: 'workspace-id',
      }),
    ).resolves.toMatchObject({ connected: true, success: true });

    expect(encryptionService.decrypt).toHaveBeenCalledWith({
      ciphertext: 'enc:v2:test:old_refresh_token',
      workspaceId: 'workspace-id',
    });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://myah-9821.myshopify.com/admin/oauth/access_token',
    );

    const refreshBody = (global.fetch as jest.Mock).mock.calls[0][1]
      .body as URLSearchParams;

    expect(refreshBody.get('grant_type')).toBe('refresh_token');
    expect(refreshBody.get('refresh_token')).toBe('old_refresh_token');
    expect(JSON.stringify((global.fetch as jest.Mock).mock.calls[1])).toContain(
      'new_access_token',
    );
    expect(getStoredConnection()).toMatchObject({
      accessToken: 'enc:v2:test:new_access_token',
      refreshToken: 'enc:v2:test:new_refresh_token',
      scopes: ['read_products', 'read_content'],
    });
    expect(getStoredConnection()?.lastCredentialsRefreshedAt).toBeInstanceOf(
      Date,
    );
  });

  it('archives and clears token material when disconnecting Shopify', async () => {
    const { getStoredConnection, service, setStoredConnection } =
      createService();

    setStoredConnection({
      id: 'shopify-connected-account-id',
      accessToken: 'enc:v2:test:shpat_secret_token',
      archivedAt: null,
      handle: 'myah-9821.myshopify.com',
      name: 'Shopify',
      provider: ConnectedAccountProvider.APP,
      scopes: ['read_products'],
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as unknown as ConnectedAccountEntity);

    await expect(
      service.disconnect({ workspaceId: 'workspace-id' }),
    ).resolves.toEqual({
      connected: false,
    });

    expect(getStoredConnection()).toMatchObject({
      accessToken: null,
      archivedAt: expect.any(Date),
      refreshToken: null,
      scopes: null,
    });
  });
});
