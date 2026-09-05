import { afterEach, describe, expect, it, vi } from 'vitest';

import { listInstagramConversationsHandler } from 'src/logic-functions/handlers/list-instagram-conversations-handler';

describe('listInstagramConversationsHandler', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails closed after Unipile cutover without calling Composio', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      listInstagramConversationsHandler({ connectedAccountId: 'legacy' }),
    ).resolves.toEqual({
      success: false,
      error:
        'Composio Instagram conversation reads are disabled after the Unipile provider cutover.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
