import { MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION } from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

const MANAGED_USER_PATTERN = /^managed-[a-f0-9]{24}$/;

type JsonRecord = Record<string, unknown>;

export const createManagedOpenRouterFetch = (
  baseFetch: typeof fetch = globalThis.fetch,
): typeof fetch => {
  return async (input, init) => {
    const url = getRequestUrl(input);

    if (!isChatCompletionRequest(url, init)) {
      return baseFetch(input, init);
    }

    const requestBody = parseRequestBody(init?.body);
    const model = requestBody.model;
    const user = requestBody.user;

    if (
      typeof model !== 'string' ||
      !(model in MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION) ||
      typeof user !== 'string' ||
      !MANAGED_USER_PATTERN.test(user)
    ) {
      throw new Error('Managed OpenRouter request policy validation failed');
    }

    const maximumPrice =
      MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION[
        model as keyof typeof MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION
      ];

    return baseFetch(input, {
      ...init,
      body: JSON.stringify({
        ...requestBody,
        provider: {
          max_price: maximumPrice,
          require_parameters: true,
        },
      }),
    });
  };
};

const getRequestUrl = (input: RequestInfo | URL): URL => {
  if (input instanceof Request) {
    return new URL(input.url);
  }

  return new URL(input.toString());
};

const isChatCompletionRequest = (
  url: URL,
  init: RequestInit | undefined,
): boolean =>
  init?.method?.toUpperCase() === 'POST' &&
  url.origin === 'https://openrouter.ai' &&
  url.pathname === '/api/v1/chat/completions';

const parseRequestBody = (body: BodyInit | null | undefined): JsonRecord => {
  if (typeof body !== 'string') {
    throw new Error('Managed OpenRouter request policy validation failed');
  }

  const parsed: unknown = JSON.parse(body);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Managed OpenRouter request policy validation failed');
  }

  return parsed as JsonRecord;
};
