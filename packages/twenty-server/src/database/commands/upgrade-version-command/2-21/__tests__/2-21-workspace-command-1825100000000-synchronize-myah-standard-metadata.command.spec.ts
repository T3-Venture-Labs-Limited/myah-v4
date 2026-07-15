import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-21/2-21-workspace-command-1825100000000-synchronize-myah-standard-metadata.command';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER = '20202020-0000-0000-0000-000000000003';

describe('SynchronizeMyahStandardMetadataCommand', () => {
  let command: SynchronizeMyahStandardMetadataCommand;
  let getOrRecompute: jest.Mock;
  let validateBuildAndRunWorkspaceMigrationFromTo: jest.Mock;

  beforeEach(() => {
    getOrRecompute = jest.fn().mockResolvedValue({
      ...createEmptyAllFlatEntityMaps(),
      featureFlagsMap: {},
    });
    validateBuildAndRunWorkspaceMigrationFromTo = jest.fn().mockResolvedValue({
      status: 'success',
    });

    command = new SynchronizeMyahStandardMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest.fn().mockResolvedValue({
          twentyStandardFlatApplication: {
            id: STANDARD_APPLICATION_ID,
            universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          },
        }),
      } as unknown as ApplicationService,
      {
        getOrRecompute,
      } as unknown as WorkspaceCacheService,
      {
        validateBuildAndRunWorkspaceMigrationFromTo,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
    );

    jest.spyOn(command['logger'], 'log').mockImplementation();
    jest.spyOn(command['logger'], 'error').mockImplementation();
  });

  const runOnWorkspace = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  it('does not build or run a migration in dry-run mode', async () => {
    await runOnWorkspace(true);

    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('builds only the source-controlled Myah metadata migration for a workspace without it', async () => {
    await runOnWorkspace();

    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        buildOptions: expect.objectContaining({
          applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          inferDeletionFromMissingEntities: false,
          isSystemBuild: true,
        }),
      }),
    );
  });

  it('uses an already-owned Myah entity as the migration source', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });

    await runOnWorkspace();

    const objectUniversalIdentifier =
      MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier;
    const fromObject =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatObjectMetadataMaps.from
        .byUniversalIdentifier[objectUniversalIdentifier];

    expect(fromObject.applicationId).toBe(STANDARD_APPLICATION_ID);
  });

  it('uses a matching legacy entity as the migration source for ownership transfer', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const objectUniversalIdentifier =
      MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier;
    const existingObject =
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        objectUniversalIdentifier
      ];

    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      flatObjectMetadataMaps: {
        ...allFlatEntityMaps.flatObjectMetadataMaps,
        byUniversalIdentifier: {
          ...allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
          [objectUniversalIdentifier]: {
            ...existingObject,
            applicationId: 'legacy-application-id',
            applicationUniversalIdentifier: 'legacy-application-universal-identifier',
          },
        },
      },
      featureFlagsMap: {},
    });

    await runOnWorkspace();

    const fromObject =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatObjectMetadataMaps.from
        .byUniversalIdentifier[objectUniversalIdentifier];

    expect(fromObject.applicationId).toBe('legacy-application-id');
  });

  it('throws when Myah metadata migration validation fails', async () => {
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValue({
      status: 'fail',
      errors: ['ownership transfer failed'],
    });

    await expect(runOnWorkspace()).rejects.toThrow(
      `Failed to synchronize Myah standard metadata for workspace ${WORKSPACE_ID}`,
    );
  });
});
