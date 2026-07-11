import { type ShopifyAgentReadResult } from 'src/logic-functions/types/shopify-agent-read-result.type';

const LOCAL_BROKER_BASE_URL = 'http://127.0.0.1:2022';

const getBrokerBaseUrls = () => {
  const urls = [
    process.env.MYAH_SHOPIFY_BROKER_BASE_URL,
    process.env.TWENTY_API_URL,
    LOCAL_BROKER_BASE_URL,
  ].filter(Boolean) as string[];

  return [...new Set(urls)];
};

export const callMyahShopifyAgentRoute = async ({
  params,
  routePath,
  toolLabel,
}: {
  params: Record<string, string | number | undefined>;
  routePath: string;
  toolLabel: string;
}): Promise<ShopifyAgentReadResult> => {
  const accessToken = process.env.TWENTY_APP_ACCESS_TOKEN;

  if (!accessToken) {
    return {
      success: false,
      connected: false,
      error: `${toolLabel} requires TWENTY_APP_ACCESS_TOKEN in the app runtime.`,
    };
  }

  let lastError = `${toolLabel} broker was not called.`;

  for (const brokerBaseUrl of getBrokerBaseUrls()) {
    const url = new URL(routePath, brokerBaseUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && String(value).trim()) {
        url.searchParams.set(key, String(value).trim());
      }
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
      lastError = `${toolLabel} broker at ${brokerBaseUrl} could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`;
      continue;
    }

    if (response.ok) {
      return (await response.json()) as ShopifyAgentReadResult;
    }

    const text = await response.text().catch(() => '');

    lastError = `${toolLabel} broker at ${brokerBaseUrl} responded with ${response.status}: ${text.slice(0, 500)}`;

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
