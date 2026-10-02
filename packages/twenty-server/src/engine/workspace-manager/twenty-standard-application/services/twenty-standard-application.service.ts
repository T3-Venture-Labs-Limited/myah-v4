import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { projectLegacyBrandBrainStandardTarget } from 'src/engine/workspace-manager/twenty-standard-application/utils/project-legacy-brand-brain-standard-target.util';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { MetadataFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/metadata-flat-entity.type';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { getSubFlatEntityMapsByApplicationIdsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-application-ids-or-throw.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { getReplacedTwentyCrmMetadataUniversalIdentifiers } from 'src/engine/workspace-manager/twenty-standard-application/utils/remove-replaced-twenty-crm-metadata.util';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { FromToAllUniversalFlatEntityMaps } from 'src/engine/workspace-manager/workspace-migration/types/workspace-migration-orchestrator.type';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

export type TwentyStandardApplicationProfile = 'full' | 'myah';

type FlatEntityWithUniversalIdentifier = {
  id: string;
  applicationId?: string;
  universalIdentifier: string;
  [key: string]: unknown;
};

type FlatEntityMapsLike = {
  byUniversalIdentifier: Record<
    string,
    FlatEntityWithUniversalIdentifier | undefined
  >;
  universalIdentifierById: Record<string, string | undefined>;
  universalIdentifiersByApplicationId: Record<string, string[] | undefined>;
};

const rebuildFlatEntityMapIndexes = (flatEntityMaps: FlatEntityMapsLike) => {
  flatEntityMaps.universalIdentifierById = {};
  flatEntityMaps.universalIdentifiersByApplicationId = {};

  for (const entity of Object.values(
    flatEntityMaps.byUniversalIdentifier,
  ).filter(isDefined)) {
    flatEntityMaps.universalIdentifierById[entity.id] =
      entity.universalIdentifier;

    if (isDefined(entity.applicationId)) {
      const applicationUniversalIdentifiers =
        flatEntityMaps.universalIdentifiersByApplicationId[
          entity.applicationId
        ] ?? [];

      applicationUniversalIdentifiers.push(entity.universalIdentifier);
      flatEntityMaps.universalIdentifiersByApplicationId[entity.applicationId] =
        applicationUniversalIdentifiers;
    }
  }
};

// TODO completely deprecate this file once we've created the twenty-standard twenty-app manifest
@Injectable()
export class TwentyStandardApplicationService {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async synchronizeTwentyStandardApplicationOrThrow({
    workspaceId,
    profile,
    upgradeTransaction,
  }: {
    workspaceId: string;
    profile: TwentyStandardApplicationProfile;
    upgradeTransaction?: UpgradeWorkspaceTransaction;
  }) {
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        {
          workspaceId,
        },
      );
    const {
      featureFlagsMap,
      flatApplicationMaps,
      ...fromTwentyStandardAllFlatEntityMaps
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      ...TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
      'featureFlagsMap',
      'flatApplicationMaps',
    ]);

    const {
      allFlatEntityMaps: toTwentyStandardAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
    } = computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId,
      twentyStandardApplicationId: twentyStandardFlatApplication.id,
      removeReplacedTwentyCrmMetadata: profile === 'myah',
      omitDashboardComposition: profile === 'myah',
    });

    const fromToAllFlatEntityMaps: FromToAllUniversalFlatEntityMaps = {};

    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      const fromFlatEntityMaps =
        fromTwentyStandardAllFlatEntityMaps[flatEntityMapsKey];
      const fromTo = {
        from: getSubFlatEntityMapsByApplicationIdsOrThrow<
          MetadataFlatEntity<typeof metadataName>
        >({
          applicationIds: [twentyStandardFlatApplication.id],
          flatEntityMaps: fromFlatEntityMaps,
        }),
        to: toTwentyStandardAllFlatEntityMaps[flatEntityMapsKey],
      };

      // @ts-expect-error Metadata flat entity maps cache key and metadataName colliding
      fromToAllFlatEntityMaps[flatEntityMapsKey] = fromTo;
    }

    if (profile === 'myah') {
      this.overlayExistingMyahRetirementClosure({
        fromToAllFlatEntityMaps,
        existingAllFlatEntityMaps: fromTwentyStandardAllFlatEntityMaps,
        toTwentyStandardAllFlatEntityMaps,
        idByUniversalIdentifierByMetadataName,
      });
      const legacySource = createEmptyAllFlatEntityMaps();

      projectLegacyBrandBrainStandardTarget({
        existing: fromTwentyStandardAllFlatEntityMaps,
        source: legacySource,
        target: toTwentyStandardAllFlatEntityMaps,
        applications: flatApplicationMaps,
      });
      for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
        const key = getMetadataFlatEntityMapsKey(metadataName);
        const legacyRows = legacySource[key].byUniversalIdentifier;
        const from = fromToAllFlatEntityMaps[key]!.from;

        Object.assign(from.byUniversalIdentifier, legacyRows);
        // SAFETY: all standard metadata maps share these three index maps.
        rebuildFlatEntityMapIndexes(from as unknown as FlatEntityMapsLike);
        idByUniversalIdentifierByMetadataName[metadataName] =
          Object.fromEntries(
            Object.values(
              toTwentyStandardAllFlatEntityMaps[key].byUniversalIdentifier,
            )
              .filter(isDefined)
              .map((entity) => [entity.universalIdentifier, entity.id]),
          );
      }
    }

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          buildOptions: {
            isSystemBuild: true,
            inferDeletionFromMissingEntities: true,
            applicationUniversalIdentifier:
              twentyStandardFlatApplication.universalIdentifier,
          },
          fromToAllFlatEntityMaps,
          workspaceId,
          additionalCacheDataMaps: {
            featureFlagsMap,
          },
          dependencyAllFlatEntityMaps: fromTwentyStandardAllFlatEntityMaps,
          idByUniversalIdentifierByMetadataName,
          upgradeTransaction,
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        validateAndBuildResult,
        'Multiple validation errors occurred while synchronizing twenty-standard application',
      );
    }
  }

  private overlayExistingMyahRetirementClosure({
    fromToAllFlatEntityMaps,
    existingAllFlatEntityMaps,
    toTwentyStandardAllFlatEntityMaps,
    idByUniversalIdentifierByMetadataName,
  }: {
    fromToAllFlatEntityMaps: FromToAllUniversalFlatEntityMaps;
    existingAllFlatEntityMaps: Parameters<
      typeof getReplacedTwentyCrmMetadataUniversalIdentifiers
    >[0];
    toTwentyStandardAllFlatEntityMaps: Record<string, FlatEntityMapsLike>;
    idByUniversalIdentifierByMetadataName: Record<
      string,
      Record<string, string>
    >;
  }): void {
    const existingStandardMaps = Object.fromEntries(
      TWENTY_STANDARD_ALL_METADATA_NAME.map((metadataName) => {
        const key = getMetadataFlatEntityMapsKey(metadataName);

        return [key, fromToAllFlatEntityMaps[key]!.from];
      }),
    ) as Parameters<typeof getReplacedTwentyCrmMetadataUniversalIdentifiers>[0];
    const retainedUniversalIdentifiersByMetadataName =
      getReplacedTwentyCrmMetadataUniversalIdentifiers(
        existingAllFlatEntityMaps,
      );

    // SAFETY: all standard flat-entity map variants share these three indexes.
    const pageLayoutMaps =
      existingStandardMaps.flatPageLayoutMaps as unknown as FlatEntityMapsLike;
    // SAFETY: all standard flat-entity map variants share these three indexes.
    const pageLayoutTabMaps =
      existingStandardMaps.flatPageLayoutTabMaps as unknown as FlatEntityMapsLike;
    // SAFETY: all standard flat-entity map variants share these three indexes.
    const pageLayoutWidgetMaps =
      existingStandardMaps.flatPageLayoutWidgetMaps as unknown as FlatEntityMapsLike;
    const dashboardLayoutIds = new Set(
      Object.values(pageLayoutMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter((layout) => layout.type === PageLayoutType.DASHBOARD)
        .map((layout) => layout.id),
    );
    const dashboardTabIds = new Set(
      Object.values(pageLayoutTabMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter((tab) => {
          const overrideLayoutId =
            tab.overrides && typeof tab.overrides === 'object'
              ? (tab.overrides as { pageLayoutId?: string }).pageLayoutId
              : undefined;

          return (
            dashboardLayoutIds.has(String(tab.pageLayoutId)) ||
            (isDefined(overrideLayoutId) &&
              dashboardLayoutIds.has(overrideLayoutId))
          );
        })
        .map((tab) => tab.id),
    );

    retainedUniversalIdentifiersByMetadataName.pageLayout ??= new Set();
    retainedUniversalIdentifiersByMetadataName.pageLayoutTab ??= new Set();
    retainedUniversalIdentifiersByMetadataName.pageLayoutWidget ??= new Set();
    for (const layout of Object.values(
      pageLayoutMaps.byUniversalIdentifier,
    ).filter(isDefined)) {
      if (dashboardLayoutIds.has(layout.id)) {
        retainedUniversalIdentifiersByMetadataName.pageLayout.add(
          layout.universalIdentifier,
        );
      }
    }
    for (const tab of Object.values(
      pageLayoutTabMaps.byUniversalIdentifier,
    ).filter(isDefined)) {
      if (dashboardTabIds.has(tab.id)) {
        retainedUniversalIdentifiersByMetadataName.pageLayoutTab.add(
          tab.universalIdentifier,
        );
      }
    }
    for (const widget of Object.values(
      pageLayoutWidgetMaps.byUniversalIdentifier,
    ).filter(isDefined)) {
      const overrideTabId =
        widget.overrides && typeof widget.overrides === 'object'
          ? (widget.overrides as { pageLayoutTabId?: string }).pageLayoutTabId
          : undefined;
      if (
        dashboardTabIds.has(String(widget.pageLayoutTabId)) ||
        (isDefined(overrideTabId) && dashboardTabIds.has(overrideTabId))
      ) {
        retainedUniversalIdentifiersByMetadataName.pageLayoutWidget.add(
          widget.universalIdentifier,
        );
      }
    }

    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      // SAFETY: all standard flat-entity map variants share these three indexes.
      const source = fromToAllFlatEntityMaps[flatEntityMapsKey]!
        .from as unknown as FlatEntityMapsLike;
      const target = toTwentyStandardAllFlatEntityMaps[
        flatEntityMapsKey
      ]! as FlatEntityMapsLike;
      const retainedUniversalIdentifiers =
        retainedUniversalIdentifiersByMetadataName[metadataName];

      if (!isDefined(retainedUniversalIdentifiers)) {
        continue;
      }

      for (const universalIdentifier of retainedUniversalIdentifiers) {
        const entity = source.byUniversalIdentifier[universalIdentifier];

        if (!isDefined(entity)) {
          continue;
        }

        target.byUniversalIdentifier[universalIdentifier] = entity;
      }

      rebuildFlatEntityMapIndexes(target);
      idByUniversalIdentifierByMetadataName[metadataName] = Object.fromEntries(
        Object.values(target.byUniversalIdentifier)
          .filter(isDefined)
          .map((entity) => [entity.universalIdentifier, entity.id]),
      );
    }
  }
}
