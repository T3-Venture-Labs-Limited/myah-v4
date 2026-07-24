import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
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
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';

type TwentyStandardApplicationAllFlatEntityMapsModule = {
  computeTwentyStandardApplicationAllFlatEntityMaps: typeof computeTwentyStandardApplicationAllFlatEntityMaps;
};

jest.mock(
  'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant',
  () => {
    const actual =
      jest.requireActual<TwentyStandardApplicationAllFlatEntityMapsModule>(
        'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant',
      );

    return {
      ...actual,
      computeTwentyStandardApplicationAllFlatEntityMaps: jest.fn(
        actual.computeTwentyStandardApplicationAllFlatEntityMaps,
      ),
    };
  },
);
const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER = '20202020-0000-0000-0000-000000000003';
const OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER =
  '00000000-0000-4000-8000-000000000099';
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

const MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS = {
  creator: '2bab4cc0-d1d8-4394-b506-9c49a8b414a5',
  myahCampaign: 'f7e38f36-1901-40df-b6c1-cfff373f472f',
  inboxOwner: 'eb7f2495-3cc2-4db5-9744-1172ab8a44e8',
  inboxState: '5047d99f-a82c-4a68-ad39-efd9665a182c',
  snoozedUntil: 'ff39959f-533d-4a41-b022-2744628ada69',
  myahReplyDraftBody: '8ec8253f-9b54-46d5-9b55-ac1829c10f4f',
  myahReplyDraftRevision: 'dfcab7eb-b140-48b7-9252-ed4b9b0d5789',
  ownedInboxThreads: '664b677e-8625-4442-bc1c-c836f541d0d1',
} as const;

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

  const addObsoleteTestField = (
    allFlatEntityMaps: TwentyStandardAllFlatEntityMaps,
  ) => {
    const currentEmailField =
      allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier
      ];
    if (!currentEmailField) {
      throw new Error('Creator email field fixture is missing');
    }

    const obsoleteField = {
      ...currentEmailField,
      id: OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER,
      universalIdentifier: OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER,
    };

    allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
      OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER
    ] = obsoleteField;
  };

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

  it('includes native MessageThread and WorkspaceMember Inbox field extensions without native object operations', async () => {
    const actualComputeTwentyStandardApplicationAllFlatEntityMaps =
      jest.requireActual<TwentyStandardApplicationAllFlatEntityMapsModule>(
        'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant',
      ).computeTwentyStandardApplicationAllFlatEntityMaps;

    jest
      .mocked(computeTwentyStandardApplicationAllFlatEntityMaps)
      .mockImplementationOnce((args) => {
        const computed =
          actualComputeTwentyStandardApplicationAllFlatEntityMaps(args);
        const fieldMaps =
          computed.allFlatEntityMaps.flatFieldMetadataMaps;
        const template =
          fieldMaps.byUniversalIdentifier[
            STANDARD_OBJECTS.messageThread.fields.subject.universalIdentifier
          ];

        if (!isDefined(template)) {
          throw new Error('Expected the native MessageThread subject field');
        }

        const messageThreadUniversalIdentifier =
          STANDARD_OBJECTS.messageThread.universalIdentifier;
        const workspaceMemberUniversalIdentifier =
          STANDARD_OBJECTS.workspaceMember.universalIdentifier;
        const inboxFields = [
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxOwner,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              workspaceMemberUniversalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxState,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.snoozedUntil,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftBody,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftRevision,
            objectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
          },
          {
            universalIdentifier:
              MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.ownedInboxThreads,
            objectMetadataUniversalIdentifier:
              workspaceMemberUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              messageThreadUniversalIdentifier,
          },
        ];

        for (const [index, inboxField] of inboxFields.entries()) {
          const id = `20202020-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
          const field = {
            ...template,
            ...inboxField,
            id,
            name: `inboxField${index}`,
            relationTargetFieldMetadataUniversalIdentifier: null,
            universalSettings: null,
          };

          fieldMaps.byUniversalIdentifier[field.universalIdentifier] = field;
          fieldMaps.universalIdentifierById[id] = field.universalIdentifier;
        }

        return computed;
      });

    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const fieldMetadataMaps = migrationInput.fromToAllFlatEntityMaps
      .flatFieldMetadataMaps as {
      from: {
        byUniversalIdentifier: Record<string, TestFlatEntity | undefined>;
      };
      to: {
        byUniversalIdentifier: Record<string, TestFlatEntity | undefined>;
      };
    };
    const fieldMetadataOperations = {
      flatEntityToCreate: Object.values(
        fieldMetadataMaps.to.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          ({ universalIdentifier }) =>
            fieldMetadataMaps.from.byUniversalIdentifier[
              universalIdentifier
            ] === undefined,
        ),
    };

    expect(
      fieldMetadataOperations.flatEntityToCreate.map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
    ).toEqual(
      expect.arrayContaining([
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxOwner,
        MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftRevision,
      ]),
    );

    const objectMetadataMaps =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps;
    const fromObjectUniversalIdentifiers = Object.keys(
      objectMetadataMaps.from.byUniversalIdentifier,
    );
    const toObjectUniversalIdentifiers = Object.keys(
      objectMetadataMaps.to.byUniversalIdentifier,
    );
    const objectMetadataOperations = {
      flatEntityToCreate: toObjectUniversalIdentifiers.filter(
        (universalIdentifier) =>
          objectMetadataMaps.from.byUniversalIdentifier[universalIdentifier] ===
          undefined,
      ),
      flatEntityToUpdate: toObjectUniversalIdentifiers.filter(
        (universalIdentifier) =>
          objectMetadataMaps.from.byUniversalIdentifier[universalIdentifier] !==
          undefined,
      ),
      flatEntityToDelete: fromObjectUniversalIdentifiers.filter(
        (universalIdentifier) =>
          objectMetadataMaps.to.byUniversalIdentifier[universalIdentifier] ===
          undefined,
      ),
    };
    const nativeObjectUniversalIdentifiers = [
      STANDARD_OBJECTS.messageThread.universalIdentifier,
      STANDARD_OBJECTS.workspaceMember.universalIdentifier,
    ];

    for (const operation of Object.values(objectMetadataOperations)) {
      expect(operation).not.toEqual(
        expect.arrayContaining(nativeObjectUniversalIdentifiers),
      );
    }
  });

  it('provides isolated retained standard objects as migration dependencies', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });

    delete allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
    ];
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });
    validateBuildAndRunWorkspaceMigrationFromTo.mockImplementation(
      async (migrationInput) => {
        const dependencyObjects =
          migrationInput.dependencyAllFlatEntityMaps.flatObjectMetadataMaps
            .byUniversalIdentifier;

        dependencyObjects.optimisticObject =
          dependencyObjects[STANDARD_OBJECTS.noteTarget.universalIdentifier];

        return { status: 'success' };
      },
    );

    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      migrationInput.dependencyAllFlatEntityMaps.flatObjectMetadataMaps
        .byUniversalIdentifier[STANDARD_OBJECTS.taskTarget.universalIdentifier],
    ).toBeDefined();
    expect(
      migrationInput.dependencyAllFlatEntityMaps.flatObjectMetadataMaps
        .byUniversalIdentifier[STANDARD_OBJECTS.noteTarget.universalIdentifier],
    ).toBeDefined();
    expect(
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier
        .optimisticObject,
    ).toBeUndefined();
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

  it('preserves unlisted obsolete fields during ordinary synchronization', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });

    addObsoleteTestField(allFlatEntityMaps);
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });
    delete allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
    ];

    await runOnWorkspace();

    const fieldMaps =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatFieldMetadataMaps;

    expect(
      fieldMaps.from.byUniversalIdentifier[
        OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER
      ],
    ).toBeUndefined();
  });

  it('includes explicit obsolete fields and bypasses the complete-graph skip', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });

    addObsoleteTestField(allFlatEntityMaps);
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });

    await command.synchronizeWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        options: { dryRun: false },
        index: 0,
        total: 1,
      },
      {
        explicitObsoleteUniversalIdentifiersByMetadataName: {
          fieldMetadata: new Set([
            OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER,
          ]),
        },
      },
    );

    const fieldMaps =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatFieldMetadataMaps;

    expect(
      fieldMaps.from.byUniversalIdentifier[
        OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER
      ],
    ).toBeDefined();
    expect(
      fieldMaps.to.byUniversalIdentifier[
        OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER
      ],
    ).toBeUndefined();
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
