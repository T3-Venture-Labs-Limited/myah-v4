import type { QueryRunner } from 'typeorm';

import type { FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import type { AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import type { WorkspaceCacheDataMap } from 'src/engine/workspace-cache/types/workspace-cache-key.type';

// An invocation-local read of the upgrade transaction, never a shared-cache entry.
export type PinnedWorkspaceMetadataSnapshot = {
  workspaceId: string;
  queryRunner: QueryRunner;
  schemaName: string;
  workspace: Pick<
    WorkspaceEntity,
    'id' | 'databaseSchema' | 'workspaceCustomApplicationId' | 'defaultRoleId'
  >;
  allFlatEntityMaps: AllFlatEntityMaps<true>;
  flatApplicationMaps: FlatApplicationCacheMaps;
  featureFlagsMap: WorkspaceCacheDataMap['featureFlagsMap'];
};
