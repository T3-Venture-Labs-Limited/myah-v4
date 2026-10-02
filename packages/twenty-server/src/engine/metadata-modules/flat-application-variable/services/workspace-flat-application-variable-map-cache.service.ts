import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { ApplicationVariableEntity } from 'src/engine/core-modules/application/application-variable/application-variable.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatApplicationVariableMaps } from 'src/engine/metadata-modules/flat-application-variable/types/flat-application-variable-maps.type';
import { fromApplicationVariableEntityToFlatApplicationVariable } from 'src/engine/metadata-modules/flat-application-variable/utils/from-application-variable-entity-to-flat-application-variable.util';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

@Injectable()
@WorkspaceCache('flatApplicationVariableMaps')
export class WorkspaceFlatApplicationVariableMapCacheService extends WorkspaceCacheProvider<FlatApplicationVariableMaps> {
  constructor(
    @InjectRepository(ApplicationVariableEntity)
    private readonly applicationVariableRepository: Repository<ApplicationVariableEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatApplicationVariableMaps> {
    return this.computeFromManager(
      workspaceId,
      this.applicationVariableRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatApplicationVariableMaps> {
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

    const [applicationVariables, applications] = await Promise.all([
      manager.getRepository(ApplicationVariableEntity).find({
        where: { workspaceId },
      }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
      }),
    ]);

    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);

    const flatApplicationVariableMaps = createEmptyFlatEntityMaps();

    for (const applicationVariableEntity of applicationVariables) {
      const flatApplicationVariable =
        fromApplicationVariableEntityToFlatApplicationVariable({
          entity: applicationVariableEntity,
          applicationIdToUniversalIdentifierMap,
        });

      addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
        flatEntity: flatApplicationVariable,
        flatEntityMapsToMutate: flatApplicationVariableMaps,
      });
    }

    return flatApplicationVariableMaps;
  }
}
