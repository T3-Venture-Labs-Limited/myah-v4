import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getShopifyBrandContentHandler } from 'src/logic-functions/handlers/get-shopify-brand-content-handler';
import { getShopifyCustomerSummaryHandler } from 'src/logic-functions/handlers/get-shopify-customer-summary-handler';
import { getShopifyProductDetailHandler } from 'src/logic-functions/handlers/get-shopify-product-detail-handler';

const SAVED_ENV = { ...process.env };

describe('expanded Shopify tool handlers', () => {
  beforeEach(() => {
    process.env.TWENTY_API_URL = 'https://myah.test';
    process.env.TWENTY_APP_ACCESS_TOKEN = 'app-execution-token';
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls the product-detail broker with handle and app execution token', async () => {
    const brokerResponse = {
      success: true,
      connected: true,
      data: { product: { title: 'Snowboard' } },
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => brokerResponse,
      text: async () => JSON.stringify(brokerResponse),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await getShopifyProductDetailHandler({
      handle: ' the-complete-snowboard ',
    });

    expect(result).toEqual(brokerResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myah.test/rest/myah/shopify/agent/product-detail?handle=the-complete-snowboard',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-execution-token',
        }),
      }),
    );
  });

  it('caps first-style tools before calling the broker', async () => {
    const brokerResponse = { success: true, connected: true, data: {} };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => brokerResponse,
      text: async () => JSON.stringify(brokerResponse),
    }));

    vi.stubGlobal('fetch', fetchMock);

    await getShopifyBrandContentHandler({ first: 999 });

    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit | undefined]
    >;

    expect(fetchCalls[0]?.[0]).toBe(
      'https://myah.test/rest/myah/shopify/agent/brand-content?first=25',
    );
  });

  it('redacts protected customer-data provider errors from the public result', async () => {
    const providerSentinel =
      'Customer email jane.doe@example.com leaked with token shpat_live_secret';
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ errors: [{ message: providerSentinel }] }),
      text: async () => providerSentinel,
    }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await getShopifyCustomerSummaryHandler({ first: 1 });

    expect(result.success).toBe(false);
    expect(result.connected).toBe(false);
    expect(result.error).toBe(
      'Myah Shopify customer summary broker request failed (HTTP 502).',
    );
    expect(JSON.stringify(result)).not.toContain('jane.doe@example.com');
    expect(JSON.stringify(result)).not.toContain('shpat_live_secret');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
