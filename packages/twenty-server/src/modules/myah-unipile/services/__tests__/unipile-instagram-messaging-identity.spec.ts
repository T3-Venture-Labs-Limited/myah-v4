import {
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';

const apiBaseUrl = 'https://api.example.test/api/v1/';
const accountId = 'connected-account';
const providerId = 'profile-001';
const providerMessagingId = 'messaging-009';
const username = 'creator.handle';

const createService = (fetch: jest.Mock) =>
  new UnipileV1ClientService(
    {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl },
    } as never,
    { get: jest.fn(() => 'synthetic-api-key') } as never,
    fetch,
  );

const chat = (overrides: Record<string, unknown> = {}) => ({
  object: 'Chat',
  id: 'chat-001',
  account_id: accountId,
  account_type: 'INSTAGRAM',
  attendee_provider_id: providerMessagingId,
  name: null,
  timestamp: null,
  type: 0,
  ...overrides,
});

describe('Unipile Instagram messaging identity', () => {
  it('serializes only the resolved provider messaging ID when starting a chat', async () => {
    const fetch = jest.fn().mockResolvedValue({
      status: 201,
      json: () =>
        Promise.resolve({
          object: 'ChatStarted',
          chat_id: 'chat-001',
          message_id: 'message-001',
        }),
    });
    const beforeDispatch = jest.fn().mockResolvedValue(undefined);
    const service = createService(fetch);

    await expect(
      service.startChat(
        {
          accountId,
          attendeeId: providerMessagingId,
          text: 'Hello',
        },
        { beforeDispatch },
      ),
    ).resolves.toEqual({
      kind: 'ACCEPTED',
      value: { chatId: 'chat-001', messageId: 'message-001' },
    });

    const [, request] = fetch.mock.calls[0] as [string, RequestInit];
    const formData = request.body as FormData;

    expect(formData).toBeInstanceOf(FormData);
    expect(formData.getAll('attendees_ids')).toEqual([providerMessagingId]);
    expect(formData.getAll('attendees_ids')).not.toContain(providerId);
    expect(formData.get('account_id')).toBe(accountId);
    expect(formData.get('text')).toBe('Hello');
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing messaging ID', { provider_messaging_id: undefined }],
    ['wrong public identifier', { public_identifier: 'another.handle' }],
  ])('fails closed for a profile with a %s', async (_caseName, overrides) => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'UserProfile',
          provider: 'INSTAGRAM',
          provider_id: providerId,
          provider_messaging_id: providerMessagingId,
          public_identifier: username,
          ...overrides,
        }),
    });
    const service = createService(fetch);

    await expect(
      service.getInstagramMessagingProfile({ accountId, username }),
    ).rejects.toMatchObject({
      code: 'UNIPILE_INSTAGRAM_MESSAGING_PROFILE_UNAVAILABLE',
    } satisfies Partial<UnipileReadError>);
  });

  it('rejects a listed chat from a different account', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'ChatList',
          items: [chat({ account_id: 'other-account' })],
          cursor: null,
        }),
    });
    const service = createService(fetch);

    await expect(
      service.listChats({ accountId, cursor: null, after: null, limit: 1 }),
    ).rejects.toMatchObject({ code: 'UNIPILE_CHAT_LIST_UNAVAILABLE' });
  });

  it('rejects a chat whose attendee is the profile ID rather than the messaging ID', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(chat({ attendee_provider_id: providerId })),
    });
    const service = createService(fetch);

    await expect(
      service.getChat({
        accountId,
        chatId: 'chat-001',
        expectedAttendeeId: providerMessagingId,
      }),
    ).rejects.toMatchObject({ code: 'UNIPILE_CHAT_UNAVAILABLE' });
  });

  it('rejects a group chat even when its account and attendee appear valid', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          chat({ type: 1, attendee_provider_id: providerMessagingId }),
        ),
    });
    const service = createService(fetch);

    await expect(
      service.getChat({
        accountId,
        chatId: 'chat-001',
        expectedAttendeeId: providerMessagingId,
      }),
    ).rejects.toMatchObject({ code: 'UNIPILE_CHAT_UNAVAILABLE' });
  });
});
