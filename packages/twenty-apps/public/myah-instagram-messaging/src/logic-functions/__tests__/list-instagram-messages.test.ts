import { afterEach, describe, expect, it, vi } from 'vitest';

import { listInstagramMessagesHandler } from 'src/logic-functions/handlers/list-instagram-messages-handler';

describe('listInstagramMessagesHandler', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails closed after Unipile cutover without calling Composio', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      listInstagramMessagesHandler({
        connectedAccountId: 'legacy',
        conversationId: 'legacy-chat',
      }),
    ).resolves.toEqual({
      success: false,
      error:
        'Composio Instagram message reads are disabled after the Unipile provider cutover.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
