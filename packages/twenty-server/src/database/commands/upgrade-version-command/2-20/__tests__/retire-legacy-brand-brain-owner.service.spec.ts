import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import {
  buildLegacyBrandBrainRetirementPlan,
  buildStandardBrandBrainRetirementPlan,
  assertStandardBrandBrainRetirementActions,
  assertStandardBrandBrainRetirementNativeActions,
  LEGACY_BRAND_BRAIN_APPLICATION_UID,
  RetireLegacyBrandBrainOwnerService,
  type LegacyBrandBrainRetirementInput,
} from 'src/database/commands/upgrade-version-command/2-20/services/retire-legacy-brand-brain-owner.service';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

const APP_ID = 'old-app';
const ROLE_UID = '8563f1a9-4e02-408a-a5d7-45f68779023a';
const uids = [
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
];

const fixture = (): LegacyBrandBrainRetirementInput => {
  const maps = createEmptyAllFlatEntityMaps();
  const add = (
    key: keyof typeof maps,
    entity: {
      id: string;
      universalIdentifier: string;
      applicationId: string;
      [key: string]: unknown;
    },
  ) => {
    // Fixture populates the three native flat-map indexes as the workspace cache does.
    const map = maps[key];
    map.byUniversalIdentifier[entity.universalIdentifier] = entity as never;
    map.universalIdentifierById[entity.id] = entity.universalIdentifier;
    map.universalIdentifiersByApplicationId[entity.applicationId] = [
      ...(map.universalIdentifiersByApplicationId[entity.applicationId] ?? []),
      entity.universalIdentifier,
    ];
  };
  uids.forEach((uid, index) =>
    add('flatObjectMetadataMaps', {
      id: `object-${index}`,
      universalIdentifier: uid,
      applicationId: APP_ID,
      isSearchable: true,
      isUIEditable: true,
      isUICreatable: true,
      isActive: true,
    }),
  );
  add('flatRoleMaps', {
    id: 'role-1',
    universalIdentifier: ROLE_UID,
    applicationId: APP_ID,
    isEditable: true,
    canBeAssignedToUsers: true,
    canBeAssignedToAgents: true,
    canBeAssignedToApiKeys: true,
    canReadAllObjectRecords: false,
    canUpdateAllObjectRecords: false,
    canSoftDeleteAllObjectRecords: false,
    canDestroyAllObjectRecords: false,
    canUpdateAllSettings: false,
    canAccessAllTools: false,
  });
  add('flatObjectPermissionMaps', {
    id: 'permission-1',
    universalIdentifier: 'permission-uid',
    applicationId: APP_ID,
    roleId: 'role-1',
    objectMetadataId: 'object-0',
    canReadObjectRecords: false,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: true,
    canDestroyObjectRecords: true,
  });
  add('flatFieldPermissionMaps', {
    id: 'field-permission-1',
    universalIdentifier: 'field-permission-uid',
    applicationId: APP_ID,
    roleId: 'role-1',
    objectMetadataId: 'object-0',
    fieldMetadataId: 'field-1',
    canReadFieldValue: false,
    canUpdateFieldValue: true,
  });
  add('flatFieldMetadataMaps', {
    id: 'field-1',
    universalIdentifier: 'field-uid',
    applicationId: APP_ID,
    objectMetadataId: 'object-0',
    name: 'restricted',
  });
  add('flatRoleTargetMaps', {
    id: 'target-1',
    universalIdentifier: 'target-uid',
    applicationId: APP_ID,
    roleId: 'role-1',
    userWorkspaceId: 'actor-1',
  });
  add('flatViewMaps', {
    id: 'view-1',
    universalIdentifier: 'view-uid',
    applicationId: APP_ID,
    objectMetadataId: 'object-0',
  });
  add('flatViewFieldMaps', {
    id: 'view-field-1',
    universalIdentifier: 'view-field-uid',
    applicationId: APP_ID,
    viewId: 'view-1',
    fieldMetadataId: 'field-1',
  });
  add('flatPageLayoutMaps', {
    id: 'layout-1',
    universalIdentifier: 'layout-uid',
    applicationId: APP_ID,
    objectMetadataId: 'object-0',
    deletedAt: null,
    defaultTabToFocusOnMobileAndSidePanelId: 'tab-1',
  });
  add('flatPageLayoutTabMaps', {
    id: 'tab-1',
    universalIdentifier: 'tab-uid',
    applicationId: APP_ID,
    pageLayoutId: 'layout-1',
    deletedAt: null,
  });
  add('flatPageLayoutWidgetMaps', {
    id: 'widget-1',
    universalIdentifier: 'widget-uid',
    applicationId: APP_ID,
    pageLayoutTabId: 'tab-1',
    objectMetadataId: 'object-0',
    deletedAt: null,
    universalConfiguration: { viewId: 'view-1' },
  });
  add('flatObjectPermissionMaps', {
    id: 'foreign-1',
    universalIdentifier: 'foreign-uid',
    applicationId: 'other-app',
    roleId: 'other-role',
    objectMetadataId: 'object-1',
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
  });
  return {
    workspaceId: 'workspace-1',
    applications: {
      idByUniversalIdentifier: { [LEGACY_BRAND_BRAIN_APPLICATION_UID]: APP_ID },
      byId: {
        [APP_ID]: {
          id: APP_ID,
          universalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
          defaultRoleId: 'role-1',
        } as never,
      },
    },
    workspaceDefaultRoleId: 'other-role',
    maps,
    additionalCacheDataMaps: { featureFlagsMap: {} } as never,
    retiredAt: new Date('2026-01-02T03:04:05.000Z'),
  };
};

describe('owner-scoped legacy Brand Brain retirement', () => {
  const standardFixture = () => {
    const input = fixture();
    for (const maps of Object.values(input.maps)) {
      for (const row of Object.values(maps.byUniversalIdentifier)) {
        if (row?.applicationId === APP_ID) row.applicationId = 'standard-app';
      }
    }
    delete input.maps.flatObjectPermissionMaps.byUniversalIdentifier[
      'foreign-uid'
    ];
    input.applications = {
      idByUniversalIdentifier: {
        [TWENTY_STANDARD_APPLICATION.universalIdentifier]: 'standard-app',
      },
      byId: {
        'standard-app': {
          id: 'standard-app',
          universalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
          defaultRoleId: 'other-role',
        } as never,
      },
    };
    return input;
  };

  const standardMigration = (
    deletedAt: string,
    plan: NonNullable<ReturnType<typeof buildStandardBrandBrainRetirementPlan>>,
  ) => {
    const objects = uids.map((universalIdentifier) => ({
      type: 'update' as const,
      metadataName: 'objectMetadata' as const,
      universalIdentifier,
      update: {
        isSearchable: false,
        isUIEditable: false,
        isUICreatable: false,
      },
    }));
    const actions = [
      ...objects,
      {
        type: 'update',
        metadataName: 'role',
        universalIdentifier: ROLE_UID,
        update: {
          isEditable: false,
          canBeAssignedToUsers: false,
          canBeAssignedToAgents: false,
          canBeAssignedToApiKeys: false,
        },
      },
      {
        type: 'update',
        metadataName: 'objectPermission',
        universalIdentifier: 'permission-uid',
        update: {
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        },
      },
      {
        type: 'update',
        metadataName: 'fieldPermission',
        universalIdentifier: 'field-permission-uid',
        update: { canUpdateFieldValue: false },
      },
      ...(['pageLayout', 'pageLayoutTab', 'pageLayoutWidget'] as const).map(
        (metadataName, index) => ({
          type: 'update',
          metadataName,
          universalIdentifier: ['layout-uid', 'tab-uid', 'widget-uid'][index],
          update: { deletedAt },
        }),
      ),
    ];
    const names: Record<string, keyof typeof plan.fromToAllFlatEntityMaps> = {
      objectMetadata: 'flatObjectMetadataMaps',
      role: 'flatRoleMaps',
      objectPermission: 'flatObjectPermissionMaps',
      fieldPermission: 'flatFieldPermissionMaps',
      pageLayout: 'flatPageLayoutMaps',
      pageLayoutTab: 'flatPageLayoutTabMaps',
      pageLayoutWidget: 'flatPageLayoutWidgetMaps',
    };
    return {
      actions: actions.map((action) => {
        const pair = plan.fromToAllFlatEntityMaps[names[action.metadataName]]!;
        const before = pair.from.byUniversalIdentifier[
          action.universalIdentifier
        ] as Record<string, unknown>;
        const flatEntity =
          pair.to.byUniversalIdentifier[action.universalIdentifier];
        return {
          ...action,
          flatEntity,
          diff: Object.fromEntries(
            Object.entries(action.update).map(([field, after]) => [
              field,
              { before: before[field], after },
            ]),
          ),
        };
      }),
      applicationUniversalIdentifier:
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
    };
  };

  const nativeRoleMigration = (
    complete: ReturnType<typeof standardMigration>,
  ) => ({
    ...complete,
    actions: complete.actions.map((action) => {
      if (action.metadataName !== 'role') return action;
      const { isEditable: _update, ...update } = action.update;
      const { isEditable: _diff, ...diff } = action.diff;
      return {
        ...action,
        update,
        diff,
        flatEntity: { ...action.flatEntity, isEditable: true },
      };
    }),
  });

  it('requires every expected Standard update exactly once and rejects action tampering', () => {
    const plan = buildStandardBrandBrainRetirementPlan(standardFixture())!;
    const migration = standardMigration('2026-01-02T03:04:05.000Z', plan);
    const { actions } = migration;
    expect(() =>
      assertStandardBrandBrainRetirementActions({
        plan,
        migration: migration as never,
        standardApplicationId: 'standard-app',
      }),
    ).not.toThrow();
    for (const invalid of [
      actions.slice(1),
      [...actions, actions[0]],
      [{ ...actions[0], update: { isUIEditable: false } }, ...actions.slice(1)],
      [
        {
          ...actions[0],
          update: { ...actions[0].update, canReadObjectRecords: true },
        },
        ...actions.slice(1),
      ],
      actions.map((action) =>
        action.metadataName === 'role'
          ? {
              ...action,
              flatEntity: { ...action.flatEntity, isEditable: true },
              diff: Object.fromEntries(
                Object.entries(action.diff).filter(
                  ([key]) => key !== 'isEditable',
                ),
              ),
              update: Object.fromEntries(
                Object.entries(action.update).filter(
                  ([key]) => key !== 'isEditable',
                ),
              ),
            }
          : action,
      ),
    ])
      expect(() =>
        assertStandardBrandBrainRetirementActions({
          plan,
          migration: { ...migration, actions: invalid } as never,
          standardApplicationId: 'standard-app',
        }),
      ).toThrow(/unsafe|action|mismatch/i);
  });

  it('executes only the pinned checked Standard plan, verifies persisted rows, and defers cache work until commit', async () => {
    const input = standardFixture();
    input.workspaceId = '11111111-1111-4111-8111-111111111111';
    let planned:
      | NonNullable<ReturnType<typeof buildStandardBrandBrainRetirementPlan>>
      | undefined;
    const callbacks: Array<() => Promise<void> | void> = [];
    const schema = getWorkspaceSchemaName(input.workspaceId);
    let lockedRoleAppId = 'standard-app';
    // TypeORM PostgresQueryRunner returns [rows, rowCount] for UPDATE RETURNING.
    let updatedRoleRows: [{ id: string }[], number] = [[{ id: 'role-1' }], 1];
    const queryRunner = {
      isTransactionActive: true,
      isReleased: false,
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM "core"."workspace"'))
          return [{ databaseSchema: schema }];
        if (sql.includes('FROM "core"."role"') && sql.includes('FOR UPDATE'))
          return [
            { id: 'role-1', applicationId: lockedRoleAppId, isEditable: true },
          ];
        if (sql.startsWith('UPDATE "core"."role"')) return updatedRoleRows;
        if (sql.includes('pg_namespace WHERE nspname'))
          return [{ exists: true }];
        if (sql.includes('array_agg'))
          return [
            'application',
            'objectMetadata',
            'fieldMetadata',
            'indexMetadata',
            'searchFieldMetadata',
            'role',
            'roleTarget',
            'objectPermission',
            'fieldPermission',
            'view',
            'viewField',
            'viewFilter',
            'viewSort',
            'viewGroup',
            'navigationMenuItem',
            'pageLayout',
            'pageLayoutTab',
            'pageLayoutWidget',
          ].map((table_name) => ({
            table_name,
            columns: [
              'id',
              'workspaceId',
              'universalIdentifier',
              'applicationId',
              'deletedAt',
              'name',
              'nameSingular',
              'namePlural',
            ],
          }));
        if (sql.includes("c.relkind IN ('r', 'p')"))
          return [
            'brandBrainPage',
            'brandBrainLink',
            'brandBrainUpdateProposal',
          ].map((relname) => ({ relname }));
        throw new Error(`unexpected SQL: ${sql}`);
      }),
      manager: {} as { queryRunner?: unknown },
    };
    queryRunner.manager.queryRunner = queryRunner;
    const source = {
      workspaceId: input.workspaceId,
      queryRunner,
      workspace: {
        id: input.workspaceId,
        defaultRoleId: input.workspaceDefaultRoleId,
      },
      allFlatEntityMaps: input.maps,
      flatApplicationMaps: input.applications,
      featureFlagsMap: {},
    };
    const load = jest.fn(async () => {
      if (!planned) return source;
      const post = structuredClone(input.maps);
      for (const [key, pair] of Object.entries(
        planned.fromToAllFlatEntityMaps,
      )) {
        if (!pair) continue;
        Object.assign(
          post[key as keyof typeof post].byUniversalIdentifier,
          structuredClone(pair.to.byUniversalIdentifier),
        );
      }
      return { ...source, allFlatEntityMaps: post };
    });
    const validateBuildAndRunWorkspaceMigrationFromTo = jest.fn(
      async (plan) => {
        planned = plan;
        return {
          status: 'success',
          workspaceMigration: nativeRoleMigration(
            standardMigration(
              plan.fromToAllFlatEntityMaps.flatPageLayoutMaps.to
                .byUniversalIdentifier['layout-uid'].deletedAt,
              plan,
            ),
          ),
        };
      },
    );
    const run = jest.fn(async () => ({
      metadataEvents: [],
      hasSchemaMetadataChanged: true,
    }));
    const flush = jest.fn(async () => undefined);
    const publishCommittedMetadataVersion = jest.fn(async () => undefined);
    const incrementMetadataVersion = jest.fn(async () => undefined);
    const emitMetadataEvents = jest.fn();
    const command = new RetireBrandBrainMetadataCommand(
      {} as never,
      {} as never,
      {} as never,
      { flush } as never,
      { validateBuildAndRunWorkspaceMigrationFromTo } as never,
      { load } as never,
      { run } as never,
      { emitMetadataEvents } as never,
      { publishCommittedMetadataVersion, incrementMetadataVersion } as never,
    );
    await command.runOnWorkspaceInUpgradeTransaction(
      { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
      queryRunner as never,
      (callback) => {
        callbacks.push(callback);
      },
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, pinnedSnapshot: source }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceMigration: expect.objectContaining({
          actions: expect.any(Array),
        }),
        pinnedSnapshot: source,
      }),
    );
    const lock = queryRunner.query.mock.calls.find(([sql]) =>
      sql.includes('FOR UPDATE'),
    );
    const write = queryRunner.query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE "core"."role"'),
    );
    expect(lock?.[1]).toEqual([input.workspaceId, ROLE_UID]);
    expect(write?.[1]).toEqual([
      input.workspaceId,
      'role-1',
      'standard-app',
      ROLE_UID,
    ]);
    expect(write?.[0]).toMatch(/"isEditable" = false.*"isEditable" = true/s);
    expect(
      queryRunner.query.mock.invocationCallOrder[
        queryRunner.query.mock.calls.indexOf(write!)
      ],
    ).toBeGreaterThan(run.mock.invocationCallOrder[0]);
    expect(flush).not.toHaveBeenCalled();
    await Promise.all(callbacks.map((callback) => callback()));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(publishCommittedMetadataVersion).toHaveBeenCalledWith(
      input.workspaceId,
    );
    expect(emitMetadataEvents).toHaveBeenCalledTimes(1);
    planned = undefined;
    callbacks.length = 0;
    run.mockClear();
    validateBuildAndRunWorkspaceMigrationFromTo.mockImplementationOnce(
      async (plan) => ({
        status: 'success',
        workspaceMigration: {
          ...standardMigration(
            plan.fromToAllFlatEntityMaps.flatPageLayoutMaps.to
              .byUniversalIdentifier['layout-uid'].deletedAt,
            plan,
          ),
          actions: [],
        },
      }),
    );
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
        queryRunner as never,
        (callback) => {
          callbacks.push(callback);
        },
      ),
    ).rejects.toThrow(/action count/);
    expect(run).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);

    planned = undefined;
    load.mockImplementationOnce(async () => source);
    load.mockImplementationOnce(async () => source); // Simulate lost native UPDATE before receipt.
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
        queryRunner as never,
        (callback) => {
          callbacks.push(callback);
        },
      ),
    ).rejects.toThrow(/postcondition/);
    expect(callbacks).toHaveLength(0);

    planned = undefined;
    load.mockImplementationOnce(async () => source);
    load.mockImplementationOnce(async () => {
      const changed = structuredClone(input.maps);
      for (const [key, pair] of Object.entries(
        planned!.fromToAllFlatEntityMaps,
      )) {
        if (pair)
          Object.assign(
            changed[key as keyof typeof changed].byUniversalIdentifier,
            structuredClone(pair.to.byUniversalIdentifier),
          );
      }
      changed.flatObjectPermissionMaps.byUniversalIdentifier[
        'permission-uid'
      ]!.canReadObjectRecords = true;
      return { ...source, allFlatEntityMaps: changed };
    });
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
        queryRunner as never,
        (callback) => {
          callbacks.push(callback);
        },
      ),
    ).rejects.toThrow(/postcondition|protected/i);
    expect(callbacks).toHaveLength(0);

    planned = undefined;
    callbacks.length = 0;
    run.mockClear();
    lockedRoleAppId = 'foreign-app';
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
        queryRunner as never,
        (callback) => {
          callbacks.push(callback);
        },
      ),
    ).rejects.toThrow(/role|owner/i);
    expect(run).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);
    planned = undefined;
    lockedRoleAppId = 'standard-app';
    updatedRoleRows = [[], 0];
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
        queryRunner as never,
        (callback) => {
          callbacks.push(callback);
        },
      ),
    ).rejects.toThrow(/role|write/i);
    expect(callbacks).toHaveLength(0);

    planned = undefined;
    callbacks.length = 0;
    updatedRoleRows = [[{ id: 'role-1' }], 1];
    run.mockResolvedValueOnce({
      metadataEvents: [],
      hasSchemaMetadataChanged: false,
    });
    await command.runOnWorkspaceInUpgradeTransaction(
      { workspaceId: input.workspaceId, options: { dryRun: false } } as never,
      queryRunner as never,
      (callback) => {
        callbacks.push(callback);
      },
    );
    expect(incrementMetadataVersion).toHaveBeenCalledWith(
      input.workspaceId,
      expect.objectContaining({ queryRunner }),
    );
    expect(callbacks).toHaveLength(2);

    flush.mockRejectedValueOnce(new Error('Redis unavailable'));
    const publishedBeforeRetry =
      publishCommittedMetadataVersion.mock.calls.length;
    await expect(
      command.reconcileCommittedUpgrade(input.workspaceId),
    ).rejects.toThrow('Redis unavailable');
    expect(publishCommittedMetadataVersion).toHaveBeenCalledTimes(
      publishedBeforeRetry,
    );
    await command.reconcileCommittedUpgrade(input.workspaceId);
    expect(publishCommittedMetadataVersion).toHaveBeenCalledTimes(
      publishedBeforeRetry + 1,
    );
  });

  it('accepts only the native role action minus its non-comparable editability delta', () => {
    const plan = buildStandardBrandBrainRetirementPlan(standardFixture())!;
    const complete = standardMigration('2026-01-02T03:04:05.000Z', plan);
    const native = nativeRoleMigration(complete);
    expect(
      assertStandardBrandBrainRetirementNativeActions({
        plan,
        migration: native as never,
        standardApplicationId: 'standard-app',
      }),
    ).toEqual({ roleId: 'role-1', makeNonEditable: true });
    expect(() =>
      assertStandardBrandBrainRetirementNativeActions({
        plan,
        migration: { ...native, actions: native.actions.slice(1) } as never,
        standardApplicationId: 'standard-app',
      }),
    ).toThrow(/action|mismatch/);
    expect(() =>
      assertStandardBrandBrainRetirementNativeActions({
        plan,
        migration: complete as never,
        standardApplicationId: 'standard-app',
      }),
    ).toThrow(/action|mismatch/);
    const alreadyRetired = standardFixture();
    alreadyRetired.maps.flatRoleMaps.byUniversalIdentifier[
      ROLE_UID
    ]!.isEditable = false;
    const retiredPlan = buildStandardBrandBrainRetirementPlan(alreadyRetired)!;
    const nativeRetired = nativeRoleMigration(
      standardMigration('2026-01-02T03:04:05.000Z', retiredPlan),
    );
    const alreadyRetiredNative = {
      ...nativeRetired,
      actions: nativeRetired.actions.map((action) =>
        action.metadataName === 'role'
          ? {
              ...action,
              flatEntity: { ...action.flatEntity, isEditable: false },
            }
          : action,
      ),
    };
    expect(
      assertStandardBrandBrainRetirementNativeActions({
        plan: retiredPlan,
        migration: alreadyRetiredNative as never,
        standardApplicationId: 'standard-app',
      }),
    ).toEqual({ roleId: 'role-1', makeNonEditable: false });
  });

  it('plans Standard-owned narrowing without changing identities or effective reads', () => {
    const input = standardFixture();
    const plan = buildStandardBrandBrainRetirementPlan(input)!;
    expect(plan.buildOptions.applicationUniversalIdentifier).toBe(
      TWENTY_STANDARD_APPLICATION.universalIdentifier,
    );
    expect(
      plan.fromToAllFlatEntityMaps.flatObjectMetadataMaps!.to
        .byUniversalIdentifier[uids[0]],
    ).toMatchObject({
      id: 'object-0',
      applicationId: 'standard-app',
      isUICreatable: false,
    });
    expect(
      plan.fromToAllFlatEntityMaps.flatObjectPermissionMaps!.to
        .byUniversalIdentifier['permission-uid'],
    ).toMatchObject({
      id: 'permission-1',
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
    });
    expect(
      plan.fromToAllFlatEntityMaps.flatFieldPermissionMaps!.to
        .byUniversalIdentifier['field-permission-uid'],
    ).toMatchObject({
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    });
    expect(
      input.maps.flatObjectPermissionMaps.byUniversalIdentifier[
        'permission-uid'
      ]?.canUpdateObjectRecords,
    ).toBe(true);
  });

  it('rejects Standard defaults, foreign grants, and shared tab override ancestry', () => {
    const defaultRole = standardFixture();
    defaultRole.applications.byId['standard-app']!.defaultRoleId = 'role-1';
    expect(() => buildStandardBrandBrainRetirementPlan(defaultRole)).toThrow(
      /default/,
    );
    const foreignGrant = standardFixture();
    foreignGrant.maps.flatObjectPermissionMaps.byUniversalIdentifier[
      'foreign-uid'
    ] = {
      id: 'foreign-1',
      universalIdentifier: 'foreign-uid',
      applicationId: 'foreign',
      roleId: 'other-role',
      objectMetadataId: 'object-0',
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
    } as never;
    expect(() => buildStandardBrandBrainRetirementPlan(foreignGrant)).toThrow(
      /foreign|unsupported/,
    );
    const sharedTab = standardFixture();
    sharedTab.maps.flatPageLayoutTabMaps.byUniversalIdentifier[
      'tab-uid'
    ]!.overrides = {
      pageLayoutId: 'other-layout',
    } as never;
    expect(() => buildStandardBrandBrainRetirementPlan(sharedTab)).toThrow(
      /override|shared/,
    );
  });
  it('projects only preserved-identity, update-only narrowing and retains dependencies and denies', () => {
    const input = fixture();
    const plan = buildLegacyBrandBrainRetirementPlan(input)!;
    expect(plan.buildOptions).toEqual({
      applicationUniversalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
      isSystemBuild: true,
      inferDeletionFromMissingEntities: {},
    });
    expect(Object.keys(plan.fromToAllFlatEntityMaps).sort()).toEqual([
      'flatFieldPermissionMaps',
      'flatObjectMetadataMaps',
      'flatObjectPermissionMaps',
      'flatPageLayoutMaps',
      'flatPageLayoutTabMaps',
      'flatPageLayoutWidgetMaps',
      'flatRoleMaps',
    ]);
    expect(
      plan.fromToAllFlatEntityMaps.flatObjectPermissionMaps!.to
        .byUniversalIdentifier['foreign-uid'],
    ).toBeUndefined();
    const permission =
      plan.fromToAllFlatEntityMaps.flatObjectPermissionMaps!.to
        .byUniversalIdentifier['permission-uid']!;
    expect(permission).toMatchObject({
      id: 'permission-1',
      applicationId: APP_ID,
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    expect(
      plan.fromToAllFlatEntityMaps.flatFieldPermissionMaps!.to
        .byUniversalIdentifier['field-permission-uid'],
    ).toMatchObject({ canReadFieldValue: false, canUpdateFieldValue: false });
    expect(
      plan.fromToAllFlatEntityMaps.flatRoleMaps!.to.byUniversalIdentifier[
        ROLE_UID
      ],
    ).toMatchObject({
      canBeAssignedToUsers: false,
      canBeAssignedToAgents: false,
      canBeAssignedToApiKeys: false,
      isEditable: false,
    });
    expect(
      plan.fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps!.to
        .byUniversalIdentifier['widget-uid'],
    ).toMatchObject({
      id: 'widget-1',
      universalConfiguration: { viewId: 'view-1' },
      deletedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(
      plan.dependencyAllFlatEntityMaps.flatFieldMetadataMaps
        .byUniversalIdentifier['field-uid'],
    ).toBeDefined();
    expect(
      input.maps.flatPageLayoutMaps.byUniversalIdentifier['layout-uid']
        ?.deletedAt,
    ).toBeNull();
  });

  it('does not fabricate absent roles or grants, and retains prior soft-delete timestamps', () => {
    const input = fixture();
    delete input.maps.flatRoleMaps.byUniversalIdentifier[ROLE_UID];
    delete input.maps.flatObjectPermissionMaps.byUniversalIdentifier[
      'permission-uid'
    ];
    delete input.maps.flatFieldPermissionMaps.byUniversalIdentifier[
      'field-permission-uid'
    ];
    input.maps.flatPageLayoutMaps.byUniversalIdentifier[
      'layout-uid'
    ]!.deletedAt = '2024-01-01T00:00:00.000Z';
    const plan = buildLegacyBrandBrainRetirementPlan(input)!;
    expect(
      Object.keys(
        plan.fromToAllFlatEntityMaps.flatRoleMaps!.to.byUniversalIdentifier,
      ),
    ).toHaveLength(0);
    expect(
      Object.keys(
        plan.fromToAllFlatEntityMaps.flatObjectPermissionMaps!.to
          .byUniversalIdentifier,
      ),
    ).toHaveLength(0);
    expect(
      plan.fromToAllFlatEntityMaps.flatPageLayoutMaps!.to.byUniversalIdentifier[
        'layout-uid'
      ]?.deletedAt,
    ).toBe('2024-01-01T00:00:00.000Z');
    input.applications = { byId: {}, idByUniversalIdentifier: {} };
    expect(() => buildLegacyBrandBrainRetirementPlan(input)).toThrow(
      'without their actual application owner',
    );
  });

  it.each([
    [
      'system owned object',
      (input: LegacyBrandBrainRetirementInput) => {
        input.maps.flatObjectMetadataMaps.byUniversalIdentifier[
          uids[0]
        ]!.isSystem = true;
      },
    ],
    [
      'foreign object',
      (input: LegacyBrandBrainRetirementInput) => {
        input.maps.flatObjectMetadataMaps.byUniversalIdentifier[
          uids[0]
        ]!.applicationId = 'other-app';
      },
    ],
    [
      'foreign grant',
      (input: LegacyBrandBrainRetirementInput) => {
        input.maps.flatObjectPermissionMaps.byUniversalIdentifier[
          'permission-uid'
        ]!.applicationId = 'other-app';
      },
    ],
    [
      'workspace default role',
      (input: LegacyBrandBrainRetirementInput) => {
        input.workspaceDefaultRoleId = 'role-1';
      },
    ],
    [
      'shared tab',
      (input: LegacyBrandBrainRetirementInput) => {
        input.maps.flatPageLayoutTabMaps.byUniversalIdentifier[
          'tab-uid'
        ]!.applicationId = 'other-app';
      },
    ],
    [
      'global grant',
      (input: LegacyBrandBrainRetirementInput) => {
        input.maps.flatRoleMaps.byUniversalIdentifier[
          ROLE_UID
        ]!.canUpdateAllObjectRecords = true;
      },
    ],
  ] as const)('fails closed on %s before validation', (_name, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() => buildLegacyBrandBrainRetirementPlan(input)).toThrow(
      'Unsafe legacy Brand Brain retirement',
    );
  });

  it('preserves retained Creator widget referencing a retained view', () => {
    const input = fixture();
    input.maps.flatViewMaps.byUniversalIdentifier['creator-view-uid'] = {
      id: 'creator-view',
      universalIdentifier: 'creator-view-uid',
      applicationId: 'other-app',
      objectMetadataId: 'creator-object',
    } as never;
    const retainedWidget = {
      id: 'creator-widget',
      universalIdentifier: 'creator-widget-uid',
      applicationId: 'other-app',
      pageLayoutTabId: 'creator-tab',
      objectMetadataId: 'creator-object',
      deletedAt: null,
      universalConfiguration: { viewUniversalIdentifier: 'creator-view-uid' },
    };
    input.maps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
      'creator-widget-uid'
    ] = retainedWidget as never;
    const plan = buildLegacyBrandBrainRetirementPlan(input)!;
    expect(
      plan.fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps!.to
        .byUniversalIdentifier['creator-widget-uid'],
    ).toBeUndefined();
    expect(retainedWidget.deletedAt).toBeNull();
  });

  it.each([
    ['viewId', { viewId: 'view-1' }],
    ['viewUniversalIdentifier', { viewUniversalIdentifier: 'view-uid' }],
  ])(
    'fails closed when a retained Creator widget references legacy %s without soft-retiring it',
    (_label, universalConfiguration) => {
      const input = fixture();
      const retainedWidget = {
        id: 'creator-widget',
        universalIdentifier: 'creator-widget-uid',
        applicationId: 'other-app',
        pageLayoutTabId: 'creator-tab',
        objectMetadataId: 'creator-object',
        deletedAt: null,
        universalConfiguration,
      };
      input.maps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        retainedWidget.universalIdentifier
      ] = retainedWidget as never;
      input.maps.flatPageLayoutWidgetMaps.universalIdentifierById[
        retainedWidget.id
      ] = retainedWidget.universalIdentifier;
      expect(() => buildLegacyBrandBrainRetirementPlan(input)).toThrow(
        'shared view dependency',
      );
      expect(retainedWidget.deletedAt).toBeNull();
    },
  );

  it('calls original validator only in dry-run and rejects unexpected actions, never writes', async () => {
    const validateBuildAndRunWorkspaceMigrationFromTo = jest
      .fn()
      .mockImplementation(async () => ({
        status: 'success',
        workspaceMigration: {
          applicationUniversalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
          actions: [
            {
              type: 'update',
              metadataName: 'objectMetadata',
              universalIdentifier: uids[0],
              update: { isUIEditable: false },
            },
          ],
        },
        hasSchemaMetadataChanged: false,
      }));
    const service = new RetireLegacyBrandBrainOwnerService(
      {
        validateBuildAndRunWorkspaceMigrationFromTo,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect((await service.preflight(fixture()))?.actions).toHaveLength(1);
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, workspaceId: 'workspace-1' }),
    );
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValueOnce({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
        actions: [
          {
            type: 'delete',
            metadataName: 'fieldMetadata',
            universalIdentifier: 'field-uid',
          },
        ],
      },
    });
    await expect(service.preflight(fixture())).rejects.toThrow(
      'unrelated or non-update action',
    );
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValueOnce({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
        actions: [
          {
            type: 'update',
            metadataName: 'objectPermission',
            universalIdentifier: 'permission-uid',
            update: { canReadObjectRecords: true },
          },
        ],
      },
    });
    await expect(service.preflight(fixture())).rejects.toThrow(
      'unrelated or non-update action',
    );
    validateBuildAndRunWorkspaceMigrationFromTo.mockResolvedValueOnce({
      status: 'fail',
      report: {},
    });
    await expect(service.preflight(fixture())).rejects.toThrow(
      'native migration validation failed',
    );
  });
});

describe('native invalidation boundary (no DB or Redis)', () => {
  it.each(['version publish', 'ORM resolver', 'FindAllViews'])(
    'propagates %s failure when full flat maps are invalidated',
    async (kind) => {
      const incrementMetadataVersion = jest.fn().mockResolvedValue(undefined);
      const invalidateAndRecompute = jest.fn().mockResolvedValue(undefined);
      const flushGraphQLOperation = jest.fn().mockResolvedValue(undefined);
      const failure = new Error(kind);
      if (kind === 'version publish')
        incrementMetadataVersion.mockRejectedValue(failure);
      if (kind === 'ORM resolver')
        invalidateAndRecompute.mockRejectedValue(failure);
      if (kind === 'FindAllViews')
        flushGraphQLOperation.mockRejectedValue(failure);
      const runner = Object.assign(
        Object.create(WorkspaceMigrationRunnerService.prototype),
        {
          flatEntityMapsCacheService: {
            invalidateFlatEntityMaps: jest.fn().mockResolvedValue(undefined),
          },
          workspaceMetadataVersionService: { incrementMetadataVersion },
          workspaceCacheStorageService: { flushGraphQLOperation },
          workspaceCacheService: { invalidateAndRecompute },
          logger: {
            perfTime: jest.fn(),
            perfTimeEnd: jest.fn(),
            error: jest.fn(),
          },
        },
      ) as WorkspaceMigrationRunnerService;
      await expect(
        runner.invalidateCache({
          workspaceId: 'workspace-1',
          allFlatEntityMapsKeys: ALL_FLAT_ENTITY_MAPS_PROPERTIES,
        }),
      ).rejects.toThrow('Failed to invalidate');
      expect(incrementMetadataVersion).toHaveBeenCalledWith('workspace-1');
      expect(flushGraphQLOperation).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'workspace-1' }),
      );
      expect(invalidateAndRecompute).toHaveBeenCalledWith('workspace-1', [
        'ORMEntityMetadatas',
        'graphQLResolverNameMap',
      ]);
    },
  );
});

describe('approved old-owner transaction and cache proof (mock boundary, not database acceptance)', () => {
  const action = {
    type: 'update',
    metadataName: 'objectMetadata',
    universalIdentifier: uids[0],
    update: { isUIEditable: false },
  };
  const response = (actions: unknown[] = [action]) => ({
    status: 'success',
    workspaceMigration: {
      applicationUniversalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
      actions,
    },
    hasSchemaMetadataChanged: false,
  });
  const setup = () => {
    const input = fixture();
    const cache = {
      ...structuredClone(input.maps),
      flatApplicationMaps: structuredClone(input.applications),
      rolesPermissions: {
        'role-1': Object.fromEntries(
          ['object-0', 'object-1', 'object-2'].map((id) => [
            id,
            {
              canReadObjectRecords: false,
              canUpdateObjectRecords: true,
              canSoftDeleteObjectRecords: true,
              canDestroyObjectRecords: true,
              restrictedFields:
                id === 'object-0'
                  ? { 'field-1': { canRead: false, canUpdate: true } }
                  : {},
            },
          ]),
        ),
      },
      userWorkspaceRoleMap: { 'actor-1': 'role-1' },
      apiKeyRoleMap: {},
      flatRoleTargetByAgentIdMaps: {},
    };
    const validator = jest.fn().mockResolvedValue(response());
    const invalidateAndRecompute = jest.fn().mockResolvedValue(undefined);
    const getOrRecompute = jest
      .fn()
      .mockImplementation(async () => structuredClone(cache));
    let version = 5;
    const findOne = jest.fn().mockImplementation(async () => ({
      defaultRoleId: 'other-role',
      metadataVersion: version,
    }));
    const invalidateCache = jest.fn().mockImplementation(async () => {
      version += 1;
    });
    const getMetadataVersion = jest
      .fn()
      .mockImplementation(async () => version);
    const coreInvalidateAndRecompute = jest.fn().mockResolvedValue(undefined);
    const coreGet = jest
      .fn()
      .mockImplementation(async () => ({ metadataVersion: version }));
    const service = new RetireLegacyBrandBrainOwnerService(
      { validateBuildAndRunWorkspaceMigrationFromTo: validator } as never,
      { invalidateAndRecompute, getOrRecompute } as never,
      { getRepository: () => ({ findOne }) } as never,
      { invalidateCache } as never,
      { getMetadataVersion } as never,
      {
        invalidateAndRecompute: coreInvalidateAndRecompute,
        get: coreGet,
      } as never,
    );
    const commit = () => {
      const plan = buildLegacyBrandBrainRetirementPlan(input)!;
      for (const [key, pair] of Object.entries(plan.fromToAllFlatEntityMaps)) {
        if (!pair) continue;
        for (const [uid, target] of Object.entries(
          pair.to.byUniversalIdentifier,
        )) {
          if (target) {
            // SAFETY: plan keys are exclusively flat-entity map keys from the fixture.
            const map = cache[key as keyof typeof input.maps] as {
              byUniversalIdentifier: Record<string, object | undefined>;
            };
            Object.assign(map.byUniversalIdentifier[uid]!, target);
          }
        }
      }
      for (const object of Object.values(cache.rolesPermissions['role-1'])) {
        object.canUpdateObjectRecords = false;
        object.canSoftDeleteObjectRecords = false;
        object.canDestroyObjectRecords = false;
        for (const field of Object.values(object.restrictedFields))
          field.canUpdate = false;
      }
    };
    return {
      input,
      cache,
      service,
      validator,
      getOrRecompute,
      invalidateAndRecompute,
      invalidateCache,
      getMetadataVersion,
      coreInvalidateAndRecompute,
      coreGet,
      findOne,
      commit,
    };
  };

  it('keeps approval and pristine read proofs independent of native mutations in both phases', async () => {
    const f = setup();
    const original = structuredClone({
      maps: f.input.maps,
      applications: f.input.applications,
      workspaceDefaultRoleId: f.input.workspaceDefaultRoleId,
      additionalCacheDataMaps: f.input.additionalCacheDataMaps,
    });
    const mutateNativeArgs = (
      args: Parameters<typeof buildLegacyBrandBrainRetirementPlan>[0] & {
        dependencyAllFlatEntityMaps: LegacyBrandBrainRetirementInput['maps'];
        fromToAllFlatEntityMaps: NonNullable<
          ReturnType<typeof buildLegacyBrandBrainRetirementPlan>
        >['fromToAllFlatEntityMaps'];
      },
    ) => {
      args.dependencyAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        uids[0]
      ]!.isUIEditable = false;
      args.dependencyAllFlatEntityMaps.flatRoleMaps.byUniversalIdentifier[
        ROLE_UID
      ]!.canBeAssignedToUsers = false;
      args.dependencyAllFlatEntityMaps.flatObjectPermissionMaps.byUniversalIdentifier[
        'permission-uid'
      ]!.canUpdateObjectRecords = false;
      args.dependencyAllFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier[
        'layout-uid'
      ]!.deletedAt = f.input.retiredAt.toISOString();
      args.dependencyAllFlatEntityMaps.flatRoleTargetMaps.byUniversalIdentifier[
        'target-uid'
      ]!.roleId = 'other-role';
      Object.assign(args.additionalCacheDataMaps.featureFlagsMap, {
        nativeMutation: true,
      });
      args.fromToAllFlatEntityMaps.flatObjectMetadataMaps!.from.byUniversalIdentifier[
        uids[0]
      ]!.isUIEditable = false;
      args.fromToAllFlatEntityMaps.flatObjectMetadataMaps!.to.byUniversalIdentifier[
        uids[0]
      ]!.isUICreatable = true;
    };
    f.validator.mockImplementation(async (args) => {
      mutateNativeArgs(args);
      if (!args.dryRun) f.commit();
      return response();
    });
    const approved = (await f.service.preflight(f.input))!;
    expect({
      maps: f.input.maps,
      applications: f.input.applications,
      workspaceDefaultRoleId: f.input.workspaceDefaultRoleId,
      additionalCacheDataMaps: f.input.additionalCacheDataMaps,
    }).toEqual(original);
    const stableApproval = structuredClone(approved);
    await f.service.applyApprovedOwnerPlan({ input: f.input, approved });
    expect(approved).toEqual(stableApproval);
    expect({
      maps: f.input.maps,
      applications: f.input.applications,
      workspaceDefaultRoleId: f.input.workspaceDefaultRoleId,
      additionalCacheDataMaps: f.input.additionalCacheDataMaps,
    }).toEqual(original);
    expect(f.validator.mock.calls.some(([args]) => args.dryRun === false)).toBe(
      true,
    );
    expect(
      f.cache.flatRoleMaps.byUniversalIdentifier[ROLE_UID]!
        .canBeAssignedToUsers,
    ).toBe(false);
  });

  it('rejects an incomplete core workspace schema before native writes or cache epochs', async () => {
    const f = setup();
    const approved = (await f.service.preflight(f.input))!;
    f.findOne.mockImplementation(async ({ select }: { select?: string[] }) => {
      if (select) return { defaultRoleId: 'other-role', metadataVersion: 5 };
      throw new Error(
        'column WorkspaceEntity.campaignCapacityTimeZone does not exist',
      );
    });

    await expect(
      f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'core workspace read failed before writes (verify current schema)',
      ),
      cause: expect.objectContaining({
        message:
          'column WorkspaceEntity.campaignCapacityTimeZone does not exist',
      }),
    });
    expect(f.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: f.input.workspaceId },
        withDeleted: true,
      }),
    );
    expect(f.findOne.mock.calls.some(([options]) => !options.select)).toBe(
      true,
    );
    expect(f.validator.mock.calls.every(([plan]) => plan.dryRun === true)).toBe(
      true,
    );
    expect(f.invalidateCache).not.toHaveBeenCalled();
    expect(f.invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('rejects forged approval and changed persisted identity before a write', async () => {
    const f = setup();
    const approved = (await f.service.preflight(f.input))!;
    await expect(
      f.service.applyApprovedOwnerPlan({
        input: f.input,
        approved: { ...approved, fingerprint: 'wrong' },
      }),
    ).rejects.toThrow('preflight');
    f.cache.flatObjectMetadataMaps.byUniversalIdentifier[
      uids[0]
    ]!.applicationId = 'other-app';
    await expect(
      f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
    ).rejects.toThrow('differs from approved');
    expect(f.validator.mock.calls.every(([args]) => args.dryRun === true)).toBe(
      true,
    );
  });

  it.each(['fail', 'throw'])(
    'propagates native %s without claiming completion',
    async (kind) => {
      const f = setup();
      const approved = (await f.service.preflight(f.input))!;
      f.validator.mockImplementation(async (args) => {
        if (args.dryRun) return response();
        if (kind === 'throw') throw new Error('native runner threw');
        return { status: 'fail' };
      });
      await expect(
        f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
      ).rejects.toThrow();
      expect(
        f.validator.mock.calls.some(([args]) => args.dryRun === false),
      ).toBe(true);
    },
  );

  it('rejects native action drift and effective-cache drift even when native reports success', async () => {
    const f = setup();
    const approved = (await f.service.preflight(f.input))!;
    f.validator.mockImplementation(async (args) => {
      if (args.dryRun) return response();
      f.commit();
      return response([{ ...action, update: { isUICreatable: false } }]);
    });
    await expect(
      f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
    ).rejects.toThrow('execution result differs');

    const afterCommitInput = { ...f.input, maps: structuredClone(f.cache) };
    const afterCommitApproval = (await f.service.preflight(afterCommitInput))!;
    f.validator.mockImplementation(async () => response([]));
    f.getOrRecompute.mockImplementationOnce(async () =>
      structuredClone(f.cache),
    );
    f.getOrRecompute.mockImplementationOnce(async () => {
      const stale = structuredClone(f.cache);
      stale.rolesPermissions['role-1']['object-0'].canUpdateObjectRecords =
        true;
      return stale;
    });
    await expect(
      f.service.applyApprovedOwnerPlan({
        input: afterCommitInput,
        approved: { ...afterCommitApproval, actions: [] },
      }),
    ).rejects.toThrow('effective role retains object writes');
  });

  it('fails on cache refresh error after a committed owner plan', async () => {
    const f = setup();
    const approved = (await f.service.preflight(f.input))!;
    f.validator.mockImplementation(async (args) => {
      if (!args.dryRun) f.commit();
      return response();
    });
    f.invalidateAndRecompute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('post-commit cache failed'));
    await expect(
      f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
    ).rejects.toThrow('post-commit cache failed');
    expect(
      f.cache.flatRoleMaps.byUniversalIdentifier[ROLE_UID]!
        .canBeAssignedToUsers,
    ).toBe(false);
  });

  it.each(['native version publication', 'ORM resolver', 'FindAllViews'])(
    'blocks completion when %s native invalidation fails',
    async (failure) => {
      const f = setup();
      const approved = (await f.service.preflight(f.input))!;
      f.validator.mockImplementation(async (args) => {
        if (!args.dryRun) f.commit();
        return response();
      });
      f.invalidateCache.mockRejectedValueOnce(new Error(failure));
      await expect(
        f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
      ).rejects.toThrow(failure);
      expect(
        f.cache.flatRoleMaps.byUniversalIdentifier[ROLE_UID]!
          .canBeAssignedToUsers,
      ).toBe(false);
    },
  );

  it.each(['redis', 'core refresh', 'core version', 'unchanged epoch'])(
    'fails closed on %s proof failure',
    async (failure) => {
      const f = setup();
      const approved = (await f.service.preflight(f.input))!;
      f.validator.mockImplementation(async (args) => {
        if (!args.dryRun) f.commit();
        return response();
      });
      if (failure === 'redis') f.getMetadataVersion.mockResolvedValue(0);
      if (failure === 'core refresh')
        f.coreInvalidateAndRecompute.mockRejectedValue(
          new Error('core refresh'),
        );
      if (failure === 'core version')
        f.coreGet.mockResolvedValue({ metadataVersion: 0 });
      if (failure === 'unchanged epoch')
        f.invalidateCache.mockResolvedValue(undefined);
      await expect(
        f.service.applyApprovedOwnerPlan({ input: f.input, approved }),
      ).rejects.toThrow();
    },
  );

  it('proves recomputed effective role, reads, target and layout after commit; retries with no native actions', async () => {
    const f = setup();
    const approved = (await f.service.preflight(f.input))!;
    f.validator.mockImplementation(async (args) => {
      if (!args.dryRun) f.commit();
      return response();
    });
    await f.service.applyApprovedOwnerPlan({ input: f.input, approved });
    expect(
      f.cache.flatPageLayoutMaps.byUniversalIdentifier['layout-uid']?.deletedAt,
    ).toBe(f.input.retiredAt.toISOString());
    expect(
      f.cache.rolesPermissions['role-1']['object-0'].canReadObjectRecords,
    ).toBe(false);
    const retryInput = {
      ...f.input,
      maps: structuredClone(f.cache),
      applications: structuredClone(f.cache.flatApplicationMaps),
    };
    const retryApproval = (await f.service.preflight(retryInput))!;
    f.validator.mockImplementation(async () => response([]));
    const priorCalls = f.validator.mock.calls.length;
    await f.service.applyApprovedOwnerPlan({
      input: retryInput,
      approved: { ...retryApproval, actions: [] },
    });
    expect(
      f.validator.mock.calls
        .slice(priorCalls)
        .every(([args]) => args.dryRun === true),
    ).toBe(true);
    expect(f.invalidateAndRecompute).toHaveBeenCalledTimes(4);
    expect(f.invalidateCache).toHaveBeenCalledTimes(2);
    expect(f.invalidateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        allFlatEntityMapsKeys: expect.arrayContaining([
          'flatObjectMetadataMaps',
          'flatFieldMetadataMaps',
          'flatViewMaps',
          'flatRoleMaps',
        ]),
      }),
    );
    expect(f.coreInvalidateAndRecompute).toHaveBeenCalledWith(
      'workspaceEntity',
      'workspace-1',
    );
    expect(f.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: ['metadataVersion'],
        withDeleted: true,
      }),
    );
  });
});
