import { Injectable, type Type } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { isValidUuid } from 'twenty-shared/utils';
import { type EntityManager, type QueryRunner } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WORKSPACE_CACHE_KEY } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';
import { type WorkspaceCacheDataMap } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { type PinnedWorkspaceMetadataSnapshot } from 'src/engine/workspace-manager/workspace-migration/types/pinned-workspace-metadata-snapshot.type';

import { WorkspaceFeatureFlagsMapCacheService } from 'src/engine/metadata-modules/workspace-feature-flags-map-cache/workspace-feature-flags-map-cache.service';
import { WorkspaceFlatRoleMapCacheService } from 'src/engine/metadata-modules/role/services/workspace-flat-role-map-cache.service';
import { WorkspaceFlatLogicFunctionMapCacheService } from 'src/engine/metadata-modules/logic-function/services/workspace-flat-logic-function-map-cache.service';
import { WorkspaceFlatWebhookMapCacheService } from 'src/engine/metadata-modules/flat-webhook/services/workspace-flat-webhook-map-cache.service';
import { WorkspaceFlatViewMapCacheService } from 'src/engine/metadata-modules/flat-view/services/workspace-flat-view-map-cache.service';
import { WorkspaceFlatViewSortMapCacheService } from 'src/engine/metadata-modules/flat-view-sort/services/workspace-flat-view-sort-map-cache.service';
import { WorkspaceFlatViewGroupMapCacheService } from 'src/engine/metadata-modules/flat-view-group/services/workspace-flat-view-group-map-cache.service';
import { WorkspaceFlatViewFilterMapCacheService } from 'src/engine/metadata-modules/flat-view-filter/services/workspace-flat-view-filter-map-cache.service';
import { WorkspaceFlatViewFilterGroupMapCacheService } from 'src/engine/metadata-modules/flat-view-filter-group/services/workspace-flat-view-filter-group-map-cache.service';
import { WorkspaceFlatViewFieldMapCacheService } from 'src/engine/metadata-modules/flat-view-field/services/workspace-flat-view-field-map-cache.service';
import { WorkspaceFlatViewFieldGroupMapCacheService } from 'src/engine/metadata-modules/flat-view-field-group/services/workspace-flat-view-field-group-map-cache.service';
import { WorkspaceFlatSkillMapCacheService } from 'src/engine/metadata-modules/flat-skill/services/workspace-flat-skill-map-cache.service';
import { WorkspaceFlatSearchFieldMetadataMapCacheService } from 'src/engine/metadata-modules/flat-search-field-metadata/services/workspace-flat-search-field-metadata-map-cache.service';
import { WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-group-map-cache.service';
import { WorkspaceFlatRowLevelPermissionPredicateMapCacheService } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-map-cache.service';
import { WorkspaceFlatRoleTargetMapCacheService } from 'src/engine/metadata-modules/flat-role-target/services/workspace-flat-role-target-map-cache.service';
import { WorkspaceFlatRolePermissionFlagMapCacheService } from 'src/engine/metadata-modules/flat-role-permission-flag/services/workspace-flat-role-permission-flag-map-cache.service';
import { WorkspaceFlatPermissionFlagMapCacheService } from 'src/engine/metadata-modules/flat-permission-flag/services/workspace-flat-permission-flag-map-cache.service';
import { WorkspaceFlatPageLayoutMapCacheService } from 'src/engine/metadata-modules/flat-page-layout/services/workspace-flat-page-layout-map-cache.service';
import { WorkspaceFlatPageLayoutWidgetMapCacheService } from 'src/engine/metadata-modules/flat-page-layout-widget/services/workspace-flat-page-layout-widget-map-cache.service';
import { WorkspaceFlatPageLayoutTabMapCacheService } from 'src/engine/metadata-modules/flat-page-layout-tab/services/workspace-flat-page-layout-tab-map-cache.service';
import { WorkspaceFlatObjectPermissionMapCacheService } from 'src/engine/metadata-modules/flat-object-permission/services/workspace-flat-object-permission-map-cache.service';
import { WorkspaceFlatObjectMetadataMapCacheService } from 'src/engine/metadata-modules/flat-object-metadata/services/workspace-flat-object-metadata-map-cache.service';
import { WorkspaceFlatNavigationMenuItemMapCacheService } from 'src/engine/metadata-modules/flat-navigation-menu-item/services/workspace-flat-navigation-menu-item-map-cache.service';
import { WorkspaceFlatIndexMapCacheService } from 'src/engine/metadata-modules/flat-index-metadata/services/workspace-flat-index-map-cache.service';
import { WorkspaceFlatFrontComponentMapCacheService } from 'src/engine/metadata-modules/flat-front-component/services/workspace-flat-front-component-map-cache.service';
import { WorkspaceFlatFieldPermissionMapCacheService } from 'src/engine/metadata-modules/flat-field-permission/services/workspace-flat-field-permission-map-cache.service';
import { WorkspaceFlatFieldMetadataMapCacheService } from 'src/engine/metadata-modules/flat-field-metadata/services/workspace-flat-field-metadata-map-cache.service';
import { WorkspaceFlatConnectionProviderMapCacheService } from 'src/engine/metadata-modules/flat-connection-provider/services/workspace-flat-connection-provider-map-cache.service';
import { WorkspaceFlatCommandMenuItemMapCacheService } from 'src/engine/metadata-modules/flat-command-menu-item/services/workspace-flat-command-menu-item-map-cache.service';
import { WorkspaceFlatApplicationVariableMapCacheService } from 'src/engine/metadata-modules/flat-application-variable/services/workspace-flat-application-variable-map-cache.service';
import { WorkspaceFlatAgentMapCacheService } from 'src/engine/metadata-modules/flat-agent/services/workspace-flat-agent-map-cache.service';
import { WorkspaceFlatApplicationMapCacheService } from 'src/engine/core-modules/application/workspace-flat-application-map-cache.service';

type SnapshotMaps = PinnedWorkspaceMetadataSnapshot['allFlatEntityMaps'] &
  Pick<WorkspaceCacheDataMap, 'flatApplicationMaps' | 'featureFlagsMap'>;
type ManagerCalculator<K extends keyof SnapshotMaps> = Type<{
  computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<SnapshotMaps[K]>;
}>;

// The mapped contract preserves key/result correlation; the independent metadata
// inventory and decorator are checked at runtime before any SQL is issued.
export const PINNED_SNAPSHOT_CALCULATORS = {
  featureFlagsMap: WorkspaceFeatureFlagsMapCacheService,
  flatRoleMaps: WorkspaceFlatRoleMapCacheService,
  flatLogicFunctionMaps: WorkspaceFlatLogicFunctionMapCacheService,
  flatWebhookMaps: WorkspaceFlatWebhookMapCacheService,
  flatViewMaps: WorkspaceFlatViewMapCacheService,
  flatViewSortMaps: WorkspaceFlatViewSortMapCacheService,
  flatViewGroupMaps: WorkspaceFlatViewGroupMapCacheService,
  flatViewFilterMaps: WorkspaceFlatViewFilterMapCacheService,
  flatViewFilterGroupMaps: WorkspaceFlatViewFilterGroupMapCacheService,
  flatViewFieldMaps: WorkspaceFlatViewFieldMapCacheService,
  flatViewFieldGroupMaps: WorkspaceFlatViewFieldGroupMapCacheService,
  flatSkillMaps: WorkspaceFlatSkillMapCacheService,
  flatSearchFieldMetadataMaps: WorkspaceFlatSearchFieldMetadataMapCacheService,
  flatRowLevelPermissionPredicateGroupMaps:
    WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService,
  flatRowLevelPermissionPredicateMaps:
    WorkspaceFlatRowLevelPermissionPredicateMapCacheService,
  flatRoleTargetMaps: WorkspaceFlatRoleTargetMapCacheService,
  flatRolePermissionFlagMaps: WorkspaceFlatRolePermissionFlagMapCacheService,
  flatPermissionFlagMaps: WorkspaceFlatPermissionFlagMapCacheService,
  flatPageLayoutMaps: WorkspaceFlatPageLayoutMapCacheService,
  flatPageLayoutWidgetMaps: WorkspaceFlatPageLayoutWidgetMapCacheService,
  flatPageLayoutTabMaps: WorkspaceFlatPageLayoutTabMapCacheService,
  flatObjectPermissionMaps: WorkspaceFlatObjectPermissionMapCacheService,
  flatObjectMetadataMaps: WorkspaceFlatObjectMetadataMapCacheService,
  flatNavigationMenuItemMaps: WorkspaceFlatNavigationMenuItemMapCacheService,
  flatIndexMaps: WorkspaceFlatIndexMapCacheService,
  flatFrontComponentMaps: WorkspaceFlatFrontComponentMapCacheService,
  flatFieldPermissionMaps: WorkspaceFlatFieldPermissionMapCacheService,
  flatFieldMetadataMaps: WorkspaceFlatFieldMetadataMapCacheService,
  flatConnectionProviderMaps: WorkspaceFlatConnectionProviderMapCacheService,
  flatCommandMenuItemMaps: WorkspaceFlatCommandMenuItemMapCacheService,
  flatApplicationVariableMaps: WorkspaceFlatApplicationVariableMapCacheService,
  flatAgentMaps: WorkspaceFlatAgentMapCacheService,
  flatApplicationMaps: WorkspaceFlatApplicationMapCacheService,
} satisfies { [K in keyof SnapshotMaps]: ManagerCalculator<K> };

const assertRunner = (queryRunner: QueryRunner): EntityManager => {
  if (
    !queryRunner ||
    queryRunner.isReleased ||
    !queryRunner.isTransactionActive ||
    !queryRunner.manager ||
    queryRunner.manager.queryRunner !== queryRunner
  ) {
    throw new Error(
      'Pinned metadata snapshot requires an active bound QueryRunner',
    );
  }

  return queryRunner.manager;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

@Injectable()
export class PinnedWorkspaceMetadataSnapshotLoaderService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly reflector: Reflector,
  ) {}

  async load(
    workspaceId: string,
    queryRunner: QueryRunner,
  ): Promise<PinnedWorkspaceMetadataSnapshot> {
    if (typeof workspaceId !== 'string' || !isValidUuid(workspaceId)) {
      throw new Error(
        'Pinned metadata snapshot requires a valid workspace UUID',
      );
    }

    const manager = assertRunner(queryRunner);
    const expectedKeys = [
      ...ALL_FLAT_ENTITY_MAPS_PROPERTIES,
      'flatApplicationMaps',
      'featureFlagsMap',
    ];
    const registry: Record<
      string,
      ManagerCalculator<keyof SnapshotMaps>
    > = PINNED_SNAPSHOT_CALCULATORS;
    const registeredKeys = Object.keys(registry);

    if (
      new Set(expectedKeys).size !== expectedKeys.length ||
      registeredKeys.length !== expectedKeys.length ||
      registeredKeys.some((key) => !expectedKeys.includes(key))
    ) {
      throw new Error(
        'Pinned metadata snapshot calculator registry is incomplete',
      );
    }

    // Resolve and verify *all* calculators before touching the database.
    const calculators = expectedKeys.map((key) => {
      const token = registry[key];
      let calculator: InstanceType<typeof token>;

      try {
        calculator = this.moduleRef.get(token, { strict: false });
      } catch {
        throw new Error(
          `Pinned metadata snapshot calculator unavailable: ${key}`,
        );
      }

      if (
        !calculator ||
        !(calculator instanceof token) ||
        this.reflector.get(WORKSPACE_CACHE_KEY, calculator.constructor) !==
          key ||
        typeof calculator.computeFromManager !== 'function'
      ) {
        throw new Error(`Pinned metadata snapshot calculator invalid: ${key}`);
      }

      return [key, calculator] as const;
    });

    const workspace = await manager.getRepository(WorkspaceEntity).findOne({
      where: { id: workspaceId },
      select: [
        'id',
        'databaseSchema',
        'workspaceCustomApplicationId',
        'defaultRoleId',
      ],
      withDeleted: true,
    });
    const schemaName = getWorkspaceSchemaName(workspaceId);

    if (!workspace || workspace.databaseSchema !== schemaName) {
      throw new Error(
        `Pinned metadata snapshot workspace/schema mismatch: ${workspaceId}`,
      );
    }
    if (!(await queryRunner.hasSchema(schemaName))) {
      throw new Error(
        `Pinned metadata snapshot schema missing: ${workspaceId}`,
      );
    }

    const results: Record<string, unknown> = {};

    for (const [key, calculator] of calculators) {
      const value: unknown = await calculator.computeFromManager(
        workspaceId,
        manager,
      );

      if (!isRecord(value)) {
        throw new Error(
          `Pinned metadata snapshot calculator returned no map: ${key}`,
        );
      }
      if (key === 'flatApplicationMaps') {
        if (!isRecord(value.byId) || !isRecord(value.idByUniversalIdentifier)) {
          throw new Error(
            'Pinned metadata snapshot application indexes incomplete',
          );
        }
      } else if (key !== 'featureFlagsMap') {
        if (
          !isRecord(value.byUniversalIdentifier) ||
          !isRecord(value.universalIdentifierById) ||
          !isRecord(value.universalIdentifiersByApplicationId)
        ) {
          throw new Error(
            `Pinned metadata snapshot indexes incomplete: ${key}`,
          );
        }
      }

      results[key] = value;
    }

    // Match ApplicationService's with-deleted owner selection, without its cache read.
    const flatApplicationMaps =
      results.flatApplicationMaps as SnapshotMaps['flatApplicationMaps'];
    const standardId =
      flatApplicationMaps.idByUniversalIdentifier[
        TWENTY_STANDARD_APPLICATION.universalIdentifier
      ];

    if (
      !standardId ||
      !flatApplicationMaps.byId[standardId] ||
      !flatApplicationMaps.byId[workspace.workspaceCustomApplicationId]
    ) {
      throw new Error(
        `Pinned metadata snapshot owners missing: ${workspaceId}`,
      );
    }

    assertRunner(queryRunner);

    // Only after exact-set, capability and shape validation is the dynamic assembly
    // treated as the exhaustive compile-time-checked registry's result.
    return {
      workspaceId,
      queryRunner,
      schemaName,
      workspace,
      allFlatEntityMaps:
        results as PinnedWorkspaceMetadataSnapshot['allFlatEntityMaps'],
      flatApplicationMaps,
      featureFlagsMap:
        results.featureFlagsMap as SnapshotMaps['featureFlagsMap'],
    };
  }
}
