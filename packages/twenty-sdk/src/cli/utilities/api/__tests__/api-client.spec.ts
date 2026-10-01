import { ApiClient } from '@/cli/utilities/api/api-client';
import { promptForReauthentication } from '@/cli/utilities/auth/reauth-helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/cli/utilities/auth/reauth-helper', () => ({
  promptForReauthentication: vi.fn().mockResolvedValue('cancelled'),
}));

vi.mock('@/cli/utilities/config/config-service', () => ({
  ConfigService: class {
    static getActiveRemote = vi.fn().mockReturnValue('test');
    getConfig = vi.fn().mockResolvedValue({ apiUrl: 'http://localhost:2020' });
    setConfig = vi.fn();
  },
}));

describe('ApiClient — frontend URL resolution', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient({ disableInterceptors: true });
  });

  it('keeps GraphQL FORBIDDEN as an authorization error without retrying authentication', async () => {
    const client = new ApiClient({ skipAuth: true });
    const response = await client.client.post(
      '/metadata',
      {},
      {
        adapter: async (config) => ({
          config,
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            errors: [
              {
                message: 'Product-owned schema',
                extensions: { code: 'FORBIDDEN' },
              },
            ],
          },
        }),
      },
    );

    expect(response.data.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(promptForReauthentication).not.toHaveBeenCalled();
  });

  describe('getFrontendUrl', () => {
    it('returns origin of authorization_endpoint', async () => {
      vi.spyOn(client.client, 'get').mockResolvedValueOnce({
        data: { authorization_endpoint: 'http://app.localhost:3001/authorize' },
      });

      expect(await client.getFrontendUrl()).toBe('http://app.localhost:3001');
    });

    it('returns null when authorization_endpoint is missing', async () => {
      vi.spyOn(client.client, 'get').mockResolvedValueOnce({ data: {} });

      expect(await client.getFrontendUrl()).toBeNull();
    });

    it('returns null on network error', async () => {
      vi.spyOn(client.client, 'get').mockRejectedValueOnce(new Error('boom'));

      expect(await client.getFrontendUrl()).toBeNull();
    });
  });

  describe('getWorkspaceFrontendUrl', () => {
    it('prefers customUrl over subdomainUrl', async () => {
      vi.spyOn(client.client, 'post').mockResolvedValueOnce({
        data: {
          data: {
            currentWorkspace: {
              workspaceUrls: {
                customUrl: 'https://crm.acme.com',
                subdomainUrl: 'http://apple.localhost:3001',
              },
            },
          },
        },
      });

      expect(await client.getWorkspaceFrontendUrl()).toBe(
        'https://crm.acme.com',
      );
    });

    it('returns subdomainUrl when customUrl is absent', async () => {
      vi.spyOn(client.client, 'post').mockResolvedValueOnce({
        data: {
          data: {
            currentWorkspace: {
              workspaceUrls: {
                subdomainUrl: 'http://apple.localhost:3001',
              },
            },
          },
        },
      });

      expect(await client.getWorkspaceFrontendUrl()).toBe(
        'http://apple.localhost:3001',
      );
    });

    it('falls back to OAuth discovery URL when workspace query returns null', async () => {
      vi.spyOn(client.client, 'post').mockResolvedValueOnce({
        data: { data: { currentWorkspace: null } },
      });
      vi.spyOn(client.client, 'get').mockResolvedValueOnce({
        data: { authorization_endpoint: 'http://app.localhost:3001/authorize' },
      });

      expect(await client.getWorkspaceFrontendUrl()).toBe(
        'http://app.localhost:3001',
      );
    });
  });
});
