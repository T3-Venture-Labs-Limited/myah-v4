import { ConfidentialClientApplication } from '@azure/msal-node';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MicrosoftAPIRefreshAccessTokenService } from 'src/modules/connected-account/refresh-tokens-manager/drivers/microsoft/services/microsoft-api-refresh-tokens.service';

describe('MicrosoftAPIRefreshAccessTokenService', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string) =>
      key === 'AUTH_MICROSOFT_CLIENT_ID' ? 'client-id' : 'client-secret',
    ),
  } as unknown as TwentyConfigService;
  const refreshToken = 'refresh-token' as PlaintextString;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses MSAL public networkClient with the supplied signal and disables internal retries', async () => {
    const abortController = new AbortController();
    let transportSignal: AbortSignal | null | undefined;
    let disableInternalRetries: boolean | undefined;

    global.fetch = jest.fn((_input, init) => {
      transportSignal = init?.signal;

      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      });
    }) as typeof fetch;

    jest
      .spyOn(
        ConfidentialClientApplication.prototype,
        'acquireTokenByRefreshToken',
      )
      .mockImplementationOnce(async function () {
        const system = (
          this as unknown as {
            config: {
              system: {
                disableInternalRetries: boolean;
                networkClient: {
                  sendPostRequestAsync: (url: string) => Promise<unknown>;
                };
              };
            };
          }
        ).config.system;

        disableInternalRetries = system.disableInternalRetries;
        await system.networkClient.sendPostRequestAsync(
          'https://login.microsoftonline.com/token',
        );

        return null;
      });

    const service = new MicrosoftAPIRefreshAccessTokenService(config);
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

    expect(disableInternalRetries).toBe(true);
    expect(transportSignal).toBe(abortController.signal);
    const rejection = expect(refreshPromise).rejects.toBeDefined();

    abortController.abort();
    await rejection;
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves default MSAL construction when no options are supplied', async () => {
    let disableInternalRetries: boolean | undefined;

    jest
      .spyOn(
        ConfidentialClientApplication.prototype,
        'acquireTokenByRefreshToken',
      )
      .mockImplementationOnce(async function () {
        disableInternalRetries = (
          this as unknown as {
            config: { system: { disableInternalRetries: boolean } };
          }
        ).config.system.disableInternalRetries;

        return null;
      });

    const service = new MicrosoftAPIRefreshAccessTokenService(config);

    await expect(service.refreshTokens(refreshToken)).rejects.toBeDefined();
    expect(disableInternalRetries).toBe(false);
  });
});
