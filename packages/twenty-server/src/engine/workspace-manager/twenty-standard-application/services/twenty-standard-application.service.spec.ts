import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';

describe('TwentyStandardApplicationService', () => {
  const createService = (
    cachedMaps = createEmptyAllFlatEntityMaps(),
    flatApplicationMaps: any = { byId: {}, idByUniversalIdentifier: {} },
  ) => {
    const validateBuildAndRunWorkspaceMigrationFromTo = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const service = new TwentyStandardApplicationService(
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            twentyStandardFlatApplication: {
              id: STANDARD_APPLICATION_ID,
              universalIdentifier: '20202020-0000-0000-0000-000000000003',
            },
          }),
      } as unknown as ApplicationService,
      {
        validateBuildAndRunWorkspaceMigrationFromTo,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          ...cachedMaps,
          featureFlagsMap: {},
          flatApplicationMaps,
        }),
      } as unknown as WorkspaceCacheService,
      {} as GlobalWorkspaceOrmManager,
    );

    return { service, validateBuildAndRunWorkspaceMigrationFromTo };
  };

  it('does not provision replaced CRM metadata for a Myah workspace', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService();

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'myah',
    });

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[STANDARD_OBJECTS.person.universalIdentifier],
    ).toBeUndefined();
  });

  it('preserves existing CRM/dashboard closure identities and overrides without provisioning missing siblings', async () => {
    const cachedMaps = createEmptyAllFlatEntityMaps();
    const existingPerson = {
      id: 'existing-person-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      labelSingular: 'Historical Person',
    };
    const existingDashboardLayout = {
      id: 'historical-dashboard-layout-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'historical-dashboard-layout',
      type: 'DASHBOARD',
      name: 'Customized historical dashboard',
      configuration: { preserved: true },
    };
    const existingDashboardTab = {
      id: 'historical-dashboard-tab-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'historical-dashboard-tab',
      pageLayoutId: existingDashboardLayout.id,
      pageLayoutUniversalIdentifier:
        existingDashboardLayout.universalIdentifier,
      title: 'Customized tab',
      overrides: { title: 'Saved override' },
    };
    const existingDashboardWidget = {
      id: 'historical-dashboard-widget-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'historical-dashboard-widget',
      pageLayoutTabId: existingDashboardTab.id,
      pageLayoutTabUniversalIdentifier:
        existingDashboardTab.universalIdentifier,
      objectMetadataUniversalIdentifier:
        STANDARD_OBJECTS.opportunity.universalIdentifier,
      universalConfiguration: { chart: { preservedFilter: 'do-not-rewrite' } },
      overrides: { pageLayoutTabId: 'retained-creator-tab-id' },
    };
    const unrelatedMissingObject = {
      id: 'unrelated-missing-object-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'unrelated-missing-object',
    };
    const addToMaps = (maps: any, entity: any) => {
      maps.byUniversalIdentifier[entity.universalIdentifier] = entity;
      maps.universalIdentifierById[entity.id] = entity.universalIdentifier;
      maps.universalIdentifiersByApplicationId[STANDARD_APPLICATION_ID] ??= [];
      maps.universalIdentifiersByApplicationId[STANDARD_APPLICATION_ID].push(
        entity.universalIdentifier,
      );
    };

    cachedMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      existingPerson.universalIdentifier
    ] = existingPerson as any;
    cachedMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      unrelatedMissingObject.universalIdentifier
    ] = unrelatedMissingObject as any;
    cachedMaps.flatObjectMetadataMaps.universalIdentifierById[
      existingPerson.id
    ] = existingPerson.universalIdentifier;
    cachedMaps.flatObjectMetadataMaps.universalIdentifierById[
      unrelatedMissingObject.id
    ] = unrelatedMissingObject.universalIdentifier;
    cachedMaps.flatObjectMetadataMaps.universalIdentifiersByApplicationId[
      STANDARD_APPLICATION_ID
    ] = [
      existingPerson.universalIdentifier,
      unrelatedMissingObject.universalIdentifier,
    ];
    const recordLayout = {
      id: 'record-layout-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'record-layout',
      type: 'RECORD_PAGE',
    };
    const overrideInTab = {
      id: 'override-in-tab-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'override-in-tab',
      pageLayoutId: recordLayout.id,
      overrides: { pageLayoutId: existingDashboardLayout.id },
    };
    const overrideOutTab = {
      id: 'override-out-tab-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'override-out-tab',
      pageLayoutId: existingDashboardLayout.id,
      overrides: { pageLayoutId: recordLayout.id },
    };
    const overrideInWidget = {
      id: 'override-in-widget-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'override-in-widget',
      pageLayoutTabId: overrideInTab.id,
    };
    const overrideOutWidget = {
      id: 'override-out-widget-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'override-out-widget',
      pageLayoutTabId: overrideOutTab.id,
    };
    const movedIntoDashboardWidget = {
      id: 'moved-in-widget-id',
      applicationId: STANDARD_APPLICATION_ID,
      universalIdentifier: 'moved-in-widget',
      pageLayoutTabId: 'unrelated-record-tab-id',
      overrides: { pageLayoutTabId: overrideInTab.id },
    };
    addToMaps(cachedMaps.flatPageLayoutMaps, existingDashboardLayout);
    addToMaps(cachedMaps.flatPageLayoutMaps, recordLayout);
    addToMaps(cachedMaps.flatPageLayoutTabMaps, existingDashboardTab);
    addToMaps(cachedMaps.flatPageLayoutTabMaps, overrideInTab);
    addToMaps(cachedMaps.flatPageLayoutTabMaps, overrideOutTab);
    addToMaps(cachedMaps.flatPageLayoutWidgetMaps, existingDashboardWidget);
    addToMaps(cachedMaps.flatPageLayoutWidgetMaps, overrideInWidget);
    addToMaps(cachedMaps.flatPageLayoutWidgetMaps, overrideOutWidget);
    addToMaps(cachedMaps.flatPageLayoutWidgetMaps, movedIntoDashboardWidget);
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService(cachedMaps);

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'myah',
    });

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const objectMetadataTarget =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to;

    expect(
      objectMetadataTarget.byUniversalIdentifier[
        existingPerson.universalIdentifier
      ],
    ).toMatchObject(existingPerson);
    expect(
      objectMetadataTarget.byUniversalIdentifier[
        unrelatedMissingObject.universalIdentifier
      ],
    ).toBeUndefined();
    const { fromToAllFlatEntityMaps } = migrationInput;
    expect(
      fromToAllFlatEntityMaps.flatPageLayoutMaps.to.byUniversalIdentifier[
        existingDashboardLayout.universalIdentifier
      ],
    ).toEqual(existingDashboardLayout);
    expect(
      fromToAllFlatEntityMaps.flatPageLayoutTabMaps.to.byUniversalIdentifier[
        existingDashboardTab.universalIdentifier
      ],
    ).toEqual(existingDashboardTab);
    expect(
      fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps.to.byUniversalIdentifier[
        existingDashboardWidget.universalIdentifier
      ],
    ).toEqual(existingDashboardWidget);
    for (const tab of [overrideInTab, overrideOutTab]) {
      expect(
        fromToAllFlatEntityMaps.flatPageLayoutTabMaps.to.byUniversalIdentifier[
          tab.universalIdentifier
        ],
      ).toEqual(tab);
    }
    for (const widget of [
      overrideInWidget,
      overrideOutWidget,
      movedIntoDashboardWidget,
    ]) {
      expect(
        fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps.to
          .byUniversalIdentifier[widget.universalIdentifier],
      ).toEqual(widget);
    }
  });

  it('does not provision Dashboard composition into an empty Myah workspace', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService();

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'myah',
    });

    const { fromToAllFlatEntityMaps } =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      Object.values(
        fromToAllFlatEntityMaps.flatPageLayoutMaps.to.byUniversalIdentifier,
      ).some((layout: any) => layout?.type === 'DASHBOARD'),
    ).toBe(false);
    expect(
      Object.values(
        fromToAllFlatEntityMaps.flatNavigationMenuItemMaps.to
          .byUniversalIdentifier,
      ).some(
        (item: any) =>
          item?.viewUniversalIdentifier ===
          STANDARD_OBJECTS.dashboard.views.allDashboards.universalIdentifier,
      ),
    ).toBe(false);
    expect(
      Object.values(
        fromToAllFlatEntityMaps.flatCommandMenuItemMaps.to
          .byUniversalIdentifier,
      ).some(
        (item: any) =>
          item?.objectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.dashboard.universalIdentifier,
      ),
    ).toBe(false);
    expect(
      Object.values(
        fromToAllFlatEntityMaps.flatPageLayoutMaps.to.byUniversalIdentifier,
      ).map((layout: any) => layout?.objectMetadataUniversalIdentifier),
    ).toEqual(
      expect.arrayContaining([
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      ]),
    );
  });

  it('rebuilds indexes when historical rows replace canonical Dashboard composition', async () => {
    const canonical = computeTwentyStandardApplicationAllFlatEntityMaps({
      workspaceId: WORKSPACE_ID,
      twentyStandardApplicationId: STANDARD_APPLICATION_ID,
      now: '2026-01-01T00:00:00.000Z',
    }).allFlatEntityMaps.flatPageLayoutMaps;
    const [canonicalLayout] = Object.values(
      canonical.byUniversalIdentifier,
    ).filter((layout: any) => layout?.type === 'DASHBOARD') as any[];
    const cachedMaps = createEmptyAllFlatEntityMaps();
    const historicalLayout = {
      ...canonicalLayout,
      id: 'historical-dashboard-layout-id',
    };
    cachedMaps.flatPageLayoutMaps.byUniversalIdentifier[
      historicalLayout.universalIdentifier
    ] = historicalLayout;
    cachedMaps.flatPageLayoutMaps.universalIdentifierById[historicalLayout.id] =
      historicalLayout.universalIdentifier;
    cachedMaps.flatPageLayoutMaps.universalIdentifiersByApplicationId[
      STANDARD_APPLICATION_ID
    ] = [historicalLayout.universalIdentifier];
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService(cachedMaps);

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'myah',
    });

    const target =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatPageLayoutMaps.to;

    expect(
      target.byUniversalIdentifier[historicalLayout.universalIdentifier],
    ).toBe(historicalLayout);
    expect(target.universalIdentifierById[historicalLayout.id]).toBe(
      historicalLayout.universalIdentifier,
    );
    expect(target.universalIdentifierById[canonicalLayout.id]).toBeUndefined();
    expect(
      target.universalIdentifiersByApplicationId[STANDARD_APPLICATION_ID],
    ).toEqual(expect.arrayContaining([historicalLayout.universalIdentifier]));
  });

  it('subsequent ordinary Myah synchronization does not replace an installed old-owner graph', async () => {
    const oldApplicationId = 'installed-brand-brain-app';
    const oldApplicationUid = '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991';
    const roleUid = '8563f1a9-4e02-408a-a5d7-45f68779023a';
    const cachedMaps = createEmptyAllFlatEntityMaps();
    for (const [index, object] of [
      MYAH_STANDARD_OBJECTS.brandBrainPage,
      MYAH_STANDARD_OBJECTS.brandBrainLink,
      MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal,
    ].entries()) {
      const installed = {
        id: `installed-object-${index}`,
        applicationId: oldApplicationId,
        universalIdentifier: object.universalIdentifier,
      };
      cachedMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        object.universalIdentifier
      ] = installed as any;
      cachedMaps.flatObjectMetadataMaps.universalIdentifierById[installed.id] =
        object.universalIdentifier;
      (cachedMaps.flatObjectMetadataMaps.universalIdentifiersByApplicationId[
        oldApplicationId
      ] ??= []).push(object.universalIdentifier);
    }
    cachedMaps.flatRoleMaps.byUniversalIdentifier[roleUid] = {
      id: 'installed-role',
      applicationId: oldApplicationId,
      universalIdentifier: roleUid,
    } as any;
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService(cachedMaps, {
        byId: {
          [oldApplicationId]: {
            id: oldApplicationId,
            universalIdentifier: oldApplicationUid,
          },
        },
        idByUniversalIdentifier: { [oldApplicationUid]: oldApplicationId },
      });

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'myah',
    });

    const migration =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const target = migration.fromToAllFlatEntityMaps;
    expect(
      target.flatObjectMetadataMaps.to.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier
      ].id,
    ).toBe('installed-object-0');
    expect(
      target.flatObjectMetadataMaps.from.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier
      ].id,
    ).toBe('installed-object-0');
    expect(target.flatRoleMaps.to.byUniversalIdentifier[roleUid].id).toBe(
      'installed-role',
    );
    expect(
      target.flatObjectMetadataMaps.to.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      target.flatObjectMetadataMaps.to.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
      ],
    ).toBeDefined();
    expect(migration.dependencyAllFlatEntityMaps).toBeDefined();
  });

  it('retains replaced CRM metadata for a full Twenty fixture workspace', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService();

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'full',
    });

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[STANDARD_OBJECTS.person.universalIdentifier],
    ).toBeDefined();
  });
});
