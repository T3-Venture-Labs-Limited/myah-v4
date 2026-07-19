import {
  createManagedOpenRouterFetch,
  runWithManagedOpenRouterResponseObserver,
} from '../create-managed-openrouter-fetch.util';

describe('createManagedOpenRouterFetch', () => {
  it.each([
    ['deepseek/deepseek-v4-flash', { completion: 0.196, prompt: 0.098 }],
    ['x-ai/grok-4.5', { completion: 12, prompt: 4 }],
    ['openai/gpt-5.6-luna', { completion: 9, prompt: 2 }],
    ['google/gemma-4-31b-it:free', { completion: 0, prompt: 0 }],
  ])(
    'injects the reviewed capability and price guards for %s',
    async (model, maximumPrice) => {
      const baseFetch = jest
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));
      const guardedFetch = createManagedOpenRouterFetch(baseFetch);

      await guardedFetch('https://openrouter.ai/api/v1/chat/completions', {
        body: JSON.stringify({
          messages: [{ content: 'hello', role: 'user' }],
          model,
          provider: { max_price: { completion: 999, prompt: 999 } },
          user: 'managed-0123456789abcdef01234567',
        }),
        method: 'POST',
      });

      const request = JSON.parse(baseFetch.mock.calls[0][1].body);

      expect(request).toEqual(
        expect.objectContaining({
          messages: [{ content: 'hello', role: 'user' }],
          model,
          provider: {
            max_price: maximumPrice,
            require_parameters: true,
          },
          user: 'managed-0123456789abcdef01234567',
        }),
      );
    },
  );

  it.each([
    [{ model: 'unknown/model', user: 'managed-0123456789abcdef01234567' }],
    [{ model: 'deepseek/deepseek-v4-flash', user: 'raw-workspace-id' }],
    [{ model: 'deepseek/deepseek-v4-flash' }],
  ])('fails closed before provider I/O for an unsafe request', async (body) => {
    const baseFetch = jest.fn();
    const guardedFetch = createManagedOpenRouterFetch(baseFetch);

    await expect(
      guardedFetch('https://openrouter.ai/api/v1/chat/completions', {
        body: JSON.stringify(body),
        method: 'POST',
      }),
    ).rejects.toThrow('Managed OpenRouter request policy validation failed');
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it('reports the generation ID before returning the provider response', async () => {
    const events: string[] = [];
    const baseFetch = jest.fn().mockImplementation(async () => {
      events.push('provider-response');

      return new Response('{}', {
        headers: { 'x-generation-id': 'generation-id' },
        status: 200,
      });
    });
    const guardedFetch = createManagedOpenRouterFetch(baseFetch);

    await runWithManagedOpenRouterResponseObserver(
      async (providerExecutionId) => {
        events.push(`attached:${providerExecutionId}`);
      },
      () =>
        guardedFetch('https://openrouter.ai/api/v1/chat/completions', {
          body: JSON.stringify({
            model: 'deepseek/deepseek-v4-flash',
            user: 'managed-0123456789abcdef01234567',
          }),
          method: 'POST',
        }),
    );

    expect(events).toEqual(['provider-response', 'attached:generation-id']);
  });

  it('does not modify unrelated requests', async () => {
    const response = new Response('{}', { status: 200 });
    const baseFetch = jest.fn().mockResolvedValue(response);
    const guardedFetch = createManagedOpenRouterFetch(baseFetch);
    const init = { method: 'GET' };

    await expect(
      guardedFetch('https://openrouter.ai/api/v1/models', init),
    ).resolves.toBe(response);
    expect(baseFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      init,
    );
  });
});
