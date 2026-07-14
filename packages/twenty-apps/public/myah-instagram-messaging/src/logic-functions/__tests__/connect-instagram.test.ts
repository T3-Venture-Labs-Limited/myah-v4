import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectInstagramHandler } from '../handlers/connect-instagram-handler';

const SAVED_ENV = { ...process.env };

const jwtWithWorkspace = (workspaceId: string) =>
  `header.${Buffer.from(JSON.stringify({ workspaceId })).toString('base64url')}.signature`;

describe('connectInstagramHandler', () => {
  afterEach(() => {
    process.env = { ...SAVED_ENV };
    vi.unstubAllGlobals();
  });

  it('binds the authorization request to its executing workspace', async () => {
    process.env.TWENTY_APP_ACCESS_TOKEN = jwtWithWorkspace('workspace-123');
    process.env.COMPOSIO_API_KEY = 'cmp_test_key';
    process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID = 'ac_instagram_test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'ca_connected_account',
            redirect_url: 'https://backend.composio.dev/api/v3/s/connect',
          }),
          { status: 201 },
        ),
      ),
    );

    await expect(connectInstagramHandler()).resolves.toEqual({
      success: true,
      connectedAccountId: 'ca_connected_account',
      authorizationUrl: 'https://backend.composio.dev/api/v3/s/connect',
    });
  });
});
