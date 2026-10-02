/* @license Enterprise */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { fromRowLevelPermissionPredicateEntityToFlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/utils/from-row-level-permission-predicate-entity-to-flat-row-level-permission-predicate.util';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RowLevelPermissionPredicateGroupEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity';
import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { type FlatRowLevelPermissionPredicateMaps } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate-maps.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

@Injectable()
@WorkspaceCache('flatRowLevelPermissionPredicateMaps')
export class WorkspaceFlatRowLevelPermissionPredicateMapCacheService extends WorkspaceCacheProvider<FlatRowLevelPermissionPredicateMaps> {
  constructor(
    @InjectWorkspaceScopedRepository(RowLevelPermissionPredicateEntity)
    private readonly rowLevelPermissionPredicateRepository: WorkspaceScopedRepository<RowLevelPermissionPredicateEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectWorkspaceScopedRepository(RoleEntity)
    private readonly roleRepository: WorkspaceScopedRepository<RoleEntity>,
    @InjectWorkspaceScopedRepository(RowLevelPermissionPredicateGroupEntity)
    private readonly rowLevelPermissionPredicateGroupRepository: WorkspaceScopedRepository<RowLevelPermissionPredicateGroupEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatRowLevelPermissionPredicateMaps> {
    return this.computeFromManager(
      workspaceId,
      this.applicationRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatRowLevelPermissionPredicateMaps> {
    // Scoped reads reject these IDs; reject before constructing any direct reads.
    if (
      workspaceId === undefined ||
      workspaceId === null ||
      workspaceId === ''
    ) {
      throw new Error(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    }

    const [
      rowLevelPermissionPredicates,
      applications,
      fieldMetadatas,
      objectMetadatas,
      roles,
      rowLevelPermissionPredicateGroups,
    ] = await Promise.all([
      this.rowLevelPermissionPredicateRepository
        .withManager(manager)
        .find(workspaceId, {
          withDeleted: true,
        }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(FieldMetadataEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(ObjectMetadataEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.roleRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.rowLevelPermissionPredicateGroupRepository
        .withManager(manager)
        .find(workspaceId, {
          select: ['id', 'universalIdentifier'],
          withDeleted: true,
        }),
    ]);

    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);
    const fieldMetadataIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(fieldMetadatas);
    const objectMetadataIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(objectMetadatas);
    const roleIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(roles);
    const rowLevelPermissionPredicateGroupIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(rowLevelPermissionPredicateGroups);

    const flatRowLevelPermissionPredicateMaps = createEmptyFlatEntityMaps();

    for (const rowLevelPermissionPredicateEntity of rowLevelPermissionPredicates) {
      const flatRowLevelPermissionPredicate =
        fromRowLevelPermissionPredicateEntityToFlatRowLevelPermissionPredicate({
          entity: rowLevelPermissionPredicateEntity,
          applicationIdToUniversalIdentifierMap,
          fieldMetadataIdToUniversalIdentifierMap,
          objectMetadataIdToUniversalIdentifierMap,
          roleIdToUniversalIdentifierMap,
          rowLevelPermissionPredicateGroupIdToUniversalIdentifierMap,
        });

      addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
        flatEntity: flatRowLevelPermissionPredicate,
        flatEntityMapsToMutate: flatRowLevelPermissionPredicateMaps,
      });
    }

    return flatRowLevelPermissionPredicateMaps;
  }
}
