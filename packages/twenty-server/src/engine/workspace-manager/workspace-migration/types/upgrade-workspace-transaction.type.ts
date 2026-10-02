import type { QueryRunner } from 'typeorm';

import type { AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';

// Owned by the ordered upgrade. The metadata runner must not commit or release
// this connection; its cache/events are scheduled only after the receipt commits.
export type UpgradeWorkspaceTransaction = {
  queryRunner: QueryRunner;
  afterCommit: (effect: () => Promise<void> | void) => void;
  // Transaction-local optimistic maps, never exposed to the shared cache.
  // A later migration in the same command must see earlier uncommitted rows.
  optimisticFlatEntityMaps?: Partial<AllFlatEntityMaps>;
};
