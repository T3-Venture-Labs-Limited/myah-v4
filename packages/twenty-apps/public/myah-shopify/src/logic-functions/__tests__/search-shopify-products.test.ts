import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchShopifyProductsHandler } from 'src/logic-functions/handlers/search-shopify-products-handler';

const SAVED_ENV = { ...process.env };

describe('searchShopifyProductsHandler', () => {
  beforeEach(() => {
    process.env.TWENTY_API_URL = 'https://myah.test';
    process.env.TWENTY_APP_ACCESS_TOKEN = 'app-execution-token';
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls the Myah Shopify product broker with query and app execution token', async () => {
    const brokerResponse = {
      success: true,
      connected: true,
      query: 'snowboard',
      products: [{ title: 'Snowboard', handle: 'snowboard' }],
      scopes: ['read_products'],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => brokerResponse,
      text: async () => JSON.stringify(brokerResponse),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await searchShopifyProductsHandler({
      productsFirst: 5,
      query: ' snowboard ',
    });

    expect(result).toEqual(brokerResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myah.test/rest/myah/shopify/agent/products?productsFirst=5&query=snowboard',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-execution-token',
        }),
      }),
    );
  });

  it('caps product results and omits empty query', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, connected: true, products: [] }),
      text: async () => '{}',
    }));

    vi.stubGlobal('fetch', fetchMock);

    await searchShopifyProductsHandler({ productsFirst: 999, query: '   ' });

    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit | undefined]
    >;

    expect(fetchCalls[0]?.[0]).toBe(
      'https://myah.test/rest/myah/shopify/agent/products?productsFirst=25',
    );
  });
});
