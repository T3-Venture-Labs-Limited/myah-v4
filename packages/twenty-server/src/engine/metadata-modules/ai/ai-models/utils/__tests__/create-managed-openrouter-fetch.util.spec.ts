import {
  createManagedOpenRouterFetch,
  getManagedOpenRouterRawUsage,
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

  it.each([
    [
      'application/json',
      JSON.stringify({
        usage: {
          cost: 0.000003,
          prompt_tokens_details: {
            cache_write_tokens: 3,
            cached_tokens: 2,
          },
        },
      }),
    ],
    [
      'text/event-stream',
      'data: {"usage":{"cost":0.000003,"prompt_tokens_details":{"cache_write_tokens":3,"cached_tokens":2}}}\n\n',
    ],
  ])(
    'preserves authoritative terminal usage for %s responses',
    async (contentType, body) => {
      const baseFetch = jest.fn().mockResolvedValue(
        new Response(body, {
          headers: {
            'content-type': contentType,
            'x-generation-id': 'generation-id',
          },
          status: 200,
        }),
      );
      const guardedFetch = createManagedOpenRouterFetch(baseFetch);

      const rawUsage = await runWithManagedOpenRouterResponseObserver(
        async () => undefined,
        async () => {
          const response = await guardedFetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              body: JSON.stringify({
                model: 'deepseek/deepseek-v4-flash',
                user: 'managed-0123456789abcdef01234567',
              }),
              method: 'POST',
            },
          );
          if (contentType === 'text/event-stream') {
            await response.text();
          }
          return getManagedOpenRouterRawUsage();
        },
      );

      expect(rawUsage).toEqual({
        cost: 0.000003,
        prompt_tokens_details: {
          cache_write_tokens: 3,
          cached_tokens: 2,
        },
      });
    },
  );

  it('keeps the last valid usage when DONE and malformed SSE lines follow it', async () => {
    const baseFetch = jest.fn().mockResolvedValue(
      new Response(
        'data: {"usage":{"cost":0.000003}}\n\ndata: [DONE]\n\ndata: {not-json}\n',
        {
          headers: {
            'content-type': 'text/event-stream',
            'x-generation-id': 'generation-id',
          },
        },
      ),
    );
    const guardedFetch = createManagedOpenRouterFetch(baseFetch);

    const rawUsage = await runWithManagedOpenRouterResponseObserver(
      async () => undefined,
      async () => {
        const response = await guardedFetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            body: JSON.stringify({
              model: 'deepseek/deepseek-v4-flash',
              user: 'managed-0123456789abcdef01234567',
            }),
            method: 'POST',
          },
        );
        await response.text();
        return getManagedOpenRouterRawUsage();
      },
    );

    expect(rawUsage).toEqual({ cost: 0.000003 });
  });

  it('cancels bounded SSE observation with the request signal', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(
          new TextEncoder().encode(`data: ${'x'.repeat(70_000)}`),
        );
      },
    });
    const baseFetch = jest.fn().mockResolvedValue(
      new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'x-generation-id': 'generation-id',
        },
      }),
    );
    const guardedFetch = createManagedOpenRouterFetch(baseFetch);

    const rawUsagePromise = runWithManagedOpenRouterResponseObserver(
      async () => undefined,
      async () => {
        await guardedFetch('https://openrouter.ai/api/v1/chat/completions', {
          body: JSON.stringify({
            model: 'deepseek/deepseek-v4-flash',
            user: 'managed-0123456789abcdef01234567',
          }),
          method: 'POST',
          signal: controller.signal,
        });
        return getManagedOpenRouterRawUsage();
      },
    );
    controller.abort();

    await expect(rawUsagePromise).resolves.toBeUndefined();
  });

  it('cancels the upstream reader when the forwarded SSE response is cancelled', async () => {
    const cancel = jest.fn();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        pulls += 1;
        return new Promise(() => undefined);
      },
      cancel,
    });
    const baseFetch = jest.fn().mockResolvedValue(
      new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'x-generation-id': 'generation-id',
        },
      }),
    );
    const guardedFetch = createManagedOpenRouterFetch(baseFetch);

    let rawUsagePromise: Promise<unknown> | undefined;
    const response = await runWithManagedOpenRouterResponseObserver(
      async () => undefined,
      async () => {
        const forwardedResponse = await guardedFetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            body: JSON.stringify({
              model: 'deepseek/deepseek-v4-flash',
              user: 'managed-0123456789abcdef01234567',
            }),
            method: 'POST',
          },
        );
        rawUsagePromise = getManagedOpenRouterRawUsage();
        return forwardedResponse;
      },
    );

    const reader = response.body?.getReader();
    await reader?.cancel();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulls).toBe(1);
    await expect(rawUsagePromise).resolves.toBeUndefined();
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
