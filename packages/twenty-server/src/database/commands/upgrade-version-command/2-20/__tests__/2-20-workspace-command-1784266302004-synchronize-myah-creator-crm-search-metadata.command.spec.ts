import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { SynchronizeMyahCreatorCrmSearchMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302004-synchronize-myah-creator-crm-search-metadata.command';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahCreatorCrmSearchMetadataCommand', () => {
  const twentyStandardApplicationId = '20202020-0000-0000-0000-000000000002';
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
  const Command =
    SynchronizeMyahCreatorCrmSearchMetadataCommand as unknown as new (
      ...constructorArgs: unknown[]
    ) => SynchronizeMyahCreatorCrmSearchMetadataCommand;
  const createCommand = (flatSearchFieldMetadataMaps: unknown) => {
    const validateBuildAndRunWorkspaceMigration = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const command = new Command(
      {} as WorkspaceIteratorService,
      applicationService,
      { validateBuildAndRunWorkspaceMigration },
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatSearchFieldMetadataMaps,
        }),
      },
    );

    return { command, validateBuildAndRunWorkspaceMigration };
  };
  const buildExistingSearchFieldMetadataMaps = (
    fieldMetadataUniversalIdentifiers: readonly string[],
  ) => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-07-21T00:00:00.000Z',
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

  it('persists the four missing Creator CRM search-field metadata rows', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand(
      createEmptyAllFlatEntityMaps().flatSearchFieldMetadataMaps,
    );

    await command.runOnWorkspace(args);

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

  it('creates only the missing Creator CRM search metadata field pairs', async () => {
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

  it('registers the forward-only Creator CRM search metadata synchronization command', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCreatorCrmSearchMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.20.0',
      timestamp: 1784266302004,
    });
  });
});
