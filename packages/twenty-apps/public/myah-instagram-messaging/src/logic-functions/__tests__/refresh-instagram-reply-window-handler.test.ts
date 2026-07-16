import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshInstagramReplyWindowHandler } from '../handlers/refresh-instagram-reply-window-handler';

const { findById, updateReplyWindow, listInstagramMessagesHandler } =
  vi.hoisted(() => ({
    findById: vi.fn(),
    updateReplyWindow: vi.fn(),
    listInstagramMessagesHandler: vi.fn(),
  }));

vi.mock('src/logic-functions/utils/create-social-conversation-store', () => ({
  createSocialConversationStore: () => ({ findById, updateReplyWindow }),
}));

vi.mock('src/logic-functions/handlers/list-instagram-messages-handler', () => ({
  listInstagramMessagesHandler,
}));

const conversationRecord = {
  id: 'ad6c5ea5-e40c-48d4-8a47-cb3407bac7d3',
  providerConversationId: 'conversation_123',
  recipientIgsid: 'creator_igsid',
  lastInboundAt: null,
  replyWindowEndsAt: null,
};

describe('refreshInstagramReplyWindowHandler', () => {
  beforeEach(() => {
    findById.mockReset();
    updateReplyWindow.mockReset();
    listInstagramMessagesHandler.mockReset();
    updateReplyWindow.mockResolvedValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-07-15T13:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a non-UUID record ID before accessing workspace records', async () => {
    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: 'not-a-uuid',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'conversationRecordId must be a UUID.',
    });

    expect(findById).not.toHaveBeenCalled();
  });
  it('fails when the target record does not exist', async () => {
    findById.mockResolvedValue(undefined);

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Conversation record was not found.',
    });
  });

  it('fails closed when the target record has no provider conversation ID', async () => {
    findById.mockResolvedValue({
      ...conversationRecord,
      providerConversationId: null,
    });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Conversation record is missing a provider conversation ID.',
    });

    expect(listInstagramMessagesHandler).not.toHaveBeenCalled();
  });

  it('fails closed when the target record has no recipient IGSID', async () => {
    findById.mockResolvedValue({ ...conversationRecord, recipientIgsid: null });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Conversation record is missing a recipient IGSID.',
    });

    expect(listInstagramMessagesHandler).not.toHaveBeenCalled();
  });

  it('matches a valid recipient IGSID after trimming stored whitespace', async () => {
    findById.mockResolvedValue({
      ...conversationRecord,
      recipientIgsid: ' creator_igsid ',
    });
    listInstagramMessagesHandler.mockResolvedValue({
      success: true,
      messages: [
        {
          from: { id: 'creator_igsid' },
          created_time: '2099-07-15T12:00:00.000Z',
        },
      ],
    });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toMatchObject({ success: true, updated: true });

    expect(updateReplyWindow).toHaveBeenCalledWith({
      id: conversationRecord.id,
      lastInboundAt: '2099-07-15T12:00:00.000Z',
      replyWindowEndsAt: '2099-07-16T12:00:00.000Z',
    });
  });

  it('does not alter stored state when no verified inbound message is returned', async () => {
    findById.mockResolvedValue(conversationRecord);
    listInstagramMessagesHandler.mockResolvedValue({
      success: true,
      messages: [
        {
          from: { id: 'myah_ig_user_id' },
          created_time: '2099-07-15T12:00:00.000Z',
        },
      ],
    });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: true,
      updated: false,
      reason: 'NO_INBOUND_MESSAGE',
    });

    expect(updateReplyWindow).not.toHaveBeenCalled();
  });

  it('does not replace a newer stored inbound timestamp', async () => {
    findById.mockResolvedValue({
      ...conversationRecord,
      lastInboundAt: '2099-07-15T12:00:00.000Z',
    });
    listInstagramMessagesHandler.mockResolvedValue({
      success: true,
      messages: [
        {
          from: { id: 'creator_igsid' },
          created_time: '2099-07-15T11:00:00.000Z',
        },
      ],
    });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: true,
      updated: false,
      reason: 'NOT_NEWER_THAN_STORED',
    });

    expect(updateReplyWindow).not.toHaveBeenCalled();
  });

  it('persists a newer verified inbound message and its exact deadline', async () => {
    findById.mockResolvedValue(conversationRecord);
    listInstagramMessagesHandler.mockResolvedValue({
      success: true,
      messages: [
        {
          from: { id: 'creator_igsid' },
          created_time: '2099-07-15T12:00:00.000Z',
        },
      ],
    });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
        connectedAccountId: 'connected_account_123',
      }),
    ).resolves.toEqual({
      success: true,
      updated: true,
      lastInboundAt: '2099-07-15T12:00:00.000Z',
      replyWindowEndsAt: '2099-07-16T12:00:00.000Z',
      isReplyWindowOpen: true,
    });

    expect(listInstagramMessagesHandler).toHaveBeenCalledWith({
      conversationId: 'conversation_123',
      connectedAccountId: 'connected_account_123',
    });
    expect(updateReplyWindow).toHaveBeenCalledWith({
      id: conversationRecord.id,
      lastInboundAt: '2099-07-15T12:00:00.000Z',
      replyWindowEndsAt: '2099-07-16T12:00:00.000Z',
    });
  });

  it('does not report an update when a concurrent newer refresh wins', async () => {
    findById.mockResolvedValue(conversationRecord);
    listInstagramMessagesHandler.mockResolvedValue({
      success: true,
      messages: [
        {
          from: { id: 'creator_igsid' },
          created_time: '2099-07-15T12:00:00.000Z',
        },
      ],
    });
    updateReplyWindow.mockResolvedValue(false);

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: true,
      updated: false,
      reason: 'NOT_NEWER_THAN_STORED',
    });
  });

  it('reads every message page before selecting the newest inbound message', async () => {
    findById.mockResolvedValue(conversationRecord);
    listInstagramMessagesHandler
      .mockResolvedValueOnce({
        success: true,
        messages: [
          {
            from: { id: 'creator_igsid' },
            created_time: '2099-07-15T11:00:00.000Z',
          },
        ],
        paging: { cursors: { after: 'next_page' } },
      })
      .mockResolvedValueOnce({
        success: true,
        messages: [
          {
            from: { id: 'creator_igsid' },
            created_time: '2099-07-15T12:00:00.000Z',
          },
        ],
      });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
        connectedAccountId: 'connected_account_123',
      }),
    ).resolves.toMatchObject({
      success: true,
      updated: true,
      lastInboundAt: '2099-07-15T12:00:00.000Z',
    });

    expect(listInstagramMessagesHandler).toHaveBeenNthCalledWith(2, {
      conversationId: 'conversation_123',
      connectedAccountId: 'connected_account_123',
      after: 'next_page',
    });
  });

  it('fails closed when a successful reader result lacks messages', async () => {
    findById.mockResolvedValue(conversationRecord);
    listInstagramMessagesHandler.mockResolvedValue({ success: true });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Instagram message lookup returned no messages.',
    });

    expect(updateReplyWindow).not.toHaveBeenCalled();
  });

  it('returns the existing reader failure without writing a record', async () => {
    findById.mockResolvedValue(conversationRecord);
    listInstagramMessagesHandler.mockResolvedValue({
      success: false,
      error: 'Composio request failed.',
    });

    await expect(
      refreshInstagramReplyWindowHandler({
        conversationRecordId: conversationRecord.id,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Composio request failed.',
    });

    expect(updateReplyWindow).not.toHaveBeenCalled();
  });
});
