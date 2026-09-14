type UnipileInstagramAccount = {
  accountId: string;
  instagramUserId: string;
  username: string | null;
  sourceStatus: string;
};

type UnipileCreateHostedAuthLinkInput =
  | {
      expiresOn: Date;
      successRedirectUrl: string;
      failureRedirectUrl: string;
      notifyUrl: string;
      name: string;
    }
  | {
      operation: 'RECONNECT';
      reconnectAccountId: string;
      expiresOn: Date;
      successRedirectUrl: string;
      failureRedirectUrl: string;
      notifyUrl: string;
      name: string;
    };

type UnipileStartChatInput = {
  accountId: string;
  attendeeId: string;
  text: string;
};

type UnipileSendMessageInput = {
  accountId: string;
  chatId: string;
  text: string;
};

type UnipileSendMessageOutcome =
  | {
      kind: 'ACCEPTED';
      value: { messageId: string };
    }
  | {
      kind: 'UNKNOWN';
      status: number | null;
      code: string;
    };

type UnipileStartChatOutcome =
  | {
      kind: 'ACCEPTED';
      value: { chatId: string; messageId: string };
    }
  | {
      kind: 'UNKNOWN';
      status: number | null;
      code: string;
    };

type UnipileInstagramChat = {
  chatId: string;
  accountId: string;
  accountType: 'INSTAGRAM';
  type: 'ONE_TO_ONE';
  attendeeProviderId: string;
  name: string | null;
  timestamp: string | null;
};

type UnipileListChatsInput = {
  accountId: string;
  cursor: string | null;
  after: string;
  limit: number;
};

type UnipileGetChatInput = {
  accountId: string;
  chatId: string;
  expectedAttendeeId: string;
};

type UnipileListChatsOutput = {
  chats: UnipileInstagramChat[];
  nextCursor: string | null;
};

type UnipileInstagramMessage = {
  messageId: string;
  accountId: string;
  chatId: string;
  senderId: string;
  text: string | null;
  timestamp: string | null;
  seen: boolean;
  delivered: boolean;
  hidden: boolean;
  deleted: boolean;
  isEvent: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
};

type UnipileListMessagesInput = {
  accountId: string;
  chatId: string;
  cursor: string | null;
  after: string;
  limit: number;
};

type UnipileListMessagesOutput = {
  messages: UnipileInstagramMessage[];
  nextCursor: string | null;
};

type UnipileGetMessageInput = {
  accountId: string;
  chatId: string;
  messageId: string;
};

type UnipileV1ClientService = {
  getInstagramMessagingProfile: (input: {
    accountId: string;
    username: string;
  }) => Promise<{
    providerId: string;
    providerMessagingId: string;
    username: string;
  }>;
  createHostedAuthLink: (
    input: UnipileCreateHostedAuthLinkInput,
  ) => Promise<{ url: string }>;
  getAccount: (accountId: string) => Promise<UnipileInstagramAccount>;
  getChat?: (input: UnipileGetChatInput) => Promise<UnipileInstagramChat>;
  listChats: (input: UnipileListChatsInput) => Promise<UnipileListChatsOutput>;
  listMessages: (
    input: UnipileListMessagesInput,
  ) => Promise<UnipileListMessagesOutput>;
  getMessage?: (
    input: UnipileGetMessageInput,
  ) => Promise<UnipileInstagramMessage>;

  startChat?: (
    input: UnipileStartChatInput,
    options: { beforeDispatch: () => Promise<void> },
  ) => Promise<UnipileStartChatOutcome>;
  deleteAccount?: (
    accountId: string,
    options: { beforeDispatch: () => Promise<void> },
  ) => Promise<
    | { kind: 'ACCEPTED'; value: { deleted: true } }
    | { kind: 'KNOWN_REJECTION'; status: number; code: string }
    | { kind: 'UNKNOWN'; status: number | null; code: string }
  >;
  sendMessage?: (
    input: UnipileSendMessageInput,
    options: { beforeDispatch: () => Promise<void> },
  ) => Promise<UnipileSendMessageOutcome>;
};

type UnipileReadError = Error & {
  status: number;
  code: string;
  retryable: boolean;
};

type UnipileV1ClientServiceModule = {
  UnipileReadError: new (...args: never[]) => UnipileReadError;
  UnipileV1ClientService: new (
    availabilityService: {
      assertEnabled: jest.Mock;
      readonly config: { apiBaseUrl: string };
    },
    twentyConfigService: { get: jest.Mock },
    fetch: jest.Mock,
  ) => UnipileV1ClientService;
};

const loadClientServiceModule = ():
  | UnipileV1ClientServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-v1-client.service') as UnipileV1ClientServiceModule;
  } catch {
    return undefined;
  }
};

describe('UnipileV1ClientService', () => {
  it('declares the runtime TwentyConfigService token and an explicit fetch token when fetch is injected', () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const { TwentyConfigService } =
      require('src/engine/core-modules/twenty-config/twenty-config.service') as {
        TwentyConfigService: unknown;
      };
    const getMetadata = (
      Reflect as typeof Reflect & {
        getMetadata: (metadataKey: string, target: object) => unknown;
      }
    ).getMetadata;
    const parameterTypes = getMetadata(
      'design:paramtypes',
      clientServiceModule.UnipileV1ClientService,
    ) as unknown[];

    expect(parameterTypes[1]).toBe(TwentyConfigService);

    if (parameterTypes.length > 2) {
      const injectedParameters = getMetadata(
        'self:paramtypes',
        clientServiceModule.UnipileV1ClientService,
      ) as Array<{ index: number; param: unknown }>;
      const fetchToken = injectedParameters.find(
        ({ index }) => index === 2,
      )?.param;

      expect(fetchToken).toBeDefined();
      expect(fetchToken).not.toBe(Function);
    }
  });

  it('retrieves and validates the bound Instagram account', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'unipile-account-123',
          type: 'INSTAGRAM',
          connection_params: {
            im: {
              id: 'instagram-user-456',
              username: 'synthetic.instagram',
            },
          },
          sources: [{ status: 'OK' }],
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );

    const account = await service.getAccount('unipile-account-123');

    expect(account).toEqual({
      accountId: 'unipile-account-123',
      instagramUserId: 'instagram-user-456',
      username: 'synthetic.instagram',
      sourceStatus: 'OK',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/accounts/unipile-account-123',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    );
    expect(callOrder).toEqual(['availability', 'config:UNIPILE_API_KEY']);

    const [requestUrl, requestOptions] = fetch.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    const requestLog = {
      requestUrl,
      requestOptions: {
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          'X-API-KEY': '[REDACTED]',
        },
      },
    };

    expect(JSON.stringify(account)).not.toContain(apiKey);
    expect(JSON.stringify(requestLog)).not.toContain(apiKey);
  });
  it('classifies a missing account as a safe read error', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const providerDetail = 'provider-detail-must-not-leak';
    const providerRequestId = 'provider-request-id-must-not-leak';
    const providerBody = {
      error: 'account_not_found',
      detail: providerDetail,
      request_id: providerRequestId,
    };
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve(providerBody),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => apiKey) },
      fetch,
    );

    const error = await service
      .getAccount('unipile-account-123')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(clientServiceModule.UnipileReadError);
    expect(error).toMatchObject({
      status: 404,
      code: 'UNIPILE_ACCOUNT_NOT_FOUND',
      retryable: true,
      message: 'Unable to retrieve the requested Instagram account',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(providerDetail);
    expect(JSON.stringify(error)).not.toContain(providerRequestId);
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain(providerDetail);
    expect(String(error)).not.toContain(providerRequestId);
  });
  it.each(['network failure', 'non-2xx response'])(
    'uses finite abort signals and maps a %s across every read operation to safe errors',
    async (failure) => {
      const readOperations: Array<
        [
          string,
          string,
          string,
          (service: UnipileV1ClientService) => Promise<unknown>,
        ]
      > = [
        [
          'Hosted Auth link',
          'UNIPILE_HOSTED_AUTH_LINK_UNAVAILABLE',
          'Unable to create an Instagram Hosted Auth link',
          (service) =>
            service.createHostedAuthLink({
              expiresOn: new Date('2026-09-03T12:15:00.000Z'),
              successRedirectUrl:
                'https://app.myah.test/integrations/instagram/success',
              failureRedirectUrl:
                'https://app.myah.test/integrations/instagram/failure',
              notifyUrl:
                'https://api.myah.test/unipile/hosted-auth/attempts/attempt-public-123',
              name: 'b893a6da2ea0a6444fa14afaf9f18f45101111bdc5b84aaef54d9c9c9d70e701',
            }),
        ],
        [
          'chat list',
          'UNIPILE_CHAT_LIST_UNAVAILABLE',
          'Unable to retrieve the requested Instagram chats',
          (service) =>
            service.listChats({
              accountId: 'unipile-account-123',
              cursor: null,
              after: '2026-09-03T12:15:00.000Z',
              limit: 75,
            }),
        ],
        [
          'message list',
          'UNIPILE_MESSAGE_LIST_UNAVAILABLE',
          'Unable to retrieve the requested Instagram messages',
          (service) =>
            service.listMessages({
              accountId: 'unipile-account-123',
              chatId: 'unipile-chat-123',
              cursor: null,
              after: '2026-09-03T12:15:00.000Z',
              limit: 75,
            }),
        ],
        [
          'message',
          'UNIPILE_MESSAGE_UNAVAILABLE',
          'Unable to retrieve the requested Instagram message',
          (service) =>
            service.getMessage!.call(service, {
              accountId: 'unipile-account-123',
              chatId: 'unipile-chat-123',
              messageId: 'unipile-message-123',
            }),
        ],
        [
          'chat',
          'UNIPILE_CHAT_UNAVAILABLE',
          'Unable to retrieve the requested Instagram chat',
          (service) =>
            service.getChat!.call(service, {
              accountId: 'unipile-account-123',
              chatId: 'unipile-chat-123',
              expectedAttendeeId: 'instagram-user-456',
            }),
        ],
        [
          'account',
          'UNIPILE_ACCOUNT_UNAVAILABLE',
          'Unable to retrieve the requested Instagram account',
          (service) => service.getAccount('unipile-account-123'),
        ],
      ];

      for (const [operation, code, message, dispatch] of readOperations) {
        const providerDetail = `${operation}-detail-must-not-leak`;
        const networkError = new Error(
          `${operation}-network-error-must-not-leak`,
        );
        const fetch = jest.fn(() =>
          failure === 'network failure'
            ? Promise.reject(networkError)
            : Promise.resolve({
                ok: false,
                status: 502,
                json: () => Promise.resolve({ detail: providerDetail }),
              }),
        );
        const timeoutSignal = new AbortController().signal;
        const timeoutSpy = jest
          .spyOn(AbortSignal, 'timeout')
          .mockReturnValue(timeoutSignal);
        const clientServiceModule = loadClientServiceModule();

        expect(clientServiceModule).toBeDefined();

        if (!clientServiceModule) {
          timeoutSpy.mockRestore();

          return;
        }

        try {
          const service = new clientServiceModule.UnipileV1ClientService(
            {
              assertEnabled: jest.fn(),
              config: {
                apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/',
              },
            },
            { get: jest.fn(() => 'synthetic-unipile-api-key') },
            fetch,
          );
          const error = await dispatch(service).catch(
            (caught: unknown) => caught,
          );

          expect(error).toMatchObject({
            status: failure === 'network failure' ? expect.any(Number) : 502,
            code,
            retryable: true,
            message,
          });
          expect(JSON.stringify(error)).not.toContain(providerDetail);
          expect(JSON.stringify(error)).not.toContain(networkError.message);
          expect(String(error)).not.toContain(providerDetail);
          expect(String(error)).not.toContain(networkError.message);
          expect(fetch).toHaveBeenCalledTimes(1);

          const [, requestOptions] = fetch.mock.calls[0] as unknown as [
            string,
            { signal?: AbortSignal },
          ];

          expect(requestOptions.signal).toBe(timeoutSignal);
          expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Number));
          expect(
            timeoutSpy.mock.calls.every(
              ([milliseconds]) =>
                Number.isFinite(milliseconds) &&
                milliseconds > 0 &&
                milliseconds <= 20_000,
            ),
          ).toBe(true);
        } finally {
          timeoutSpy.mockRestore();
        }
      }
    },
  );
  it('rejects a returned Instagram account bound to another account id', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const unexpectedAccountId = 'unipile-account-789';
    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = { get: jest.fn(() => 'synthetic-api-key') };
    const fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          id: unexpectedAccountId,
          type: 'INSTAGRAM',
          connection_params: { im: { id: 'instagram-user-456' } },
          sources: [{ status: 'OK' }],
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const error = await service
      .getAccount('unipile-account-123')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(clientServiceModule.UnipileReadError);
    expect(error).toMatchObject({
      status: 200,
      code: 'UNIPILE_ACCOUNT_UNAVAILABLE',
      retryable: false,
    });
    expect((error as Error).message).not.toContain(unexpectedAccountId);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('classifies a rate-limited account read as retryable', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => 'synthetic-api-key') },
      jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ detail: 'provider rate limit' }),
      }),
    );

    const error = await service
      .getAccount('unipile-account-123')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(clientServiceModule.UnipileReadError);
    expect(error).toMatchObject({
      status: 429,
      code: 'UNIPILE_ACCOUNT_UNAVAILABLE',
      retryable: true,
      message: 'Unable to retrieve the requested Instagram account',
    });
  });

  it('classifies a malformed successful account response as non-retryable', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => 'synthetic-api-key') },
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'unipile-account-123' }),
      }),
    );

    const error = await service
      .getAccount('unipile-account-123')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(clientServiceModule.UnipileReadError);
    expect(error).toMatchObject({
      status: 200,
      code: 'UNIPILE_ACCOUNT_UNAVAILABLE',
      retryable: false,
      message: 'Unable to retrieve the requested Instagram account',
    });
  });

  it.each([
    'https://account.unipile.com/synthetic-hosted-auth-link',
    'https://account.unipile.com:443/synthetic-hosted-auth-link',
    'https://account.unipile.com/opaque%2fTOKEN%2B%3D/%252F?signature=a%2Fb%2Bc%3D&state=x+y&state=%2520#opaque%23',
  ])(
    'creates a single-use Instagram Hosted Auth link preserving %s with only public callback state',
    async (url) => {
      const clientServiceModule = loadClientServiceModule();

      expect(clientServiceModule).toBeDefined();

      if (!clientServiceModule) {
        return;
      }

      const apiKey = 'synthetic-unipile-api-key';
      const callOrder: string[] = [];
      const availabilityService = {
        assertEnabled: jest.fn(() => callOrder.push('availability')),
        config: { apiBaseUrl: 'https://api46.unipile.com:17699/api/v1/' },
      };
      const twentyConfigService = {
        get: jest.fn((key: string) => {
          callOrder.push(`config:${key}`);

          if (key === 'UNIPILE_API_KEY') {
            return apiKey;
          }

          throw new Error(`Unexpected configuration key: ${key}`);
        }),
      };
      const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            url,
            id: 'provider-only-link-id',
          }),
      });
      const service = new clientServiceModule.UnipileV1ClientService(
        availabilityService,
        twentyConfigService,
        fetch,
      );
      const expiresOn = new Date('2026-09-03T12:15:00.000Z');
      const input = {
        expiresOn,
        successRedirectUrl:
          'https://app.myah.test/integrations/instagram/success',
        failureRedirectUrl:
          'https://app.myah.test/integrations/instagram/failure',
        notifyUrl:
          'https://api.myah.test/unipile/hosted-auth/attempts/attempt-public-123',
        name: 'b893a6da2ea0a6444fa14afaf9f18f45101111bdc5b84aaef54d9c9c9d70e701',
      };

      const hostedAuthLink = await service.createHostedAuthLink(input);

      expect(hostedAuthLink).toEqual({ url });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api46.unipile.com:17699/api/v1/hosted/accounts/link',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey,
          },
          body: JSON.stringify({
            type: 'create',
            providers: ['INSTAGRAM'],
            single_use: true,
            api_url: 'https://api46.unipile.com:17699',
            expiresOn: expiresOn.toISOString(),
            success_redirect_url: input.successRedirectUrl,
            failure_redirect_url: input.failureRedirectUrl,
            notify_url: input.notifyUrl,
            name: input.name,
          }),
          redirect: 'error',
          signal: expect.any(AbortSignal),
        },
      );
      expect(callOrder).toEqual(['availability', 'config:UNIPILE_API_KEY']);
    },
  );
  it.each([
    'https://account.unipile.com/synthetic-hosted-auth-reconnect-link',
    'https://account.unipile.com:443/synthetic-hosted-auth-reconnect-link',
    'https://account.unipile.com/opaque%2fTOKEN%2B%3D/%252F?signature=a%2Fb%2Bc%3D&state=x+y&state=%2520#opaque%23',
  ])(
    'creates a single-use Hosted Auth reconnect link preserving %s without provider selection or account leakage',
    async (url) => {
      const clientServiceModule = loadClientServiceModule();

      expect(clientServiceModule).toBeDefined();

      if (!clientServiceModule) {
        return;
      }

      const apiKey = 'synthetic-unipile-api-key';
      const callOrder: string[] = [];
      const availabilityService = {
        assertEnabled: jest.fn(() => callOrder.push('availability')),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      };
      const twentyConfigService = {
        get: jest.fn((key: string) => {
          callOrder.push(`config:${key}`);

          if (key === 'UNIPILE_API_KEY') {
            return apiKey;
          }

          throw new Error(`Unexpected configuration key: ${key}`);
        }),
      };
      const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            url,
            id: 'provider-only-link-id',
            account_id: 'unipile-instagram-account-123',
          }),
      });
      const service = new clientServiceModule.UnipileV1ClientService(
        availabilityService,
        twentyConfigService,
        fetch,
      );
      const expiresOn = new Date('2026-09-03T12:15:00.000Z');
      const input = {
        operation: 'RECONNECT' as const,
        reconnectAccountId: 'unipile-instagram-account-123',
        expiresOn,
        successRedirectUrl:
          'https://app.myah.test/integrations/instagram/success',
        failureRedirectUrl:
          'https://app.myah.test/integrations/instagram/failure',
        notifyUrl:
          'https://api.myah.test/unipile/hosted-auth/attempts/attempt-public-123',
        name: 'b893a6da2ea0a6444fa14afaf9f18f45101111bdc5b84aaef54d9c9c9d70e701',
      };

      const hostedAuthLink = await service.createHostedAuthLink(input);

      expect(hostedAuthLink).toEqual({ url });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api49.unipile.com:17981/api/v1/hosted/accounts/link',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey,
          },
          body: JSON.stringify({
            type: 'reconnect',
            reconnect_account: input.reconnectAccountId,
            single_use: true,
            api_url: 'https://api49.unipile.com:17981',
            expiresOn: expiresOn.toISOString(),
            success_redirect_url: input.successRedirectUrl,
            failure_redirect_url: input.failureRedirectUrl,
            notify_url: input.notifyUrl,
            name: input.name,
          }),
          redirect: 'error',
          signal: expect.any(AbortSignal),
        },
      );
      expect(callOrder).toEqual(['availability', 'config:UNIPILE_API_KEY']);
    },
  );

  describe.each(['CREATE', 'RECONNECT'] as const)(
    'Hosted Auth %s returned URL trust',
    (operation) => {
      it.each<[string, unknown]>([
        ['attacker HTTPS host', 'https://attacker.example/url-token-sentinel'],
        ['HTTP official host', 'http://account.unipile.com/url-token-sentinel'],
        ['javascript scheme', 'javascript:alert("url-token-sentinel")'],
        ['data scheme', 'data:text/plain,url-token-sentinel'],
        ['FTP scheme', 'ftp://account.unipile.com/url-token-sentinel'],
        [
          'blob scheme with official origin',
          'blob:https://account.unipile.com/00000000-0000-4000-8000-000000000000',
        ],
        [
          'host suffix',
          'https://account.unipile.com.attacker.example/url-token-sentinel',
        ],
        ['subdomain', 'https://login.account.unipile.com/url-token-sentinel'],
        ['lookalike', 'https://account-unipile.com/url-token-sentinel'],
        [
          'trailing-dot host',
          'https://account.unipile.com./url-token-sentinel',
        ],
        // The official guide generates account.unipile.com, not this old fixture host.
        [
          'undocumented sibling host',
          'https://auth.unipile.com/url-token-sentinel',
        ],
        [
          'API DSN origin',
          'https://api49.unipile.com:17981/url-token-sentinel',
        ],
        ['custom domain', 'https://auth.myah.test/url-token-sentinel'],
        [
          'attacker userinfo on official host',
          'https://credential-sentinel@account.unipile.com/url-token-sentinel',
        ],
        [
          'password on official host',
          'https://:credential-sentinel@account.unipile.com/url-token-sentinel',
        ],
        [
          'username and password',
          'https://attacker:credential-sentinel@account.unipile.com/url-token-sentinel',
        ],
        [
          'official host as userinfo',
          'https://account.unipile.com@attacker.example/url-token-sentinel',
        ],
        [
          'nondefault port',
          'https://account.unipile.com:444/url-token-sentinel',
        ],
        ['malformed URL', 'https://[url-token-sentinel'],
        ['relative URL', '/url-token-sentinel'],
        ['empty URL', ''],
        ['missing URL', undefined],
        ['null URL', null],
        ['numeric URL', 123],
        [
          'object URL',
          { url: 'https://account.unipile.com/url-token-sentinel' },
        ],
        ['array URL', ['https://account.unipile.com/url-token-sentinel']],
      ])(
        'rejects %s through the existing redacted read error',
        async (_name, url) => {
          const clientServiceModule = loadClientServiceModule();

          expect(clientServiceModule).toBeDefined();

          if (!clientServiceModule) {
            return;
          }

          const apiKey = 'synthetic-hosted-auth-api-key';
          const diagnostic = 'provider-diagnostic-sentinel';
          const fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ url, detail: diagnostic }),
          });
          const service = new clientServiceModule.UnipileV1ClientService(
            {
              assertEnabled: jest.fn(),
              config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
            },
            { get: jest.fn(() => apiKey) },
            fetch,
          );
          const input = {
            expiresOn: new Date('2026-09-03T12:15:00.000Z'),
            successRedirectUrl:
              'https://app.myah.test/integrations/instagram/success',
            failureRedirectUrl:
              'https://app.myah.test/integrations/instagram/failure',
            notifyUrl:
              'https://api.myah.test/unipile/hosted-auth/attempts/attempt-public-123',
            name: 'synthetic-callback-state',
          };
          const error = await service
            .createHostedAuthLink(
              operation === 'RECONNECT'
                ? {
                    ...input,
                    operation,
                    reconnectAccountId: 'synthetic-account',
                  }
                : input,
            )
            .catch((caught: unknown) => caught);

          expect(error).toBeInstanceOf(clientServiceModule.UnipileReadError);
          expect(error).toMatchObject({
            name: 'UnipileReadError',
            code: 'UNIPILE_HOSTED_AUTH_LINK_UNAVAILABLE',
            message: 'Unable to create an Instagram Hosted Auth link',
            status: 200,
            retryable: false,
          });
          for (const sensitive of [
            apiKey,
            diagnostic,
            'url-token-sentinel',
            'credential-sentinel',
            ...(typeof url === 'string' && url.length > 0 ? [url] : []),
          ]) {
            expect(JSON.stringify(error)).not.toContain(sensitive);
            expect(String(error)).not.toContain(sensitive);
          }
          expect(fetch).toHaveBeenCalledTimes(1);
        },
      );
    },
  );

  it('lists Instagram chats with the exact cursor query and safe public values', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          object: 'ChatList',
          items: [
            {
              object: 'Chat',
              id: 'unipile-chat-123',
              account_id: 'unipile-account-123',
              account_type: 'INSTAGRAM',
              provider_id: 'provider-chat-456',
              attendee_provider_id: 'instagram-user-456',
              name: null,
              type: 0,
              timestamp: '2026-09-03T12:15:00.000Z',
              unread_count: 0,
              archived: 0,
              muted_until: null,
              read_only: 0,
              pinned: 0,
              provider_detail: 'must not appear in the public result',
            },
          ],
          cursor: 'next-cursor-789',
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );

    const chats = await service.listChats({
      accountId: 'unipile-account-123',
      cursor: 'current-cursor-456',
      after: '2026-09-03T12:15:00.000Z',
      limit: 75,
    });

    expect(chats).toEqual({
      chats: [
        {
          chatId: 'unipile-chat-123',
          accountId: 'unipile-account-123',
          accountType: 'INSTAGRAM',
          type: 'ONE_TO_ONE',
          attendeeProviderId: 'instagram-user-456',
          name: null,
          timestamp: '2026-09-03T12:15:00.000Z',
        },
      ],
      nextCursor: 'next-cursor-789',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/chats?account_id=unipile-account-123&account_type=INSTAGRAM&cursor=current-cursor-456&after=2026-09-03T12%3A15%3A00.000Z&limit=75',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('imports only single chats from a mixed page and preserves its cursor', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'ChatList',
          items: [
            {
              object: 'Chat',
              id: 'unipile-direct-chat-123',
              account_id: 'unipile-account-123',
              account_type: 'INSTAGRAM',
              attendee_provider_id: 'instagram-user-456',
              name: null,
              type: 0,
              timestamp: '2026-09-03T12:15:00.000Z',
            },
            {
              object: 'Chat',
              id: 'unipile-group-chat-456',
              account_id: 'unipile-account-123',
              account_type: 'INSTAGRAM',
              name: 'Synthetic group',
              type: 1,
              timestamp: '2026-09-03T12:14:00.000Z',
            },
            {
              object: 'Chat',
              id: 'unipile-channel-chat-789',
              account_id: 'unipile-account-123',
              account_type: 'INSTAGRAM',
              name: 'Synthetic channel',
              type: 2,
              timestamp: '2026-09-03T12:13:00.000Z',
            },
          ],
          cursor: 'next-cursor-789',
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => 'synthetic-unipile-api-key') },
      fetch,
    );

    await expect(
      service.listChats({
        accountId: 'unipile-account-123',
        cursor: 'current-cursor-456',
        after: '2026-09-03T12:15:00.000Z',
        limit: 25,
      }),
    ).resolves.toEqual({
      chats: [
        {
          chatId: 'unipile-direct-chat-123',
          accountId: 'unipile-account-123',
          accountType: 'INSTAGRAM',
          type: 'ONE_TO_ONE',
          attendeeProviderId: 'instagram-user-456',
          name: null,
          timestamp: '2026-09-03T12:15:00.000Z',
        },
      ],
      nextCursor: 'next-cursor-789',
    });
  });

  it('fails closed when a chat page contains an unsupported chat type', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'ChatList',
          items: [
            {
              object: 'Chat',
              id: 'unipile-unsupported-chat-123',
              account_id: 'unipile-account-123',
              account_type: 'INSTAGRAM',
              name: null,
              type: 3,
              timestamp: '2026-09-03T12:15:00.000Z',
            },
          ],
          cursor: null,
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => 'synthetic-unipile-api-key') },
      fetch,
    );

    await expect(
      service.listChats({
        accountId: 'unipile-account-123',
        cursor: null,
        after: '2026-09-03T12:15:00.000Z',
        limit: 25,
      }),
    ).rejects.toMatchObject({
      code: 'UNIPILE_CHAT_LIST_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram chats',
    });
  });

  it('rejects a chat list item bound to another Instagram account', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const unexpectedAccountId = 'unipile-account-789';
    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = { get: jest.fn(() => 'synthetic-api-key') };
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          object: 'ChatList',
          items: [
            {
              object: 'Chat',
              id: 'unipile-chat-123',
              account_id: unexpectedAccountId,
              account_type: 'INSTAGRAM',
              attendee_provider_id: 'instagram-user-456',
              name: null,
              type: 0,
              timestamp: '2026-09-03T12:15:00.000Z',
            },
          ],
          cursor: null,
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const error = await service
      .listChats({
        accountId: 'unipile-account-123',
        cursor: null,
        after: '2026-09-03T12:15:00.000Z',
        limit: 25,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(unexpectedAccountId);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('lists Instagram chat messages with exact paging and safe public values', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const providerAttachmentUrl =
      'https://provider.example.test/attachments/private-image.png?token=synthetic-secret';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'MessageList',
            items: [
              {
                object: 'Message',
                id: 'unipile-message-123',
                account_id: 'unipile-account-123',
                chat_id: 'unipile-chat-123',
                sender_id: 'instagram-user-456',
                is_sender: 1,
                text: null,
                attachments: [
                  {
                    id: 'unipile-attachment-123',
                    url: providerAttachmentUrl,
                  },
                ],
                timestamp: '2026-09-03T12:15:00.000Z',
                seen: 1,
                delivered: 1,
                hidden: 0,
                deleted: 0,
                is_event: 0,
              },
              {
                object: 'Message',
                id: 'unipile-message-456',
                account_id: 'unipile-account-123',
                chat_id: 'unipile-chat-123',
                sender_id: 'instagram-user-789',
                text: 'Synthetic Instagram reply',
                attachments: [],
                timestamp: null,
              },
            ],
            cursor: 'next-cursor-789',
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );

    const result = await service.listMessages({
      accountId: 'unipile-account-123',
      chatId: 'unipile-chat-123',
      cursor: 'current-cursor-456',
      after: '2026-09-03T12:15:00.000Z',
      limit: 75,
    });

    expect(result).toEqual({
      messages: [
        {
          messageId: 'unipile-message-123',
          accountId: 'unipile-account-123',
          chatId: 'unipile-chat-123',
          senderId: 'instagram-user-456',
          isSender: 1,
          text: null,
          timestamp: '2026-09-03T12:15:00.000Z',
          seen: true,
          delivered: true,
          hidden: false,
          deleted: false,
          isEvent: false,
          hasAttachments: true,
          attachmentCount: 1,
        },
        {
          messageId: 'unipile-message-456',
          accountId: 'unipile-account-123',
          chatId: 'unipile-chat-123',
          senderId: 'instagram-user-789',
          text: 'Synthetic Instagram reply',
          timestamp: null,
          seen: false,
          delivered: false,
          hidden: false,
          deleted: false,
          isEvent: false,
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
      nextCursor: 'next-cursor-789',
    });
    expect(JSON.stringify(result)).not.toContain(providerAttachmentUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/chats/unipile-chat-123/messages?cursor=current-cursor-456&after=2026-09-03T12%3A15%3A00.000Z&limit=75',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    );
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'fetch',
    ]);
  });

  it.each([
    ['account', 'different-unipile-account-789', 'unipile-chat-123'],
    ['chat', 'unipile-account-123', 'different-unipile-chat-789'],
  ])(
    'rejects a message list item bound to another Instagram %s without exposing provider identifiers',
    async (_binding, accountId, chatId) => {
      const clientServiceModule = loadClientServiceModule();

      expect(clientServiceModule).toBeDefined();

      if (!clientServiceModule) {
        return;
      }

      const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'MessageList',
            items: [
              {
                object: 'Message',
                id: 'unipile-message-789',
                account_id: accountId,
                chat_id: chatId,
                sender_id: 'instagram-user-456',
                text: 'Synthetic Instagram message',
                attachments: [],
                timestamp: '2026-09-03T12:15:00.000Z',
              },
            ],
            cursor: null,
          }),
      });
      const service = new clientServiceModule.UnipileV1ClientService(
        {
          assertEnabled: jest.fn(),
          config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
        },
        { get: jest.fn(() => 'synthetic-unipile-api-key') },
        fetch,
      );
      const error = await service
        .listMessages({
          accountId: 'unipile-account-123',
          chatId: 'unipile-chat-123',
          cursor: null,
          after: '2026-09-03T12:15:00.000Z',
          limit: 25,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Unable to retrieve the requested Instagram messages',
      );
      expect((error as Error).message).not.toContain(accountId);
      expect((error as Error).message).not.toContain(chatId);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('retrieves a bound Instagram message with safe mapped values', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const providerAttachmentUrl =
      'https://provider.example.test/attachments/private-image.png?token=synthetic-secret';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'Message',
            id: 'unipile-message-123',
            account_id: 'unipile-account-123',
            chat_id: 'unipile-chat-123',
            sender_id: 'instagram-user-456',
            is_sender: 1,
            text: null,
            attachments: [
              {
                id: 'unipile-attachment-123',
                url: providerAttachmentUrl,
              },
            ],
            timestamp: '2026-09-03T12:15:00.000Z',
            seen: 0,
            delivered: 1,
            hidden: 1,
            deleted: 0,
            is_event: 0,
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const getMessage = service.getMessage;

    expect(getMessage).toBeDefined();

    if (!getMessage) {
      return;
    }

    const message = await getMessage.call(service, {
      accountId: 'unipile-account-123',
      chatId: 'unipile-chat-123',
      messageId: 'unipile-message-123',
    });

    expect(message).toEqual({
      messageId: 'unipile-message-123',
      accountId: 'unipile-account-123',
      chatId: 'unipile-chat-123',
      senderId: 'instagram-user-456',
      isSender: 1,
      text: null,
      timestamp: '2026-09-03T12:15:00.000Z',
      seen: false,
      delivered: true,
      hidden: true,
      deleted: false,
      isEvent: false,
      hasAttachments: true,
      attachmentCount: 1,
    });
    expect(JSON.stringify(message)).not.toContain(providerAttachmentUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/messages/unipile-message-123',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    );
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'fetch',
    ]);
  });

  it.each([
    [
      'account',
      'different-unipile-account-789',
      'unipile-chat-123',
      'unipile-message-123',
    ],
    [
      'chat',
      'unipile-account-123',
      'different-unipile-chat-789',
      'unipile-message-123',
    ],
    [
      'message',
      'unipile-account-123',
      'unipile-chat-123',
      'different-unipile-message-789',
    ],
  ])(
    'rejects an Instagram message bound to another %s without exposing provider identifiers',
    async (_binding, accountId, chatId, messageId) => {
      const clientServiceModule = loadClientServiceModule();

      expect(clientServiceModule).toBeDefined();

      if (!clientServiceModule) {
        return;
      }

      const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'Message',
            id: messageId,
            account_id: accountId,
            chat_id: chatId,
            sender_id: 'instagram-user-456',
            text: 'Synthetic Instagram message',
            attachments: [],
            timestamp: '2026-09-03T12:15:00.000Z',
          }),
      });
      const service = new clientServiceModule.UnipileV1ClientService(
        {
          assertEnabled: jest.fn(),
          config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
        },
        { get: jest.fn(() => 'synthetic-unipile-api-key') },
        fetch,
      );
      const getMessage = service.getMessage;

      expect(getMessage).toBeDefined();

      if (!getMessage) {
        return;
      }

      const error = await getMessage
        .call(service, {
          accountId: 'unipile-account-123',
          chatId: 'unipile-chat-123',
          messageId: 'unipile-message-123',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Unable to retrieve the requested Instagram message',
      );
      expect((error as Error).message).not.toContain(accountId);
      expect((error as Error).message).not.toContain(chatId);
      expect((error as Error).message).not.toContain(messageId);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, 2])(
    'rejects invalid provider self-sender evidence %p',
    async (isSender) => {
      const clientServiceModule = loadClientServiceModule();

      expect(clientServiceModule).toBeDefined();
      if (!clientServiceModule) {
        return;
      }

      const service = new clientServiceModule.UnipileV1ClientService(
        {
          assertEnabled: jest.fn(),
          config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
        },
        { get: jest.fn(() => 'synthetic-unipile-api-key') },
        jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              object: 'Message',
              id: 'unipile-message-123',
              account_id: 'unipile-account-123',
              chat_id: 'unipile-chat-123',
              sender_id: 'instagram-user-456',
              is_sender: isSender,
              text: 'Synthetic Instagram message',
              attachments: [],
              timestamp: '2026-09-03T12:15:00.000Z',
            }),
        }),
      );
      const getMessage = service.getMessage;

      expect(getMessage).toBeDefined();
      if (!getMessage) {
        return;
      }

      await expect(
        getMessage.call(service, {
          accountId: 'unipile-account-123',
          chatId: 'unipile-chat-123',
          messageId: 'unipile-message-123',
        }),
      ).rejects.toThrow('Unable to retrieve the requested Instagram message');
    },
  );

  it('rejects a zero message list limit before availability, secret lookup, or fetch', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = { get: jest.fn() };
    const fetch = jest.fn();
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );

    await expect(
      service.listMessages({
        accountId: 'unipile-account-123',
        chatId: 'unipile-chat-123',
        cursor: null,
        after: '2026-09-03T12:15:00.000Z',
        limit: 0,
      }),
    ).rejects.toThrow(/limit/i);

    expect(availabilityService.assertEnabled).not.toHaveBeenCalled();
    expect(twentyConfigService.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retrieves a bound Instagram chat with safe mapped values', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'Chat',
            id: 'unipile-chat-123',
            account_id: 'unipile-account-123',
            account_type: 'INSTAGRAM',
            attendee_provider_id: 'instagram-user-456',
            name: null,
            type: 0,
            timestamp: '2026-09-03T12:15:00.000Z',
            provider_detail: 'must not appear in the public result',
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const getChat = service.getChat;

    expect(getChat).toBeDefined();

    if (!getChat) {
      return;
    }

    const chat = await getChat.call(service, {
      accountId: 'unipile-account-123',
      chatId: 'unipile-chat-123',
      expectedAttendeeId: 'instagram-user-456',
    });

    expect(chat).toEqual({
      chatId: 'unipile-chat-123',
      accountId: 'unipile-account-123',
      accountType: 'INSTAGRAM',
      type: 'ONE_TO_ONE',
      attendeeProviderId: 'instagram-user-456',
      name: null,
      timestamp: '2026-09-03T12:15:00.000Z',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/chats/unipile-chat-123',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    );
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'fetch',
    ]);
  });

  it('rejects a group chat when resolving a direct-chat identity', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'Chat',
          id: 'unipile-group-chat-123',
          account_id: 'unipile-account-123',
          account_type: 'INSTAGRAM',
          name: 'Synthetic group',
          type: 1,
          timestamp: '2026-09-03T12:15:00.000Z',
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => 'synthetic-unipile-api-key') },
      fetch,
    );

    const getChat = service.getChat;

    expect(getChat).toBeDefined();

    if (!getChat) {
      return;
    }

    await expect(
      getChat.call(service, {
        accountId: 'unipile-account-123',
        chatId: 'unipile-group-chat-123',
        expectedAttendeeId: 'instagram-user-456',
      }),
    ).rejects.toMatchObject({
      code: 'UNIPILE_CHAT_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram chat',
    });
  });

  it('rejects an account-mismatched chat without exposing provider data', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const providerBody = `Provider account mismatch leaked ${apiKey}`;
    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          object: 'Chat',
          id: 'unipile-chat-123',
          account_id: 'different-unipile-account-789',
          account_type: 'INSTAGRAM',
          attendee_provider_id: 'instagram-user-456',
          name: null,
          type: 0,
          timestamp: '2026-09-03T12:15:00.000Z',
          provider_detail: providerBody,
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const getChat = service.getChat;

    expect(getChat).toBeDefined();

    if (!getChat) {
      return;
    }

    const error = await getChat
      .call(service, {
        accountId: 'unipile-account-123',
        chatId: 'unipile-chat-123',
        expectedAttendeeId: 'instagram-user-456',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Unable to retrieve the requested Instagram chat',
    );
    expect((error as Error).message).not.toContain(providerBody);
    expect((error as Error).message).not.toContain(apiKey);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/chats/unipile-chat-123',
      expect.any(Object),
    );
  });

  it('rejects a chat with a mismatched ID without exposing provider identifiers', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const unexpectedChatId = 'different-unipile-chat-789';
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          object: 'Chat',
          id: unexpectedChatId,
          account_id: 'unipile-account-123',
          account_type: 'INSTAGRAM',
          attendee_provider_id: 'instagram-user-456',
          name: null,
          type: 0,
          timestamp: '2026-09-03T12:15:00.000Z',
        }),
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      },
      { get: jest.fn(() => 'synthetic-unipile-api-key') },
      fetch,
    );
    const getChat = service.getChat;

    expect(getChat).toBeDefined();

    if (!getChat) {
      return;
    }

    const error = await getChat
      .call(service, {
        accountId: 'unipile-account-123',
        chatId: 'unipile-chat-123',
        expectedAttendeeId: 'instagram-user-456',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Unable to retrieve the requested Instagram chat',
    );
    expect((error as Error).message).not.toContain(unexpectedChatId);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a chat list limit above 250 before availability, secret lookup, or fetch', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = { get: jest.fn() };
    const fetch = jest.fn();
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );

    await expect(
      service.listChats({
        accountId: 'unipile-account-123',
        cursor: null,
        after: '2026-09-03T12:15:00.000Z',
        limit: 251,
      }),
    ).rejects.toThrow(/limit/i);

    expect(availabilityService.assertEnabled).not.toHaveBeenCalled();
    expect(twentyConfigService.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits before dispatching a multipart existing-chat message and accepts the documented MessageSent response', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            object: 'MessageSent',
            message_id: 'unipile-message-456',
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const sendMessage = service.sendMessage;

    expect(sendMessage).toBeDefined();

    if (!sendMessage) {
      return;
    }

    let releaseBeforeDispatch!: () => void;
    const beforeDispatch = jest.fn(() => {
      callOrder.push('beforeDispatch');

      return new Promise<void>((resolve) => {
        releaseBeforeDispatch = resolve;
      });
    });
    const send = sendMessage.call(
      service,
      {
        accountId: 'unipile-account-123',
        chatId: 'unipile-chat-123',
        text: 'Synthetic existing-chat text',
      },
      { beforeDispatch },
    );

    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'beforeDispatch',
    ]);
    expect(fetch).not.toHaveBeenCalled();

    releaseBeforeDispatch();

    await expect(send).resolves.toEqual({
      kind: 'ACCEPTED',
      value: { messageId: 'unipile-message-456' },
    });
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'beforeDispatch',
      'fetch',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);

    const [requestUrl, requestOptions] = fetch.mock.calls[0] as unknown as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body: FormData;
        redirect: string;
      },
    ];

    expect(requestUrl).toBe(
      'https://api49.unipile.com:17981/api/v1/chats/unipile-chat-123/messages',
    );
    expect(requestOptions).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      },
      redirect: 'error',
    });
    expect(requestOptions.headers).not.toHaveProperty('Content-Type');
    expect(requestOptions.body).toBeInstanceOf(FormData);
    expect([...requestOptions.body.entries()]).toEqual([
      ['account_id', 'unipile-account-123'],
      ['text', 'Synthetic existing-chat text'],
    ]);
  });

  it('waits before dispatching a multipart chat start and maps provider acceptance', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            object: 'ChatStarted',
            chat_id: 'unipile-chat-123',
            message_id: 'unipile-message-456',
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const startChat = service.startChat;

    expect(startChat).toBeDefined();

    if (!startChat) {
      return;
    }

    let releaseBeforeDispatch!: () => void;
    const beforeDispatch = jest.fn(() => {
      callOrder.push('beforeDispatch');

      return new Promise<void>((resolve) => {
        releaseBeforeDispatch = resolve;
      });
    });
    const start = startChat.call(
      service,
      {
        accountId: 'unipile-account-123',
        attendeeId: 'instagram-user-456',
        text: 'Synthetic outbound chat text',
      },
      { beforeDispatch },
    );

    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();

    releaseBeforeDispatch();

    await expect(start).resolves.toEqual({
      kind: 'ACCEPTED',
      value: {
        chatId: 'unipile-chat-123',
        messageId: 'unipile-message-456',
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(callOrder.indexOf('beforeDispatch')).toBeLessThan(
      callOrder.indexOf('fetch'),
    );
    expect(callOrder.indexOf('availability')).toBeLessThan(
      callOrder.indexOf('config:UNIPILE_API_KEY'),
    );

    const [requestUrl, requestOptions] = fetch.mock.calls[0] as unknown as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body: FormData;
        redirect: string;
      },
    ];

    expect(requestUrl).toBe('https://api49.unipile.com:17981/api/v1/chats');
    expect(requestOptions).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      },
      redirect: 'error',
    });
    expect(requestOptions.headers).not.toHaveProperty('Content-Type');
    expect(requestOptions.body).toBeInstanceOf(FormData);
    expect([...requestOptions.body.entries()]).toEqual([
      ['account_id', 'unipile-account-123'],
      ['attendees_ids', 'instagram-user-456'],
      ['text', 'Synthetic outbound chat text'],
    ]);
  });

  it('maps a dispatched 503 chat start to an unknown safe outcome', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const callOrder: string[] = [];
    const providerDetail = `Provider diagnostic leaked ${apiKey}`;
    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            code: 'provider-unsafe-code',
            detail: providerDetail,
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const startChat = service.startChat;

    expect(startChat).toBeDefined();

    if (!startChat) {
      return;
    }

    const beforeDispatch = jest.fn(() => {
      callOrder.push('beforeDispatch');

      return Promise.resolve();
    });
    const result = await startChat.call(
      service,
      {
        accountId: 'unipile-account-123',
        attendeeId: 'instagram-user-456',
        text: 'Synthetic outbound chat text',
      },
      { beforeDispatch },
    );

    expect(result).toEqual({
      kind: 'UNKNOWN',
      status: 503,
      code: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain('provider-unsafe-code');
    expect(JSON.stringify(result)).not.toContain(providerDetail);
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['beforeDispatch', 'fetch']);
  });

  it.each([
    [
      'chat start',
      (service: UnipileV1ClientService, beforeDispatch: () => Promise<void>) =>
        service.startChat!.call(
          service,
          {
            accountId: 'unipile-account-123',
            attendeeId: 'instagram-user-456',
            text: 'Synthetic outbound chat text',
          },
          { beforeDispatch },
        ),
    ],
    [
      'existing-chat message',
      (service: UnipileV1ClientService, beforeDispatch: () => Promise<void>) =>
        service.sendMessage!.call(
          service,
          {
            accountId: 'unipile-account-123',
            chatId: 'unipile-chat-123',
            text: 'Synthetic existing-chat text',
          },
          { beforeDispatch },
        ),
    ],
    [
      'account deletion',
      (service: UnipileV1ClientService, beforeDispatch: () => Promise<void>) =>
        service.deleteAccount!.call(service, 'unipile-account-123', {
          beforeDispatch,
        }),
    ],
  ])(
    'maps a rejected dispatched %s fetch to an unknown safe outcome with a finite abort signal',
    async (
      _operation,
      dispatch: (
        service: UnipileV1ClientService,
        beforeDispatch: () => Promise<void>,
      ) => Promise<unknown>,
    ) => {
      const providerError = new Error('synthetic rejected fetch');
      const callOrder: string[] = [];
      const fetch = jest.fn(() => {
        callOrder.push('fetch');

        return Promise.reject(providerError);
      });
      const timeoutSignal = new AbortController().signal;
      const timeoutSpy = jest
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(timeoutSignal);
      const availabilityService = {
        assertEnabled: jest.fn(),
        config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
      };
      const twentyConfigService = { get: jest.fn(() => 'synthetic-api-key') };
      const clientServiceModule = loadClientServiceModule();

      expect(clientServiceModule).toBeDefined();

      if (!clientServiceModule) {
        timeoutSpy.mockRestore();

        return;
      }

      try {
        const service = new clientServiceModule.UnipileV1ClientService(
          availabilityService,
          twentyConfigService,
          fetch,
        );
        const beforeDispatch = jest.fn(() => {
          callOrder.push('beforeDispatch');

          return Promise.resolve();
        });
        const outcome = await dispatch(service, beforeDispatch);

        expect(outcome).toMatchObject({
          kind: 'UNKNOWN',
          status: null,
          code: expect.any(String),
        });
        expect(JSON.stringify(outcome)).not.toContain(providerError.message);
        expect(beforeDispatch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(callOrder).toEqual(['beforeDispatch', 'fetch']);

        const [, requestOptions] = fetch.mock.calls[0] as unknown as [
          string,
          { signal?: AbortSignal },
        ];

        expect(requestOptions.signal).toBe(timeoutSignal);
        expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Number));
        expect(
          timeoutSpy.mock.calls.every(
            ([milliseconds]) =>
              Number.isFinite(milliseconds) && milliseconds > 0,
          ),
        ).toBe(true);
      } finally {
        timeoutSpy.mockRestore();
      }
    },
  );

  it('maps a post-dispatch chat-start body parse failure to an unknown safe outcome', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const bodyError = new Error('synthetic unreadable body');
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.reject(bodyError),
    });
    const availabilityService = {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = { get: jest.fn(() => 'synthetic-api-key') };
    const beforeDispatch = jest.fn(() => Promise.resolve());
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const result = await service.startChat!.call(
      service,
      {
        accountId: 'unipile-account-123',
        attendeeId: 'instagram-user-456',
        text: 'Synthetic outbound chat text',
      },
      { beforeDispatch },
    );

    expect(result).toMatchObject({
      kind: 'UNKNOWN',
      status: 201,
      code: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain(bodyError.message);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
  });

  it('maps a 403 chat start after dispatch to a known safe rejection', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const providerDetail =
      `Synthetic verbose provider diagnostic containing secret ${apiKey} ` +
      'and sensitive account data that must never be exposed';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            code: 'provider-unsafe-code',
            detail: providerDetail,
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const startChat = service.startChat;

    expect(startChat).toBeDefined();

    if (!startChat) {
      return;
    }

    const beforeDispatch = jest.fn(() => {
      callOrder.push('beforeDispatch');

      return Promise.resolve();
    });
    const result = await startChat.call(
      service,
      {
        accountId: 'unipile-account-123',
        attendeeId: 'instagram-user-456',
        text: 'Synthetic outbound chat text',
      },
      { beforeDispatch },
    );

    expect(result).toEqual({
      kind: 'KNOWN_REJECTION',
      status: 403,
      code: 'UNIPILE_CHAT_START_REJECTED',
    });
    expect(JSON.stringify(result)).not.toContain('provider-unsafe-code');
    expect(JSON.stringify(result)).not.toContain(providerDetail);
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'beforeDispatch',
      'fetch',
    ]);
  });

  it('waits for deferred dispatch before deleting an account and accepts AccountDeleted', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'AccountDeleted' }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const deleteAccount = service.deleteAccount;

    expect(deleteAccount).toBeDefined();

    if (!deleteAccount) {
      return;
    }

    let releaseBeforeDispatch!: () => void;
    const beforeDispatch = jest.fn(() => {
      callOrder.push('beforeDispatch');

      return new Promise<void>((resolve) => {
        releaseBeforeDispatch = resolve;
      });
    });
    const deletion = deleteAccount.call(service, 'unipile-account-123', {
      beforeDispatch,
    });

    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'beforeDispatch',
    ]);
    expect(fetch).not.toHaveBeenCalled();

    releaseBeforeDispatch();

    await expect(deletion).resolves.toEqual({
      kind: 'ACCEPTED',
      value: { deleted: true },
    });
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'beforeDispatch',
      'fetch',
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/accounts/unipile-account-123',
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
      },
    );
  });

  it('maps a dispatched 404 account delete to a known safe rejection', async () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    if (!clientServiceModule) {
      return;
    }

    const apiKey = 'synthetic-unipile-api-key';
    const providerDetail =
      `Synthetic verbose provider diagnostic containing secret ${apiKey} ` +
      'and sensitive account data that must never be exposed';
    const callOrder: string[] = [];
    const availabilityService = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/' },
    };
    const twentyConfigService = {
      get: jest.fn((key: string) => {
        callOrder.push(`config:${key}`);

        if (key === 'UNIPILE_API_KEY') {
          return apiKey;
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    const fetch = jest.fn(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            code: 'provider-unsafe-code',
            detail: providerDetail,
          }),
      });
    });
    const service = new clientServiceModule.UnipileV1ClientService(
      availabilityService,
      twentyConfigService,
      fetch,
    );
    const deleteAccount = service.deleteAccount;

    expect(deleteAccount).toBeDefined();

    if (!deleteAccount) {
      return;
    }

    const beforeDispatch = jest.fn(() => {
      callOrder.push('beforeDispatch');

      return Promise.resolve();
    });
    const result = await deleteAccount.call(service, 'unipile-account-123', {
      beforeDispatch,
    });

    expect(result).toEqual({
      kind: 'KNOWN_REJECTION',
      status: 404,
      code: 'UNIPILE_ACCOUNT_DELETE_REJECTED',
    });
    expect(JSON.stringify(result)).not.toContain('provider-unsafe-code');
    expect(JSON.stringify(result)).not.toContain(providerDetail);
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual([
      'availability',
      'config:UNIPILE_API_KEY',
      'beforeDispatch',
      'fetch',
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'https://api49.unipile.com:17981/api/v1/accounts/unipile-account-123',
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        redirect: 'error',
      },
    );
  });
});

describe('UnipileV1ClientService.getInstagramMessagingProfile', () => {
  const input = {
    accountId: ' account+scope/&account_id=other?#%雪 ',
    username: 'synthetic.creator_13',
  };
  const profile = {
    object: 'UserProfile',
    provider: 'INSTAGRAM',
    provider_id: 'profile-900719925474099312345',
    provider_messaging_id: 'messaging-opaque:000456',
    public_identifier: input.username,
  };
  const apiKey = 'synthetic-profile-api-key';
  const apiBaseUrl = 'https://api49.unipile.com:17981/api/v1/';
  const diagnostic = 'synthetic-provider-diagnostic';
  const createHarness = () => {
    const clientServiceModule = loadClientServiceModule();

    expect(clientServiceModule).toBeDefined();

    const callOrder: string[] = [];
    const availability = {
      assertEnabled: jest.fn(() => callOrder.push('availability')),
      config: { apiBaseUrl },
    };
    const config = {
      get: jest.fn(() => {
        callOrder.push('config');

        return apiKey;
      }),
    };
    const fetch = jest.fn().mockImplementation(() => {
      callOrder.push('fetch');

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(profile),
      });
    });
    const service = new clientServiceModule!.UnipileV1ClientService(
      availability,
      config,
      fetch,
    );

    expect(service.getInstagramMessagingProfile).toEqual(expect.any(Function));

    return {
      service,
      fetch,
      config,
      availability,
      callOrder,
      clientServiceModule: clientServiceModule!,
    };
  };
  const expectSafeError = (
    error: unknown,
    status: number,
    retryable: boolean,
  ) => {
    expect(error).toMatchObject({
      name: 'UnipileReadError',
      status,
      code: 'UNIPILE_INSTAGRAM_MESSAGING_PROFILE_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram messaging profile',
      retryable,
    });
    for (const sensitive of [
      apiKey,
      apiBaseUrl,
      input.accountId,
      input.username,
      profile.provider_id,
      profile.provider_messaging_id,
      diagnostic,
    ]) {
      expect(JSON.stringify(error)).not.toContain(sensitive);
      expect(String(error)).not.toContain(sensitive);
    }
  };

  it('reads the exact account-scoped path with a 15s timeout and no write dispatch', async () => {
    const { service, fetch, config, callOrder } = createHarness();
    const signal = new AbortController().signal;
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const beforeDispatch = jest.fn();

    try {
      await expect(
        service.getInstagramMessagingProfile({
          ...input,
          ...{ beforeDispatch },
        }),
      ).resolves.toEqual({
        providerId: profile.provider_id,
        providerMessagingId: profile.provider_messaging_id,
        username: input.username,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        `${apiBaseUrl}users/synthetic.creator_13?account_id=+account%2Bscope%2F%26account_id%3Dother%3F%23%25%E9%9B%AA+`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
          redirect: 'error',
          signal,
        },
      );
      const [url] = fetch.mock.calls[0] as [string];

      expect([...new URL(url).searchParams.entries()]).toEqual([
        ['account_id', input.accountId],
      ]);
      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(config.get).toHaveBeenCalledWith('UNIPILE_API_KEY');
      expect(callOrder).toEqual(['availability', 'config', 'fetch']);
      expect(beforeDispatch).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });

  it.each(['account-\uD800', 'account-\uDC00'])(
    'rejects unpaired surrogate account ID %p before API configuration, secret lookup or transport',
    async (accountId) => {
      const { service, fetch, config, availability, callOrder } =
        createHarness();
      const getApiConfig = jest.fn(() => ({ apiBaseUrl }));

      Object.defineProperty(availability, 'config', { get: getApiConfig });
      const error = await service
        .getInstagramMessagingProfile({ ...input, accountId })
        .catch((caught: unknown) => caught);

      expectSafeError(error, 400, false);
      expect(getApiConfig).not.toHaveBeenCalled();
      expect(config.get).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(callOrder).toEqual(['availability']);
    },
  );

  it('preserves a supplementary Unicode account ID through the adapter request', async () => {
    const { service, fetch } = createHarness();
    const accountId = 'account-\uD83D\uDE80';

    await expect(
      service.getInstagramMessagingProfile({ ...input, accountId }),
    ).resolves.toEqual({
      providerId: profile.provider_id,
      providerMessagingId: profile.provider_messaging_id,
      username: input.username,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = fetch.mock.calls[0] as [string];

    expect([...new URL(url).searchParams.entries()]).toEqual([
      ['account_id', accountId],
    ]);
  });

  it('discards profile metadata and preserves opaque ID bytes without coercion or trimming', async () => {
    const { service, fetch } = createHarness();

    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...profile,
          provider_id: ' 000900719925474099312345 ',
          provider_messaging_id: ' opaque/messaging:+000123 ',
          full_name: 'Synthetic Creator',
          biography: diagnostic,
          followers_count: 123,
          relationship_status: { following: false },
          pk: 123,
          id: 'unipile-attendee-record-id',
        }),
    });
    await expect(service.getInstagramMessagingProfile(input)).resolves.toEqual({
      providerId: ' 000900719925474099312345 ',
      providerMessagingId: ' opaque/messaging:+000123 ',
      username: input.username,
    });
  });

  it.each<[string, unknown]>([
    ['wrong provider', { ...profile, provider: 'LINKEDIN' }],
    ['wrong object', { ...profile, object: 'ChatAttendee' }],
    ['missing provider', { ...profile, provider: undefined }],
    ['missing object', { ...profile, object: undefined }],
    ['mismatched username', { ...profile, public_identifier: 'other.creator' }],
    [
      'noncanonical returned username',
      { ...profile, public_identifier: 'Synthetic.Creator_13' },
    ],
    [
      'at-sign returned username',
      { ...profile, public_identifier: '@synthetic.creator_13' },
    ],
    [
      'whitespace returned username',
      { ...profile, public_identifier: ' synthetic.creator_13 ' },
    ],
    [
      'SDK-only pk',
      {
        object: 'UserProfile',
        provider: 'INSTAGRAM',
        pk: 123,
        username: input.username,
      },
    ],
    [
      'attendee ID only',
      {
        ...profile,
        provider_messaging_id: undefined,
        id: 'unipile-attendee-record-id',
      },
    ],
    ['null body', null],
    ['array body', [profile]],
    ...['provider_id', 'provider_messaging_id', 'public_identifier'].flatMap(
      (field) =>
        [undefined, null, '', ' \t\n', 123].map((value): [string, unknown] => [
          `${field}=${String(value)}`,
          { ...profile, [field]: value },
        ]),
    ),
  ])(
    'fails closed on %s without identity fallbacks or response leaks',
    async (_name, body) => {
      const { service, fetch, clientServiceModule } = createHarness();

      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      });
      const error = await service
        .getInstagramMessagingProfile(input)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(clientServiceModule.UnipileReadError);
      expectSafeError(error, 200, false);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    '',
    ' ',
    '@synthetic.creator_13',
    'Synthetic.Creator_13',
    ' synthetic.creator_13 ',
    '../chats',
    '.',
    '..',
    'creator..name',
    '.creator',
    'creator.',
    'creator/other',
    'creator?account_id=other',
    'creator#fragment',
    'creator%2fother',
    'creator\\other',
    'a'.repeat(31),
    'creator-name',
    '雪',
  ])(
    'rejects noncanonical or injectable requested username %p before secret lookup or transport',
    async (username) => {
      const { service, fetch, config } = createHarness();
      const error = await service
        .getInstagramMessagingProfile({ ...input, username })
        .catch((caught: unknown) => caught);

      expectSafeError(error, 400, false);
      expect(config.get).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['', ' \t\n'])(
    'rejects blank account ID %p before secret lookup or transport',
    async (accountId) => {
      const { service, fetch, config } = createHarness();
      const error = await service
        .getInstagramMessagingProfile({ ...input, accountId })
        .catch((caught: unknown) => caught);

      expectSafeError(error, 400, false);
      expect(config.get).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([400, 401, 403, 404, 422, 429, 500, 502, 503])(
    'redacts HTTP %s failures with existing read retryability and no retries',
    async (status) => {
      const { service, fetch } = createHarness();
      const json = jest.fn(() =>
        Promise.resolve({ detail: diagnostic, ...profile }),
      );

      fetch.mockResolvedValue({ ok: false, status, json });
      const error = await service
        .getInstagramMessagingProfile(input)
        .catch((caught: unknown) => caught);

      expectSafeError(error, status, status === 429 || status >= 500);
      expect(json).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('redacts malformed JSON', async () => {
    const { service, fetch } = createHarness();

    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError(diagnostic)),
    });
    const error = await service
      .getInstagramMessagingProfile(input)
      .catch((caught: unknown) => caught);

    expectSafeError(error, 200, false);
  });

  it.each(['TimeoutError', 'TypeError'])(
    'redacts transport %s without retrying',
    async (name) => {
      const { service, fetch } = createHarness();

      fetch.mockRejectedValue(
        Object.assign(new Error(`${apiBaseUrl}${diagnostic}${apiKey}`), {
          name,
        }),
      );
      const error = await service
        .getInstagramMessagingProfile(input)
        .catch((caught: unknown) => caught);

      expectSafeError(error, 0, true);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('honors feature availability before configuration lookup or transport', async () => {
    const { service, fetch, config, availability } = createHarness();
    const disabled = new Error('Instagram integration is disabled');

    availability.assertEnabled.mockImplementation(() => {
      throw disabled;
    });
    await expect(service.getInstagramMessagingProfile(input)).rejects.toBe(
      disabled,
    );
    expect(config.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('UnipileV1ClientService timestamp ingestion', () => {
  const accountId = 'opaque-account';
  const chatId = 'opaque-chat';
  const messageId = 'opaque-message';
  const attendeeId = ' attendee:opaque ';
  const cursor = ' cursor:+/% opaque ';
  const apiBaseUrl = 'https://timestamp.invalid/api/v1/';
  const apiKey = 'synthetic-timestamp-api-key-secret';
  const after = '2024-01-01T00:00:00.000Z';
  const rawChat = (timestamp: unknown) => ({
    object: 'Chat',
    id: chatId,
    account_id: accountId,
    account_type: 'INSTAGRAM',
    type: 0,
    attendee_provider_id: attendeeId,
    name: 'body-sentinel',
    timestamp,
  });
  const rawMessage = (timestamp: unknown) => ({
    object: 'Message',
    id: messageId,
    account_id: accountId,
    chat_id: chatId,
    sender_id: attendeeId,
    is_sender: 0,
    text: 'body-sentinel',
    attachments: [{}],
    timestamp,
  });
  const reads = [
    {
      method: 'listChats',
      code: 'UNIPILE_CHAT_LIST_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram chats',
      route: `chats?account_id=${accountId}&account_type=INSTAGRAM&after=${encodeURIComponent(after)}&limit=25`,
    },
    {
      method: 'getChat',
      code: 'UNIPILE_CHAT_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram chat',
      route: `chats/${chatId}`,
    },
    {
      method: 'listMessages',
      code: 'UNIPILE_MESSAGE_LIST_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram messages',
      route: `chats/${chatId}/messages?after=${encodeURIComponent(after)}&limit=25`,
    },
    {
      method: 'getMessage',
      code: 'UNIPILE_MESSAGE_UNAVAILABLE',
      message: 'Unable to retrieve the requested Instagram message',
      route: `messages/${messageId}`,
    },
  ] as const;
  type Read = (typeof reads)[number];
  const harnessFor = (
    read: Read,
    timestamp: unknown,
    bodyOverride?: unknown,
  ) => {
    const module = loadClientServiceModule();

    if (!module) throw new Error('Unipile client is unavailable');

    const chat = rawChat(timestamp);
    const message = rawMessage(timestamp);
    const body =
      bodyOverride ??
      (read.method === 'listChats'
        ? { object: 'ChatList', items: [chat], cursor }
        : read.method === 'listMessages'
          ? { object: 'MessageList', items: [message], cursor }
          : read.method === 'getChat'
            ? chat
            : message);
    const fetch = jest.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${apiBaseUrl}${read.route}`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      });
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const service = new module.UnipileV1ClientService(
      { assertEnabled: jest.fn(), config: { apiBaseUrl } },
      {
        get: jest.fn((key: string) => {
          expect(key).toBe('UNIPILE_API_KEY');
          return apiKey;
        }),
      },
      fetch,
    );
    const invoke = () => {
      switch (read.method) {
        case 'listChats':
          return service.listChats({
            accountId,
            cursor: null,
            after,
            limit: 25,
          });
        case 'listMessages':
          return service.listMessages({
            accountId,
            chatId,
            cursor: null,
            after,
            limit: 25,
          });
        case 'getChat': {
          if (!service.getChat) throw new Error('getChat is unavailable');
          return service.getChat({
            accountId,
            chatId,
            expectedAttendeeId: attendeeId,
          });
        }
        case 'getMessage': {
          if (!service.getMessage) throw new Error('getMessage is unavailable');
          return service.getMessage({ accountId, chatId, messageId });
        }
      }
    };
    return { invoke, fetch, ErrorClass: module.UnipileReadError };
  };
  const expectRejected = async (
    read: Read,
    timestamp: unknown,
    body?: unknown,
  ) => {
    const harness = harnessFor(read, timestamp, body);
    const result = harness.invoke();
    await expect(result).rejects.toBeInstanceOf(harness.ErrorClass);
    await expect(result).rejects.toMatchObject({
      name: 'UnipileReadError',
      status: 200,
      code: read.code,
      message: read.message,
      retryable: false,
    });
    const error = (await result.catch(
      (value: unknown) => value,
    )) as UnipileReadError;
    expect(`${error.message} ${JSON.stringify(error)}`).not.toMatch(
      /body-sentinel|timestamp-sentinel|synthetic-timestamp-api-key-secret|Zod|issues|invalid_format/,
    );
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('issues');
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  };

  describe.each(reads)('$method', (read) => {
    it.each([
      'not-a-date-timestamp-sentinel',
      '',
      '2026-02-29T12:00:00Z',
      '2024-02-30T12:00:00Z',
      '1900-02-29T12:00:00Z',
      '2024-04-31T12:00:00Z',
      '2024-00-01T12:00:00Z',
      '2024-13-01T12:00:00Z',
      '2024-01-00T12:00:00Z',
      '0000-01-01T00:00:00Z',
      '+010000-01-01T00:00:00Z',
      '2024-01-01T12:00:00+16:00',
      '2024-01-01T12:00:00-16:00',
      '2024-01-01T12:00:00+23:59',
      '0001-01-01T00:00:00+15:59',
      '9999-12-31T23:59:59-15:59',
      '2024-01-01T23:59:59.9999999Z',
      '2024-01-01T12:00:00.123456789Z',
      `2024-01-01T12:00:00.${'1'.repeat(100)}Z`,
      '2024-01-01T12:00:00.1234567+05:30',
      '2024-01-01T12:00:00+15:60',
      '2024-01-01T12:00:00+0530',
      '2024-01-01t12:00:00Z',
      '2024-01-01T12:00:00z',
      '2024-01-01T24:00:00Z',
      '2024-01-01T12:60:00Z',
      '2024-01-01T12:00:60Z',
      '2024-01-01T12:00:00',
      '2024-01-01',
      'infinity',
      '-infinity',
      ' 2024-01-01T12:00:00Z',
      '2024-01-01T12:00:00Z\n',
      '2024-01-01T12:00.1Z',
      '2024-01-01T12:00:00.Z',
    ])(
      'rejects malformed successful timestamp %p with a redacted terminal read error',
      async (timestamp) => {
        await expectRejected(read, timestamp);
      },
    );

    it.each([undefined, 123, false, {}, []])(
      'retains required string-or-null controls for %p',
      async (timestamp) => {
        await expectRejected(read, timestamp);
      },
    );

    it.each([
      null,
      '2024-01-01T12:00Z',
      '2024-01-01T12:00+15:59',
      '2024-02-29T12:00:00Z',
      '2000-02-29T12:00:00Z',
      '2024-01-01T12:00:00.1Z',
      '2024-01-01T12:00:00.123Z',
      '2024-01-01T12:00:00.123456Z',
      '2024-01-01T12:00:00.123456+05:30',
      '2024-01-01T12:00:00+15:59',
      '2024-01-01T12:00:00-15:59',
      '2024-01-01T12:00:00-00:00',
      '2024-01-01T12:00:00+00:00',
      '0001-01-01T00:00:00Z',
      '9999-12-31T23:59:59.999999Z',
      '0001-01-01T15:59:00+15:59',
      '9999-12-31T08:00:59.999999-15:59',
    ])(
      'preserves accepted timestamp %p and opaque identity/cursor bytes',
      async (timestamp) => {
        const harness = harnessFor(read, timestamp);
        const result = await harness.invoke();
        const record =
          'chats' in result
            ? result.chats[0]
            : 'messages' in result
              ? result.messages[0]
              : result;
        expect(record).toMatchObject({ accountId, chatId, timestamp });
        if ('messageId' in record) {
          expect(record).toMatchObject({
            messageId,
            senderId: attendeeId,
            text: 'body-sentinel',
            attachmentCount: 1,
            hasAttachments: true,
          });
        } else {
          expect(record).toMatchObject({ attendeeProviderId: attendeeId });
        }
        if ('nextCursor' in result) expect(result.nextCursor).toBe(cursor);
        expect(harness.fetch).toHaveBeenCalledTimes(1);
      },
    );
  });

  it.each([1, 2])(
    'rejects a mixed ChatList before filtering ignored chat type %s',
    async (type) => {
      await expectRejected(reads[0], null, {
        object: 'ChatList',
        cursor,
        items: [
          rawChat(null),
          {
            ...rawChat('not-a-date-timestamp-sentinel'),
            id: 'ignored-chat',
            type,
          },
        ],
      });
    },
  );
  it.each(['hidden', 'deleted', 'is_event'])(
    'rejects a mixed MessageList with malformed %s item before consumer skipping',
    async (flag) => {
      await expectRejected(reads[2], null, {
        object: 'MessageList',
        cursor,
        items: [
          rawMessage(null),
          {
            ...rawMessage('not-a-date-timestamp-sentinel'),
            id: 'ignored-message',
            [flag]: 1,
          },
        ],
      });
    },
  );
});
