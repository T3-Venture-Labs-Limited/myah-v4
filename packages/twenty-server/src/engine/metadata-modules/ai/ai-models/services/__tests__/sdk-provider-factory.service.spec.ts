import { type LanguageModelV3 } from '@ai-sdk/provider';

import { SdkProviderFactoryService } from '../sdk-provider-factory.service';

describe('SdkProviderFactoryService managed OpenRouter transport', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends stable attribution and source-controlled routing guards through the real SDK provider', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              index: 0,
              message: { content: 'hello', role: 'assistant' },
            },
          ],
          created: 1,
          id: 'generation-1',
          model: 'deepseek/deepseek-v4-flash',
          object: 'chat.completion',
          usage: {
            completion_tokens: 1,
            cost: 0.000_000_294,
            prompt_tokens: 1,
            total_tokens: 2,
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-generation-id': 'generation-1',
          },
          status: 200,
        },
      ),
    );
    const provider = new SdkProviderFactoryService().createProvider(
      'openrouter',
      {
        apiKey: 'managed-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        label: 'Myah Managed OpenRouter',
        name: 'openrouter',
        npm: '@ai-sdk/openai-compatible',
      },
    );
    const model = provider.createModel(
      'deepseek/deepseek-v4-flash',
    ) as LanguageModelV3;

    const result = await model.doGenerate({
      prompt: [{ content: [{ text: 'hello', type: 'text' }], role: 'user' }],
      providerOptions: {
        openrouter: { user: 'managed-0123456789abcdef01234567' },
      },
    });

    expect(result.usage.raw).toEqual(
      expect.objectContaining({ cost: 0.000_000_294 }),
    );
    expect(result.response?.headers?.['x-generation-id']).toBe('generation-1');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body).toEqual(
      expect.objectContaining({
        model: 'deepseek/deepseek-v4-flash',
        provider: {
          max_price: { completion: 0.196, prompt: 0.098 },
          require_parameters: true,
        },
        user: 'managed-0123456789abcdef01234567',
      }),
    );
    expect(init.headers.authorization).toBe('Bearer managed-key');
  });
});
