import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listInstagramConversationsHandler } from '../handlers/list-instagram-conversations-handler';

const SAVED_ENV = { ...process.env };

const buildComposioResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('listInstagramConversationsHandler', () => {
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

  it('lists conversations manually with a capped limit and sanitized cursor response', async () => {
    const fetchMock = vi.fn(async () =>
      buildComposioResponse({
        data: {
          data: [
            {
              id: 'conversation_123',
              participants: {
                data: [{ id: 'igsid_123', username: 'creator' }],
              },
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

    const result = await listInstagramConversationsHandler({
      limit: 200,
      after: 'cursor-before',
    });

    expect(result).toEqual({
      success: true,
      toolSlug: 'INSTAGRAM_LIST_ALL_CONVERSATIONS',
      conversations: [
        {
          id: 'conversation_123',
          participants: {
            data: [{ id: 'igsid_123', username: 'creator' }],
          },
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
        limit: 25,
        after: 'cursor-before',
      },
    });
  });
});
