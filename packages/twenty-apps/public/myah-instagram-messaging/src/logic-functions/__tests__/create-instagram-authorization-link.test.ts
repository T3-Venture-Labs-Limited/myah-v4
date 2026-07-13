import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInstagramAuthorizationLink } from '../utils/create-instagram-authorization-link';

const SAVED_ENV = { ...process.env };

describe('createInstagramAuthorizationLink', () => {
  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = 'cmp_test_key';
    process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID = 'ac_instagram_test';
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
    vi.unstubAllGlobals();
  });

  it('creates a workspace-scoped OAuth2 authorization request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'ca_connected_account',
          redirect_url: 'https://backend.composio.dev/api/v3/s/connect',
          status: 'INITIATED',
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createInstagramAuthorizationLink({ workspaceId: 'workspace-123' }),
    ).resolves.toEqual({
      connectedAccountId: 'ca_connected_account',
      authorizationUrl: 'https://backend.composio.dev/api/v3/s/connect',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.composio.dev/api/v3.1/connected_accounts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'cmp_test_key',
        },
        body: JSON.stringify({
          auth_config: { id: 'ac_instagram_test' },
          connection: {
            user_id: 'workspace:workspace-123:instagram',
            state: { authScheme: 'OAUTH2', val: {} },
          },
        }),
      }),
    );
  });
});
