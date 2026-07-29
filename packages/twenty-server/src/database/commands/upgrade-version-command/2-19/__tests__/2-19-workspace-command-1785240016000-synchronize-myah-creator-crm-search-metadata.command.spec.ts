import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

type SynchronizeMyahCreatorCrmSearchMetadataCommand = {
  runOnWorkspace: (args: RunOnWorkspaceArgs) => Promise<void>;
};

type SynchronizeMyahCreatorCrmSearchMetadataCommandConstructor = new (
  ...constructorArgs: unknown[]
) => SynchronizeMyahCreatorCrmSearchMetadataCommand;

type SynchronizeMyahCreatorCrmSearchMetadataCommandModule = {
  SynchronizeMyahCreatorCrmSearchMetadataCommand: SynchronizeMyahCreatorCrmSearchMetadataCommandConstructor;
};

const loadCommandModule =
  (): SynchronizeMyahCreatorCrmSearchMetadataCommandModule | undefined => {
    try {
      return require(
        'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785240016000-synchronize-myah-creator-crm-search-metadata.command',
      ) as SynchronizeMyahCreatorCrmSearchMetadataCommandModule;
    } catch {
      return undefined;
    }
  };

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahCreatorCrmSearchMetadataCommand', () => {
  const twentyStandardApplicationId = '20202020-0000-0000-0000-000000000002';
  const { allFlatEntityMaps: standardApplicationAllFlatEntityMaps } =
    computeTwentyStandardApplicationAllFlatEntityMaps({
      now: '2026-07-28T00:00:00.000Z',
      workspaceId: args.workspaceId,
      twentyStandardApplicationId,
    });
  const creatorCrmObjectUniversalIdentifiers = new Set<string>([
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
  ]);
  const creatorCrmTsVectorFieldUniversalIdentifiers = Object.values(
    standardApplicationAllFlatEntityMaps.flatFieldMetadataMaps
      .byUniversalIdentifier,
  )
    .filter(isDefined)
    .filter(
      ({ objectMetadataUniversalIdentifier, type }) =>
        type === FieldMetadataType.TS_VECTOR &&
        creatorCrmObjectUniversalIdentifiers.has(
          objectMetadataUniversalIdentifier,
        ),
    )
    .map(({ universalIdentifier }) => universalIdentifier)
    .sort();
  const applicationService = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({
        twentyStandardFlatApplication: {
          id: twentyStandardApplicationId,
          universalIdentifier: '20202020-0000-0000-0000-000000000003',
        },
      }),
  };
  const createCommand = (
    flatSearchFieldMetadataMaps: unknown,
    flatFieldMetadataMaps: unknown =
      standardApplicationAllFlatEntityMaps.flatFieldMetadataMaps,
  ) => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    const validateBuildAndRunWorkspaceMigration = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn().mockResolvedValue(undefined),
      getOrRecompute: jest.fn().mockResolvedValue({
        flatFieldMetadataMaps,
        flatSearchFieldMetadataMaps,
      }),
    };
    const workspaceMigrationRunnerService = {
      run: jest.fn().mockResolvedValue(undefined),
    };
    const command = new commandModule!.SynchronizeMyahCreatorCrmSearchMetadataCommand(
      {} as WorkspaceIteratorService,
      applicationService,
      { validateBuildAndRunWorkspaceMigration },
      workspaceCacheService,
      workspaceMigrationRunnerService,
    );

    return {
      command,
      validateBuildAndRunWorkspaceMigration,
      workspaceCacheService,
      workspaceMigrationRunnerService,
    };
  };
  const buildExistingSearchFieldMetadataMaps = (
    fieldMetadataUniversalIdentifiers: readonly string[],
  ) => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-07-28T00:00:00.000Z',
        workspaceId: args.workspaceId,
        twentyStandardApplicationId,
      });

    return {
      ...createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps,
      byUniversalIdentifier: Object.fromEntries(
        Object.values(
          allFlatEntityMaps.flatSearchFieldMetadataMaps
            .byUniversalIdentifier,
        )
          .filter(isDefined)
          .filter(({ fieldMetadataUniversalIdentifier }) =>
            fieldMetadataUniversalIdentifiers.includes(
              fieldMetadataUniversalIdentifier,
            ),
          )
          .map((searchFieldMetadata, index) => [
            `existing-${index}`,
            searchFieldMetadata,
          ]),
      ),
    };
  };

  it('refreshes stale search metadata before persisting missing Creator CRM rows', async () => {
    const {
      command,
      validateBuildAndRunWorkspaceMigration,
      workspaceCacheService,
    } = createCommand(createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps);

    await command.runOnWorkspace(args);

    expect(workspaceCacheService.invalidateAndRecompute).toHaveBeenCalledTimes(1);
    expect(workspaceCacheService.invalidateAndRecompute).toHaveBeenCalledWith(
      args.workspaceId,
      ['flatSearchFieldMetadataMaps'],
    );
    expect(validateBuildAndRunWorkspaceMigration).toHaveBeenCalledTimes(1);
    const flatEntityToCreate =
      validateBuildAndRunWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.searchFieldMetadata
        .flatEntityToCreate;

    expect(flatEntityToCreate).toHaveLength(4);
    expect(flatEntityToCreate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
        }),
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier,
        }),
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creatorList.fields.name.universalIdentifier,
        }),
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.name.universalIdentifier,
        }),
      ]),
    );
  });

  it('rebuilds Creator CRM vectors after persisting missing search metadata', async () => {
    const { command, workspaceMigrationRunnerService } = createCommand(
      createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps,
    );

    await command.runOnWorkspace(args);

    const rebuildActions =
      workspaceMigrationRunnerService.run.mock.calls[0][0].workspaceMigration
        .actions;

    expect(rebuildActions).toHaveLength(
      creatorCrmTsVectorFieldUniversalIdentifiers.length,
    );
    expect(
      rebuildActions
        .map(
          ({ universalIdentifier }: { universalIdentifier: string }) =>
            universalIdentifier,
        )
        .sort(),
    ).toEqual(creatorCrmTsVectorFieldUniversalIdentifiers);
    expect(rebuildActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadataName: 'fieldMetadata',
          rebuildSearchVector: true,
          update: { universalSettings: null },
        }),
      ]),
    );
  });

  it('does not mutate workspace cache in dry-run mode', async () => {
    const {
      command,
      validateBuildAndRunWorkspaceMigration,
      workspaceCacheService,
    } = createCommand(createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps);

    await command.runOnWorkspace({
      ...args,
      options: { dryRun: true },
    });

    expect(workspaceCacheService.invalidateAndRecompute).not.toHaveBeenCalled();
    expect(workspaceCacheService.getOrRecompute).not.toHaveBeenCalled();
    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('creates search metadata only for Creator CRM fields present in the workspace', async () => {
    const availableFieldMetadataUniversalIdentifier =
      MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier;
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand(
      createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps,
      {
        ...createEmptyAllFlatEntityMaps().flatFieldMetadataMaps,
        byUniversalIdentifier: {
          [availableFieldMetadataUniversalIdentifier]:
            standardApplicationAllFlatEntityMaps.flatFieldMetadataMaps
              .byUniversalIdentifier[
              availableFieldMetadataUniversalIdentifier
            ],
        },
      },
    );

    await command.runOnWorkspace(args);

    const flatEntityToCreate =
      validateBuildAndRunWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.searchFieldMetadata
        .flatEntityToCreate;

    expect(flatEntityToCreate).toEqual([
      expect.objectContaining({
        fieldMetadataUniversalIdentifier:
          availableFieldMetadataUniversalIdentifier,
      }),
    ]);
  });

  it('does not create search metadata when all Creator CRM field pairs exist', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand(
      buildExistingSearchFieldMetadataMaps([
        MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creatorList.fields.name.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.name.universalIdentifier,
      ]),
    );

    await command.runOnWorkspace(args);

    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('creates only missing Creator CRM search metadata field pairs', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand(
      buildExistingSearchFieldMetadataMaps([
        MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creatorList.fields.name.universalIdentifier,
      ]),
    );

    await command.runOnWorkspace(args);

    const flatEntityToCreate =
      validateBuildAndRunWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.searchFieldMetadata
        .flatEntityToCreate;

    expect(flatEntityToCreate).toHaveLength(2);
    expect(
      flatEntityToCreate
        .map(
          ({ fieldMetadataUniversalIdentifier }: { fieldMetadataUniversalIdentifier: string }) =>
            fieldMetadataUniversalIdentifier,
        )
        .sort(),
    ).toEqual(
      [
        MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.name.universalIdentifier,
      ].sort(),
    );
  });

  it('registers the active-release Creator CRM search metadata synchronization command', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      getRegisteredWorkspaceCommandMetadata(
        commandModule!.SynchronizeMyahCreatorCrmSearchMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.19.0',
      timestamp: 1785240016000,
    });
  });
});
