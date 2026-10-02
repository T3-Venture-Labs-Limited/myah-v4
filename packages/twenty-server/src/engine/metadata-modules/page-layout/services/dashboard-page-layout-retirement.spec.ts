import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { PageLayoutTabService } from 'src/engine/metadata-modules/page-layout-tab/services/page-layout-tab.service';
import { PageLayoutWidgetService } from 'src/engine/metadata-modules/page-layout-widget/services/page-layout-widget.service';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { assertPageLayoutMutationIsAllowed } from 'src/engine/metadata-modules/page-layout/utils/assert-page-layout-mutation-is-allowed.util';
import { PageLayoutResetService } from 'src/engine/metadata-modules/page-layout/services/page-layout-reset.service';
import { PageLayoutService } from 'src/engine/metadata-modules/page-layout/services/page-layout.service';
import { PageLayoutUpdateService } from 'src/engine/metadata-modules/page-layout/services/page-layout-update.service';

const workspaceId = 'workspace-id';
const brandObjectId = 'brand-object-id';
const brandLayoutId = 'brand-layout-id';
const brandTabId = 'brand-tab-id';
const overrideBrandTabId = 'override-brand-tab-id';
const brandWidgetId = 'brand-widget-id';
const brandBaseWidgetId = 'brand-base-widget-id';
const dashboardLayoutId = 'dashboard-layout-id';
const dashboardTabId = 'dashboard-tab-id';
const dashboardWidgetId = 'dashboard-widget-id';
const creatorLayoutId = 'creator-layout-id';
const creatorTabId = 'creator-tab-id';
const retainedOverrideTabId = 'retained-override-tab-id';
const retainedWidgetId = 'retained-widget-id';
const overrideMovedWidgetId = 'override-moved-widget-id';
const resetDestinationDashboardWidgetId =
  'reset-destination-dashboard-widget-id';

const legacyViewId = 'a1526f30-58f1-4a1f-9b36-13273df51320';
const legacyViewUid = '57b4196e-3114-4cca-b220-29b0bc41c349';
const retainedViewId = 'a87f61b1-9b38-49d1-b119-b63868f86264';
const dashboardMaps = {
  flatFieldMetadataMaps: { universalIdentifierById: {} },
  flatFrontComponentMaps: { universalIdentifierById: {} },
  flatViewFieldGroupMaps: { universalIdentifierById: {} },
  flatObjectMetadataMaps: {
    byUniversalIdentifier: {
      [MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier]: {
        id: brandObjectId,
        universalIdentifier:
          MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
      },
    },
    universalIdentifierById: {
      [brandObjectId]: MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
    },
  },
  flatViewMaps: {
    byUniversalIdentifier: {
      [legacyViewUid]: {
        id: legacyViewId,
        universalIdentifier: legacyViewUid,
        objectMetadataId: brandObjectId,
      },
      'retained-view-uid': {
        id: retainedViewId,
        universalIdentifier: 'retained-view-uid',
        objectMetadataId: 'creator-object-id',
      },
    },
    universalIdentifierById: {
      [legacyViewId]: legacyViewUid,
      [retainedViewId]: 'retained-view-uid',
    },
  },
  flatPageLayoutMaps: {
    byUniversalIdentifier: {
      [brandLayoutId]: {
        id: brandLayoutId,
        universalIdentifier: brandLayoutId,
        type: PageLayoutType.RECORD_PAGE,
        objectMetadataId: brandObjectId,
        deletedAt: '2026-01-01T00:00:00Z',
      },
      [dashboardLayoutId]: {
        id: dashboardLayoutId,
        universalIdentifier: dashboardLayoutId,
        type: PageLayoutType.DASHBOARD,
      },
      [creatorLayoutId]: {
        id: creatorLayoutId,
        universalIdentifier: creatorLayoutId,
        type: PageLayoutType.RECORD_PAGE,
      },
    },
    universalIdentifierById: {
      [dashboardLayoutId]: dashboardLayoutId,
      [creatorLayoutId]: creatorLayoutId,
      [brandLayoutId]: brandLayoutId,
    },
  },
  flatPageLayoutTabMaps: {
    byUniversalIdentifier: {
      [brandTabId]: {
        id: brandTabId,
        universalIdentifier: brandTabId,
        pageLayoutId: brandLayoutId,
      },
      [dashboardTabId]: {
        id: dashboardTabId,
        universalIdentifier: dashboardTabId,
        pageLayoutId: dashboardLayoutId,
      },
      [creatorTabId]: {
        id: creatorTabId,
        universalIdentifier: creatorTabId,
        pageLayoutId: creatorLayoutId,
      },
      [retainedOverrideTabId]: {
        id: retainedOverrideTabId,
        universalIdentifier: retainedOverrideTabId,
        pageLayoutId: creatorLayoutId,
        overrides: { pageLayoutId: creatorLayoutId },
      },
      [overrideBrandTabId]: {
        id: overrideBrandTabId,
        universalIdentifier: overrideBrandTabId,
        pageLayoutId: creatorLayoutId,
        overrides: { pageLayoutId: brandLayoutId },
      },
    },
    universalIdentifierById: {
      [dashboardTabId]: dashboardTabId,
      [creatorTabId]: creatorTabId,
      [brandTabId]: brandTabId,
      [retainedOverrideTabId]: retainedOverrideTabId,
      [overrideBrandTabId]: overrideBrandTabId,
    },
  },
  flatPageLayoutWidgetMaps: {
    byUniversalIdentifier: {
      [brandWidgetId]: {
        id: brandWidgetId,
        universalIdentifier: brandWidgetId,
        pageLayoutTabId: creatorTabId,
        overrides: { pageLayoutTabId: brandTabId },
        configuration: { configurationType: 'FIELDS' },
      },
      [brandBaseWidgetId]: {
        id: brandBaseWidgetId,
        universalIdentifier: brandBaseWidgetId,
        pageLayoutTabId: brandTabId,
        overrides: { pageLayoutTabId: creatorTabId },
        configuration: { configurationType: 'FIELDS' },
      },
      [dashboardWidgetId]: {
        id: dashboardWidgetId,
        universalIdentifier: dashboardWidgetId,
        pageLayoutTabId: dashboardTabId,
      },
      [retainedWidgetId]: {
        id: retainedWidgetId,
        universalIdentifier: retainedWidgetId,
        pageLayoutTabId: creatorTabId,
        configuration: { configurationType: 'FIELDS' },
      },
      [overrideMovedWidgetId]: {
        id: overrideMovedWidgetId,
        universalIdentifier: overrideMovedWidgetId,
        pageLayoutTabId: creatorTabId,
        overrides: { pageLayoutTabId: dashboardTabId },
        configuration: { configurationType: 'FIELDS' },
      },
      [resetDestinationDashboardWidgetId]: {
        id: resetDestinationDashboardWidgetId,
        universalIdentifier: resetDestinationDashboardWidgetId,
        pageLayoutTabId: dashboardTabId,
        overrides: { pageLayoutTabId: creatorTabId },
        applicationUniversalIdentifier: 'standard-app-universal-identifier',
        configuration: { configurationType: 'FIELDS' },
      },
    },
    universalIdentifierById: {
      [dashboardWidgetId]: dashboardWidgetId,
      [brandWidgetId]: brandWidgetId,
      [brandBaseWidgetId]: brandBaseWidgetId,
      [retainedWidgetId]: retainedWidgetId,
      [overrideMovedWidgetId]: overrideMovedWidgetId,
      [resetDestinationDashboardWidgetId]: resetDestinationDashboardWidgetId,
    },
  },
} as any;

const createDependencies = () => {
  const cache = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest
      .fn()
      .mockResolvedValue(dashboardMaps),
  };
  const application = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({
        workspaceCustomFlatApplication: {
          id: 'custom-app-id',
          universalIdentifier: 'custom-app-universal-identifier',
        },
      }),
  };
  const migration = {
    validateBuildAndRunWorkspaceMigration: jest.fn(),
  };

  return { application, cache, migration };
};

describe('dashboard page-layout retirement service boundary', () => {
  it('recognizes every retired object target and both base and override ancestry, even when soft-deleted', () => {
    for (const object of [
      MYAH_STANDARD_OBJECTS.brandBrainPage,
      MYAH_STANDARD_OBJECTS.brandBrainLink,
      MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal,
    ]) {
      expect(() =>
        assertPageLayoutMutationIsAllowed({
          objectMetadataId: brandObjectId,
          flatObjectMetadataMaps: {
            universalIdentifierById: {
              [brandObjectId]: object.universalIdentifier,
            },
          } as any,
        }),
      ).toThrow('retired');
    }

    expect(() =>
      assertPageLayoutMutationIsAllowed({
        pageLayoutTabId: overrideBrandTabId,
        ...dashboardMaps,
      }),
    ).toThrow('retired');
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        pageLayoutWidgetId: brandWidgetId,
        ...dashboardMaps,
      }),
    ).toThrow('retired');
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        pageLayoutWidgetId: brandBaseWidgetId,
        ...dashboardMaps,
      }),
    ).toThrow('retired');
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        pageLayoutId: brandLayoutId,
        ...dashboardMaps,
      }),
    ).toThrow('retired');
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        pageLayoutId: creatorLayoutId,
        ...dashboardMaps,
      }),
    ).not.toThrow();
  });

  it('rejects retired Brand Brain targets and soft-deleted layout ancestry before migration', async () => {
    const { application, cache, migration } = createDependencies();
    const layouts = new PageLayoutService(
      migration as any,
      cache as any,
      application as any,
    );
    const tabs = new PageLayoutTabService(
      migration as any,
      cache as any,
      application as any,
    );
    const widgets = new PageLayoutWidgetService(
      migration as any,
      cache as any,
      application as any,
    );

    await expect(
      layouts.create({
        workspaceId,
        createPageLayoutInput: {
          name: 'retired',
          type: PageLayoutType.RECORD_PAGE,
          objectMetadataId: brandObjectId,
        } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      layouts.update({
        id: creatorLayoutId,
        workspaceId,
        updateData: {
          objectMetadataId: brandObjectId,
        } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      layouts.destroyMany({
        ids: [creatorLayoutId, brandLayoutId],
        workspaceId,
      }),
    ).rejects.toThrow('retired');
    await expect(
      tabs.create({
        workspaceId,
        createPageLayoutTabInput: {
          pageLayoutId: brandLayoutId,
          title: 'recreated',
        } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(tabs.destroy({ id: brandTabId, workspaceId })).rejects.toThrow(
      'retired',
    );
    await expect(
      tabs.update({
        id: overrideBrandTabId,
        workspaceId,
        updateData: {} as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.update({ id: brandWidgetId, workspaceId, updateData: {} as any }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.destroy({ id: brandBaseWidgetId, workspaceId }),
    ).rejects.toThrow('retired');
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('rejects every retired widget object target on create and update, even in a retained tab', async () => {
    const { application, cache, migration } = createDependencies();
    const widgets = new PageLayoutWidgetService(
      migration as any,
      cache as any,
      application as any,
    );
    for (const object of [
      MYAH_STANDARD_OBJECTS.brandBrainPage,
      MYAH_STANDARD_OBJECTS.brandBrainLink,
      MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal,
    ]) {
      dashboardMaps.flatObjectMetadataMaps.universalIdentifierById[
        brandObjectId
      ] = object.universalIdentifier;
      await expect(
        widgets.create({
          workspaceId,
          input: {
            pageLayoutTabId: retainedOverrideTabId,
            objectMetadataId: brandObjectId,
            configuration: { configurationType: 'RECORD_TABLE' },
          } as any,
        }),
      ).rejects.toThrow('retired');
      await expect(
        widgets.update({
          workspaceId,
          id: retainedWidgetId,
          updateData: {
            objectMetadataId: brandObjectId,
          } as any,
        }),
      ).rejects.toThrow('retired');
    }
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['configuration viewId', { viewId: legacyViewId }],
    [
      'configuration viewId holding universal identifier',
      { viewId: legacyViewUid },
    ],
    [
      'configuration viewUniversalIdentifier',
      { viewUniversalIdentifier: legacyViewUid },
    ],
  ])(
    'rejects legacy %s on widget create and update in a retained tab',
    async (_label, configuration) => {
      const { application, cache, migration } = createDependencies();
      const widgets = new PageLayoutWidgetService(
        migration as any,
        cache as any,
        application as any,
      );
      await expect(
        widgets.create({
          workspaceId,
          input: {
            pageLayoutTabId: creatorTabId,
            configuration: {
              configurationType: 'RECORD_TABLE',
              ...configuration,
            },
          } as any,
        }),
      ).rejects.toThrow('retired');
      await expect(
        widgets.update({
          workspaceId,
          id: retainedWidgetId,
          updateData: {
            configuration: {
              configurationType: 'RECORD_TABLE',
              ...configuration,
            },
          } as any,
        }),
      ).rejects.toThrow('retired');
      expect(
        migration.validateBuildAndRunWorkspaceMigration,
      ).not.toHaveBeenCalled();
    },
  );

  it('allows retained widget object and view targets, including a retained override tab', () => {
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        ...dashboardMaps,
        pageLayoutTabId: creatorTabId,
        objectMetadataId: 'creator-object-id',
        configuration: { viewId: retainedViewId },
      }),
    ).not.toThrow();
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        ...dashboardMaps,
        pageLayoutTabId: retainedOverrideTabId,
        configuration: { viewId: retainedViewId },
      }),
    ).not.toThrow();
    expect(() =>
      assertPageLayoutMutationIsAllowed({
        ...dashboardMaps,
        pageLayoutTabId: retainedOverrideTabId,
        configuration: { viewId: legacyViewId },
      }),
    ).toThrow('retired');
  });

  it('rejects dashboard page-layout mutations, including bulk, reset, and tabs-with-widgets, before migrations', async () => {
    const { application, cache, migration } = createDependencies();
    const pageLayouts = new PageLayoutService(
      migration as any,
      cache as any,
      application as any,
    );
    const updates = new PageLayoutUpdateService(
      migration as any,
      cache as any,
      application as any,
      {} as any,
    );
    const resets = new PageLayoutResetService(
      migration as any,
      cache as any,
      application as any,
      {} as any,
    );

    await expect(
      pageLayouts.create({
        workspaceId,
        createPageLayoutInput: {
          name: 'retired',
          type: PageLayoutType.DASHBOARD,
        } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      pageLayouts.update({
        id: dashboardLayoutId,
        workspaceId,
        updateData: {} as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      pageLayouts.destroy({ id: dashboardLayoutId, workspaceId }),
    ).rejects.toThrow('retired');
    await expect(
      pageLayouts.destroyMany({ ids: [dashboardLayoutId], workspaceId }),
    ).rejects.toThrow('retired');
    await expect(
      updates.updatePageLayoutWithTabs({
        id: dashboardLayoutId,
        workspaceId,
        input: {} as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      resets.resetPageLayoutToDefault({ id: dashboardLayoutId, workspaceId }),
    ).rejects.toThrow('retired');

    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('rejects a record layout becoming a dashboard through both update APIs', async () => {
    const { application, cache, migration } = createDependencies();
    const pageLayouts = new PageLayoutService(
      migration as any,
      cache as any,
      application as any,
    );
    const updates = new PageLayoutUpdateService(
      migration as any,
      cache as any,
      application as any,
      {} as any,
    );

    await expect(
      pageLayouts.update({
        id: creatorLayoutId,
        workspaceId,
        updateData: { type: PageLayoutType.DASHBOARD } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      updates.updatePageLayoutWithTabs({
        id: creatorLayoutId,
        workspaceId,
        input: { type: PageLayoutType.DASHBOARD } as any,
      }),
    ).rejects.toThrow('retired');
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('rejects a reset whose post-reset destination is a dashboard before migration', async () => {
    const { application, cache, migration } = createDependencies();
    const resets = new PageLayoutResetService(
      migration as any,
      cache as any,
      application as any,
      {} as any,
    );

    await expect(
      resets.resetPageLayoutWidgetToDefault({
        id: resetDestinationDashboardWidgetId,
        workspaceId,
      }),
    ).rejects.toThrow('retired');
    await expect(
      resets.resetPageLayoutTabToDefault({ id: creatorTabId, workspaceId }),
    ).rejects.toThrow('retired');
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('traverses tab and widget parents before their create, update, destroy, and reset mutations', async () => {
    const { application, cache, migration } = createDependencies();
    const tabs = new PageLayoutTabService(
      migration as any,
      cache as any,
      application as any,
    );
    const widgets = new PageLayoutWidgetService(
      migration as any,
      cache as any,
      application as any,
    );
    const resets = new PageLayoutResetService(
      migration as any,
      cache as any,
      application as any,
      {} as any,
    );

    await expect(
      tabs.create({
        workspaceId,
        createPageLayoutTabInput: {
          pageLayoutId: dashboardLayoutId,
          title: 'tab',
        } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      tabs.update({ id: dashboardTabId, workspaceId, updateData: {} as any }),
    ).rejects.toThrow('retired');
    await expect(
      tabs.destroy({ id: dashboardTabId, workspaceId }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.create({
        workspaceId,
        input: { pageLayoutTabId: dashboardTabId } as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.update({
        id: dashboardWidgetId,
        workspaceId,
        updateData: {} as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.destroy({ id: dashboardWidgetId, workspaceId }),
    ).rejects.toThrow('retired');
    await expect(
      resets.resetPageLayoutTabToDefault({ id: dashboardTabId, workspaceId }),
    ).rejects.toThrow('retired');
    await expect(
      resets.resetPageLayoutWidgetToDefault({
        id: dashboardWidgetId,
        workspaceId,
      }),
    ).rejects.toThrow('retired');

    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('rejects an override-moved widget and a retained widget moved to a dashboard destination', async () => {
    const { application, cache, migration } = createDependencies();
    const widgets = new PageLayoutWidgetService(
      migration as any,
      cache as any,
      application as any,
    );

    await expect(
      widgets.update({
        id: overrideMovedWidgetId,
        workspaceId,
        updateData: {} as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.update({
        id: retainedWidgetId,
        workspaceId,
        updateData: { pageLayoutTabId: dashboardTabId } as any,
      }),
    ).rejects.toThrow('retired');

    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('rejects update and destroy for a base-Dashboard widget overridden into a record page', async () => {
    const { application, cache, migration } = createDependencies();
    const widgets = new PageLayoutWidgetService(
      migration as any,
      cache as any,
      application as any,
    );

    await expect(
      widgets.update({
        id: resetDestinationDashboardWidgetId,
        workspaceId,
        updateData: {} as any,
      }),
    ).rejects.toThrow('retired');
    await expect(
      widgets.destroy({
        id: resetDestinationDashboardWidgetId,
        workspaceId,
      }),
    ).rejects.toThrow('retired');
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('allows retained record-page layout mutations to reach the existing service flow', async () => {
    const { application, cache, migration } = createDependencies();
    application.findWorkspaceTwentyStandardAndCustomApplicationOrThrow.mockRejectedValueOnce(
      new Error('existing retained-layout flow'),
    );
    const pageLayouts = new PageLayoutService(
      migration as any,
      cache as any,
      application as any,
    );

    await expect(
      pageLayouts.create({
        workspaceId,
        createPageLayoutInput: {
          name: 'Creator',
          type: PageLayoutType.RECORD_PAGE,
        } as any,
      }),
    ).rejects.toThrow('existing retained-layout flow');
    expect(
      application.findWorkspaceTwentyStandardAndCustomApplicationOrThrow,
    ).toHaveBeenCalledWith({ workspaceId });
    expect(cache.getOrRecomputeManyOrAllFlatEntityMaps).not.toHaveBeenCalled();
  });
});
