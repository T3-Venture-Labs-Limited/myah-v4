import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listInstagramMessagesHandler } from '../handlers/list-instagram-messages-handler';

const SAVED_ENV = { ...process.env };

const buildComposioResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('listInstagramMessagesHandler', () => {
  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = 'cmp_test_key';
    process.env.MYAH_COMPOSIO_USER_ID = 'workspace-user';
    process.env.MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID = 'ca_env_instagram_456';
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists messages with a capped limit and strips tokenized paging.next URLs', async () => {
    const fetchMock = vi.fn(async () =>
      buildComposioResponse({
        data: {
          data: [
            {
              id: 'mid.1',
              text: 'hello',
              created_time: '2026-07-06T14:00:00+0000',
            },
          ],
          paging: {
            cursors: {
              after: 'cursor-after',
              before: 123,
              tokenizedUrl: 'https://graph.facebook.com/secret',
            },
            next: 'https://graph.facebook.com/v21.0/secret-tokenized-url',
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listInstagramMessagesHandler({
      conversationId: 'conversation_123',
      limit: 200,
      after: 'cursor-before',
    });

    expect(result).toEqual({
      success: true,
      toolSlug: 'INSTAGRAM_LIST_ALL_MESSAGES',
      messages: [
        {
          id: 'mid.1',
          text: 'hello',
          created_time: '2026-07-06T14:00:00+0000',
        },
      ],
      paging: {
        cursors: { after: 'cursor-after' },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];

    expect(JSON.parse(requestInit.body)).toEqual({
      connected_account_id: 'ca_env_instagram_456',
      user_id: 'workspace-user',
      arguments: {
        conversation_id: 'conversation_123',
        limit: 25,
        after: 'cursor-before',
      },
    });
  });
});
