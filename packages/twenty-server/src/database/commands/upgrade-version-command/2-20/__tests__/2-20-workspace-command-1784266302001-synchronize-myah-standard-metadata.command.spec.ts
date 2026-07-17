import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import type { DataSource } from 'typeorm';


import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import type { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import type { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER = '20202020-0000-0000-0000-000000000003';
type TestFlatEntity = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  applicationUniversalIdentifier?: string;
};

type StandardFieldIdentifiers = Record<
  string,
  { universalIdentifier: string }
>;

describe('SynchronizeMyahStandardMetadataCommand', () => {
  let command: SynchronizeMyahStandardMetadataCommand;
  let getOrRecompute: jest.Mock;
  let validateBuildAndRunWorkspaceMigrationFromTo: jest.Mock;
  let update: jest.Mock;
  let flush: jest.Mock;
  let findByUniversalIdentifier: jest.Mock;
  let createQueryRunner: jest.Mock;
  let incrementMetadataVersion: jest.Mock;

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({ affected: 1 });
    flush = jest.fn().mockResolvedValue(undefined);
    getOrRecompute = jest.fn().mockResolvedValue({
      ...createEmptyAllFlatEntityMaps(),
      featureFlagsMap: {},
    });
    findByUniversalIdentifier = jest.fn().mockResolvedValue(null);
    incrementMetadataVersion = jest.fn().mockResolvedValue(undefined);
    createQueryRunner = jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: { update },
    });
    validateBuildAndRunWorkspaceMigrationFromTo = jest.fn().mockResolvedValue({
      status: 'success',
    });

    command = new SynchronizeMyahStandardMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        createQueryRunner,
      } as unknown as DataSource,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            twentyStandardFlatApplication: {
              id: STANDARD_APPLICATION_ID,
              universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
        findByUniversalIdentifier,
      } as unknown as ApplicationService,
      {
        getOrRecompute,
        flush,
      } as unknown as WorkspaceCacheService,
      {
        incrementMetadataVersion,
      } as unknown as WorkspaceMetadataVersionService,
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

  it('builds the migration plan without mutating in dry-run mode', async () => {
    await runOnWorkspace(true);

    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('registers the migration in the next dispatchable version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahStandardMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0' });
  });

  it('builds the bounded source-controlled Myah metadata migration for a workspace without it', async () => {
    await runOnWorkspace();

    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        buildOptions: expect.objectContaining({
          applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          inferDeletionFromMissingEntities: true,
          isSystemBuild: true,
        }),
      }),
    );
  });

  it('includes Myah object and field permissions in the desired migration slice', async () => {
    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      Object.keys(
        migrationInput.fromToAllFlatEntityMaps.flatObjectPermissionMaps.to
          .byUniversalIdentifier,
      ),
    ).not.toHaveLength(0);
    expect(
      Object.keys(
        migrationInput.fromToAllFlatEntityMaps.flatFieldPermissionMaps.to
          .byUniversalIdentifier,
      ),
    ).not.toHaveLength(0);
  });
  it('includes Task and Note target extensions in the desired migration slice', async () => {
    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const desiredFields =
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier;
    const taskTargetFields = STANDARD_OBJECTS.taskTarget
      .fields as unknown as StandardFieldIdentifiers;
    const noteTargetFields = STANDARD_OBJECTS.noteTarget
      .fields as unknown as StandardFieldIdentifiers;

    expect(
      desiredFields[
        taskTargetFields.targetCreator.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      desiredFields[
        noteTargetFields.targetBrandBrainPage.universalIdentifier
      ],
    ).toBeDefined();
  });

  it('retains CRM metadata when no legacy Myah application is installed', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const templateObject =
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier
      ] as unknown as TestFlatEntity;
    const crmObject = {
      ...templateObject,
      id: '20202020-0000-0000-0000-000000000004',
      universalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    };
    delete allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
    ];

    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      flatObjectMetadataMaps: {
        ...allFlatEntityMaps.flatObjectMetadataMaps,
        byUniversalIdentifier: {
          ...allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
          [crmObject.universalIdentifier]: crmObject,
        },
      },
      featureFlagsMap: {},
    });

    await runOnWorkspace();

    expect(
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatObjectMetadataMaps.from
        .byUniversalIdentifier[STANDARD_OBJECTS.person.universalIdentifier],
    ).toBeUndefined();
  });
  it('includes obsolete CRM metadata only in the migration source', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const templateObject =
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier
      ] as unknown as TestFlatEntity;
    const obsoleteObject = {
      ...templateObject,
      id: '20202020-0000-0000-0000-000000000004',
      universalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    };

    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      flatObjectMetadataMaps: {
        ...allFlatEntityMaps.flatObjectMetadataMaps,
        byUniversalIdentifier: {
          ...allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
          [obsoleteObject.universalIdentifier]: obsoleteObject,
        },
        universalIdentifierById: {
          ...allFlatEntityMaps.flatObjectMetadataMaps.universalIdentifierById,
          [obsoleteObject.id]: obsoleteObject.universalIdentifier,
        },
        universalIdentifiersByApplicationId: {
          ...allFlatEntityMaps.flatObjectMetadataMaps
            .universalIdentifiersByApplicationId,
          [STANDARD_APPLICATION_ID]: [
            ...(allFlatEntityMaps.flatObjectMetadataMaps
              .universalIdentifiersByApplicationId[STANDARD_APPLICATION_ID] ??
              []),
            obsoleteObject.universalIdentifier,
          ],
        },
      },
      featureFlagsMap: {},
    });

    findByUniversalIdentifier.mockResolvedValue({
      id: 'legacy-myah-application-id',
    });

    await runOnWorkspace();

    const objectMaps =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatObjectMetadataMaps;

    expect(
      objectMaps.from.byUniversalIdentifier[
        STANDARD_OBJECTS.person.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      objectMaps.to.byUniversalIdentifier[
        STANDARD_OBJECTS.person.universalIdentifier
      ],
    ).toBeUndefined();
  });

  it('skips migration machinery when the complete native Myah graph already exists', async () => {
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

    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
    expect(createQueryRunner).not.toHaveBeenCalled();
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
    delete allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
    ];

    await runOnWorkspace();

    const objectUniversalIdentifier =
      MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier;
    const fromObject =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatObjectMetadataMaps.from
        .byUniversalIdentifier[objectUniversalIdentifier];

    expect(fromObject.applicationId).toBe(STANDARD_APPLICATION_ID);
  });


  it('transfers selected Myah metadata ownership after a successful migration', async () => {
    findByUniversalIdentifier.mockResolvedValue({
      id: 'legacy-myah-application-id',
    });

    await runOnWorkspace();

    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        applicationId: expect.anything(),
        universalIdentifier: expect.anything(),
      }),
      { applicationId: STANDARD_APPLICATION_ID },
    );
    expect(flush).toHaveBeenCalled();
    expect(incrementMetadataVersion).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('does not transfer ownership in dry-run mode', async () => {
    findByUniversalIdentifier.mockResolvedValue({
      id: 'legacy-myah-application-id',
    });

    await runOnWorkspace(true);

    expect(createQueryRunner).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('does not persist ownership changes before a failed migration', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const objectUniversalIdentifier =
      MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier;
    const standardObject =
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        objectUniversalIdentifier
      ] as unknown as TestFlatEntity;
    const legacyObject = {
      ...standardObject,
      applicationId: 'legacy-application-id',
      applicationUniversalIdentifier: 'legacy-application-universal-identifier',
    };

    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      flatObjectMetadataMaps: {
        ...allFlatEntityMaps.flatObjectMetadataMaps,
        byUniversalIdentifier: {
          ...allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
          [objectUniversalIdentifier]: legacyObject,
        },
      },
      featureFlagsMap: {},
    });
    findByUniversalIdentifier.mockResolvedValue({
      id: 'legacy-myah-application-id',
    });
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValue({
      status: 'fail',
      errors: ['migration rejected'],
    });

    await expect(runOnWorkspace()).rejects.toThrow(
      `Failed to synchronize Myah standard metadata for workspace ${WORKSPACE_ID}`,
    );

    expect(update).not.toHaveBeenCalled();
    expect(createQueryRunner).not.toHaveBeenCalled();
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
