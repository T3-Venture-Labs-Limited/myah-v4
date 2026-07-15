import { isDefined } from 'twenty-shared/utils';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';

export const getSubFlatEntityMapsByUniversalIdentifiersOrThrow = <
  T extends SyncableFlatEntity,
>({
  flatEntityMaps,
  universalIdentifiers,
}: {
  flatEntityMaps: FlatEntityMaps<T>;
  universalIdentifiers: ReadonlySet<string>;
}): FlatEntityMaps<T> =>
  Object.values(flatEntityMaps.byUniversalIdentifier)
    .filter(isDefined)
    .filter((flatEntity) =>
      universalIdentifiers.has(flatEntity.universalIdentifier),
    )
    .reduce<FlatEntityMaps<T>>(
      (subFlatEntityMaps, flatEntity) =>
        addFlatEntityToFlatEntityMapsOrThrow({
          flatEntity,
          flatEntityMaps: subFlatEntityMaps,
        }),
      createEmptyFlatEntityMaps(),
    );
