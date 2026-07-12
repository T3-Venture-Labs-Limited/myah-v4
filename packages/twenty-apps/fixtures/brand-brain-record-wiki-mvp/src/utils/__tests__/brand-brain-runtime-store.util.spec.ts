import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreApiClientConstructor = vi.fn(function CoreApiClient() {
  return {
    query: vi.fn(),
    mutation: vi.fn(),
  };
});

vi.mock('twenty-client-sdk/core', () => ({
  CoreApiClient: coreApiClientConstructor,
}));

const ORIGINAL_ENV = { ...process.env };

describe('brand brain runtime store', () => {
  beforeEach(() => {
    vi.resetModules();
    coreApiClientConstructor.mockClear();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('requires the server-injected workspace-scoped app access token', async () => {
    process.env.TWENTY_API_URL = 'https://twenty.test';
    process.env.TWENTY_API_KEY = 'global-api-key-must-not-be-used';
    delete process.env.TWENTY_APP_ACCESS_TOKEN;

    const { createBrandBrainRuntimeStore } = await import(
      'src/utils/brand-brain-runtime-store.util'
    );

    expect(() => createBrandBrainRuntimeStore()).toThrow(
      'Brand Brain tool runtime requires TWENTY_APP_ACCESS_TOKEN',
    );
    expect(coreApiClientConstructor).not.toHaveBeenCalled();
  });

  it('instantiates CoreApiClient with the server-injected app access token', async () => {
    process.env.TWENTY_API_URL = 'https://twenty.test';
    process.env.TWENTY_APP_ACCESS_TOKEN = 'workspace-app-token';
    process.env.TWENTY_API_KEY = 'global-api-key-must-not-be-used';

    const { createBrandBrainRuntimeStore } = await import(
      'src/utils/brand-brain-runtime-store.util'
    );

    createBrandBrainRuntimeStore();

    expect(coreApiClientConstructor).toHaveBeenCalledTimes(1);
    expect(coreApiClientConstructor).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer workspace-app-token' },
    });
  });
});
