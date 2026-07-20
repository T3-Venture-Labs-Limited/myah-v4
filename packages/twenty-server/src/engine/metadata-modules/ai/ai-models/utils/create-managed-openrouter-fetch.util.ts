import { AsyncLocalStorage } from 'node:async_hooks';

import { MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION } from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

const MANAGED_USER_PATTERN = /^managed-[a-f0-9]{24}$/;

type JsonRecord = Record<string, unknown>;
export type ManagedOpenRouterRawUsage = {
  cost?: unknown;
  prompt_tokens_details?: JsonRecord;
  completion_tokens_details?: JsonRecord;
};
type ResponseObserverContext = {
  observer: ResponseObserver;
  rawUsagePromise?: Promise<ManagedOpenRouterRawUsage | undefined>;
};
type ResponseObserver = (providerExecutionId: string) => Promise<void>;

const responseObserverStorage =
  new AsyncLocalStorage<ResponseObserverContext>();

export const runWithManagedOpenRouterResponseObserver = <T>(
  observer: ResponseObserver,
  callback: () => T,
): T => responseObserverStorage.run({ observer }, callback);

export const getManagedOpenRouterRawUsage = ():
  | Promise<ManagedOpenRouterRawUsage | undefined>
  | undefined => responseObserverStorage.getStore()?.rawUsagePromise;

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

    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify({
        ...requestBody,
        provider: {
          max_price: maximumPrice,
          require_parameters: true,
        },
      }),
    });
    const responseObserverContext = responseObserverStorage.getStore();
    const providerExecutionId = response.headers.get('x-generation-id');
    const contentType = response.headers.get('content-type');
    let observedResponse = response;

    if (providerExecutionId && responseObserverContext) {
      if (contentType?.includes('text/event-stream')) {
        const deferred = createDeferred<
          ManagedOpenRouterRawUsage | undefined
        >();
        responseObserverContext.rawUsagePromise = deferred.promise;
        observedResponse = createObservedSseResponse(
          response,
          deferred.resolve,
          init?.signal ?? undefined,
        );
      } else {
        responseObserverContext.rawUsagePromise = extractRawUsage(response);
      }

      await responseObserverContext.observer(providerExecutionId);
    }

    return observedResponse;
  };
};
const createDeferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};

const createObservedSseResponse = (
  response: Response,
  resolveUsage: (usage: ManagedOpenRouterRawUsage | undefined) => void,
  signal?: AbortSignal,
): Response => {
  const upstreamReader = response.body?.getReader();
  if (!upstreamReader) {
    resolveUsage(undefined);
    return response;
  }

  const parser = createSseParser();
  let settled = false;
  const settle = (usage: ManagedOpenRouterRawUsage | undefined) => {
    if (!settled) {
      settled = true;
      resolveUsage(usage);
    }
  };
  const cancelUpstream = () => {
    settle(undefined);
    void upstreamReader.cancel();
  };
  if (signal?.aborted) {
    cancelUpstream();
  }
  const abort = () => cancelUpstream();
  signal?.addEventListener('abort', abort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await upstreamReader.read();
        if (done) {
          settle(parser.finish());
          signal?.removeEventListener('abort', abort);
          controller.close();
          return;
        }
        parser.push(value);
        controller.enqueue(value);
      } catch (error) {
        settle(undefined);
        signal?.removeEventListener('abort', abort);
        controller.error(error);
      }
    },
    async cancel() {
      signal?.removeEventListener('abort', abort);
      settle(undefined);
      await upstreamReader.cancel();
    },
  });

  return new Response(stream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
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
const extractRawUsage = async (
  response: Response,
): Promise<ManagedOpenRouterRawUsage | undefined> => {
  try {
    const body = await response.clone().text();
    const parsed: unknown = JSON.parse(body);

    return sanitizeRawUsage(isRecord(parsed) ? parsed.usage : undefined);
  } catch {
    return undefined;
  }
};

const createSseParser = (): {
  finish: () => ManagedOpenRouterRawUsage | undefined;
  push: (value: Uint8Array) => void;
} => {
  const decoder = new TextDecoder();
  const maxLineBytes = 64 * 1024;
  let line = '';
  let latestUsage: ManagedOpenRouterRawUsage | undefined;
  let discardedOversizedLine = false;

  const parseLine = (value: string) => {
    const completeLine = value.replace(/\r$/, '');
    if (
      !discardedOversizedLine &&
      completeLine.length <= maxLineBytes &&
      completeLine.startsWith('data:')
    ) {
      const payload = completeLine.slice(5).trim();
      if (payload !== '[DONE]') {
        try {
          const parsed: unknown = JSON.parse(payload);
          const usage = isRecord(parsed) ? parsed.usage : undefined;
          if (isRecord(usage)) {
            latestUsage = sanitizeRawUsage(usage);
          }
        } catch {
          // Ignore malformed SSE records while retaining prior usage.
        }
      }
    }
  };

  return {
    push(value) {
      line += decoder.decode(value, { stream: true });
      let newlineIndex = line.indexOf('\n');
      while (newlineIndex !== -1) {
        parseLine(line.slice(0, newlineIndex));
        line = line.slice(newlineIndex + 1);
        discardedOversizedLine = false;
        newlineIndex = line.indexOf('\n');
      }
      if (line.length > maxLineBytes) {
        line = '';
        discardedOversizedLine = true;
      }
    },
    finish() {
      line += decoder.decode();
      if (line.length > 0) {
        parseLine(line);
      }
      return latestUsage;
    },
  };
};

const sanitizeRawUsage = (
  usage: unknown,
): ManagedOpenRouterRawUsage | undefined => {
  if (!isRecord(usage)) {
    return undefined;
  }

  const rawUsage: ManagedOpenRouterRawUsage = {};
  if ('cost' in usage) {
    rawUsage.cost = usage.cost;
  }
  if (isRecord(usage.prompt_tokens_details)) {
    rawUsage.prompt_tokens_details = usage.prompt_tokens_details;
  }
  if (isRecord(usage.completion_tokens_details)) {
    rawUsage.completion_tokens_details = usage.completion_tokens_details;
  }
  return rawUsage;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
