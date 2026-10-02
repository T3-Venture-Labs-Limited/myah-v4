import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { FlatPageLayoutWidgetMaps } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget-maps.type';
import { fromPageLayoutWidgetEntityToFlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/utils/from-page-layout-widget-entity-to-flat-page-layout-widget.util';
import { FrontComponentEntity } from 'src/engine/metadata-modules/front-component/entities/front-component.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PageLayoutTabEntity } from 'src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity';
import { PageLayoutWidgetEntity } from 'src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { createIdToUniversalIdentifierMap } from 'src/engine/workspace-cache/utils/create-id-to-universal-identifier-map.util';
import { addFlatEntityToFlatEntityMapsThroughMutationOrThrow } from 'src/engine/workspace-manager/workspace-migration/utils/add-flat-entity-to-flat-entity-maps-through-mutation-or-throw.util';

@Injectable()
@WorkspaceCache('flatPageLayoutWidgetMaps')
export class WorkspaceFlatPageLayoutWidgetMapCacheService extends WorkspaceCacheProvider<FlatPageLayoutWidgetMaps> {
  constructor(
    @InjectWorkspaceScopedRepository(PageLayoutWidgetEntity)
    private readonly pageLayoutWidgetRepository: WorkspaceScopedRepository<PageLayoutWidgetEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectWorkspaceScopedRepository(PageLayoutTabEntity)
    private readonly pageLayoutTabRepository: WorkspaceScopedRepository<PageLayoutTabEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(FrontComponentEntity)
    private readonly frontComponentRepository: Repository<FrontComponentEntity>,
    @InjectWorkspaceScopedRepository(ViewEntity)
    private readonly viewRepository: WorkspaceScopedRepository<ViewEntity>,
  ) {
    super();
  }

  async computeForCache(
    workspaceId: string,
  ): Promise<FlatPageLayoutWidgetMaps> {
    return this.computeFromManager(
      workspaceId,
      this.applicationRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FlatPageLayoutWidgetMaps> {
    // Direct repositories cannot reject an invalid workspace before issuing SQL.
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
      existingPageLayoutWidgets,
      applications,
      pageLayoutTabs,
      objectMetadatas,
      fieldMetadatas,
      frontComponents,
      views,
    ] = await Promise.all([
      this.pageLayoutWidgetRepository.withManager(manager).find(workspaceId, {
        withDeleted: true,
      }),
      manager.getRepository(ApplicationEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.pageLayoutTabRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(ObjectMetadataEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(FieldMetadataEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      manager.getRepository(FrontComponentEntity).find({
        where: { workspaceId },
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
      this.viewRepository.withManager(manager).find(workspaceId, {
        select: ['id', 'universalIdentifier'],
        withDeleted: true,
      }),
    ]);

    const applicationIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(applications);
    const pageLayoutTabIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(pageLayoutTabs);
    const objectMetadataIdToUniversalIdentifierMap =
      createIdToUniversalIdentifierMap(objectMetadatas);
    const fieldMetadataUniversalIdentifierById = Object.fromEntries(
      createIdToUniversalIdentifierMap(fieldMetadatas),
    );
    const frontComponentUniversalIdentifierById = Object.fromEntries(
      createIdToUniversalIdentifierMap(frontComponents),
    );
    const viewUniversalIdentifierById = Object.fromEntries(
      createIdToUniversalIdentifierMap(views),
    );

    const flatPageLayoutWidgetMaps = createEmptyFlatEntityMaps();

    for (const pageLayoutWidgetEntity of existingPageLayoutWidgets) {
      const flatPageLayoutWidget =
        fromPageLayoutWidgetEntityToFlatPageLayoutWidget({
          entity: pageLayoutWidgetEntity,
          applicationIdToUniversalIdentifierMap,
          pageLayoutTabIdToUniversalIdentifierMap,
          objectMetadataIdToUniversalIdentifierMap,
          fieldMetadataUniversalIdentifierById,
          frontComponentUniversalIdentifierById,
          viewUniversalIdentifierById,
        });

      addFlatEntityToFlatEntityMapsThroughMutationOrThrow({
        flatEntity: flatPageLayoutWidget,
        flatEntityMapsToMutate: flatPageLayoutWidgetMaps,
      });
    }

    return flatPageLayoutWidgetMaps;
  }
}
