import { afterEach, describe, expect, it, vi } from 'vitest';

import { getServerUrl } from '@/cli/__tests__/constants/server-url.constant';

vi.mock('@/cli/utilities/config/config-service', () => ({
  ConfigService: class {
    getConfig = vi.fn().mockResolvedValue({ apiUrl: 'http://localhost:2020' });
  },
}));

describe('getServerUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured test server URL instead of the CLI default', async () => {
    vi.stubEnv('TWENTY_API_URL', 'http://localhost:3000');

    await expect(getServerUrl()).resolves.toBe('http://localhost:3000');
  });
});
