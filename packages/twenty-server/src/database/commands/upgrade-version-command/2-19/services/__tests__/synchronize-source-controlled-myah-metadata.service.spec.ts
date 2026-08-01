import {
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-0000-0000-000000000003';
const INBOX_FIELD_UNIVERSAL_IDENTIFIER =
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator;
const INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS = [
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
  MYAH_STANDARD_OBJECTS.creator.fields.inboxThreads.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaign.fields.inboxThreads.universalIdentifier,
];
const CREATOR_INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS = [
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
  MYAH_STANDARD_OBJECTS.creator.fields.inboxThreads.universalIdentifier,
];

const createArgs = (dryRun = false): RunOnWorkspaceArgs => ({
  workspaceId: WORKSPACE_ID,
  options: { dryRun },
  index: 0,
  total: 1,
});

describe('SynchronizeSourceControlledMyahMetadataService', () => {
  const applicationService = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({
        twentyStandardFlatApplication: {
          id: STANDARD_APPLICATION_ID,
          universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        },
      }),
  };
  const createService = (
    cachedMetadata: unknown,
    refreshedCachedMetadata = cachedMetadata,
  ) => {
    const flush = jest.fn();
    const invalidateAndRecompute = jest.fn();
    const getOrRecompute = jest
      .fn()
      .mockResolvedValueOnce(cachedMetadata)
      .mockResolvedValue(refreshedCachedMetadata);
    const validateBuildAndRunWorkspaceMigrationFromTo = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const incrementMetadataVersion = jest.fn();
    const insert = jest.fn();
    const update = jest.fn();
    const service = new SynchronizeSourceControlledMyahMetadataService(
      applicationService as never,
      { flush, invalidateAndRecompute, getOrRecompute } as never,
      { validateBuildAndRunWorkspaceMigrationFromTo } as never,
      { incrementMetadataVersion } as never,
      { insert, update } as never,
    );
    (service as unknown as { logger: { log: jest.Mock } }).logger = {
      log: jest.fn(),
    };

    return {
      service,
      flush,
      incrementMetadataVersion,
      insert,
      update,
      invalidateAndRecompute,
      validateBuildAndRunWorkspaceMigrationFromTo,
    };
  };

  it('creates a selected missing source-controlled field without inferring deletion', async () => {
    const {
      service,
      invalidateAndRecompute,
      validateBuildAndRunWorkspaceMigrationFromTo,
    } = createService({
      ...createEmptyAllFlatEntityMaps(),
      featureFlagsMap: {},
    });

    await service.synchronizeWorkspace(createArgs(), {
      fieldMetadata: new Set([INBOX_FIELD_UNIVERSAL_IDENTIFIER]),
    });

    expect(invalidateAndRecompute).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining(['flatFieldMetadataMaps']),
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledTimes(1);
    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(migrationInput.buildOptions).toMatchObject({
      applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      inferDeletionFromMissingEntities: {},
      isSystemBuild: true,
    });
    expect(
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier[INBOX_FIELD_UNIVERSAL_IDENTIFIER],
    ).toMatchObject({
      universalIdentifier: INBOX_FIELD_UNIVERSAL_IDENTIFIER,
    });
    expect(
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier
        ],
    ).toMatchObject({
      universalIdentifier: MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    });
    expect(
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS.creator.fields.id.universalIdentifier
        ],
    ).toMatchObject({
      universalIdentifier:
        MYAH_STANDARD_OBJECTS.creator.fields.id.universalIdentifier,
    });
  });

  it('includes a selected view field relation and its inverse field metadata', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService({
        ...createEmptyAllFlatEntityMaps(),
        featureFlagsMap: {},
      });
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-07-28T00:00:00.000Z',
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
      });
    const creatorOwnerField =
      allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.fields.owner.universalIdentifier
      ];

    if (!creatorOwnerField?.relationTargetFieldMetadataUniversalIdentifier) {
      throw new Error('Creator owner relation metadata is required by the test fixture');
    }

    await service.synchronizeWorkspace(createArgs(), {
      viewField: new Set([
        MYAH_STANDARD_OBJECTS.creator.views.creatorRecordPageFields.viewFields
          .owner.universalIdentifier,
      ]),
    });

    const desiredFields =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier;

    expect(
      desiredFields[
        MYAH_STANDARD_OBJECTS.creator.fields.owner.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      desiredFields[
        creatorOwnerField.relationTargetFieldMetadataUniversalIdentifier
      ],
    ).toBeDefined();
  });

  it('re-registers selected Inbox relation metadata over existing join columns before the generic sync', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-07-28T00:00:00.000Z',
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
      });
    const missingRelationMetadata = structuredClone(allFlatEntityMaps);

    for (const universalIdentifier of INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS) {
      delete missingRelationMetadata.flatFieldMetadataMaps
        .byUniversalIdentifier[universalIdentifier];
    }

    const queryRunner = {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue([{ exists: true }]),
      release: jest.fn(),
    };
    const {
      service,
      flush,
      incrementMetadataVersion,
      insert,
      validateBuildAndRunWorkspaceMigrationFromTo,
    } = createService(
      { ...missingRelationMetadata, featureFlagsMap: {} },
      { ...allFlatEntityMaps, featureFlagsMap: {} },
    );

    await service.synchronizeWorkspace(
      {
        ...createArgs(),
        dataSource: { createQueryRunner: () => queryRunner } as never,
      },
      { fieldMetadata: new Set(INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS) },
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(
      insert.mock.calls[0][0]
        .map(({ universalIdentifier }: { universalIdentifier: string }) =>
          universalIdentifier,
        )
        .sort(),
    ).toEqual([...INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS].sort());
    expect(flush).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'flatFieldMetadataMaps',
        'ORMEntityMetadatas',
        'graphQLResolverNameMap',
      ]),
    );
    expect(incrementMetadataVersion).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('reconnects a surviving Inbox relation when its inverse metadata is restored', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-07-28T00:00:00.000Z',
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
      });
    const missingInverseMetadata = structuredClone(allFlatEntityMaps);
    const [creatorUniversalIdentifier, inboxThreadsUniversalIdentifier] =
      CREATOR_INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS;
    const survivingCreatorRelation =
      missingInverseMetadata.flatFieldMetadataMaps.byUniversalIdentifier[
        creatorUniversalIdentifier
      ];

    if (!survivingCreatorRelation) {
      throw new Error('Creator relation metadata is required by the test fixture');
    }

    delete missingInverseMetadata.flatFieldMetadataMaps
      .byUniversalIdentifier[inboxThreadsUniversalIdentifier];
    survivingCreatorRelation.relationTargetFieldMetadataId = null;

    const queryRunner = {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue([{ exists: true }]),
      release: jest.fn(),
    };
    const { service, insert, update, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService(
        { ...missingInverseMetadata, featureFlagsMap: {} },
        { ...allFlatEntityMaps, featureFlagsMap: {} },
      );

    await service.synchronizeWorkspace(
      {
        ...createArgs(),
        dataSource: { createQueryRunner: () => queryRunner } as never,
      },
      {
        fieldMetadata: new Set(
          CREATOR_INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
        ),
      },
    );

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        universalIdentifier: inboxThreadsUniversalIdentifier,
      }),
    ]);
    expect(update).toHaveBeenCalledWith(
      { id: survivingCreatorRelation.id },
      { relationTargetFieldMetadataId: expect.any(String) },
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('does not run a migration when every selected source-controlled entity already exists', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-07-28T00:00:00.000Z',
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
      });
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService({
        ...allFlatEntityMaps,
        featureFlagsMap: {},
      });

    await service.synchronizeWorkspace(createArgs(), {
      fieldMetadata: new Set([INBOX_FIELD_UNIVERSAL_IDENTIFIER]),
    });

    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('does not mutate selected source-controlled metadata during dry-run', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService({
        ...createEmptyAllFlatEntityMaps(),
        featureFlagsMap: {},
      });

    await service.synchronizeWorkspace(createArgs(true), {
      fieldMetadata: new Set([INBOX_FIELD_UNIVERSAL_IDENTIFIER]),
    });

    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('logs the migration report and selected metadata when source synchronization fails', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService({
        ...createEmptyAllFlatEntityMaps(),
        featureFlagsMap: {},
      });
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValue({
      errors: ['missing source field'],
      status: 'fail',
    });
    const logger = { error: jest.fn() };
    (service as unknown as { logger: typeof logger }).logger = logger;

    await expect(
      service.synchronizeWorkspace(createArgs(), {
        fieldMetadata: new Set([INBOX_FIELD_UNIVERSAL_IDENTIFIER]),
      }),
    ).rejects.toThrow(
      `Failed to synchronize source-controlled Myah metadata for workspace ${WORKSPACE_ID}`,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('missing source field'),
    );
  });
});
