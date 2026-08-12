import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import type { DataSource } from 'typeorm';

import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';


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

type TestPageLayoutWidget = TestFlatEntity & {
  universalConfiguration: {
    configurationType: string;
    viewUniversalIdentifier?: string;
  };
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
  let connectQueryRunner: jest.Mock;
  let findWorkspace: jest.Mock;
  let hasSchema: jest.Mock;
  let releaseQueryRunner: jest.Mock;
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
    findWorkspace = jest
      .fn()
      .mockResolvedValue({ databaseSchema: 'workspace_test' });
    connectQueryRunner = jest.fn();
    hasSchema = jest.fn().mockResolvedValue(true);
    releaseQueryRunner = jest.fn();
    createQueryRunner = jest.fn().mockReturnValue({
      connect: connectQueryRunner,
      hasSchema,
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: releaseQueryRunner,
      manager: { update },
    });
    validateBuildAndRunWorkspaceMigrationFromTo = jest.fn().mockResolvedValue({
      status: 'success',
    });

    command = new SynchronizeMyahStandardMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        createQueryRunner,
        getRepository: jest.fn().mockReturnValue({
          findOne: findWorkspace,
        }),
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

  it('skips active workspaces without a physical database schema', async () => {
    hasSchema.mockResolvedValue(false);

    await runOnWorkspace();

    expect(hasSchema).toHaveBeenCalledWith('workspace_test');
    expect(releaseQueryRunner).toHaveBeenCalled();
    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('releases the schema query runner when connection fails', async () => {
    connectQueryRunner.mockRejectedValue(new Error('connection failed'));

    await expect(runOnWorkspace()).rejects.toThrow('connection failed');

    expect(releaseQueryRunner).toHaveBeenCalled();
    expect(getOrRecompute).not.toHaveBeenCalled();
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
    expect(
      Object.keys(
        migrationInput.fromToAllFlatEntityMaps.flatRolePermissionFlagMaps.to
          .byUniversalIdentifier,
      ),
    ).toHaveLength(1);
  });
  it('includes Task and Note target extensions in the desired migration slice', async () => {
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

  it('includes every desired field owner and relation target object in the migration slice', async () => {
    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const desiredObjects =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier;
    const desiredFields = Object.values(
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier,
    ) as Array<{
      name: string;
      objectMetadataUniversalIdentifier: string;
      relationTargetObjectMetadataUniversalIdentifier?: string | null;
    }>;

    for (const field of desiredFields) {
      expect(desiredObjects[field.objectMetadataUniversalIdentifier]).toBeDefined();

      if (isDefined(field.relationTargetObjectMetadataUniversalIdentifier)) {
        expect(
          desiredObjects[field.relationTargetObjectMetadataUniversalIdentifier],
        ).toBeDefined();
      }
    }
  });

  it('omits relations to absent non-Myah objects from the migration slice', async () => {
    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const desiredObjects =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier;
    const desiredFieldsByUniversalIdentifier =
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier;
    const desiredFields = Object.values(
      desiredFieldsByUniversalIdentifier,
    ) as Array<{
      objectMetadataUniversalIdentifier: string;
      relationTargetObjectMetadataUniversalIdentifier?: string | null;
    }>;
    const desiredViewFields = Object.values(
      migrationInput.fromToAllFlatEntityMaps.flatViewFieldMaps.to
        .byUniversalIdentifier,
    ) as Array<{
      fieldMetadataUniversalIdentifier?: string | null;
    }>;
    const absentObjectUniversalIdentifiers = [
      STANDARD_OBJECTS.company.universalIdentifier,
      STANDARD_OBJECTS.opportunity.universalIdentifier,
      STANDARD_OBJECTS.person.universalIdentifier,
    ];

    for (const universalIdentifier of absentObjectUniversalIdentifiers) {
      expect(desiredObjects[universalIdentifier]).toBeUndefined();
      expect(
        desiredFields.some(
          (field) =>
            field.objectMetadataUniversalIdentifier === universalIdentifier ||
            field.relationTargetObjectMetadataUniversalIdentifier ===
              universalIdentifier,
        ),
      ).toBe(false);
    }

    for (const field of desiredFields) {
      expect(
        desiredObjects[field.objectMetadataUniversalIdentifier],
      ).toBeDefined();

      if (isDefined(field.relationTargetObjectMetadataUniversalIdentifier)) {
        expect(
          desiredObjects[
            field.relationTargetObjectMetadataUniversalIdentifier
          ],
        ).toBeDefined();
      }
    }

    for (const viewField of desiredViewFields) {
      if (isDefined(viewField.fieldMetadataUniversalIdentifier)) {
        expect(
          desiredFieldsByUniversalIdentifier[
            viewField.fieldMetadataUniversalIdentifier
          ],
        ).toBeDefined();
      }
    }

    expect(
      desiredFieldsByUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      desiredFieldsByUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.fields.campaignCreators
          .universalIdentifier
      ],
    ).toBeDefined();
  });

  it('preserves current metadata for non-Myah objects included only for graph closure', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const workflowUniversalIdentifier =
      STANDARD_OBJECTS.workflow.universalIdentifier;
    const currentWorkflow =
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        workflowUniversalIdentifier
      ];

    if (!isDefined(currentWorkflow)) {
      throw new Error('Workflow object fixture is required');
    }

    currentWorkflow.labelSingular = 'Automation';
    delete allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
    ];
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });

    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const desiredWorkflow =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[workflowUniversalIdentifier];

    expect(desiredWorkflow.labelSingular).toBe('Automation');
  });

  it('syncs the native Outreach Campaign relation and General Automations filter', async () => {
    await runOnWorkspace();

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const desiredObjects =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier;
    const desiredFields =
      migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
        .byUniversalIdentifier;
    const desiredViews =
      migrationInput.fromToAllFlatEntityMaps.flatViewMaps.to
        .byUniversalIdentifier;
    const desiredViewFields =
      migrationInput.fromToAllFlatEntityMaps.flatViewFieldMaps.to
        .byUniversalIdentifier;
    const desiredViewFilters =
      migrationInput.fromToAllFlatEntityMaps.flatViewFilterMaps.to
        .byUniversalIdentifier;

    expect(
      desiredFields[
        STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      desiredFields[STANDARD_OBJECTS.workflow.fields.name.universalIdentifier],
    ).toBeUndefined();
    expect(
      desiredObjects[STANDARD_OBJECTS.workflow.universalIdentifier],
    ).toBeDefined();
    expect(
      desiredViews[
        STANDARD_OBJECTS.workflow.views.allWorkflows.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      desiredViewFields['9ecf92f8-6702-49bb-a25f-1d6e4ade47d8'],
    ).toBeUndefined();
    expect(
      desiredViewFilters[
        STANDARD_OBJECTS.workflow.views.allWorkflows.viewFilters
          .outreachCampaignIsEmpty.universalIdentifier
      ],
    ).toMatchObject({
      fieldMetadataUniversalIdentifier:
        STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier,
      operand: 'IS_EMPTY',
      value: JSON.stringify([]),
    });
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

  describe('with a bounded Creator slice', () => {
    it('limits desired metadata to Creator while retaining CRM metadata without a legacy Myah application', async () => {
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
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
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

      await command.synchronizeWorkspace(
        {
          workspaceId: WORKSPACE_ID,
          options: { dryRun: false },
          index: 0,
          total: 1,
        },
        {
          targetObjectUniversalIdentifiers: new Set([
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          ]),
        },
      );

      const objectMaps =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps.flatObjectMetadataMaps;

      expect(
        objectMaps.from.byUniversalIdentifier[
          STANDARD_OBJECTS.person.universalIdentifier
        ],
      ).toBeUndefined();
      expect(
        objectMaps.to.byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier
        ],
      ).toBeDefined();
      expect(
        objectMaps.to.byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier
        ],
      ).toBeUndefined();
      expect(
          Object.values(
            validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
              .fromToAllFlatEntityMaps.flatObjectPermissionMaps.to
              .byUniversalIdentifier,
          ).every(
            ({ objectMetadataUniversalIdentifier }) =>
              objectMetadataUniversalIdentifier ===
              MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          ),
        ).toBe(true);

      const standardFields = Object.values(
        allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
      ) as Array<{
        universalIdentifier: string;
        objectMetadataUniversalIdentifier: string;
        relationTargetObjectMetadataUniversalIdentifier?: string | null;
        relationTargetFieldMetadataUniversalIdentifier?: string | null;
      }>;
      const creatorOwnerField = standardFields.find(
        ({ universalIdentifier }) =>
          universalIdentifier ===
          MYAH_STANDARD_OBJECTS.creator.fields.owner.universalIdentifier,
      );
      const unselectedOutboundCreatorRelation = standardFields.find(
        (field) =>
          field.objectMetadataUniversalIdentifier ===
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier &&
          field.relationTargetObjectMetadataUniversalIdentifier !== null &&
          field.relationTargetObjectMetadataUniversalIdentifier !== undefined &&
          field.universalIdentifier !==
            MYAH_STANDARD_OBJECTS.creator.fields.owner.universalIdentifier,
      );
      const inboundCreatorRelation = standardFields.find(
        (field) =>
          field.objectMetadataUniversalIdentifier !==
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier &&
          field.relationTargetObjectMetadataUniversalIdentifier ===
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      );

      if (
        !creatorOwnerField ||
        !creatorOwnerField.relationTargetFieldMetadataUniversalIdentifier ||
        !unselectedOutboundCreatorRelation ||
        !inboundCreatorRelation
      ) {
        throw new Error('Creator relation field fixtures are missing');
      }

      const desiredFields =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
          .byUniversalIdentifier;
      const desiredRoles =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps.flatRoleMaps.to.byUniversalIdentifier;

      expect(
        desiredFields[creatorOwnerField.universalIdentifier],
      ).toBeDefined();
      expect(
        desiredFields[
          creatorOwnerField.relationTargetFieldMetadataUniversalIdentifier
        ],
      ).toBeDefined();
      expect(
        desiredFields[unselectedOutboundCreatorRelation.universalIdentifier],
      ).toBeUndefined();
      expect(
        desiredFields[inboundCreatorRelation.universalIdentifier],
      ).toBeUndefined();
      expect(
        desiredRoles[STANDARD_ROLE.creatorOpsDefault.universalIdentifier],
      ).toBeDefined();
      expect(
        desiredRoles[STANDARD_ROLE.brandBrainAdmin.universalIdentifier],
      ).toBeUndefined();

      const desiredCreator = objectMaps.to.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ] as { fieldUniversalIdentifiers: string[] };
      const desiredCreatorOpsRole = desiredRoles[
        STANDARD_ROLE.creatorOpsDefault.universalIdentifier
      ] as {
        objectPermissionUniversalIdentifiers: string[];
        fieldPermissionUniversalIdentifiers: string[];
      };
      const desiredObjectPermissions =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps.flatObjectPermissionMaps.to
          .byUniversalIdentifier;
      const desiredFieldPermissions =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps.flatFieldPermissionMaps.to
          .byUniversalIdentifier;

      expect(
        desiredCreator.fieldUniversalIdentifiers.every(
          (fieldUniversalIdentifier) =>
            desiredFields[fieldUniversalIdentifier] !== undefined,
        ),
      ).toBe(true);
      expect(
        desiredCreatorOpsRole.objectPermissionUniversalIdentifiers.every(
          (permissionUniversalIdentifier) =>
            desiredObjectPermissions[permissionUniversalIdentifier] !== undefined,
        ),
      ).toBe(true);
      expect(
        desiredCreatorOpsRole.fieldPermissionUniversalIdentifiers.every(
          (permissionUniversalIdentifier) =>
            desiredFieldPermissions[permissionUniversalIdentifier] !== undefined,
        ),
      ).toBe(true);
    });

    it('includes every bounded Creator Fields widget view in the desired migration slice', async () => {
      await command.synchronizeWorkspace(
        {
          workspaceId: WORKSPACE_ID,
          options: { dryRun: false },
          index: 0,
          total: 1,
        },
        {
          targetObjectUniversalIdentifiers: new Set([
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          ]),
        },
      );

      const migrationInput =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
      const desiredViews =
        migrationInput.fromToAllFlatEntityMaps.flatViewMaps.to
          .byUniversalIdentifier;
      const desiredFields =
        migrationInput.fromToAllFlatEntityMaps.flatFieldMetadataMaps.to
          .byUniversalIdentifier;
      const desiredViewFields =
        migrationInput.fromToAllFlatEntityMaps.flatViewFieldMaps.to
          .byUniversalIdentifier;
      const desiredWidgets = Object.values(
        migrationInput.fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps.to
          .byUniversalIdentifier,
      ) as TestPageLayoutWidget[];
      const fieldsWidgetViewUniversalIdentifiers = desiredWidgets.flatMap(
        ({ universalConfiguration }) =>
          universalConfiguration.configurationType === 'FIELDS' &&
          universalConfiguration.viewUniversalIdentifier !== undefined
            ? [universalConfiguration.viewUniversalIdentifier]
            : [],
      );

      expect(fieldsWidgetViewUniversalIdentifiers).not.toHaveLength(0);
      expect(
        fieldsWidgetViewUniversalIdentifiers.every(
          (viewUniversalIdentifier) =>
            desiredViews[viewUniversalIdentifier] !== undefined,
        ),
      ).toBe(true);

      const { allFlatEntityMaps } =
        computeTwentyStandardApplicationAllFlatEntityMaps({
          workspaceId: WORKSPACE_ID,
          twentyStandardApplicationId: STANDARD_APPLICATION_ID,
          now: '2026-07-15T00:00:00.000Z',
        });
      const fieldsWidgetViewFieldUniversalIdentifiers = Object.values(
        allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .flatMap(({ universalIdentifier, viewUniversalIdentifier }) =>
        fieldsWidgetViewUniversalIdentifiers.includes(viewUniversalIdentifier)
          ? [universalIdentifier]
          : [],
      );

      expect(fieldsWidgetViewFieldUniversalIdentifiers).not.toHaveLength(0);
      expect(
        fieldsWidgetViewFieldUniversalIdentifiers.every(
          (viewFieldUniversalIdentifier) =>
            desiredViewFields[viewFieldUniversalIdentifier] !== undefined,
        ),
      ).toBe(true);

      const fieldsWidgetViewFieldMetadataUniversalIdentifiers = Object.values(
        allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .flatMap(
          ({ fieldMetadataUniversalIdentifier, viewUniversalIdentifier }) =>
            fieldsWidgetViewUniversalIdentifiers.includes(
              viewUniversalIdentifier,
            ) && isDefined(fieldMetadataUniversalIdentifier)
              ? [fieldMetadataUniversalIdentifier]
              : [],
        );

      expect(
        fieldsWidgetViewFieldMetadataUniversalIdentifiers,
      ).not.toHaveLength(0);
      expect(
        fieldsWidgetViewFieldMetadataUniversalIdentifiers.every(
          (fieldMetadataUniversalIdentifier) =>
            desiredFields[fieldMetadataUniversalIdentifier] !== undefined,
        ),
      ).toBe(true);
    });

    it('retains only roles referenced by the bounded Creator permission graph', async () => {
      await command.synchronizeWorkspace(
        {
          workspaceId: WORKSPACE_ID,
          options: { dryRun: false },
          index: 0,
          total: 1,
        },
        {
          targetObjectUniversalIdentifiers: new Set([
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          ]),
        },
      );

      const desiredRoles =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps.flatRoleMaps.to.byUniversalIdentifier;

      expect(
        desiredRoles[STANDARD_ROLE.creatorOpsDefault.universalIdentifier],
      ).toBeDefined();
      expect(
        desiredRoles[STANDARD_ROLE.brandBrainAdmin.universalIdentifier],
      ).toBeUndefined();
    });
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
    expect(createQueryRunner).toHaveBeenCalledTimes(1);
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

    expect(createQueryRunner).toHaveBeenCalledTimes(2);
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

  it('does not transfer ownership in dry-run mode or when legacy cutover is disabled', async () => {
    findByUniversalIdentifier.mockResolvedValue({
      id: 'legacy-myah-application-id',
    });

    await runOnWorkspace(true);

    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();

    jest.clearAllMocks();

    await command.synchronizeWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        options: { dryRun: false },
        index: 0,
        total: 1,
      },
      {
        targetObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        ]),
        migrateLegacyMyahApplication: false,
      },
    );

    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
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
    expect(createQueryRunner).toHaveBeenCalledTimes(1);
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
