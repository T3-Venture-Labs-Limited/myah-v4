import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  MyahComposioService,
  buildInstagramComposioUserId,
  buildInstagramConnectionAlias,
} from 'src/modules/myah-composio/services/myah-composio.service';
import { FieldActorSource } from 'twenty-shared/types';

describe('buildInstagramComposioUserId', () => {
  it('uses a workspace-scoped id so team members share the Instagram connection', () => {
    expect(buildInstagramComposioUserId('workspace-id')).toBe(
      'workspace:workspace-id:instagram',
    );
  });
});

describe('buildInstagramConnectionAlias', () => {
  it('uses a unique Myah Instagram alias for each authorization attempt', () => {
    expect(buildInstagramConnectionAlias(1783512000000)).toBe(
      'myah-instagram-1783512000000',
    );
  });
});

describe('MyahComposioService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      COMPOSIO_API_KEY: 'cmp_test_key',
      COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID: 'ac_instagram_test',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('selects the configured Instagram auth config when creating an OAuth session', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'session_123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected_account_id: 'link_123',
          redirect_url: 'https://connect.composio.dev/link/link_123',
        }),
      });

    const service = new MyahComposioService();

    await expect(
      service.startInstagramOAuth({
        userId: buildInstagramComposioUserId('workspace-id'),
        callbackUrl: 'http://localhost:2022/settings/accounts/instagram',
      }),
    ).resolves.toEqual({
      connectionRequestId: 'link_123',
      redirectUrl: 'https://connect.composio.dev/link/link_123',
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://backend.composio.dev/api/v3.1/tool_router/session',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'cmp_test_key',
        },
        body: JSON.stringify({
          user_id: 'workspace:workspace-id:instagram',
          auth_configs: {
            instagram: 'ac_instagram_test',
          },
          multi_account: {
            enable: true,
            require_explicit_selection: true,
            max_accounts_per_toolkit: 2,
          },
        }),
      }),
    );

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://backend.composio.dev/api/v3.1/tool_router/session/session_123/link',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'cmp_test_key',
        },
        body: expect.any(String),
      }),
    );

    const fetchUrls = (global.fetch as jest.Mock).mock.calls.map(([url]) =>
      String(url),
    );
    const linkRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body,
    ) as Record<string, unknown>;

    expect(fetchUrls).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('connected_accounts/link'),
      ]),
    );
    expect(linkRequestBody).toMatchObject({
      toolkit: 'instagram',
      callback_url: 'http://localhost:2022/settings/accounts/instagram',
    });
    expect(linkRequestBody.alias).toEqual(
      expect.stringMatching(/^myah-instagram-\d+$/),
    );
    expect(linkRequestBody).not.toHaveProperty('auth_config_id');
    expect(linkRequestBody).not.toHaveProperty('toolkits');
    expect(linkRequestBody).not.toHaveProperty('catalog');
  });

  it('lists every active Instagram connected account instead of silently selecting the newest one', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_old',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            auth_config_id: 'ac_instagram',
            toolkit: { slug: 'instagram' },
            created_at: '2026-07-07T03:19:50.756Z',
            updated_at: '2026-07-07T03:20:15.347Z',
          },
          {
            id: 'ca_instagram_new',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            auth_config_id: 'ac_instagram',
            toolkit: { slug: 'instagram' },
            created_at: '2026-07-08T11:00:00.000Z',
            updated_at: '2026-07-08T11:01:01.962Z',
          },
          {
            id: 'ca_github',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            toolkit: { slug: 'github' },
          },
        ],
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.listInstagramAccounts({
        userId: buildInstagramComposioUserId('workspace-id'),
      }),
    ).resolves.toEqual([
      {
        connectedAccountId: 'ca_instagram_old',
        status: 'ACTIVE',
        composioUserId: 'workspace:workspace-id:instagram',
        authConfigId: 'ac_instagram',
        toolkitSlug: 'instagram',
        createdAt: '2026-07-07T03:19:50.756Z',
        updatedAt: '2026-07-07T03:20:15.347Z',
      },
      {
        connectedAccountId: 'ca_instagram_new',
        status: 'ACTIVE',
        composioUserId: 'workspace:workspace-id:instagram',
        authConfigId: 'ac_instagram',
        toolkitSlug: 'instagram',
        createdAt: '2026-07-08T11:00:00.000Z',
        updatedAt: '2026-07-08T11:01:01.962Z',
      },
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://backend.composio.dev/api/v3.1/connected_accounts?user_ids=workspace%3Aworkspace-id%3Ainstagram&statuses=ACTIVE&limit=50',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'cmp_test_key',
        },
      }),
    );
  });

  it('keeps active Instagram accounts isolated by workspace-derived user ID', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'ca_workspace_a',
              status: 'ACTIVE',
              user_id: buildInstagramComposioUserId('workspace-a'),
              toolkit: { slug: 'instagram' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          successful: true,
          data: { id: 'instagram-a', username: 'workspace_a' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'ca_workspace_b',
              status: 'ACTIVE',
              user_id: buildInstagramComposioUserId('workspace-b'),
              toolkit: { slug: 'instagram' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          successful: true,
          data: { id: 'instagram-b', username: 'workspace_b' },
        }),
      });

    const service = new MyahComposioService();
    const accountsA = await service.listInstagramAccounts({
      userId: buildInstagramComposioUserId('workspace-a'),
    });
    const accountsB = await service.listInstagramAccounts({
      userId: buildInstagramComposioUserId('workspace-b'),
    });

    expect(accountsA).toEqual([
      expect.objectContaining({
        connectedAccountId: 'ca_workspace_a',
        composioUserId: buildInstagramComposioUserId('workspace-a'),
      }),
    ]);
    expect(accountsB).toEqual([
      expect.objectContaining({
        connectedAccountId: 'ca_workspace_b',
        composioUserId: buildInstagramComposioUserId('workspace-b'),
      }),
    ]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'user_ids=workspace%3Aworkspace-a%3Ainstagram',
      ),
      expect.any(Object),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'user_ids=workspace%3Aworkspace-b%3Ainstagram',
      ),
      expect.any(Object),
    );
  });

  it('enriches an active Instagram account with its server-fetched profile identity', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'ca_instagram_active',
              status: 'ACTIVE',
              user_id: 'workspace:workspace-id:instagram',
              auth_config_id: 'ac_instagram',
              toolkit: { slug: 'instagram' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          successful: true,
          data: {
            id: '17841400008460056',
            username: 'myah_test_account',
          },
        }),
      });

    const service = new MyahComposioService();

    await expect(
      service.listInstagramAccounts({
        userId: buildInstagramComposioUserId('workspace-id'),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        connectedAccountId: 'ca_instagram_active',
        igUserId: '17841400008460056',
        username: 'myah_test_account',
      }),
    ]);

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://backend.composio.dev/api/v3.1/tools/execute/INSTAGRAM_GET_USER_INFO',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'cmp_test_key',
        },
        body: JSON.stringify({
          connected_account_id: 'ca_instagram_active',
          user_id: 'workspace:workspace-id:instagram',
          arguments: { ig_user_id: 'me' },
        }),
      }),
    );
  });

  it('keeps the active connection visible when profile lookup is unavailable', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'ca_instagram_active',
              status: 'ACTIVE',
              user_id: 'workspace:workspace-id:instagram',
              auth_config_id: 'ac_instagram',
              toolkit: { slug: 'instagram' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'provider unavailable' }),
      });

    const service = new MyahComposioService();

    await expect(
      service.listInstagramAccounts({
        userId: buildInstagramComposioUserId('workspace-id'),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        connectedAccountId: 'ca_instagram_active',
        status: 'ACTIVE',
      }),
    ]);
  });

  it('resolves the single active Instagram account bound to the workspace user and approval', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_approved',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            toolkit: { slug: 'instagram' },
          },
        ],
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.getActiveInstagramAccount({
        workspaceId: 'workspace-id',
        connectedAccountId: 'ca_instagram_approved',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        connectedAccountId: 'ca_instagram_approved',
        composioUserId: 'workspace:workspace-id:instagram',
      }),
    );
  });

  it('rejects the approved account when no active Instagram account remains', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const service = new MyahComposioService();

    await expect(
      service.getActiveInstagramAccount({
        workspaceId: 'workspace-id',
        connectedAccountId: 'ca_instagram_approved',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects the approved account when multiple active Instagram accounts remain', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_old',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            toolkit: { slug: 'instagram' },
          },
          {
            id: 'ca_instagram_approved',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            toolkit: { slug: 'instagram' },
          },
        ],
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.getActiveInstagramAccount({
        workspaceId: 'workspace-id',
        connectedAccountId: 'ca_instagram_approved',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an active Instagram account with a missing provider user ID', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_approved',
            status: 'ACTIVE',
            toolkit: { slug: 'instagram' },
          },
        ],
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.getActiveInstagramAccount({
        workspaceId: 'workspace-id',
        connectedAccountId: 'ca_instagram_approved',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an active Instagram account owned by a different provider user', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_approved',
            status: 'ACTIVE',
            user_id: 'workspace:other-workspace:instagram',
            toolkit: { slug: 'instagram' },
          },
        ],
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.getActiveInstagramAccount({
        workspaceId: 'workspace-id',
        connectedAccountId: 'ca_instagram_approved',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the approved connected account ID bound to the active account', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_other',
            status: 'ACTIVE',
            user_id: 'workspace:workspace-id:instagram',
            toolkit: { slug: 'instagram' },
          },
        ],
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.getActiveInstagramAccount({
        workspaceId: 'workspace-id',
        connectedAccountId: 'ca_instagram_approved',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('upserts every active Instagram account and removes stale local rows for that workspace user', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T04:30:00.000Z'));

    const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
    const query = jest.fn().mockResolvedValue({});
    const getGlobalWorkspaceDataSource = jest.fn().mockResolvedValue({ query });
    const executeInWorkspaceContext = jest
      .fn()
      .mockImplementation(async (callback: () => Promise<void>) => callback());

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_old',
            status: 'ACTIVE',
            user_id: buildInstagramComposioUserId(workspaceId),
            auth_config_id: 'ac_instagram',
            toolkit: { slug: 'instagram' },
            created_at: '2026-07-07T03:19:50.756Z',
            updated_at: '2026-07-07T03:20:15.347Z',
          },
          {
            id: 'ca_instagram_new',
            status: 'ACTIVE',
            user_id: buildInstagramComposioUserId(workspaceId),
            auth_config_id: 'ac_instagram',
            toolkit: { slug: 'instagram' },
            created_at: '2026-07-08T11:00:00.000Z',
            updated_at: '2026-07-08T11:01:01.962Z',
          },
        ],
      }),
    });

    const service = new MyahComposioService({
      executeInWorkspaceContext,
      getGlobalWorkspaceDataSource,
    } as never);

    await service.listInstagramAccounts({
      userId: buildInstagramComposioUserId(workspaceId),
      workspace: { id: workspaceId } as never,
    });

    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        type: 'system',
        workspace: expect.objectContaining({ id: workspaceId }),
      }),
    );
    expect(getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahInstagramAccount"',
      ),
      [
        buildInstagramComposioUserId(workspaceId),
        ['ca_instagram_old', 'ca_instagram_new'],
      ],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahInstagramAccount"',
      ),
      [
        'Workspace Instagram account',
        'Workspace Instagram account',
        'ca_instagram_old',
        buildInstagramComposioUserId(workspaceId),
        'ac_instagram',
        null,
        null,
        'ACTIVE',
        '2026-07-08T04:30:00.000Z',
        null,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
      ],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."_myahInstagramAccount"',
      ),
      [
        'Workspace Instagram account',
        'Workspace Instagram account',
        'ca_instagram_new',
        buildInstagramComposioUserId(workspaceId),
        'ac_instagram',
        null,
        null,
        'ACTIVE',
        '2026-07-08T04:30:00.000Z',
        null,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
      ],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  });

  it('still returns the Composio connection state when the app object table mirror is unavailable', async () => {
    const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
    const executeInWorkspaceContext = jest
      .fn()
      .mockRejectedValue(new Error('relation does not exist'));

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ca_instagram_active',
            status: 'ACTIVE',
            user_id: buildInstagramComposioUserId(workspaceId),
            auth_config_id: 'ac_instagram',
            toolkit: { slug: 'instagram' },
            created_at: '2026-07-08T11:00:00.000Z',
            updated_at: '2026-07-08T11:01:01.962Z',
          },
        ],
      }),
    });

    const service = new MyahComposioService({
      executeInWorkspaceContext,
    } as never);
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

    await expect(
      service.listInstagramAccounts({
        userId: buildInstagramComposioUserId(workspaceId),
        workspace: { id: workspaceId } as never,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        connectedAccountId: 'ca_instagram_active',
        status: 'ACTIVE',
        toolkitSlug: 'instagram',
      }),
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not mirror Instagram connected account state',
      ),
    );
  });

  it('fails closed when the Composio API key is missing', async () => {
    delete process.env.COMPOSIO_API_KEY;

    const service = new MyahComposioService();

    await expect(
      service.startInstagramOAuth({ userId: 'user-workspace-id' }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('redacts upstream Composio errors from the caller', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'real upstream secret-bearing message',
      }),
    });

    const service = new MyahComposioService();

    await expect(
      service.startInstagramOAuth({ userId: 'user-workspace-id' }),
    ).rejects.toThrow(BadGatewayException);
  });
});
