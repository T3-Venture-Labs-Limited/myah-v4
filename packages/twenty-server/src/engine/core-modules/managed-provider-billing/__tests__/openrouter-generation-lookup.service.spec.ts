import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { OpenRouterGenerationLookupService } from '../services/openrouter-generation-lookup.service';

describe('OpenRouterGenerationLookupService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const createService = (apiKey = 'openrouter-key') =>
    new OpenRouterGenerationLookupService({
      get: jest.fn().mockReturnValue(apiKey),
    } as unknown as TwentyConfigService);

  it('parses authoritative generation metadata without requesting stored content', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            native_tokens_cached: 3,
            id: 'gen-123',
            model: 'openai/gpt-5.6-luna',
            tokens_prompt: 12,
            tokens_completion: 7,
            total_cost: 0.000_002_548,
          },
        }),
        { status: 200 },
      ),
    );
    const service = createService();

    await expect(service.lookup('gen-123')).resolves.toEqual({
      cachedPromptTokens: 3,
      completionTokens: 7,
      id: 'gen-123',
      model: 'openai/gpt-5.6-luna',
      promptTokens: 12,
      status: 'found',
      totalCostUsd: 0.000_002_548,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/generation?id=gen-123',
      { headers: { Authorization: 'Bearer openrouter-key' } },
    );
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['fractional', 1.5],
    ['negative', -1],
  ])(
    'returns malformed when native_tokens_cached is %s',
    async (_label, cachedTokens) => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              ...(cachedTokens === undefined
                ? {}
                : { native_tokens_cached: cachedTokens }),
              id: 'gen-123',
              model: 'openai/gpt-5.6-luna',
              tokens_prompt: 12,
              tokens_completion: 7,
              total_cost: 0.01,
            },
          }),
          { status: 200 },
        ),
      );

      await expect(createService().lookup('gen-123')).resolves.toEqual({
        status: 'malformed',
      });
    },
  );

  it.each([0, 9])(
    'preserves valid native_tokens_cached value %s',
    async (cachedTokens) => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              native_tokens_cached: cachedTokens,
              id: 'gen-123',
              model: 'openai/gpt-5.6-luna',
              tokens_prompt: 12,
              tokens_completion: 7,
              total_cost: 0.01,
            },
          }),
          { status: 200 },
        ),
      );

      await expect(createService().lookup('gen-123')).resolves.toEqual({
        cachedPromptTokens: cachedTokens,
        completionTokens: 7,
        id: 'gen-123',
        model: 'openai/gpt-5.6-luna',
        promptTokens: 12,
        status: 'found',
        totalCostUsd: 0.01,
      });
    },
  );

  it('fails closed on malformed generation metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'gen-123',
            model: 'openai/gpt-5.6-luna',
            usage: { prompt_tokens: 12, completion_tokens: 7 },
            total_cost: 0.01,
          },
        }),
        { status: 200 },
      ),
    );

    await expect(createService().lookup('gen-123')).resolves.toEqual({
      status: 'malformed',
    });
  });

  it('does not make provider I/O without a key or generation identifier', async () => {
    global.fetch = jest.fn();

    await expect(createService('').lookup('gen-123')).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(createService().lookup('')).resolves.toEqual({
      status: 'unavailable',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
