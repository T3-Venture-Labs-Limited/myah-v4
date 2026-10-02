import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatNavigationMenuItemMaps } from 'src/engine/metadata-modules/flat-navigation-menu-item/types/flat-navigation-menu-item-maps.type';
import { addFlatNavigationMenuItemToMapsAndUpdateIndex } from 'src/engine/metadata-modules/flat-navigation-menu-item/utils/add-flat-navigation-menu-item-to-maps-and-update-index.util';
import { fromNavigationMenuItemEntityToFlatNavigationMenuItem } from 'src/engine/metadata-modules/flat-navigation-menu-item/utils/from-navigation-menu-item-entity-to-flat-navigation-menu-item.util';
import { NavigationMenuItemEntity } from 'src/engine/metadata-modules/navigation-menu-item/entities/navigation-menu-item.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';

@Injectable()
@WorkspaceCache('flatNavigationMenuItemMaps')
export class WorkspaceFlatNavigationMenuItemMapCacheService extends WorkspaceCacheProvider<FlatNavigationMenuItemMaps> {
  constructor(
    @InjectWorkspaceScopedRepository(NavigationMenuItemEntity)
    private readonly navigationMenuItemRepository: WorkspaceScopedRepository<NavigationMenuItemEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectWorkspaceScopedRepository(ViewEntity)
    private readonly viewRepository: WorkspaceScopedRepository<ViewEntity>,
    @InjectWorkspaceScopedRepository(PageLayoutEntity)
    private readonly pageLayoutRepository: WorkspaceScopedRepository<PageLayoutEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatNavigationMenuItemMaps> {
    return this.computeFromManager(
      workspaceId,
      this.applicationRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatNavigationMenuItemMaps> {
    if (!workspaceId) {
      throw new Error('Workspace id is required');
    }

    const [
      navigationMenuItems,
      applications,
      objectMetadatas,
      views,
      pageLayouts,
    ] = await Promise.all([
      this.navigationMenuItemRepository.withManager(manager).find(workspaceId, {
        withDeleted: true,
      }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(ObjectMetadataEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.viewRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.pageLayoutRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
    ]);

    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);
    const objectMetadataIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(objectMetadatas);
    const navigationMenuItemIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(navigationMenuItems);
    const viewIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(views);
    const pageLayoutIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(pageLayouts);

    const flatNavigationMenuItemMaps = {
      ...createEmptyFlatEntityMaps(),
      byUserWorkspaceIdAndFolderId: {},
    };

    for (const navigationMenuItemEntity of navigationMenuItems) {
      const flatNavigationMenuItem =
        fromNavigationMenuItemEntityToFlatNavigationMenuItem({
          entity: navigationMenuItemEntity,
          applicationIdToUniversalIdentifierMap,
          objectMetadataIdToUniversalIdentifierMap,
          navigationMenuItemIdToUniversalIdentifierMap,
          viewIdToUniversalIdentifierMap,
          pageLayoutIdToUniversalIdentifierMap,
        });

      addFlatNavigationMenuItemToMapsAndUpdateIndex({
        flatNavigationMenuItem,
        flatNavigationMenuItemMaps,
      });
    }

    return flatNavigationMenuItemMaps;
  }
}
