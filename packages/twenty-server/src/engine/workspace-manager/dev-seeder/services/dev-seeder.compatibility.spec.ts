import { isSupportedApplicationUniversalIdentifier } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { DevSeederService } from 'src/engine/workspace-manager/dev-seeder/services/dev-seeder.service';
import { DevSeederDataService } from 'src/engine/workspace-manager/dev-seeder/data/services/dev-seeder-data.service';
import { getPageLayoutFlatEntitySeeds } from 'src/engine/workspace-manager/dev-seeder/core/utils/get-page-layout-data-seeds.util';
import { getPageLayoutTabFlatEntitySeeds } from 'src/engine/workspace-manager/dev-seeder/core/utils/get-page-layout-tab-data-seeds.util';
import { getPageLayoutWidgetFlatEntitySeeds } from 'src/engine/workspace-manager/dev-seeder/core/utils/get-page-layout-widget-data-seeds.util';
import { getNavigationMenuItemFlatEntitySeeds } from 'src/engine/workspace-manager/dev-seeder/core/utils/get-navigation-menu-item-data-seeds.util';
import { SEEDER_CREATE_WORKSPACE_INPUT } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';

jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util',
  () => ({ prefillWorkflows: jest.fn() }),
);
jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflow-command-menu-items.util',
  () => ({ prefillWorkflowCommandMenuItems: jest.fn() }),
);

const workspaceId = Object.keys(
  SEEDER_CREATE_WORKSPACE_INPUT,
)[0] as keyof typeof SEEDER_CREATE_WORKSPACE_INPUT;

it('light dev seed provisions standard metadata without requesting unsupported sample front components', async () => {
  const ensureSeeded = jest.fn();
  const synchronizeTwentyStandardApplicationOrThrow = jest.fn();
  const seed = jest.fn();
  const standardApplication = {
    id: 'standard-app',
    universalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
  } as FlatApplication;
  const customApplication = {
    id: 'custom-app',
    universalIdentifier: 'custom-app-uid',
  } as FlatApplication;
  const service = Object.assign(Object.create(DevSeederService.prototype), {
    twentyConfigService: { get: jest.fn() },
    upgradeMigrationService: {
      getLastAttemptedInstanceCommandOrThrow: jest.fn().mockResolvedValue({}),
    },
    upgradeSequenceReaderService: {
      getInitialCursorForNewWorkspace: jest.fn().mockReturnValue({}),
    },
    applicationRegistrationService: {
      createCliRegistrationIfNotExists: jest.fn(),
    },
    workspaceDataSourceService: {
      createWorkspaceDBSchema: jest.fn().mockResolvedValue('seed_schema'),
    },
    workspaceCacheService: {
      getOrRecompute: jest.fn().mockResolvedValue({ featureFlagsMap: {} }),
    },
    workspaceRepository: { update: jest.fn() },
    applicationService: {
      findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
        .fn()
        .mockResolvedValue({
          workspaceCustomFlatApplication: customApplication,
          twentyStandardFlatApplication: standardApplication,
        }),
    },
    twentyStandardApplicationService: {
      synchronizeTwentyStandardApplicationOrThrow,
    },
    sdkClientGenerationService: { generateSdkClientForApplication: jest.fn() },
    devSeederMetadataService: { seed: jest.fn(), seedRelations: jest.fn() },
    devSeederPermissionsService: { initPermissions: jest.fn() },
    coreDataSource: {
      getRepository: jest
        .fn()
        .mockReturnValue({ find: jest.fn().mockResolvedValue([]) }),
    },
    prefillLogicFunctionService: { ensureSeeded: jest.fn() },
    prefillFrontComponentService: { ensureSeeded },
    workspaceMigrationValidateBuildAndRunService: {
      validateBuildAndRunWorkspaceMigration: jest
        .fn()
        .mockResolvedValue({ status: 'success' }),
    },
    devSeederDataService: { seed },
    workspaceCacheStorageService: { flush: jest.fn() },
  }) as DevSeederService;
  jest
    .spyOn(
      service as unknown as { seedCoreSchema: () => Promise<void> },
      'seedCoreSchema',
    )
    .mockResolvedValue();

  await service.seedDev(workspaceId, { light: true });

  expect(synchronizeTwentyStandardApplicationOrThrow).toHaveBeenCalledWith({
    workspaceId,
    profile: 'full',
  });
  expect(
    isSupportedApplicationUniversalIdentifier(
      standardApplication.universalIdentifier,
    ),
  ).toBe(true);
  expect(ensureSeeded).not.toHaveBeenCalled();
  expect(seed).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId, light: true }),
  );
});

it('light data seed skips retired dashboard records and does not create sample command items', async () => {
  const insertedTables: string[] = [];
  const validateBuildAndRunWorkspaceMigration = jest.fn();
  const entityManager = {
    createQueryBuilder: () => ({
      insert: () => ({
        into: (table: string) => {
          insertedTables.push(table);
          return {
            orIgnore: () => ({ values: () => ({ execute: jest.fn() }) }),
          };
        },
      }),
    }),
  };
  const service = Object.assign(Object.create(DevSeederDataService.prototype), {
    objectMetadataService: {
      findManyWithinWorkspace: jest.fn().mockResolvedValue([
        {
          nameSingular: 'dashboard',
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
        },
        {
          nameSingular: 'task',
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
        },
      ]),
    },
    flatEntityMapsCacheService: {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
        flatObjectMetadataMaps: {},
        flatFieldMetadataMaps: {},
      }),
    },
    coreDataSource: {
      transaction: async (
        callback: (manager: typeof entityManager) => Promise<void>,
      ) => callback(entityManager),
    },
    applicationService: {},
    workspaceMigrationValidateBuildAndRunService: {
      validateBuildAndRunWorkspaceMigration,
    },
  }) as DevSeederDataService;

  await service.seed({ schemaName: 'seed_schema', workspaceId, light: true });

  expect(insertedTables).toContain('seed_schema.task');
  expect(insertedTables).not.toContain('seed_schema.dashboard');
  expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
});

it('dev layout fixtures have no retired dashboards or dangling sample component widgets', () => {
  const flatApplication = {
    id: 'standard-app',
    universalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
  } as FlatApplication;
  const objectMetadataItems: ObjectMetadataEntity[] = [];
  const layouts = getPageLayoutFlatEntitySeeds({
    workspaceId,
    flatApplication,
  });
  const tabs = getPageLayoutTabFlatEntitySeeds({
    workspaceId,
    flatApplication,
  });
  const widgets = getPageLayoutWidgetFlatEntitySeeds({
    workspaceId,
    flatApplication,
    objectMetadataItems,
  });
  const navigation = getNavigationMenuItemFlatEntitySeeds({
    workspaceId,
    flatApplication,
  });

  expect(
    layouts.some((layout) => layout.type === PageLayoutType.DASHBOARD),
  ).toBe(false);
  expect(
    widgets.some((widget) => widget.type === WidgetType.FRONT_COMPONENT),
  ).toBe(false);
  expect(
    tabs.every((tab) =>
      layouts.some((layout) => layout.id === tab.pageLayoutId),
    ),
  ).toBe(true);
  expect(
    widgets.every((widget) =>
      tabs.some((tab) => tab.id === widget.pageLayoutTabId),
    ),
  ).toBe(true);
  expect(
    navigation.every((item) =>
      layouts.some((layout) => layout.id === item.pageLayoutId),
    ),
  ).toBe(true);
  expect(
    layouts.some((layout) => layout.type === PageLayoutType.STANDALONE_PAGE),
  ).toBe(true);
});
