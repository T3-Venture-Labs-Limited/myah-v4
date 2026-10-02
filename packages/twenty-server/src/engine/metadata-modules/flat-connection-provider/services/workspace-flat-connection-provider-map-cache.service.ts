import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ConnectionProviderEntity } from 'src/engine/core-modules/application/connection-provider/connection-provider.entity';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatConnectionProviderMaps } from 'src/engine/metadata-modules/flat-connection-provider/types/flat-connection-provider-maps.type';
import { fromConnectionProviderEntityToFlatConnectionProvider } from 'src/engine/metadata-modules/flat-connection-provider/utils/from-connection-provider-entity-to-flat-connection-provider.util';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

@Injectable()
@WorkspaceCache('flatConnectionProviderMaps')
export class WorkspaceFlatConnectionProviderMapCacheService extends WorkspaceCacheProvider<FlatConnectionProviderMaps> {
  constructor(
    @InjectRepository(ConnectionProviderEntity)
    private readonly connectionProviderRepository: Repository<ConnectionProviderEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatConnectionProviderMaps> {
    return this.computeFromManager(
      workspaceId,
      this.connectionProviderRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatConnectionProviderMaps> {
    // TypeORM can omit an undefined WHERE value, turning a scoped read into a
    // workspace-wide read. Check before starting either direct repository find.
    if (
      workspaceId === undefined ||
      workspaceId === null ||
      workspaceId === ''
    ) {
      throw new Error(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    }

    const [connectionProviders, applications] = await Promise.all([
      manager.getRepository(ConnectionProviderEntity).find({
        where: { workspaceId },
      }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
      }),
    ]);

    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);

    const flatConnectionProviderMaps = createEmptyFlatEntityMaps();

    for (const connectionProviderEntity of connectionProviders) {
      const flatConnectionProvider =
        fromConnectionProviderEntityToFlatConnectionProvider({
          entity: connectionProviderEntity,
          applicationIdToUniversalIdentifierMap,
        });

      addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
        flatEntity: flatConnectionProvider,
        flatEntityMapsToMutate: flatConnectionProviderMaps,
      });
    }

    return flatConnectionProviderMaps;
  }
}
