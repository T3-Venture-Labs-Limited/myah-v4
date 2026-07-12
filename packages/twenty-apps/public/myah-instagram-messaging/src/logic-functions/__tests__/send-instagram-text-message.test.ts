import { afterEach, describe, expect, it, vi } from 'vitest';

import { INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG } from '../constants/composio-instagram.constants';
import { sendInstagramTextMessageHandler } from '../handlers/send-instagram-text-message-handler';
import { executeComposioInstagramTool } from '../utils/execute-composio-instagram-tool';

const SEND_DISABLED_ERROR =
  'Instagram send operations are disabled until an authenticated workspace ownership broker is available.';

describe('Instagram send operations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a fully specified account, conversation, message, and draft send before provider I/O', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendInstagramTextMessageHandler({
      connectedAccountId: 'ca_instagram_123',
      conversationId: 'conversation_123',
      recipientId: 'igsid_123',
      replyToMessageId: 'message_123',
      draftId: 'draft_123',
      text: 'Approved reply that must not be sent.',
      igUserId: 'ig_user_123',
      graphApiVersion: 'v21.0',
    });

    expect(result).toEqual({ success: false, error: SEND_DISABLED_ERROR });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects direct send execution before checking credentials or calling Composio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.COMPOSIO_API_KEY;

    const result = await executeComposioInstagramTool({
      toolSlug: INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG,
      connectedAccountId: 'ca_instagram_123',
      arguments: {
        conversation_id: 'conversation_123',
        message_id: 'message_123',
        draft_id: 'draft_123',
        recipient_id: 'igsid_123',
        text: 'Must remain unsent.',
      },
    });

    expect(result).toEqual({ success: false, error: SEND_DISABLED_ERROR });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still validates missing required send inputs without provider I/O', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID;

    const result = await sendInstagramTextMessageHandler({});

    expect(result.success).toBe(false);
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('connectedAccountId'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
