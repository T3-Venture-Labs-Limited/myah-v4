import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { LogicFunctionEntity } from 'src/engine/metadata-modules/logic-function/logic-function.entity';
import { FlatLogicFunction } from 'src/engine/metadata-modules/logic-function/types/flat-logic-function.type';
import { fromLogicFunctionEntityToFlatLogicFunction } from 'src/engine/metadata-modules/logic-function/utils/from-logic-function-entity-to-flat-logic-function.util';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

@Injectable()
@WorkspaceCache('flatLogicFunctionMaps')
export class WorkspaceFlatLogicFunctionMapCacheService extends WorkspaceCacheProvider<
  FlatEntityMaps<FlatLogicFunction>
> {
  constructor(
    @InjectRepository(LogicFunctionEntity)
    private readonly logicFunctionRepository: Repository<LogicFunctionEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatEntityMaps<FlatLogicFunction>> {
    return this.computeFromManager(
      workspaceId,
      this.logicFunctionRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatEntityMaps<FlatLogicFunction>> {
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

    const [logicFunctions, applications] = await Promise.all([
      manager.getRepository(LogicFunctionEntity).find({
        where: { workspaceId },
        withDeleted: true,
      }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
      }),
    ]);

    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);

    const flatLogicFunctionMaps = createEmptyFlatEntityMaps();

    for (const logicFunctionEntity of logicFunctions) {
      const flatLogicFunction = fromLogicFunctionEntityToFlatLogicFunction({
        entity: logicFunctionEntity,
        applicationIdToUniversalIdentifierMap,
      });

      addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
        flatEntity: flatLogicFunction,
        flatEntityMapsToMutate: flatLogicFunctionMaps,
      });
    }

    return flatLogicFunctionMaps;
  }
}
