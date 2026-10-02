import { AsyncLocalStorage } from 'node:async_hooks';

import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { PRODUCT_SCHEMA_WRITE_AUTHORITY } from 'src/engine/metadata-modules/utils/product-schema-write-authority.util';

const scope = new AsyncLocalStorage<{ workspaceId: string; active: boolean }>();

export const runRegisteredWorkspaceUpgrade = async <T>(
  command: { constructor: Function },
  workspaceId: string,
  body: () => Promise<T>,
): Promise<T> => {
  if (!getRegisteredWorkspaceCommandMetadata(command.constructor)) {
    return body();
  }

  const capability = { workspaceId, active: true };

  return scope.run(capability, async () => {
    try {
      return await body();
    } finally {
      capability.active = false;
    }
  });
};

export const resolveWorkspaceUpgradeSchemaWriteAuthority = (
  workspaceId: string,
) => {
  const capability = scope.getStore();

  return capability?.active && capability.workspaceId === workspaceId
    ? PRODUCT_SCHEMA_WRITE_AUTHORITY
    : undefined;
};
