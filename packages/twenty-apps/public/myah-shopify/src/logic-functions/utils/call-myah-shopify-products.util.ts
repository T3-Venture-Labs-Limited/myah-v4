import { type ShopifyProductSearchResult } from 'src/logic-functions/types/shopify-product-search-result.type';

const LOCAL_BROKER_BASE_URL = 'http://127.0.0.1:2022';

const getBrokerBaseUrls = () => {
  const urls = [
    process.env.MYAH_SHOPIFY_BROKER_BASE_URL,
    process.env.TWENTY_API_URL,
    LOCAL_BROKER_BASE_URL,
  ].filter(Boolean) as string[];

  return [...new Set(urls)];
};

export const callMyahShopifyProducts = async ({
  productsFirst,
  query,
}: {
  productsFirst: number;
  query?: string;
}): Promise<ShopifyProductSearchResult> => {
  const accessToken = process.env.TWENTY_APP_ACCESS_TOKEN;

  if (!accessToken) {
    return {
      success: false,
      connected: false,
      error:
        'Myah Shopify product search requires TWENTY_APP_ACCESS_TOKEN in the app runtime.',
    };
  }

  let lastError = 'Myah Shopify product broker was not called.';

  for (const brokerBaseUrl of getBrokerBaseUrls()) {
    const url = new URL('/rest/myah/shopify/agent/products', brokerBaseUrl);

    url.searchParams.set('productsFirst', String(productsFirst));

    if (query?.trim()) {
      url.searchParams.set('query', query.trim());
    }

    let response: Response;

    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      lastError = `Myah Shopify product broker at ${brokerBaseUrl} could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`;
      continue;
    }

    if (response.ok) {
      return (await response.json()) as ShopifyProductSearchResult;
    }

    const text = await response.text().catch(() => '');

    lastError = `Myah Shopify product broker at ${brokerBaseUrl} responded with ${response.status}: ${text.slice(0, 500)}`;

    if (![502, 503, 504].includes(response.status)) {
      break;
    }
  }

  return {
    success: false,
    connected: false,
    error: lastError,
  };
};
