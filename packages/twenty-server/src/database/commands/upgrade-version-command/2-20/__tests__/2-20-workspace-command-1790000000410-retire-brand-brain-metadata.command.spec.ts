import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { LEGACY_BRAND_BRAIN_APPLICATION_UID } from 'src/database/commands/upgrade-version-command/2-20/services/retire-legacy-brand-brain-owner.service';

const objectUid = MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier;
const apps = (legacy = false) => ({
  idByUniversalIdentifier: {
    'standard-uid': 'standard',
    ...(legacy ? { [LEGACY_BRAND_BRAIN_APPLICATION_UID]: 'legacy' } : {}),
  },
  byId: {
    standard: { id: 'standard', universalIdentifier: 'standard-uid' },
    ...(legacy
      ? {
          legacy: {
            id: 'legacy',
            universalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
          },
        }
      : {}),
  },
});

const setup = (legacy = false) => {
  const maps = createEmptyAllFlatEntityMaps();
  const add = (key: keyof typeof maps, row: Record<string, unknown>) => {
    const map = maps[key];
    map.byUniversalIdentifier[row.universalIdentifier as string] = row as never;
    map.universalIdentifierById[row.id as string] =
      row.universalIdentifier as string;
  };
  const applicationMaps = apps(legacy);
  const standard = {
    synchronizeWorkspace: jest.fn(),
    workspaceSchemaExists: jest.fn().mockResolvedValue(true),
  };
  const application = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({
        twentyStandardFlatApplication: applicationMaps.byId.standard,
      }),
  };
  const cache = {
    getOrRecompute: jest.fn().mockResolvedValue({
      ...maps,
      flatApplicationMaps: applicationMaps,
      featureFlagsMap: {},
    }),
  };
  const validator = {
    validateBuildAndRunWorkspaceMigrationFromTo: jest
      .fn()
      .mockImplementation(async (plan) => ({
        status: 'success',
        workspaceMigration: {
          applicationUniversalIdentifier: 'standard-uid',
          actions: (
            ['pageLayout', 'pageLayoutTab', 'pageLayoutWidget'] as const
          ).flatMap((metadataName) => {
            const key = `flat${metadataName[0].toUpperCase()}${metadataName.slice(1)}Maps`;
            const maps = plan.fromToAllFlatEntityMaps[key];
            return Object.values(maps.from.byUniversalIdentifier)
              .filter((row: any) => row.deletedAt === null)
              .map((row: any) => ({
                type: 'update',
                metadataName,
                universalIdentifier: row.universalIdentifier,
                update: {
                  deletedAt:
                    maps.to.byUniversalIdentifier[row.universalIdentifier]
                      .deletedAt,
                },
              }));
          }),
        },
      })),
  };
  const command = new RetireBrandBrainMetadataCommand(
    null as never,
    standard as never,
    application as never,
    cache as never,
    validator as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const args = { workspaceId: 'workspace', options: { dryRun: true } } as never;
  return {
    command,
    args,
    maps,
    add,
    standard,
    cache,
    validator,
    applicationMaps,
  };
};

const addPresentation = (f: ReturnType<typeof setup>, owner = 'standard') => {
  f.add('flatObjectMetadataMaps', {
    id: 'object',
    universalIdentifier: objectUid,
    applicationId: owner,
  });
  f.add('flatViewMaps', {
    id: 'existing-view',
    universalIdentifier: 'view-uid',
    applicationId: owner,
    objectMetadataId: 'object',
  });
  f.add('flatPageLayoutMaps', {
    id: 'layout',
    universalIdentifier: 'layout-uid',
    applicationId: owner,
    objectMetadataId: 'object',
    deletedAt: null,
    defaultTabToFocusOnMobileAndSidePanelId: 'tab',
  });
  f.add('flatPageLayoutTabMaps', {
    id: 'tab',
    universalIdentifier: 'tab-uid',
    applicationId: owner,
    pageLayoutId: 'layout',
    deletedAt: '2024-01-01T00:00:00.000Z',
  });
  f.add('flatPageLayoutWidgetMaps', {
    id: 'widget',
    universalIdentifier: 'widget-uid',
    applicationId: owner,
    pageLayoutTabId: 'tab',
    objectMetadataId: 'object',
    deletedAt: null,
    universalConfiguration: { viewId: 'existing-view' },
  });
};

describe('0410 recoverable Brand Brain preflight', () => {
  it('validates only native soft updates under standard owner and never selects menu deletion', async () => {
    const f = setup();
    addPresentation(f);
    f.add('flatNavigationMenuItemMaps', {
      id: 'menu',
      universalIdentifier: 'menu-uid',
      applicationId: 'standard',
      targetObjectMetadataId: 'object',
    });
    await f.command.runOnWorkspace(f.args);
    const plan =
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    await expect(
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo.mock.results[0]
        .value,
    ).resolves.toEqual(
      expect.objectContaining({
        workspaceMigration: expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({
              type: 'update',
              metadataName: 'pageLayout',
              universalIdentifier: 'layout-uid',
            }),
            expect.objectContaining({
              type: 'update',
              metadataName: 'pageLayoutWidget',
              universalIdentifier: 'widget-uid',
            }),
          ]),
        }),
      }),
    );
    expect(plan).toEqual(
      expect.objectContaining({
        workspaceId: 'workspace',
        dryRun: true,
        buildOptions: {
          applicationUniversalIdentifier: 'standard-uid',
          isSystemBuild: true,
          inferDeletionFromMissingEntities: {},
        },
      }),
    );
    expect(Object.keys(plan.fromToAllFlatEntityMaps).sort()).toEqual([
      'flatPageLayoutMaps',
      'flatPageLayoutTabMaps',
      'flatPageLayoutWidgetMaps',
    ]);
    expect(
      plan.fromToAllFlatEntityMaps.flatPageLayoutMaps.to.byUniversalIdentifier[
        'layout-uid'
      ],
    ).toEqual(
      expect.objectContaining({
        deletedAt: expect.any(String),
        defaultTabToFocusOnMobileAndSidePanelId: 'tab',
      }),
    );
    expect(
      plan.fromToAllFlatEntityMaps.flatPageLayoutTabMaps.to
        .byUniversalIdentifier['tab-uid'].deletedAt,
    ).toBe('2024-01-01T00:00:00.000Z');
    expect(
      plan.fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps.to
        .byUniversalIdentifier['widget-uid'],
    ).toEqual(
      expect.objectContaining({
        universalConfiguration: { viewId: 'existing-view' },
        objectMetadataId: 'object',
      }),
    );
    expect(
      f.maps.flatNavigationMenuItemMaps.byUniversalIdentifier['menu-uid'],
    ).toEqual(expect.objectContaining({ id: 'menu' }));
    expect(f.standard.synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('delegates installed legacy owner to 2001 dual preflight; mutation fails before any call', async () => {
    const f = setup(true);
    f.add('flatObjectMetadataMaps', {
      id: 'object',
      universalIdentifier: objectUid,
      applicationId: 'legacy',
    });
    await f.command.runOnWorkspace(f.args);
    expect(f.standard.synchronizeWorkspace).toHaveBeenCalledWith(f.args);
    f.standard.synchronizeWorkspace.mockClear();
    await expect(
      f.command.runOnWorkspace({
        workspaceId: 'workspace',
        options: { dryRun: false },
      } as never),
    ).rejects.toThrow(/read-only/);
    expect(f.standard.synchronizeWorkspace).not.toHaveBeenCalled();
    expect(
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo,
    ).not.toHaveBeenCalled();
  });

  it('rejects mixed layout owners and shared retained-object widgets before native validation', async () => {
    const f = setup();
    addPresentation(f);
    f.maps.flatPageLayoutTabMaps.byUniversalIdentifier[
      'tab-uid'
    ]!.applicationId = 'other';
    await expect(f.command.runOnWorkspace(f.args)).rejects.toThrow(
      /owner|shared/,
    );
    f.maps.flatPageLayoutTabMaps.byUniversalIdentifier[
      'tab-uid'
    ]!.applicationId = 'standard';
    f.maps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
      'widget-uid'
    ]!.objectMetadataId = 'creator';
    await expect(f.command.runOnWorkspace(f.args)).rejects.toThrow(/shared/);
    expect(
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo,
    ).not.toHaveBeenCalled();
  });

  it('rejects retained-layout overrides and retained widgets referencing retired views', async () => {
    const f = setup();
    addPresentation(f);
    f.add('flatPageLayoutMaps', {
      id: 'creator-layout',
      universalIdentifier: 'creator-layout-uid',
      applicationId: 'standard',
      objectMetadataId: 'creator',
      deletedAt: null,
    });
    f.add('flatPageLayoutTabMaps', {
      id: 'creator-tab',
      universalIdentifier: 'creator-tab-uid',
      applicationId: 'standard',
      pageLayoutId: 'creator-layout',
      deletedAt: null,
    });
    f.add('flatPageLayoutWidgetMaps', {
      id: 'creator-widget',
      universalIdentifier: 'creator-widget-uid',
      applicationId: 'standard',
      pageLayoutTabId: 'creator-tab',
      objectMetadataId: 'creator',
      overrides: { pageLayoutTabId: 'tab' },
      deletedAt: null,
    });
    await expect(f.command.runOnWorkspace(f.args)).rejects.toThrow(
      /shared widget override/,
    );
    f.maps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
      'creator-widget-uid'
    ]!.overrides = null;
    f.maps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
      'creator-widget-uid'
    ]!.universalConfiguration = { viewId: 'existing-view' } as never;
    await expect(f.command.runOnWorkspace(f.args)).rejects.toThrow(
      /shared view/,
    );
    expect(
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo,
    ).not.toHaveBeenCalled();
  });

  it('does not mark feature active for no app or no presentation', async () => {
    const f = setup();
    await f.command.runOnWorkspace(f.args);
    f.add('flatObjectMetadataMaps', {
      id: 'object',
      universalIdentifier: objectUid,
      applicationId: 'standard',
    });
    await f.command.runOnWorkspace(f.args);
    expect(
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo,
    ).not.toHaveBeenCalled();
    expect(f.standard.synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('rejects native delete, cross-owner and non-deletedAt actions', async () => {
    const f = setup();
    addPresentation(f);
    for (const action of [
      {
        type: 'delete',
        metadataName: 'pageLayout',
        universalIdentifier: 'layout-uid',
      },
      {
        type: 'update',
        metadataName: 'pageLayout',
        universalIdentifier: 'layout-uid',
        update: { name: 'bad' },
      },
      {
        type: 'update',
        metadataName: 'pageLayout',
        universalIdentifier: 'foreign-uid',
        update: { deletedAt: '2026-01-01' },
      },
    ]) {
      f.validator.validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValueOnce(
        {
          status: 'success',
          workspaceMigration: {
            applicationUniversalIdentifier: 'standard-uid',
            actions: [action],
          },
        },
      );
      await expect(f.command.runOnWorkspace(f.args)).rejects.toThrow(
        /native plan/,
      );
    }
  });
});
