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

  it('creates a single-use Instagram Hosted Auth link with only public callback state', async () => {
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
          url: 'https://auth.unipile.com/synthetic-hosted-auth-link',
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

    expect(hostedAuthLink).toEqual({
      url: 'https://auth.unipile.com/synthetic-hosted-auth-link',
    });
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
          type: 'create',
          providers: ['INSTAGRAM'],
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
  });
  it('creates a single-use Hosted Auth reconnect link without provider selection or account leakage', async () => {
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
          url: 'https://auth.unipile.com/synthetic-hosted-auth-reconnect-link',
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

    expect(hostedAuthLink).toEqual({
      url: 'https://auth.unipile.com/synthetic-hosted-auth-reconnect-link',
    });
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
  });

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
              type: 1,
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
              type: 1,
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
            type: 1,
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
          type: 1,
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
