import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { DevSeederService } from 'src/engine/workspace-manager/dev-seeder/services/dev-seeder.service';

jest.mock(
  'src/engine/workspace-manager/dev-seeder/core/utils/seed-page-layouts.util',
  () => ({ seedPageLayouts: jest.fn().mockResolvedValue(undefined) }),
);

describe('DevSeederService.seedDev', () => {
  it('provisions READY Inbox triage tables in the new workspace before seeding data', async () => {
    const queryRunner = { query: jest.fn() };
    const ensureWorkspaceTables = jest.fn().mockResolvedValue(undefined);
    const initializeNewWorkspaceInTransaction = jest
      .fn()
      .mockResolvedValue(undefined);
    const seedData = jest.fn().mockResolvedValue(undefined);
    const synchronizeTwentyStandardApplicationOrThrow = jest
      .fn()
      .mockResolvedValue(undefined);
    const transaction = jest.fn(async (callback) => callback({ queryRunner }));
    const executeInWorkspaceContext = jest.fn(
      async (callback: () => Promise<unknown>, _context: unknown) => callback(),
    );
    const service = Object.assign(Object.create(DevSeederService.prototype), {
      twentyConfigService: { get: jest.fn(() => false) },
      upgradeMigrationService: {
        getLastAttemptedInstanceCommandOrThrow: jest.fn().mockResolvedValue({}),
        getCompletedInstanceCommandNames: jest
          .fn()
          .mockResolvedValue(new Set()),
      },
      upgradeSequenceReaderService: {
        getInitialCursorForNewWorkspace: jest.fn().mockReturnValue({}),
      },
      seedCoreSchema: jest.fn().mockResolvedValue(undefined),
      applicationRegistrationService: {
        createCliRegistrationIfNotExists: jest.fn(),
      },
      workspaceDataSourceService: {
        createWorkspaceDBSchema: jest.fn().mockResolvedValue('workspace_seed'),
      },
      workspaceCacheService: {
        getOrRecompute: jest.fn().mockResolvedValue({ featureFlagsMap: {} }),
      },
      workspaceRepository: { update: jest.fn() },
      applicationService: {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            workspaceCustomFlatApplication: { id: 'custom' },
            twentyStandardFlatApplication: { id: 'standard' },
          }),
      },
      twentyStandardApplicationService: {
        synchronizeTwentyStandardApplicationOrThrow,
      },
      sdkClientGenerationService: {
        generateSdkClientForApplication: jest.fn(),
      },
      devSeederMetadataService: { seed: jest.fn(), seedRelations: jest.fn() },
      devSeederPermissionsService: { initPermissions: jest.fn() },
      coreDataSource: {
        getRepository: () => ({ find: jest.fn().mockResolvedValue([]) }),
      },
      prefillLogicFunctionService: { ensureSeeded: jest.fn() },
      prefillFrontComponentService: { ensureSeeded: jest.fn() },
      workspaceMigrationValidateBuildAndRunService: {},
      devSeederDataService: { seed: seedData },
      workspaceCacheStorageService: { flush: jest.fn() },
      globalWorkspaceOrmManager: {
        executeInWorkspaceContext,
        getGlobalWorkspaceDataSource: jest
          .fn()
          .mockResolvedValue({ transaction }),
      },
      myahInboxContactTriageSchemaService: {
        ensureWorkspaceTables,
        initializeNewWorkspaceInTransaction,
      },
    }) as DevSeederService;

    await service.seedDev(SEED_APPLE_WORKSPACE_ID, { light: true });

    expect(ensureWorkspaceTables).toHaveBeenCalledWith(
      queryRunner,
      SEED_APPLE_WORKSPACE_ID,
    );
    expect(initializeNewWorkspaceInTransaction).toHaveBeenCalledWith(
      queryRunner,
      SEED_APPLE_WORKSPACE_ID,
    );
    expect(executeInWorkspaceContext.mock.calls[0][1]).toMatchObject({
      workspace: { id: SEED_APPLE_WORKSPACE_ID },
    });
    expect(
      synchronizeTwentyStandardApplicationOrThrow.mock.invocationCallOrder[0],
    ).toBeLessThan(ensureWorkspaceTables.mock.invocationCallOrder[0]);
    expect(ensureWorkspaceTables.mock.invocationCallOrder[0]).toBeLessThan(
      initializeNewWorkspaceInTransaction.mock.invocationCallOrder[0],
    );
    expect(
      initializeNewWorkspaceInTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(seedData.mock.invocationCallOrder[0]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
