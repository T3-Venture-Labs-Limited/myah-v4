import { CoreApiClient } from 'twenty-client-sdk/core';

import { createBrandBrainCoreApiStore } from 'src/utils/brand-brain-core-api-store.util';

type CoreApiClientConstructor = new (options: {
  headers: { Authorization: string };
}) => {
  query: (selection: Record<string, unknown>) => Promise<Record<string, unknown>>;
  mutation: (selection: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export const createBrandBrainRuntimeStore = () => {
  const appAccessToken = process.env.TWENTY_APP_ACCESS_TOKEN;

  if (!appAccessToken) {
    throw new Error(
      'Brand Brain tool runtime requires TWENTY_APP_ACCESS_TOKEN from the Twenty logic-function execution context.',
    );
  }

  const RuntimeCoreApiClient = CoreApiClient as unknown as CoreApiClientConstructor;

  return createBrandBrainCoreApiStore({
    client: new RuntimeCoreApiClient({
      headers: { Authorization: `Bearer ${appAccessToken}` },
    }),
  });
};
