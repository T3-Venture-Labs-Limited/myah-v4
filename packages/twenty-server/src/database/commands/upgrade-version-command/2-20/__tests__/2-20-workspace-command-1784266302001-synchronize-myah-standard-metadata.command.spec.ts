import { createHash } from 'node:crypto';

import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import type { DataSource } from 'typeorm';
import type { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { WorkspaceMigrationObjectPermissionActionsBuilderService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/builders/object-permission/workspace-migration-object-permission-actions-builder.service';
import { FlatObjectPermissionValidatorService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-object-permission-validator.service';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import {
  SynchronizeMyahStandardMetadataCommand,
  type SynchronizeMyahStandardMetadataOptions,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import type { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { RetireLegacyBrandBrainOwnerService } from 'src/database/commands/upgrade-version-command/2-20/services/retire-legacy-brand-brain-owner.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';
const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER =
  TWENTY_STANDARD_APPLICATION.universalIdentifier;
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

type StandardFieldIdentifiers = Record<string, { universalIdentifier: string }>;

describe('SynchronizeMyahStandardMetadataCommand', () => {
  let command: SynchronizeMyahStandardMetadataCommand;
  let getOrRecompute: jest.Mock;
  let validateBuildAndRunWorkspaceMigrationFromTo: jest.Mock;
  let update: jest.Mock;
  let count: jest.Mock;
  let query: jest.Mock;
  let flush: jest.Mock;
  let incrementMetadataVersion: jest.Mock;
  let findByUniversalIdentifier: jest.Mock;
  let createQueryRunner: jest.Mock;
  let connectQueryRunner: jest.Mock;
  let findWorkspace: jest.Mock;
  let hasSchema: jest.Mock;
  let releaseQueryRunner: jest.Mock;
  let preflight: jest.SpyInstance;
  let loadSnapshot: jest.Mock;

  beforeEach(() => {
    update = jest.fn().mockImplementation(
      (_entity, where: { universalIdentifier: { _value: string[] } }) =>
        Promise.resolve({ affected: where.universalIdentifier._value.length }),
    );
    count = jest.fn().mockImplementation(
      (_entity, { where }: { where: { universalIdentifier: { _value: string[] } } }) =>
        Promise.resolve(where.universalIdentifier._value.length),
    );
    let tableLookupCount = 0;
    query = jest.fn().mockImplementation((sql: string, parameters?: unknown[]) => {
      if (sql.includes('information_schema.tables')) {
        tableLookupCount += 1;
        const tableNames = parameters?.[1] as string[];

        if (tableLookupCount === 2 || tableLookupCount === 3) {
          return Promise.resolve([]);
        }

        return Promise.resolve(tableNames.map((table_name) => ({ table_name })));
      }

      if (sql.includes('count(*)')) {
        return Promise.resolve([{ count: '1' }]);
      }

      return Promise.resolve([]);
    });
    flush = jest.fn().mockResolvedValue(undefined);
    incrementMetadataVersion = jest.fn().mockResolvedValue(undefined);
    getOrRecompute = jest.fn().mockResolvedValue({
      ...createEmptyAllFlatEntityMaps(),
      featureFlagsMap: {},
    });
    findByUniversalIdentifier = jest.fn().mockResolvedValue(null);
    const ownerService = new RetireLegacyBrandBrainOwnerService(
      {
        validateBuildAndRunWorkspaceMigrationFromTo: (...args: unknown[]) =>
          validateBuildAndRunWorkspaceMigrationFromTo(...args),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    preflight = jest.spyOn(ownerService, 'preflight');
    findWorkspace = jest.fn().mockResolvedValue({
      databaseSchema: 'workspace_test',
      defaultRoleId: null,
    });
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
      query,
      manager: { update, count },
    });
    validateBuildAndRunWorkspaceMigrationFromTo = jest.fn().mockResolvedValue({
      status: 'success',
    });

    loadSnapshot = jest.fn();
    command = new SynchronizeMyahStandardMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        createQueryRunner,
        getRepository: jest.fn().mockReturnValue({
          findOne: findWorkspace,
          findOneOrFail: jest.fn().mockResolvedValue({ metadataVersion: 1 }),
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
        validateBuildAndRunWorkspaceMigrationFromTo,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      ownerService,
      {
        load: loadSnapshot,
      } as unknown as PinnedWorkspaceMetadataSnapshotLoaderService,
      { publishCommittedMetadataVersion: jest.fn(), incrementMetadataVersion } as never,
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

  it('publishes a new metadata version after first-time bounded synchronization', async () => {
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

    expect(flush).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining(['flatObjectMetadataMaps', 'flatFieldMetadataMaps']),
    );
    expect(incrementMetadataVersion).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('does not publish the cache or version in a bounded dry-run', async () => {
    await command.synchronizeWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        options: { dryRun: true },
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

    expect(flush).not.toHaveBeenCalled();
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
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

  it('plans a dry-run for a soft-deleted suspended workspace with an existing schema', async () => {
    findWorkspace.mockImplementation(async ({ withDeleted }) =>
      withDeleted ? { databaseSchema: 'workspace_test' } : null,
    );

    await runOnWorkspace(true);

    expect(findWorkspace).toHaveBeenCalledWith({
      select: ['databaseSchema'],
      where: { id: WORKSPACE_ID },
      withDeleted: true,
    });
    expect(hasSchema).toHaveBeenCalledWith('workspace_test');
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, dryRun: true }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('skips workspaces without a configured database schema', async () => {
    findWorkspace.mockResolvedValue({ databaseSchema: null });

    await runOnWorkspace(true);

    expect(hasSchema).not.toHaveBeenCalled();
    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

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

  it('preserves standard-owned base and effective Dashboard ancestry in a dry-run without adopting record layouts', async () => {
    const maps = createEmptyAllFlatEntityMaps();
    const dashboard = {
      id: 'dashboard-layout-id', universalIdentifier: 'historical-dashboard-layout',
      applicationId: STANDARD_APPLICATION_ID, type: 'DASHBOARD',
    };
    const record = {
      id: 'record-layout-id', universalIdentifier: 'historical-record-layout',
      applicationId: STANDARD_APPLICATION_ID, type: 'RECORD_PAGE',
    };
    const foreignDashboard = {
      id: 'foreign-dashboard-id', universalIdentifier: 'foreign-dashboard-uid',
      applicationId: 'foreign-application-id', type: 'DASHBOARD',
    };
    const tabs = [
      { id: 'override-in-id', universalIdentifier: 'override-in-uid', applicationId: STANDARD_APPLICATION_ID,
        pageLayoutId: record.id, overrides: { pageLayoutId: dashboard.id } },
      { id: 'override-out-id', universalIdentifier: 'override-out-uid', applicationId: STANDARD_APPLICATION_ID,
        pageLayoutId: dashboard.id, overrides: { pageLayoutId: record.id } },
      { id: 'record-only-id', universalIdentifier: 'record-only-uid', applicationId: STANDARD_APPLICATION_ID,
        pageLayoutId: record.id, overrides: null },
    ];
    const widgets = tabs.map((tab) => ({
      id: `${tab.id}-widget`, universalIdentifier: `${tab.universalIdentifier}-widget`,
      applicationId: STANDARD_APPLICATION_ID, pageLayoutTabId: tab.id, overrides: null as { pageLayoutTabId: string } | null,
    }));
    const movedWidget = {
      id: 'moved-widget-id', universalIdentifier: 'moved-widget-uid',
      applicationId: STANDARD_APPLICATION_ID, pageLayoutTabId: tabs[2].id,
      overrides: { pageLayoutTabId: tabs[0].id },
    };
    const add = (flatMaps: any, entity: any) => {
      flatMaps.byUniversalIdentifier[entity.universalIdentifier] = entity;
      flatMaps.universalIdentifierById[entity.id] = entity.universalIdentifier;
    };
    for (const layout of [dashboard, record, foreignDashboard]) add(maps.flatPageLayoutMaps, layout);
    for (const tab of tabs) add(maps.flatPageLayoutTabMaps, tab);
    for (const widget of [...widgets, movedWidget]) add(maps.flatPageLayoutWidgetMaps, widget);
    const foreignTab = {
      id: 'foreign-tab-id', universalIdentifier: 'foreign-tab-uid',
      applicationId: 'foreign-application-id', pageLayoutId: foreignDashboard.id,
      overrides: null,
    };
    add(maps.flatPageLayoutTabMaps, foreignTab);
    getOrRecompute.mockResolvedValue({ ...maps, featureFlagsMap: {} });

    await runOnWorkspace(true);

    const migration = validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    expect(migration.dryRun).toBe(true);
    for (const [key, kept, excluded] of [
      ['flatPageLayoutMaps', [dashboard], [record, foreignDashboard]],
      ['flatPageLayoutTabMaps', tabs.slice(0, 2), [tabs[2], foreignTab]],
      ['flatPageLayoutWidgetMaps', [...widgets.slice(0, 2), movedWidget], widgets.slice(2)],
    ] as const) {
      for (const side of ['from', 'to'] as const) {
        const entities = migration.fromToAllFlatEntityMaps[key][side].byUniversalIdentifier;
        for (const entity of kept) expect(entities[entity.universalIdentifier]).toEqual(entity);
        for (const entity of excluded) expect(entities[entity.universalIdentifier]).toBeUndefined();
      }
    }
    expect(update).not.toHaveBeenCalled();
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
          applicationUniversalIdentifier:
            STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          inferDeletionFromMissingEntities: true,
          isSystemBuild: true,
        }),
      }),
    );
  });

  it('omits cache-derived field uniqueness from the metadata migration', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-08-14T00:00:00.000Z',
      });

    delete allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
    ];

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
        targetObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
          STANDARD_OBJECTS.workflow.universalIdentifier,
        ]),
      },
    );

    const fieldMaps =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatFieldMetadataMaps;
    const outreachCampaignUniversalIdentifier =
      STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier;

    expect(
      fieldMaps.from.byUniversalIdentifier[outreachCampaignUniversalIdentifier]
        .isUnique,
    ).toBeUndefined();
    expect(
      fieldMaps.to.byUniversalIdentifier[outreachCampaignUniversalIdentifier]
        .isUnique,
    ).toBeUndefined();
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
      desiredFields[taskTargetFields.targetCreator.universalIdentifier],
    ).toBeDefined();
    expect(
      desiredFields[noteTargetFields.targetBrandBrainPage.universalIdentifier],
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
      expect(
        desiredObjects[field.objectMetadataUniversalIdentifier],
      ).toBeDefined();

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
          desiredObjects[field.relationTargetObjectMetadataUniversalIdentifier],
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

  it('does not alter native Workflow metadata after its command has run', async () => {
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

    expect(
      desiredFields[
        STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier
      ],
    ).toBeUndefined();
    expect(
      desiredObjects[STANDARD_OBJECTS.workflow.universalIdentifier],
    ).toBeUndefined();
    expect(
      desiredViews[
        STANDARD_OBJECTS.workflow.views.allWorkflows.universalIdentifier
      ],
    ).toBeUndefined();
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

  it('runs Standard-owned 2001 under the ordered pinned transaction and defers side effects', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const manager = {
      queryRunner: null as unknown,
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    };
    const runner = { manager, isTransactionActive: true, isReleased: false };
    manager.queryRunner = runner;
    const afterCommit = jest.fn();
    loadSnapshot.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      queryRunner: runner,
      workspace: { id: WORKSPACE_ID },
      allFlatEntityMaps,
      flatApplicationMaps: {
        byId: {
          [STANDARD_APPLICATION_ID]: {
            id: STANDARD_APPLICATION_ID,
            universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          },
        },
        idByUniversalIdentifier: {
          [STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER]: STANDARD_APPLICATION_ID,
        },
      },
      featureFlagsMap: {},
    });
    getOrRecompute.mockImplementation(() => {
      throw new Error('pooled cache forbidden in ordered upgrade');
    });

    await command.runOnWorkspaceInUpgradeTransaction(
      { workspaceId: WORKSPACE_ID, options: { dryRun: false }, index: 0, total: 1 },
      runner as never,
      afterCommit,
    );

    expect(loadSnapshot).toHaveBeenCalledWith(WORKSPACE_ID, runner);
    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        pinnedSnapshot: expect.objectContaining({ allFlatEntityMaps }),
        upgradeTransaction: { queryRunner: runner, afterCommit },
        assertBeforeRun: expect.any(Function),
      }),
    );
    const pinnedTarget =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps.flatObjectMetadataMaps.to.byUniversalIdentifier;
    expect(
      pinnedTarget[MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier],
    ).toBeUndefined(); // The appended Instagram command owns this provisioning.
    const assertBeforeRun =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .assertBeforeRun;
    expect(() =>
      assertBeforeRun({
        applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        actions: [{ type: 'delete', metadataName: 'fieldMetadata' }],
      }),
    ).toThrow('Unsafe pinned 2001');
  });

  it('uses a separate 3604-only pinned projection and strict 14-action guard, leaving the 2001 path unchanged', async () => {
    const pinnedWorkspaceId = '20202020-0000-4000-8000-000000000002';
    const pinnedStandardId = '20202020-0000-4000-8000-000000000001';
    const { allFlatEntityMaps, idByUniversalIdentifierByMetadataName } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: pinnedWorkspaceId,
        twentyStandardApplicationId: pinnedStandardId,
        now: '2026-09-28T00:00:00.000Z',
      });
    const source = structuredClone(allFlatEntityMaps);
    const instagramNames = ['myahInstagramAccount', 'myahSocialConversation', 'myahSocialMessage', 'myahInstagramReplyDraft'] as const;
    const objectUids = instagramNames.map((name) => MYAH_STANDARD_OBJECTS[name].universalIdentifier);
    const fieldUids = [
      ...instagramNames.flatMap((name) => Object.values(MYAH_STANDARD_OBJECTS[name].fields).map((field) => field.universalIdentifier)),
      MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier,
      MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts.universalIdentifier,
    ];
    const indexUids = instagramNames.flatMap((name) => Object.values(MYAH_STANDARD_OBJECTS[name].indexes).map((index) => index.universalIdentifier));
    for (const uid of objectUids) {
      delete source.flatObjectMetadataMaps.byUniversalIdentifier[uid];
      delete source.flatObjectMetadataMaps.universalIdentifierById[idByUniversalIdentifierByMetadataName.objectMetadata![uid]];
    }
    for (const uid of fieldUids) {
      delete source.flatFieldMetadataMaps.byUniversalIdentifier[uid];
      delete source.flatFieldMetadataMaps.universalIdentifierById[idByUniversalIdentifierByMetadataName.fieldMetadata![uid]];
    }
    for (const uid of indexUids) {
      delete source.flatIndexMaps.byUniversalIdentifier[uid];
      delete source.flatIndexMaps.universalIdentifierById[idByUniversalIdentifierByMetadataName.index![uid]];
    }
    const manager = { queryRunner: null as unknown, getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }) };
    const runner = { manager, isTransactionActive: true, isReleased: false };
    manager.queryRunner = runner;
    const afterCommit = jest.fn();
    loadSnapshot.mockResolvedValue({
      workspaceId: pinnedWorkspaceId, queryRunner: runner, workspace: { id: pinnedWorkspaceId },
      allFlatEntityMaps: source,
      flatApplicationMaps: {
        byId: { [pinnedStandardId]: { id: pinnedStandardId, universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } },
        idByUniversalIdentifier: { [STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER]: pinnedStandardId },
      },
      featureFlagsMap: {},
    });
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValueOnce({
      status: 'success', workspaceMigration: { actions: Array(14).fill({}) },
    });
    const ids = await command.synchronizeAbsentInstagramInUpgradeTransaction(
      { workspaceId: pinnedWorkspaceId, options: { dryRun: false }, index: 0, total: 1 },
      { queryRunner: runner as never, afterCommit },
    );
    const input = validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    expect(input.pinnedSnapshot.allFlatEntityMaps).toBe(source);
    expect(input.upgradeTransaction).toEqual({ queryRunner: runner, afterCommit });
    expect(input.dryRun).toBe(false);
    expect(ids.objectMetadata).toEqual(expect.objectContaining(Object.fromEntries(objectUids.map((uid) => [uid, expect.any(String)]))));
    expect(input.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.creator.universalIdentifier].id)
      .toBe(source.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.creator.universalIdentifier]?.id);
    expect(() => input.assertBeforeRun({ applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      actions: [{ type: 'delete', metadataName: 'objectMetadata' }] })).toThrow('Unsafe pinned 3604');
    expect(getOrRecompute).not.toHaveBeenCalled();
  });

  describe('Creator import permission guard', () => {
    const creatorOptions = {
      targetObjectUniversalIdentifiers: new Set([
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      ]),
      migrateLegacyMyahApplication: false,
      preserveCreatorImportPermissions: true as const,
    };
    const secondOptions = {
      ...creatorOptions,
      explicitObsoleteUniversalIdentifiersByMetadataName: {
        viewField:
          OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
      },
    };
    const sync = (
      syncOptions: SynchronizeMyahStandardMetadataOptions = creatorOptions,
      dryRun = false,
    ) =>
      command.synchronizeWorkspace(
        { workspaceId: WORKSPACE_ID, options: { dryRun }, index: 0, total: 1 },
        syncOptions,
      );
    const fixture = () => {
      const { allFlatEntityMaps } =
        computeTwentyStandardApplicationAllFlatEntityMaps({
          workspaceId: WORKSPACE_ID,
          twentyStandardApplicationId: STANDARD_APPLICATION_ID,
          now: '2026-07-15T00:00:00.000Z',
        });
      const maps = structuredClone(allFlatEntityMaps);
      const permission = Object.values(
        maps.flatObjectPermissionMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .find(
          ({ roleUniversalIdentifier, objectMetadataUniversalIdentifier }) =>
            roleUniversalIdentifier ===
              STANDARD_ROLE.creatorOpsDefault.universalIdentifier &&
            objectMetadataUniversalIdentifier ===
              MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        );
      if (!permission)
        throw new Error('Standard Creator Ops permission fixture is missing');
      getOrRecompute.mockResolvedValue({ ...maps, featureFlagsMap: {} });
      return { maps, permission };
    };
    const nativePermissionActions = async () => {
      const calls = validateBuildAndRunWorkspaceMigrationFromTo.mock.calls;
      const input = calls[calls.length - 1]?.[0];
      if (!input) throw new Error('Expected a native planner input');
      const builder =
        new WorkspaceMigrationObjectPermissionActionsBuilderService(
          new FlatObjectPermissionValidatorService(),
        );
      Object.assign(builder, {
        logger: { perfTime: jest.fn(), perfTimeEnd: jest.fn() },
      });
      return builder.validateAndBuild({
        workspaceId: WORKSPACE_ID,
        buildOptions: input.buildOptions,
        from: input.fromToAllFlatEntityMaps.flatObjectPermissionMaps.from,
        to: input.fromToAllFlatEntityMaps.flatObjectPermissionMaps.to,
        dependencyOptimisticFlatEntityMaps: structuredClone(
          input.dependencyAllFlatEntityMaps,
        ),
        additionalCacheDataMaps: input.additionalCacheDataMaps,
      });
    };

    it('reloads complete pinned source on each pass and never reads the pooled cache or mutates the first snapshot', async () => {
      const { maps } = fixture();
      const first = structuredClone(maps);
      delete first.flatFieldMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier
      ];
      const originalFirst = structuredClone(first);
      const second = structuredClone(maps);
      const retainedUid = STANDARD_OBJECTS.noteTarget.universalIdentifier;
      const firstLabel =
        first.flatObjectMetadataMaps.byUniversalIdentifier[retainedUid]
          ?.labelSingular;
      const secondLabel = 'Changed only in the second pinned read';
      const secondRetained =
        second.flatObjectMetadataMaps.byUniversalIdentifier[retainedUid];
      if (!secondRetained)
        throw new Error('Retained object fixture is missing');
      secondRetained.labelSingular = secondLabel;
      const manager = {
        getRepository: jest.fn(),
        queryRunner: null as unknown,
      };
      const runner = { isTransactionActive: true, isReleased: false, manager };
      manager.queryRunner = runner;
      runner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
      });
      const applications = {
        byId: {
          [STANDARD_APPLICATION_ID]: {
            id: STANDARD_APPLICATION_ID,
            universalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          },
        },
        idByUniversalIdentifier: {
          [STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER]: STANDARD_APPLICATION_ID,
        },
      };
      loadSnapshot.mockResolvedValueOnce({
        workspaceId: WORKSPACE_ID,
        queryRunner: runner,
        workspace: { id: WORKSPACE_ID },
        allFlatEntityMaps: first,
        flatApplicationMaps: applications,
        featureFlagsMap: { test: false },
      });
      loadSnapshot.mockResolvedValueOnce({
        workspaceId: WORKSPACE_ID,
        queryRunner: runner,
        workspace: { id: WORKSPACE_ID },
        allFlatEntityMaps: second,
        flatApplicationMaps: applications,
        featureFlagsMap: { test: true },
      });
      const tx = {
        queryRunner: runner,
        afterCommit: jest.fn(),
      } as unknown as UpgradeWorkspaceTransaction;
      getOrRecompute.mockImplementation(() => {
        throw new Error('pooled cache forbidden');
      });
      const args = {
        workspaceId: WORKSPACE_ID,
        options: { dryRun: false },
        index: 0,
        total: 1,
      };
      await command.synchronizeCreatorImportInUpgradeTransaction(
        args,
        creatorOptions,
        tx,
      );
      await command.synchronizeCreatorImportInUpgradeTransaction(
        args,
        secondOptions,
        tx,
      );
      expect(loadSnapshot).toHaveBeenCalledTimes(2);
      expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
        expect.objectContaining({
          pinnedSnapshot: expect.objectContaining({
            allFlatEntityMaps: second,
          }),
          upgradeTransaction: tx,
          additionalCacheDataMaps: { featureFlagsMap: { test: true } },
        }),
      );
      const [firstInput, secondInput] =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls.map(
          ([input]) => input,
        );
      expect(
        firstInput.dependencyAllFlatEntityMaps.flatObjectMetadataMaps
          .byUniversalIdentifier[retainedUid].labelSingular,
      ).toBe(firstLabel);
      expect(
        secondInput.dependencyAllFlatEntityMaps.flatObjectMetadataMaps
          .byUniversalIdentifier[retainedUid].labelSingular,
      ).toBe(secondLabel);
      expect(first).toEqual(originalFirst);
      expect(getOrRecompute).not.toHaveBeenCalled();
    });

    it('uses the real scalar comparator and validator to predict a native false-to-true update in an unmarked second pass', async () => {
      const { maps, permission } = fixture();
      permission.canReadObjectRecords = false;
      permission.canUpdateObjectRecords = false;
      permission.canSoftDeleteObjectRecords = false;
      const before = structuredClone(maps);
      await command.synchronizeWorkspace(
        {
          workspaceId: WORKSPACE_ID,
          options: { dryRun: false },
          index: 0,
          total: 1,
        },
        { ...secondOptions, preserveCreatorImportPermissions: undefined },
      );
      const result = await nativePermissionActions();
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;
      expect(result.actions.update).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            universalIdentifier: permission.universalIdentifier,
            diff: expect.objectContaining({
              canReadObjectRecords: { before: false, after: true },
              canUpdateObjectRecords: { before: false, after: true },
              canSoftDeleteObjectRecords: { before: false, after: true },
            }),
          }),
        ]),
      );
      expect(maps).toEqual(before);
    });

    it.each([
      'canReadObjectRecords',
      'canUpdateObjectRecords',
      'canSoftDeleteObjectRecords',
    ] as const)(
      'rejects an installed %s DENY before the first complete-graph skip, including dry-run',
      async (key) => {
        const { maps, permission } = fixture();
        permission[key] = false;
        const before = structuredClone(maps);
        await expect(sync(creatorOptions, true)).rejects.toThrow(
          'Unsafe Creator import',
        );
        expect(
          validateBuildAndRunWorkspaceMigrationFromTo,
        ).not.toHaveBeenCalled();
        expect(maps).toEqual(before);
      },
    );

    it('rejects an installed DENY on the incomplete first pass before any runner', async () => {
      const { maps, permission } = fixture();
      permission.canReadObjectRecords = false;
      delete maps.flatFieldMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier
      ];
      await expect(sync()).rejects.toThrow('Unsafe Creator import');
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    });

    it('preserves nullable inheritance exactly rather than interpreting NULL as false', async () => {
      const { permission } = fixture();
      permission.canReadObjectRecords = null as unknown as boolean;
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    });

    it('rejects a newly observed DENY before the second native runner', async () => {
      const { permission } = fixture();
      await sync();
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
      permission.canReadObjectRecords = false;
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    });

    it('permits equal permissions and still plans the bounded second pass', async () => {
      fixture();
      await sync();
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
      await sync(secondOptions);
      expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledTimes(
        1,
      );
      const result = await nativePermissionActions();
      expect(result.status).toBe('success');
      if (result.status === 'success')
        expect(result.actions.update).toEqual([]);
    });

    it('refuses absent override with existing false-default role, owner/tuple conflicts, and role-default drift', async () => {
      const { maps, permission } = fixture();
      delete maps.flatObjectPermissionMaps.byUniversalIdentifier[
        permission.universalIdentifier
      ];
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
      maps.flatObjectPermissionMaps.byUniversalIdentifier[
        permission.universalIdentifier
      ] = permission;
      permission.roleId = '00000000-0000-4000-8000-000000000099';
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      permission.roleId =
        maps.flatRoleMaps.byUniversalIdentifier[
          STANDARD_ROLE.creatorOpsDefault.universalIdentifier
        ]!.id;
      permission.applicationId = '00000000-0000-4000-8000-000000000098';
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      permission.applicationId = STANDARD_APPLICATION_ID;
      maps.flatRoleMaps.byUniversalIdentifier[
        STANDARD_ROLE.creatorOpsDefault.universalIdentifier
      ]!.canReadAllObjectRecords = true;
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      maps.flatRoleMaps.byUniversalIdentifier[
        STANDARD_ROLE.creatorOpsDefault.universalIdentifier
      ]!.canReadAllObjectRecords = false;
      maps.flatObjectPermissionMaps.byUniversalIdentifier[
        permission.universalIdentifier
      ] = undefined;
      maps.flatObjectPermissionMaps.byUniversalIdentifier[
        '00000000-0000-4000-8000-000000000097'
      ] = {
        ...permission,
        universalIdentifier: '00000000-0000-4000-8000-000000000097',
      };
      await expect(sync(secondOptions)).rejects.toThrow(
        'Unsafe Creator import',
      );
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    });

    it('allows consistent initial Creator/role/permission provisioning without changing dependency-only permissions', async () => {
      const { maps, permission } = fixture();
      const otherPermissions = Object.values(
        maps.flatObjectPermissionMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          ({ roleUniversalIdentifier }) =>
            roleUniversalIdentifier !==
            STANDARD_ROLE.creatorOpsDefault.universalIdentifier,
        );
      for (const existing of Object.values(
        maps.flatObjectPermissionMaps.byUniversalIdentifier,
      ).filter(isDefined)) {
        if (
          existing.roleUniversalIdentifier ===
          STANDARD_ROLE.creatorOpsDefault.universalIdentifier
        ) {
          delete maps.flatObjectPermissionMaps.byUniversalIdentifier[
            existing.universalIdentifier
          ];
        }
      }
      delete maps.flatRoleMaps.byUniversalIdentifier[
        STANDARD_ROLE.creatorOpsDefault.universalIdentifier
      ];
      delete maps.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ];
      await sync(secondOptions);
      const input =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
      expect(
        input.fromToAllFlatEntityMaps.flatObjectPermissionMaps.to
          .byUniversalIdentifier[permission.universalIdentifier],
      ).toBeDefined();
      expect(
        input.fromToAllFlatEntityMaps.flatObjectPermissionMaps.from
          .byUniversalIdentifier[permission.universalIdentifier],
      ).toBeUndefined();
      expect(
        input.fromToAllFlatEntityMaps.flatObjectPermissionMaps.to
          .byUniversalIdentifier,
      ).toHaveProperty(permission.universalIdentifier);
      for (const other of otherPermissions) {
        expect(
          input.fromToAllFlatEntityMaps.flatObjectPermissionMaps.from
            .byUniversalIdentifier[other.universalIdentifier],
        ).toBeUndefined();
        expect(
          input.dependencyAllFlatEntityMaps.flatObjectPermissionMaps
            .byUniversalIdentifier[other.universalIdentifier],
        ).toEqual(other);
      }
    });

    it('rejects malformed marked target and forbidden permission obsoletes', async () => {
      fixture();
      await expect(
        sync({
          ...creatorOptions,
          targetObjectUniversalIdentifiers: new Set([
            MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
          ]),
        }),
      ).rejects.toThrow('guard options');
      await expect(
        sync({
          ...creatorOptions,
          explicitObsoleteUniversalIdentifiersByMetadataName: {
            objectPermission: new Set(['unexpected']),
          },
        }),
      ).rejects.toThrow('guard options');
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    });
  });

  describe('with a bounded Creator slice', () => {
    it('limits desired metadata to Creator while retaining CRM metadata without a legacy Myah application', async () => {
      const { allFlatEntityMaps } =
        computeTwentyStandardApplicationAllFlatEntityMaps({
          workspaceId: WORKSPACE_ID,
          twentyStandardApplicationId: STANDARD_APPLICATION_ID,
          now: '2026-07-15T00:00:00.000Z',
        });
      const templateObject = allFlatEntityMaps.flatObjectMetadataMaps
        .byUniversalIdentifier[
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
        desiredFields[
          STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier
        ],
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
            desiredObjectPermissions[permissionUniversalIdentifier] !==
            undefined,
        ),
      ).toBe(true);
      expect(
        desiredCreatorOpsRole.fieldPermissionUniversalIdentifiers.every(
          (permissionUniversalIdentifier) =>
            desiredFieldPermissions[permissionUniversalIdentifier] !==
            undefined,
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
  it('rejects an unrecognized legacy app instead of reassigning CRM metadata', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const templateObject = allFlatEntityMaps.flatObjectMetadataMaps
      .byUniversalIdentifier[
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

    await expect(runOnWorkspace()).rejects.toThrow(
      'unrecognized or mixed application owners',
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('validates a complete installed Brand Brain graph instead of skipping its owner checks', async () => {
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

    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({
        fromToAllFlatEntityMaps: expect.objectContaining({
          flatObjectMetadataMaps: expect.objectContaining({
            from: expect.objectContaining({
              byUniversalIdentifier: expect.objectContaining({
                [MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier]:
                  expect.objectContaining({
                    applicationId: STANDARD_APPLICATION_ID,
                  }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(createQueryRunner).toHaveBeenCalledTimes(1);
  });

  it('rejects a mixed-owner Brand Brain role even when every desired UID is installed', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const installed =
      allFlatEntityMaps.flatRoleMaps.byUniversalIdentifier[
        STANDARD_ROLE.brandBrainAdmin.universalIdentifier
      ];
    if (!installed) throw new Error('Brand Brain role fixture is missing');
    installed.applicationId = 'foreign-app-id';
    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });

    await expect(runOnWorkspace()).rejects.toThrow(/mixed-owner Standard role/);
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
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
          fieldMetadata: new Set([OBSOLETE_TEST_FIELD_UNIVERSAL_IDENTIFIER]),
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

  const legacyFixture = () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-07-15T00:00:00.000Z',
      });
    const legacyId = 'legacy-brand-brain-application-id';
    for (const name of [
      'brandBrainPage',
      'brandBrainLink',
      'brandBrainUpdateProposal',
    ] as const) {
      const object =
        allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS[name].universalIdentifier
        ];
      if (!object) throw new Error('Missing object fixture');
      object.applicationId = legacyId;
    }
    const currentMaps = createEmptyAllFlatEntityMaps();
    for (const name of [
      'brandBrainPage',
      'brandBrainLink',
      'brandBrainUpdateProposal',
    ] as const) {
      const uid = MYAH_STANDARD_OBJECTS[name].universalIdentifier;
      currentMaps.flatObjectMetadataMaps.byUniversalIdentifier[uid] =
        allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[uid];
    }
    getOrRecompute.mockResolvedValue({
      ...currentMaps,
      featureFlagsMap: {},
      flatApplicationMaps: {
        idByUniversalIdentifier: {
          [RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER]: legacyId,
        },
        byId: {
          [legacyId]: {
            id: legacyId,
            universalIdentifier:
              RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
          },
        },
      },
    });
    findByUniversalIdentifier.mockImplementation(
      async ({ universalIdentifier }) =>
        universalIdentifier ===
        RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER
          ? {
              id: legacyId,
              universalIdentifier:
                RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
            }
          : null,
    );
    return { allFlatEntityMaps, legacyId };
  };

  it('preflights both actual owners read-only before accepting a legacy dry-run', async () => {
    const { legacyId } = legacyFixture();
    validateBuildAndRunWorkspaceMigrationFromTo.mockImplementation(
      async ({ buildOptions }) => ({
        status: 'success',
        workspaceMigration: {
          applicationUniversalIdentifier:
            buildOptions.applicationUniversalIdentifier,
          actions: [],
        },
      }),
    );
    await runOnWorkspace(true);
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledTimes(
      2,
    );
    expect(
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0],
    ).toEqual(
      expect.objectContaining({
        dryRun: true,
        buildOptions: expect.objectContaining({
          applicationUniversalIdentifier:
            RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        }),
      }),
    );
    expect(preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        workspaceDefaultRoleId: null,
        maps: expect.objectContaining({
          flatObjectMetadataMaps: expect.anything(),
        }),
        applications: expect.objectContaining({
          byId: expect.objectContaining({ [legacyId]: expect.anything() }),
        }),
      }),
    );
    expect(
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[1][0].dryRun,
    ).toBe(true);
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        buildOptions: expect.objectContaining({
          applicationUniversalIdentifier:
            STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        }),
      }),
    );
    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects legacy mutation before any validator or transfer', async () => {
    legacyFixture();
    await expect(runOnWorkspace()).rejects.toThrow('read-only');
    expect(preflight).not.toHaveBeenCalled();
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a forged or missing old app graph without validating', async () => {
    legacyFixture();
    const cache = await getOrRecompute();
    delete cache.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier
    ];
    await expect(runOnWorkspace(true)).rejects.toThrow();
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('rejects mixed known-object ownership before standard validation', async () => {
    legacyFixture();
    const cache = await getOrRecompute();
    cache.flatObjectMetadataMaps.byUniversalIdentifier[
      MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier
    ].applicationId = STANDARD_APPLICATION_ID;
    await expect(runOnWorkspace(true)).rejects.toThrow(
      'mixed-owner known object graph',
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('rejects a failed old-owner native plan before standard validation', async () => {
    legacyFixture();
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValue({
      status: 'fail',
      report: {},
    });
    await expect(runOnWorkspace(true)).rejects.toThrow(
      'native migration validation failed',
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledTimes(
      1,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an unrelated standard deletion in the old-owner dry-run', async () => {
    legacyFixture();
    validateBuildAndRunWorkspaceMigrationFromTo.mockImplementation(
      async ({ buildOptions }) => ({
        status: 'success',
        workspaceMigration: {
          applicationUniversalIdentifier:
            buildOptions.applicationUniversalIdentifier,
          actions:
            buildOptions.applicationUniversalIdentifier ===
            STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER
              ? [
                  {
                    type: 'delete',
                    metadataName: 'pageLayout',
                    universalIdentifier: 'unrelated-layout',
                  },
                ]
              : [],
        },
      }),
    );
    await expect(runOnWorkspace(true)).rejects.toThrow('unrelated deletion');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects standard validator actions targeting old-owned metadata', async () => {
    legacyFixture();
    validateBuildAndRunWorkspaceMigrationFromTo.mockImplementation(
      async ({ buildOptions }) => ({
        status: 'success',
        workspaceMigration: {
          applicationUniversalIdentifier:
            buildOptions.applicationUniversalIdentifier,
          actions:
            buildOptions.applicationUniversalIdentifier ===
            STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER
              ? [
                  {
                    type: 'update',
                    metadataName: 'objectMetadata',
                    universalIdentifier:
                      MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
                    update: { labelSingular: 'Wrong owner' },
                  },
                ]
              : [],
        },
      }),
    );
    await expect(runOnWorkspace(true)).rejects.toThrow('standard plan');
    expect(preflight).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps Instagram adoption separate from legacy CRM replacement', async () => {
    const legacyInstagramApplicationId = 'legacy-instagram-application-id';
    const legacyBrandBrainApplicationId = 'legacy-brand-brain-application-id';
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        now: '2026-09-21T00:00:00.000Z',
      });
    const instagramObjectUniversalIdentifiers = new Set<string>([
      MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
      MYAH_STANDARD_OBJECTS.myahSocialConversation.universalIdentifier,
      MYAH_STANDARD_OBJECTS.myahSocialMessage.universalIdentifier,
      MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft.universalIdentifier,
    ]);

    for (const object of Object.values(
      allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
    )) {
      if (
        object !== undefined &&
        instagramObjectUniversalIdentifiers.has(object.universalIdentifier)
      ) {
        object.applicationId = legacyInstagramApplicationId;
      }
    }
    for (const field of Object.values(
      allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    )) {
      if (
        field !== undefined &&
        (instagramObjectUniversalIdentifiers.has(
          field.objectMetadataUniversalIdentifier,
        ) ||
          instagramObjectUniversalIdentifiers.has(
            field.relationTargetObjectMetadataUniversalIdentifier ?? '',
          ))
      ) {
        field.applicationId = legacyInstagramApplicationId;
      }
    }
    for (const index of Object.values(
      allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
    )) {
      if (
        index !== undefined &&
        instagramObjectUniversalIdentifiers.has(
          index.objectMetadataUniversalIdentifier,
        )
      ) {
        index.applicationId = legacyInstagramApplicationId;
      }
    }

    getOrRecompute.mockResolvedValue({
      ...allFlatEntityMaps,
      featureFlagsMap: {},
    });
    const originalQuery = query.getMockImplementation();
    const physicalIndexes = [
      ['_myahInstagramAccount', ['connectedAccountId']],
      ['_myahInstagramAccount', ['igUserId']],
      ['_myahInstagramAccount', ['unipileAccountId']],
      ['_myahSocialConversation', ['provider', 'instagramAccountId', 'providerConversationId']],
      ['_myahSocialMessage', ['provider', 'conversationId', 'providerMessageId']],
    ] as const;
    const indexName = (table: string, columns: readonly string[]) => {
      const hash = createHash('sha256');

      [table, ...columns, '"deletedAt" IS NULL'].forEach((part) => hash.update(part));

      return `IDX_UNIQUE_${hash.digest('hex').slice(0, 27)}`;
    };

    query.mockImplementation((sql: string, parameters?: unknown[]) => {
      if (sql.includes('FROM pg_attribute a JOIN pg_class c')) {
        return Promise.resolve([
          ...['createdBySource', 'status', 'updatedBySource'].map((column_name) => ({ table_name: '_myahInstagramAccount', column_name, type_name: `_myahInstagramAccount_${column_name}_enum` })),
          ...['createdBySource', 'lifecycle', 'provider', 'updatedBySource'].map((column_name) => ({ table_name: '_myahSocialConversation', column_name, type_name: `_myahSocialConversation_${column_name}_enum` })),
          ...['createdBySource', 'deliveryState', 'direction', 'provider', 'sentVia', 'updatedBySource'].map((column_name) => ({ table_name: '_myahSocialMessage', column_name, type_name: `_myahSocialMessage_${column_name}_enum` })),
          ...['createdBySource', 'kind', 'source', 'status', 'updatedBySource'].map((column_name) => ({ table_name: '_myahInstagramReplyDraft', column_name, type_name: `_myahInstagramReplyDraft_${column_name}_enum` })),
        ]);
      }
      if (sql.includes('FROM pg_class i JOIN pg_namespace n')) {
        return Promise.resolve(physicalIndexes.flatMap(([table, columns]) => [table, table.slice(1)].map((physicalTable) => ({
          index_name: indexName(physicalTable, columns),
          relkind: 'i',
          table_name: table,
          is_unique: true,
          predicate: '("deletedAt" IS NULL)',
          columns,
        }))));
      }

      return originalQuery?.(sql, parameters);
    });
    findByUniversalIdentifier.mockImplementation(
      ({ universalIdentifier }: { universalIdentifier: string }) => {
        if (universalIdentifier === '4738ebcd-6662-4ecc-a190-374fa0525951') {
          return { id: legacyInstagramApplicationId };
        }

        if (universalIdentifier === '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991') {
          return { id: legacyBrandBrainApplicationId };
        }

        return null;
      },
    );

    await command.synchronizeWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        options: { dryRun: false },
        index: 0,
        total: 1,
      },
      {
        targetObjectUniversalIdentifiers: instagramObjectUniversalIdentifiers,
        migrateLegacyMyahApplication: false,
        legacyInstagramApplicationUniversalIdentifier:
          '4738ebcd-6662-4ecc-a190-374fa0525951',
      } as unknown as Parameters<typeof command.synchronizeWorkspace>[1],
    );

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
    const migratedObjects =
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.from
        .byUniversalIdentifier;

    expect(migratedObjects[STANDARD_OBJECTS.person.universalIdentifier]).toBeUndefined();
    expect(migratedObjects[STANDARD_OBJECTS.company.universalIdentifier]).toBeUndefined();
    expect(migratedObjects[STANDARD_OBJECTS.opportunity.universalIdentifier]).toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        applicationId: expect.anything(),
        universalIdentifier: expect.anything(),
      }),
      { applicationId: STANDARD_APPLICATION_ID },
    );
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('DROP INDEX'))).toHaveLength(5);
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('ALTER TYPE'))).toHaveLength(18);
  });

  it('rejects non-standard Instagram ownership when the legacy application is soft-deleted', async () => {
    const originalQuery = query.getMockImplementation();

    query.mockImplementation((sql: string, parameters?: unknown[]) =>
      sql.includes('FROM core."objectMetadata"')
        ? Promise.resolve([{ applicationId: 'soft-deleted-legacy-application' }])
        : originalQuery?.(sql, parameters),
    );

    await expect(
      command.synchronizeWorkspace(
        { workspaceId: WORKSPACE_ID, options: { dryRun: false }, index: 0, total: 1 },
        {
          migrateLegacyMyahApplication: false,
          legacyInstagramApplicationUniversalIdentifier:
            '4738ebcd-6662-4ecc-a190-374fa0525951',
        },
      ),
    ).rejects.toThrow('object ownership is ambiguous or incomplete');
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
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
