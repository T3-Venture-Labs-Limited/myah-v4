import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { fromFieldMetadataEntityToFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/from-field-metadata-entity-to-flat-field-metadata.util';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { computeUniqueFieldMetadataIdsFromIndexEntities } from 'src/engine/metadata-modules/index-metadata/utils/compute-unique-field-metadata-ids-from-index-entities.util';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewGroupEntity } from 'src/engine/metadata-modules/view-group/entities/view-group.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { regroupEntitiesByRelatedEntityId } from 'src/engine/workspace-cache/utils/regroup-entities-by-related-entity-id';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';

@Injectable()
@WorkspaceCache('flatFieldMetadataMaps')
export class WorkspaceFlatFieldMetadataMapCacheService extends WorkspaceCacheProvider<
  FlatEntityMaps<FlatFieldMetadata>
> {
  constructor(
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectWorkspaceScopedRepository(IndexMetadataEntity)
    private readonly indexMetadataRepository: WorkspaceScopedRepository<IndexMetadataEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectWorkspaceScopedRepository(ViewFieldEntity)
    private readonly viewFieldRepository: WorkspaceScopedRepository<ViewFieldEntity>,
    @InjectWorkspaceScopedRepository(ViewFilterEntity)
    private readonly viewFilterRepository: WorkspaceScopedRepository<ViewFilterEntity>,
    @InjectWorkspaceScopedRepository(ViewGroupEntity)
    private readonly viewGroupRepository: WorkspaceScopedRepository<ViewGroupEntity>,
    @InjectWorkspaceScopedRepository(ViewSortEntity)
    private readonly viewSortRepository: WorkspaceScopedRepository<ViewSortEntity>,
    @InjectWorkspaceScopedRepository(ViewEntity)
    private readonly viewRepository: WorkspaceScopedRepository<ViewEntity>,
    @InjectWorkspaceScopedRepository(SearchFieldMetadataEntity)
    private readonly searchFieldMetadataRepository: WorkspaceScopedRepository<SearchFieldMetadataEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatEntityMaps<FlatFieldMetadata>> {
    return this.computeFromManager(
      workspaceId,
      this.fieldMetadataRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatEntityMaps<FlatFieldMetadata>> {
    const [
      fieldMetadatas,
      fieldPermissions,
      indexMetadatas,
      objectMetadatas,
      applications,
      viewFields,
      viewFilters,
      viewSorts,
      views,
      searchFieldMetadatas,
    ] = await Promise.all([
      manager.getRepository(FieldMetadataEntity).find({
        where: { workspaceId },
        withDeleted: true,
      }),
      manager.getRepository(FieldPermissionEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier', 'fieldMetadataId'],
        withDeleted: true,
      }),
      this.indexMetadataRepository.withManager(manager).find(workspaceId, {
        where: { isUnique: true },
        relations: ['indexFieldMetadatas'],
        withDeleted: true,
      }),
      manager.getRepository(ObjectMetadataEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.viewFieldRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier', 'fieldMetadataId'],
        withDeleted: true,
      }),
      this.viewFilterRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier', 'fieldMetadataId'],
        withDeleted: true,
      }),
      this.viewSortRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier', 'fieldMetadataId'],
        withDeleted: true,
      }),
      this.viewRepository.withManager(manager).find(workspaceId, {
        select: [
          'id',
          'universalIdentifier',
          'kanbanAggregateOperationFieldMetadataId',
          'calendarFieldMetadataId',
          'mainGroupByFieldMetadataId',
        ],
        withDeleted: true,
      }),
      this.searchFieldMetadataRepository
        .withManager(manager)
        .find(workspaceId, {
          select: ['id', 'universalIdentifier', 'fieldMetadataId'],
        }),
    ]);

    const [
      fieldPermissionsByFieldId,
      viewFieldsByFieldId,
      viewFiltersByFieldId,
      calendarViewsByFieldId,
      kanbanViewsByFieldId,
      mainGroupByFieldMetadataViewsByFieldId,
      viewSortsByFieldId,
      searchFieldMetadatasByFieldId,
    ] = (
      [
        {
          entities: fieldPermissions,
          foreignKey: 'fieldMetadataId',
        },
        {
          entities: viewFields,
          foreignKey: 'fieldMetadataId',
        },
        {
          entities: viewFilters,
          foreignKey: 'fieldMetadataId',
        },
        {
          entities: views,
          foreignKey: 'calendarFieldMetadataId',
        },
        {
          entities: views,
          foreignKey: 'kanbanAggregateOperationFieldMetadataId',
        },
        {
          entities: views,
          foreignKey: 'mainGroupByFieldMetadataId',
        },
        {
          entities: viewSorts,
          foreignKey: 'fieldMetadataId',
        },
        {
          entities: searchFieldMetadatas,
          foreignKey: 'fieldMetadataId',
        },
      ] as const
    ).map(regroupEntitiesByRelatedEntityId);

    const fieldMetadataIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(fieldMetadatas);
    const objectMetadataIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(objectMetadatas);
    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);

    const uniqueFieldMetadataIds =
      computeUniqueFieldMetadataIdsFromIndexEntities(indexMetadatas);

    const flatFieldMetadataMaps = createEmptyFlatEntityMaps();

    for (const fieldMetadataEntity of fieldMetadatas) {
      const flatFieldMetadata = fromFieldMetadataEntityToFlatFieldMetadata({
        entity: {
          ...fieldMetadataEntity,
          fieldPermissions:
            fieldPermissionsByFieldId.get(fieldMetadataEntity.id) || [],
          viewFields: viewFieldsByFieldId.get(fieldMetadataEntity.id) || [],
          viewFilters: viewFiltersByFieldId.get(fieldMetadataEntity.id) || [],
          kanbanAggregateOperationViews:
            kanbanViewsByFieldId.get(fieldMetadataEntity.id) || [],
          calendarViews:
            calendarViewsByFieldId.get(fieldMetadataEntity.id) || [],
          mainGroupByFieldMetadataViews:
            mainGroupByFieldMetadataViewsByFieldId.get(
              fieldMetadataEntity.id,
            ) || [],
          viewSorts: viewSortsByFieldId.get(fieldMetadataEntity.id) || [],
          searchFieldMetadatas:
            searchFieldMetadatasByFieldId.get(fieldMetadataEntity.id) || [],
        },
        fieldMetadataIdToUniversalIdentifierMap,
        objectMetadataIdToUniversalIdentifierMap,
        applicationIdToUniversalIdentifierMap,
      });

      addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
        flatEntity: {
          ...flatFieldMetadata,
          isUnique: uniqueFieldMetadataIds.has(fieldMetadataEntity.id),
        },
        flatEntityMapsToMutate: flatFieldMetadataMaps,
      });
    }

    return flatFieldMetadataMaps;
  }
}
