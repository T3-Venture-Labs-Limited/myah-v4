import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSocialConversationStore } from '../create-social-conversation-store';

const { query, mutation, coreApiClientConstructor } = vi.hoisted(() => {
  const query = vi.fn();
  const mutation = vi.fn();
  const coreApiClientConstructor = vi.fn(function CoreApiClient() {
    return { query, mutation };
  });

  return { query, mutation, coreApiClientConstructor };
});

vi.mock('twenty-client-sdk/core', () => ({
  CoreApiClient: coreApiClientConstructor,
}));

const ORIGINAL_ENV = { ...process.env };

describe('createSocialConversationStore', () => {
  beforeEach(() => {
    query.mockReset();
    mutation.mockReset();
    coreApiClientConstructor.mockClear();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('requires the server-injected app access token before accessing workspace records', () => {
    process.env.TWENTY_API_KEY = 'global-api-key-must-not-be-used';
    delete process.env.TWENTY_APP_ACCESS_TOKEN;

    expect(() => createSocialConversationStore()).toThrow(
      'Instagram reply-window refresh requires TWENTY_APP_ACCESS_TOKEN.',
    );
    expect(coreApiClientConstructor).not.toHaveBeenCalled();
  });

  it('queries one social conversation with the app-scoped token', async () => {
    process.env.TWENTY_APP_ACCESS_TOKEN = 'workspace-app-token';
    query.mockResolvedValue({
      myahSocialConversation: {
        id: 'ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3',
        providerConversationId: 'conversation_123',
        recipientIgsid: 'creator_igsid',
        lastInboundAt: null,
        replyWindowEndsAt: null,
      },
    });

    const store = createSocialConversationStore();
    const record = await store.findById('ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3');

    expect(coreApiClientConstructor).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer workspace-app-token' },
    });
    expect(query).toHaveBeenCalledWith({
      myahSocialConversation: {
        __args: {
          filter: { id: { eq: 'ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3' } },
        },
        id: true,
        providerConversationId: true,
        recipientIgsid: true,
        lastInboundAt: true,
        replyWindowEndsAt: true,
      },
    });
    expect(record?.providerConversationId).toBe('conversation_123');
  });

  it('updates only the managed reply-window fields', async () => {
    process.env.TWENTY_APP_ACCESS_TOKEN = 'workspace-app-token';
    mutation.mockResolvedValue({
      updateMyahSocialConversations: [
        { id: 'ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3' },
      ],
    });

    const store = createSocialConversationStore();

    await expect(
      store.updateReplyWindow({
        id: 'ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3',
        lastInboundAt: '2026-07-15T12:00:00.000Z',
        replyWindowEndsAt: '2026-07-16T12:00:00.000Z',
      }),
    ).resolves.toBe(true);

    expect(mutation).toHaveBeenCalledWith({
      updateMyahSocialConversations: {
        __args: {
          data: {
            lastInboundAt: '2026-07-15T12:00:00.000Z',
            replyWindowEndsAt: '2026-07-16T12:00:00.000Z',
          },
          filter: {
            and: [
              { id: { eq: 'ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3' } },
              {
                or: [
                  { lastInboundAt: { is: 'NULL' } },
                  { lastInboundAt: { lt: '2026-07-15T12:00:00.000Z' } },
                ],
              },
              {
                or: [
                  { replyWindowEndsAt: { is: 'NULL' } },
                  { replyWindowEndsAt: { lt: '2026-07-16T12:00:00.000Z' } },
                ],
              },
            ],
          },
        },
        id: true,
      },
    });
  });
});
