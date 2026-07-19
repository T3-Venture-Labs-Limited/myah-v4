import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { RemoveReplacedTwentyCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302002-remove-replaced-twenty-crm-metadata.command';
import type { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import type { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-0000-0000-000000000003';

type StandardFieldIdentifiers = Record<
  string,
  { universalIdentifier: string }
>;

describe('RemoveReplacedTwentyCrmMetadataCommand', () => {
  let command: RemoveReplacedTwentyCrmMetadataCommand;
  let getOrRecompute: jest.Mock;
  let validateBuildAndRunWorkspaceMigrationFromTo: jest.Mock;
  let flush: jest.Mock;
  let incrementMetadataVersion: jest.Mock;

  beforeEach(() => {
    getOrRecompute = jest.fn();
    flush = jest.fn().mockResolvedValue(undefined);
    incrementMetadataVersion = jest.fn().mockResolvedValue(undefined);
    validateBuildAndRunWorkspaceMigrationFromTo = jest.fn().mockResolvedValue({
      status: 'success',
    });

    command = new RemoveReplacedTwentyCrmMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            twentyStandardFlatApplication: {
              id: STANDARD_APPLICATION_ID,
              universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
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

  const seedWorkspaceMetadata = () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-19T00:00:00.000Z',
      });

    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });

    return allFlatEntityMaps;
  };

  it('deletes only the replaced CRM metadata closure', async () => {
    seedWorkspaceMetadata();

    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const sourceObjects =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.from
        .byUniversalIdentifier;
    const targetObjects =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier;
    const sourceFields =
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.from
        .byUniversalIdentifier;
    const taskTargetFields = STANDARD_OBJECTS.taskTarget
      .fields as unknown as StandardFieldIdentifiers;
    const noteTargetFields = STANDARD_OBJECTS.noteTarget
      .fields as unknown as StandardFieldIdentifiers;

    for (const object of [
      STANDARD_OBJECTS.company,
      STANDARD_OBJECTS.person,
      STANDARD_OBJECTS.opportunity,
    ]) {
      expect(sourceObjects[object.universalIdentifier]).toBeDefined();
      expect(targetObjects[object.universalIdentifier]).toBeUndefined();
    }

    for (const object of [
      MYAH_STANDARD_OBJECTS.creator,
      MYAH_STANDARD_OBJECTS.campaign,
      STANDARD_OBJECTS.taskTarget,
      STANDARD_OBJECTS.noteTarget,
    ]) {
      expect(sourceObjects[object.universalIdentifier]).toBeUndefined();
    }

    for (const field of [
      taskTargetFields.targetCreator,
      taskTargetFields.targetCampaign,
      taskTargetFields.targetBrandBrainPage,
      noteTargetFields.targetCreator,
      noteTargetFields.targetCampaign,
      noteTargetFields.targetBrandBrainPage,
    ]) {
      expect(sourceFields[field.universalIdentifier]).toBeUndefined();
    }
  });

  it('does not persist cache or version changes in dry-run mode', async () => {
    seedWorkspaceMetadata();

    await runOnWorkspace(true);

    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
    expect(flush).not.toHaveBeenCalled();
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
  });

  it('does not persist cache or version changes after validation failure', async () => {
    seedWorkspaceMetadata();
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValue({
      status: 'fail',
      errors: ['deletion rejected'],
    });

    await expect(runOnWorkspace()).rejects.toThrow(
      `Failed to remove replaced Twenty CRM metadata for workspace ${WORKSPACE_ID}`,
    );

    expect(flush).not.toHaveBeenCalled();
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
  });

  it('skips migration machinery after the CRM metadata is absent', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-19T00:00:00.000Z',
        removeReplacedTwentyCrmMetadata: true,
      });
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });

    await runOnWorkspace();

    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
  });

  it('flushes metadata and increments the version after a live cutover', async () => {
    seedWorkspaceMetadata();

    await runOnWorkspace();

    expect(flush).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
        'flatRowLevelPermissionPredicateMaps',
        'flatRowLevelPermissionPredicateGroupMaps',
      ]),
    );
    expect(incrementMetadataVersion).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('registers the destructive cutover after metadata synchronization', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RemoveReplacedTwentyCrmMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1784266302002 });
  });
});
