import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { GoogleAPIRefreshAccessTokenService } from 'src/modules/connected-account/refresh-tokens-manager/drivers/google/services/google-api-refresh-tokens.service';

describe('GoogleAPIRefreshAccessTokenService', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string) =>
      key === 'AUTH_GOOGLE_CLIENT_ID' ? 'client-id' : 'client-secret',
    ),
  } as unknown as TwentyConfigService;
  const refreshToken = 'refresh-token' as PlaintextString;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the supplied signal on the installed Google transport and aborts a stalled token request', async () => {
    const abortController = new AbortController();
    let transportSignal: AbortSignal | null | undefined;

    global.fetch = jest.fn((_input, init) => {
      transportSignal = init?.signal;

      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      });
    }) as typeof fetch;

    const service = new GoogleAPIRefreshAccessTokenService(config);
    const refreshPromise = service.refreshTokens(refreshToken, {
      abortSignal: abortController.signal,
    });

    for (
      let index = 0;
      index < 20 && !jest.mocked(fetch).mock.calls.length;
      index++
    ) {
      await Promise.resolve();
    }

    expect(transportSignal).toBe(abortController.signal);
    const rejection = expect(refreshPromise).rejects.toBeDefined();

    abortController.abort();
    await rejection;
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the default Google refresh behavior when no options are supplied', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'access-token', expires_in: 3600 }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const service = new GoogleAPIRefreshAccessTokenService(config);

    await expect(service.refreshTokens(refreshToken)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken,
    });
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal).toBeUndefined();
  });

  it('disables the installed Google authentication retry policy', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'server_error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;

    const service = new GoogleAPIRefreshAccessTokenService(config);

    await expect(
      service.refreshTokens(refreshToken, {
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toBeDefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({
      retry: false,
      retryConfig: expect.objectContaining({
        retry: 0,
        noResponseRetries: 0,
      }),
    });
  });
});
