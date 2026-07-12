import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getShopifyStoreContextHandler } from 'src/logic-functions/handlers/get-shopify-store-context-handler';

const SAVED_ENV = { ...process.env };

describe('getShopifyStoreContextHandler', () => {
  beforeEach(() => {
    process.env.TWENTY_API_URL = 'https://myah.test';
    process.env.TWENTY_APP_ACCESS_TOKEN = 'app-execution-token';
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls the Myah Shopify broker with the app execution token', async () => {
    const brokerResponse = {
      success: true,
      connected: true,
      shop: {
        name: 'Myah Store',
        myshopifyDomain: 'myah-9821.myshopify.com',
      },
      products: [{ title: 'Starter Kit', handle: 'starter-kit' }],
      scopes: ['read_products'],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => brokerResponse,
      text: async () => JSON.stringify(brokerResponse),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await getShopifyStoreContextHandler({ productsFirst: 5 });

    expect(result).toEqual(brokerResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myah.test/rest/myah/shopify/agent/store-context?productsFirst=5',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-execution-token',
        }),
      }),
    );
  });

  it('caps requested products to keep tool output compact', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, connected: true, products: [] }),
      text: async () => '{}',
    }));

    vi.stubGlobal('fetch', fetchMock);

    await getShopifyStoreContextHandler({ productsFirst: 999 });

    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit | undefined]
    >;
    const firstCall = fetchCalls[0];

    expect(firstCall?.[0]).toBe(
      'https://myah.test/rest/myah/shopify/agent/store-context?productsFirst=25',
    );
  });

  it('falls back to the local broker when the configured API URL returns a transient 5xx', async () => {
    const fallbackResponse = {
      success: true,
      connected: true,
      products: [{ title: 'Fallback Product' }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => 'bad gateway',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fallbackResponse,
        text: async () => JSON.stringify(fallbackResponse),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await getShopifyStoreContextHandler({});
    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit | undefined]
    >;

    expect(result).toEqual(fallbackResponse);
    expect(fetchCalls[0]?.[0]).toBe(
      'https://myah.test/rest/myah/shopify/agent/store-context?productsFirst=10',
    );
    expect(fetchCalls[1]?.[0]).toBe(
      'http://127.0.0.1:2022/rest/myah/shopify/agent/store-context?productsFirst=10',
    );
  });
});
