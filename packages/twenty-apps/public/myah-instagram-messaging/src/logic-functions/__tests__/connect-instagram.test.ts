import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectInstagramHandler } from 'src/logic-functions/handlers/connect-instagram-handler';

describe('connectInstagramHandler', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails closed after Unipile cutover without calling Composio', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(connectInstagramHandler()).resolves.toEqual({
      success: false,
      error:
        'Composio Instagram connection is disabled after the Unipile provider cutover.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
