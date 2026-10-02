import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

import { type FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { type WorkspaceCacheKeyName } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type WorkspaceMigrationBuilderAdditionalCacheDataMaps } from 'src/engine/workspace-manager/workspace-migration/types/workspace-migration-builder-additional-cache-data-maps.type';
import { type FromToAllUniversalFlatEntityMaps } from 'src/engine/workspace-manager/workspace-migration/types/workspace-migration-orchestrator.type';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

export const LEGACY_BRAND_BRAIN_APPLICATION_UID =
  '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991';
const LEGACY_BRAND_BRAIN_ROLE_UID = '8563f1a9-4e02-408a-a5d7-45f68779023a';
const OBJECT_UIDS = new Set<string>([
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
]);

export type LegacyBrandBrainRetirementInput = {
  workspaceId: string;
  applications: FlatApplicationCacheMaps;
  workspaceDefaultRoleId: string | null;
  maps: AllFlatEntityMaps;
  additionalCacheDataMaps: WorkspaceMigrationBuilderAdditionalCacheDataMaps;
  retiredAt: Date;
};

const entities = <T extends SyncableFlatEntity>(maps: FlatEntityMaps<T>): T[] =>
  Object.values(maps.byUniversalIdentifier).filter(
    (entity): entity is T => entity !== undefined,
  );

const pair = <T extends SyncableFlatEntity>(from: T[], to: T[]) => {
  const collect = (rows: T[]) =>
    rows.reduce<FlatEntityMaps<T>>(
      (maps, flatEntity) =>
        addFlatEntityToFlatEntityMapsOrThrow({
          flatEntityMaps: maps,
          flatEntity,
        }),
      createEmptyFlatEntityMaps(),
    );

  return { from: collect(from), to: collect(to) };
};

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : item,
  );

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');

const PROOF_KEYS = [
  'flatApplicationMaps',
  'flatObjectMetadataMaps',
  'flatRoleMaps',
  'flatRoleTargetMaps',
  'flatObjectPermissionMaps',
  'flatFieldPermissionMaps',
  'flatPageLayoutMaps',
  'flatPageLayoutTabMaps',
  'flatPageLayoutWidgetMaps',
  'rolesPermissions',
  'userWorkspaceRoleMap',
  'apiKeyRoleMap',
  'flatRoleTargetByAgentIdMaps',
] as const satisfies readonly WorkspaceCacheKeyName[];

const protectedSnapshot = (input: LegacyBrandBrainRetirementInput) => ({
  workspaceId: input.workspaceId,
  workspaceDefaultRoleId: input.workspaceDefaultRoleId,
  applications: input.applications,
  // Include the entire dependency graph so a changed foreign owner or shared edge
  // cannot be accepted under an old approval.
  maps: input.maps,
});

const reject = (reason: string): never => {
  throw new Error(`Unsafe legacy Brand Brain retirement: ${reason}`);
};

/** Produces only existing-owner updates. All unselected metadata remains a validator dependency. */
const buildBrandBrainRetirementPlanForOwner = (
  {
    applications,
    workspaceDefaultRoleId,
    maps,
    additionalCacheDataMaps,
    retiredAt,
    workspaceId,
  }: LegacyBrandBrainRetirementInput,
  ownerUid: string,
  standardOwned: boolean,
) => {
  const appId = applications.idByUniversalIdentifier[ownerUid];
  const app = appId && applications.byId[appId];
  const objects = entities(maps.flatObjectMetadataMaps).filter((object) =>
    OBJECT_UIDS.has(object.universalIdentifier),
  );

  if (!app || app.universalIdentifier !== ownerUid || app.id !== appId) {
    if (objects.length > 0)
      reject('known objects exist without their actual application owner');
    return null;
  }
  if (
    objects.length !== OBJECT_UIDS.size ||
    objects.some((object) => object.applicationId !== appId)
  ) {
    reject('incomplete or mixed-owner known object graph');
  }
  if (objects.some((object) => object.isSystem === true))
    reject('system-owned known object cannot be retired');
  const objectIds = new Set(objects.map((object) => object.id));
  const role =
    maps.flatRoleMaps.byUniversalIdentifier[LEGACY_BRAND_BRAIN_ROLE_UID];

  if (standardOwned && !role) reject('incomplete Standard role');
  if (role && role.applicationId !== appId)
    reject('known role has a foreign owner');
  if (role && workspaceDefaultRoleId === role.id)
    reject('legacy role is workspace default');
  if (
    role &&
    Object.values(applications.byId).some(
      (candidate) =>
        candidate &&
        (standardOwned || candidate.id !== appId) &&
        candidate.defaultRoleId === role.id,
    )
  ) {
    reject('legacy role is an active application default');
  }
  if (
    role &&
    (role.canUpdateAllObjectRecords ||
      role.canSoftDeleteAllObjectRecords ||
      role.canDestroyAllObjectRecords ||
      role.canUpdateAllSettings ||
      role.canAccessAllTools)
  ) {
    reject('legacy role has unsupported global grants');
  }
  if (standardOwned) {
    const objectGrants = entities(maps.flatObjectPermissionMaps).filter(
      (permission) => objectIds.has(permission.objectMetadataId),
    );
    const fieldGrants = entities(maps.flatFieldPermissionMaps).filter(
      (permission) => objectIds.has(permission.objectMetadataId),
    );
    if (
      [...objectGrants, ...fieldGrants].some(
        (permission) =>
          permission.applicationId !== appId || permission.roleId !== role?.id,
      )
    )
      reject('foreign or unsupported Standard grant on Brand Brain');
  }
  const permissions = entities(maps.flatObjectPermissionMaps).filter(
    (permission) =>
      objectIds.has(permission.objectMetadataId) &&
      role?.id === permission.roleId,
  );
  const fieldPermissions = entities(maps.flatFieldPermissionMaps).filter(
    (permission) =>
      objectIds.has(permission.objectMetadataId) &&
      role?.id === permission.roleId,
  );
  if (
    [...permissions, ...fieldPermissions].some(
      (permission) => permission.applicationId !== appId,
    )
  ) {
    reject('legacy role permission has a foreign owner');
  }
  if (
    entities(maps.flatObjectPermissionMaps).some(
      (permission) =>
        permission.roleId === role?.id &&
        !objectIds.has(permission.objectMetadataId) &&
        (permission.canUpdateObjectRecords ||
          permission.canSoftDeleteObjectRecords ||
          permission.canDestroyObjectRecords),
    )
  ) {
    reject('legacy role has unrelated object write grants');
  }
  if (
    entities(maps.flatFieldPermissionMaps).some(
      (permission) =>
        permission.roleId === role?.id &&
        !objectIds.has(permission.objectMetadataId) &&
        permission.canUpdateFieldValue,
    )
  ) {
    reject('legacy role has unrelated field write grants');
  }
  if (
    entities(maps.flatRolePermissionFlagMaps).some(
      (flag) => flag.roleId === role?.id,
    )
  ) {
    reject('legacy role has unsupported custom grants');
  }
  if (
    !role &&
    [
      ...entities(maps.flatObjectPermissionMaps),
      ...entities(maps.flatFieldPermissionMaps),
    ].some(
      (permission) =>
        objectIds.has(permission.objectMetadataId) &&
        permission.applicationId === appId,
    )
  ) {
    reject('legacy grants exist without known role');
  }

  const layouts = entities(maps.flatPageLayoutMaps).filter(
    (layout) =>
      layout.objectMetadataId && objectIds.has(layout.objectMetadataId),
  );
  const layoutIds = new Set(layouts.map((layout) => layout.id));
  const tabs = entities(maps.flatPageLayoutTabMaps).filter((tab) =>
    layoutIds.has(tab.pageLayoutId),
  );
  const tabIds = new Set(tabs.map((tab) => tab.id));
  if (
    standardOwned &&
    entities(maps.flatPageLayoutTabMaps).some((tab) => {
      const overrideLayout =
        tab.overrides && typeof tab.overrides === 'object'
          ? (tab.overrides as { pageLayoutId?: string }).pageLayoutId
          : undefined;
      return (
        (tabIds.has(tab.id) &&
          overrideLayout &&
          !layoutIds.has(overrideLayout)) ||
        (!tabIds.has(tab.id) && overrideLayout && layoutIds.has(overrideLayout))
      );
    })
  )
    reject('shared tab override ancestry');
  const widgets = entities(maps.flatPageLayoutWidgetMaps).filter((widget) =>
    tabIds.has(widget.pageLayoutTabId),
  );
  if (
    [...layouts, ...tabs, ...widgets].some(
      (entity) => entity.applicationId !== appId,
    )
  ) {
    reject('shared or foreign-owned presentation ancestry');
  }
  if (
    widgets.some((widget) => {
      const overrideTab =
        widget.overrides && typeof widget.overrides === 'object'
          ? (widget.overrides as { pageLayoutTabId?: string }).pageLayoutTabId
          : undefined;
      return overrideTab && !tabIds.has(overrideTab);
    })
  )
    reject('legacy widget overrides retained tab');
  if (
    entities(maps.flatPageLayoutWidgetMaps).some((widget) => {
      const overrideTab =
        widget.overrides && typeof widget.overrides === 'object'
          ? (widget.overrides as { pageLayoutTabId?: string }).pageLayoutTabId
          : undefined;
      return (
        overrideTab &&
        tabIds.has(overrideTab) &&
        !tabIds.has(widget.pageLayoutTabId)
      );
    })
  )
    reject('shared widget override ancestry');
  if (
    widgets.some(
      (widget) =>
        widget.objectMetadataId && !objectIds.has(widget.objectMetadataId),
    )
  ) {
    reject('layout contains a retained-object widget');
  }
  if (
    entities(maps.flatPageLayoutWidgetMaps).some(
      (widget) =>
        !tabIds.has(widget.pageLayoutTabId) &&
        widget.objectMetadataId &&
        objectIds.has(widget.objectMetadataId),
    )
  ) {
    reject('retained layout contains legacy-object widget');
  }
  if (
    entities(maps.flatPageLayoutMaps).some(
      (layout) =>
        !layoutIds.has(layout.id) &&
        layout.defaultTabToFocusOnMobileAndSidePanelId &&
        tabIds.has(layout.defaultTabToFocusOnMobileAndSidePanelId),
    )
  ) {
    reject('shared default tab');
  }
  const brainViews = entities(maps.flatViewMaps).filter((view) =>
    objectIds.has(view.objectMetadataId),
  );
  const viewIds = new Set(brainViews.map((view) => view.id));
  const viewUids = new Set(brainViews.map((view) => view.universalIdentifier));
  const viewReferences = (widget: (typeof widgets)[number]) => {
    const configuration = widget.universalConfiguration;
    if (!configuration || typeof configuration !== 'object') return [];
    const reference = configuration as {
      viewId?: string;
      viewUniversalIdentifier?: string;
    };
    return [reference.viewId, reference.viewUniversalIdentifier].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  };
  if (
    widgets.some((widget) =>
      viewReferences(widget).some(
        (reference) => !viewIds.has(reference) && !viewUids.has(reference),
      ),
    ) ||
    entities(maps.flatPageLayoutWidgetMaps).some(
      (widget) =>
        !tabIds.has(widget.pageLayoutTabId) &&
        viewReferences(widget).some(
          (reference) => viewIds.has(reference) || viewUids.has(reference),
        ),
    )
  ) {
    reject('layout has shared view dependency');
  }
  const retirementDate = new Date(retiredAt);
  if (Number.isNaN(retirementDate.getTime()))
    reject('invalid retirement timestamp');
  const softRetire = <T extends { deletedAt: string | null }>(
    entity: T,
  ): T => ({
    ...entity,
    deletedAt: entity.deletedAt ?? retirementDate.toISOString(),
  });
  const fromToAllFlatEntityMaps: FromToAllUniversalFlatEntityMaps = {
    flatObjectMetadataMaps: pair(
      objects,
      objects.map((object) => ({
        ...object,
        isSearchable: false,
        isUIEditable: false,
        isUICreatable: false,
      })),
    ),
    flatRoleMaps: pair(
      role ? [role] : [],
      role
        ? [
            {
              ...role,
              isEditable: false,
              canBeAssignedToUsers: false,
              canBeAssignedToAgents: false,
              canBeAssignedToApiKeys: false,
            },
          ]
        : [],
    ),
    flatObjectPermissionMaps: pair(
      permissions,
      permissions.map((permission) => ({
        ...permission,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      })),
    ),
    flatFieldPermissionMaps: pair(
      fieldPermissions,
      fieldPermissions.map((permission) => ({
        ...permission,
        canUpdateFieldValue: false,
      })),
    ),
    flatPageLayoutMaps: pair(layouts, layouts.map(softRetire)),
    flatPageLayoutTabMaps: pair(tabs, tabs.map(softRetire)),
    flatPageLayoutWidgetMaps: pair(widgets, widgets.map(softRetire)),
  };

  return {
    workspaceId,
    // Native InferDeletionFromMissingEntities accepts {} (all false), not the scalar false.
    buildOptions: {
      applicationUniversalIdentifier: ownerUid,
      inferDeletionFromMissingEntities: {},
      isSystemBuild: true,
    },
    fromToAllFlatEntityMaps,
    dependencyAllFlatEntityMaps: maps,
    additionalCacheDataMaps,
    dryRun: true as const,
  };
};

export const buildLegacyBrandBrainRetirementPlan = (
  input: LegacyBrandBrainRetirementInput,
) =>
  buildBrandBrainRetirementPlanForOwner(
    input,
    LEGACY_BRAND_BRAIN_APPLICATION_UID,
    false,
  );

export const buildStandardBrandBrainRetirementPlan = (
  input: LegacyBrandBrainRetirementInput,
) =>
  buildBrandBrainRetirementPlanForOwner(
    input,
    TWENTY_STANDARD_APPLICATION.universalIdentifier,
    true,
  );

// Compare the complete expected delta, not merely permissible row names/keys.
// A missing update is as unsafe as an unexpected create, delete or read grant.
export const assertStandardBrandBrainRetirementActions = ({
  plan,
  migration,
  standardApplicationId,
}: {
  plan: NonNullable<ReturnType<typeof buildStandardBrandBrainRetirementPlan>>;
  migration: WorkspaceMigration;
  standardApplicationId: string;
}): void => {
  const permitted = {
    objectMetadata: [
      'flatObjectMetadataMaps',
      ['isSearchable', 'isUIEditable', 'isUICreatable'],
    ],
    role: [
      'flatRoleMaps',
      [
        'isEditable',
        'canBeAssignedToUsers',
        'canBeAssignedToAgents',
        'canBeAssignedToApiKeys',
      ],
    ],
    objectPermission: [
      'flatObjectPermissionMaps',
      [
        'canUpdateObjectRecords',
        'canSoftDeleteObjectRecords',
        'canDestroyObjectRecords',
      ],
    ],
    fieldPermission: ['flatFieldPermissionMaps', ['canUpdateFieldValue']],
    pageLayout: ['flatPageLayoutMaps', ['deletedAt']],
    pageLayoutTab: ['flatPageLayoutTabMaps', ['deletedAt']],
    pageLayoutWidget: ['flatPageLayoutWidgetMaps', ['deletedAt']],
  } as const;
  const expected = new Map<string, Record<string, unknown>>();
  for (const [name, [mapName, keys]] of Object.entries(permitted)) {
    const pair =
      plan.fromToAllFlatEntityMaps[mapName] ??
      reject(`missing Standard retirement ${name} map`);
    // Each selected native map has the same UID index and existing-row identity.
    const from = pair.from.byUniversalIdentifier as Record<
      string,
      Record<string, unknown>
    >;
    const to = pair.to.byUniversalIdentifier as Record<
      string,
      Record<string, unknown>
    >;
    if (Object.keys(from).length !== Object.keys(to).length)
      reject(`Standard retirement ${name} identity mismatch`);
    for (const [uid, before] of Object.entries(from)) {
      const after = to[uid];
      if (
        !after ||
        before.applicationId !== standardApplicationId ||
        before.id !== after.id ||
        before.universalIdentifier !== after.universalIdentifier ||
        after.applicationId !== standardApplicationId
      )
        reject(`Standard retirement ${name} owner or identity mismatch`);
      const update: Record<string, unknown> = {};
      for (const key of keys)
        if (canonical(before[key]) !== canonical(after[key]))
          update[key] = after[key];
      if (canonical({ ...before, ...update }) !== canonical(after))
        reject(`Standard retirement ${name} changed a protected value`);
      if (Object.keys(update).length) expected.set(`${name}:${uid}`, update);
    }
  }
  if (
    migration.applicationUniversalIdentifier !==
      TWENTY_STANDARD_APPLICATION.universalIdentifier ||
    migration.actions.length !== expected.size
  )
    reject('Standard retirement action count or owner mismatch');
  const seen = new Set<string>();
  for (const action of migration.actions) {
    if (
      action.type !== 'update' ||
      Object.keys(action).sort().join(',') !==
        'diff,flatEntity,metadataName,type,universalIdentifier,update'
    )
      reject('Standard retirement includes a non-update or auxiliary action');
    const changed = action as {
      metadataName: string;
      universalIdentifier: string;
      update: Record<string, unknown>;
      flatEntity: unknown;
      diff: unknown;
    };
    const key = `${changed.metadataName}:${changed.universalIdentifier}`;
    const allowed = permitted[changed.metadataName as keyof typeof permitted];
    const pair = allowed && plan.fromToAllFlatEntityMaps[allowed[0]];
    const before = pair?.from.byUniversalIdentifier[
      changed.universalIdentifier
    ] as Record<string, unknown> | undefined;
    const after = pair?.to.byUniversalIdentifier[changed.universalIdentifier];
    if (
      seen.has(key) ||
      !expected.has(key) ||
      !before ||
      !after ||
      canonical(changed.update) !== canonical(expected.get(key)) ||
      canonical(changed.flatEntity) !== canonical(after) ||
      canonical(changed.diff) !==
        canonical(
          Object.fromEntries(
            Object.entries(changed.update).map(([field, value]) => [
              field,
              { before: before[field], after: value },
            ]),
          ),
        )
    )
      reject('Standard retirement action or native diff mismatch');
    seen.add(key);
  }
};

// The native role builder/runner intentionally exclude isEditable. Validate
// exactly the native-comparable delta; 0410 writes this one pinned field itself.
export const assertStandardBrandBrainRetirementNativeActions = ({
  plan,
  migration,
  standardApplicationId,
}: {
  plan: NonNullable<ReturnType<typeof buildStandardBrandBrainRetirementPlan>>;
  migration: WorkspaceMigration;
  standardApplicationId: string;
}): { roleId: string; makeNonEditable: boolean } => {
  const roles =
    plan.fromToAllFlatEntityMaps.flatRoleMaps ??
    reject('missing Standard role plan');
  const before =
    roles.from.byUniversalIdentifier[LEGACY_BRAND_BRAIN_ROLE_UID] ??
    reject('missing Standard role');
  const after =
    roles.to.byUniversalIdentifier[LEGACY_BRAND_BRAIN_ROLE_UID] ??
    reject('missing Standard role target');
  const roleId = 'id' in before ? before.id : undefined;
  if (typeof roleId !== 'string')
    return reject('Standard role identity mismatch');
  if (
    !('applicationId' in before) ||
    before.applicationId !== standardApplicationId ||
    !('id' in after) ||
    after.id !== roleId ||
    !('applicationId' in after) ||
    after.applicationId !== standardApplicationId ||
    typeof before.isEditable !== 'boolean' ||
    after.isEditable !== false
  )
    return reject('Standard role owner or editability mismatch');
  const nativePlan = {
    ...plan,
    fromToAllFlatEntityMaps: {
      ...plan.fromToAllFlatEntityMaps,
      flatRoleMaps: {
        ...roles,
        to: {
          ...roles.to,
          byUniversalIdentifier: {
            ...roles.to.byUniversalIdentifier,
            [LEGACY_BRAND_BRAIN_ROLE_UID]: {
              ...after,
              isEditable: before.isEditable,
            },
          },
        },
      },
    },
  };
  assertStandardBrandBrainRetirementActions({
    plan: nativePlan,
    migration,
    standardApplicationId,
  });
  return { roleId, makeNonEditable: before.isEditable };
};

// Reload every metadata map on the pinned manager before its receipt commits.
// The runner may update timestamps, but may not alter grants, relations,
// ownership, unselected rows, or any other durable metadata value.
export const assertStandardBrandBrainRetirementPersisted = ({
  before,
  after,
  plan,
}: {
  before: AllFlatEntityMaps;
  after: AllFlatEntityMaps;
  plan: NonNullable<ReturnType<typeof buildStandardBrandBrainRetirementPlan>>;
}): void => {
  const withoutUpdateTime = (row: Record<string, unknown>) => {
    const { updatedAt: _updatedAt, ...stable } = row;
    return stable;
  };
  for (const key of ALL_FLAT_ENTITY_MAPS_PROPERTIES) {
    const original = before[key].byUniversalIdentifier as Record<
      string,
      Record<string, unknown>
    >;
    const persisted = after[key].byUniversalIdentifier as Record<
      string,
      Record<string, unknown>
    >;
    const pair = plan.fromToAllFlatEntityMaps[key];
    if (Object.keys(original).length !== Object.keys(persisted).length)
      reject(`Standard retirement postcondition row count changed: ${key}`);
    for (const [uid, row] of Object.entries(original)) {
      const selected = pair?.from.byUniversalIdentifier[uid] as
        | Record<string, unknown>
        | undefined;
      if (selected && canonical(row) !== canonical(selected))
        reject(`Standard retirement plan source mismatch: ${key}:${uid}`);
      const expected = (pair?.to.byUniversalIdentifier[uid] ?? row) as Record<
        string,
        unknown
      >;
      if (
        !persisted[uid] ||
        canonical(withoutUpdateTime(persisted[uid])) !==
          canonical(withoutUpdateTime(expected))
      )
        reject(
          `Standard retirement postcondition protected value changed: ${key}:${uid}`,
        );
    }
  }
};

// Native builders mutate optimistic flat maps. Detach only plain map data, not the
// validator or its class-backed services, and retain the pristine plan for proof.
const detachedNativePlan = (
  plan: NonNullable<ReturnType<typeof buildLegacyBrandBrainRetirementPlan>>,
) => ({
  ...plan,
  dependencyAllFlatEntityMaps: structuredClone(
    plan.dependencyAllFlatEntityMaps,
  ),
  fromToAllFlatEntityMaps: structuredClone(plan.fromToAllFlatEntityMaps),
  additionalCacheDataMaps: structuredClone(plan.additionalCacheDataMaps),
});

@Injectable()
export class RetireLegacyBrandBrainOwnerService {
  constructor(
    private readonly validator: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    @InjectDataSource() private readonly coreDataSource: DataSource,
    private readonly migrationRunner: WorkspaceMigrationRunnerService,
    private readonly cacheStorage: WorkspaceCacheStorageService,
    private readonly coreEntityCache: CoreEntityCacheService,
  ) {}

  async preflight(input: LegacyBrandBrainRetirementInput) {
    const plan = buildLegacyBrandBrainRetirementPlan(input);
    if (!plan) return null;
    const approvedFingerprint = fingerprint(protectedSnapshot(input));
    const result =
      await this.validator.validateBuildAndRunWorkspaceMigrationFromTo(
        detachedNativePlan(plan),
      );
    if (result.status !== 'success')
      throw new Error(
        'Unsafe legacy Brand Brain retirement: native migration validation failed',
      );
    const allowed = new Map<string, Set<string>>([
      [
        'objectMetadata',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatObjectMetadataMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
      [
        'role',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatRoleMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
      [
        'objectPermission',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatObjectPermissionMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
      [
        'fieldPermission',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatFieldPermissionMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
      [
        'pageLayout',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatPageLayoutMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
      [
        'pageLayoutTab',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatPageLayoutTabMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
      [
        'pageLayoutWidget',
        new Set(
          Object.keys(
            plan.fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps!.from
              .byUniversalIdentifier,
          ),
        ),
      ],
    ]);
    const allowedUpdates = new Map<string, Set<string>>([
      [
        'objectMetadata',
        new Set(['isSearchable', 'isUIEditable', 'isUICreatable']),
      ],
      [
        'role',
        new Set([
          'isEditable',
          'canBeAssignedToUsers',
          'canBeAssignedToAgents',
          'canBeAssignedToApiKeys',
        ]),
      ],
      [
        'objectPermission',
        new Set([
          'canUpdateObjectRecords',
          'canSoftDeleteObjectRecords',
          'canDestroyObjectRecords',
        ]),
      ],
      ['fieldPermission', new Set(['canUpdateFieldValue'])],
      ['pageLayout', new Set(['deletedAt'])],
      ['pageLayoutTab', new Set(['deletedAt'])],
      ['pageLayoutWidget', new Set(['deletedAt'])],
    ]);
    if (
      result.workspaceMigration.applicationUniversalIdentifier !==
        LEGACY_BRAND_BRAIN_APPLICATION_UID ||
      result.workspaceMigration.actions.some(
        (action) =>
          action.type !== 'update' ||
          !allowed.get(action.metadataName)?.has(action.universalIdentifier) ||
          Object.entries(action.update).some(
            ([key, value]) =>
              !allowedUpdates.get(action.metadataName)?.has(key) ||
              (key === 'deletedAt'
                ? value !== input.retiredAt.toISOString()
                : value !== false),
          ),
      )
    ) {
      reject('native validator produced an unrelated or non-update action');
    }
    return {
      actions: structuredClone(result.workspaceMigration.actions),
      applicationUniversalIdentifier: LEGACY_BRAND_BRAIN_APPLICATION_UID,
      fingerprint: approvedFingerprint,
    };
  }

  /** Internal only: caller must keep metadata writers and customer execution quiescent. */
  async applyApprovedOwnerPlan({
    input,
    approved,
  }: {
    input: LegacyBrandBrainRetirementInput;
    approved: NonNullable<
      Awaited<ReturnType<RetireLegacyBrandBrainOwnerService['preflight']>>
    >;
  }): Promise<void> {
    if (
      approved.applicationUniversalIdentifier !==
        LEGACY_BRAND_BRAIN_APPLICATION_UID ||
      approved.fingerprint !== fingerprint(protectedSnapshot(input))
    )
      reject('approved preflight does not match the supplied input');

    // Probe every mapped core column before native writes: cache recomputation
    // later reads the complete WorkspaceEntity, not just its default role.
    const workspace = await this.coreDataSource
      .getRepository(WorkspaceEntity)
      .findOne({
        where: { id: input.workspaceId },
        withDeleted: true,
      })
      .catch((cause: unknown) => {
        throw Object.assign(
          new Error(
            'Unsafe legacy Brand Brain retirement: core workspace read failed before writes (verify current schema)',
          ),
          { cause },
        );
      });
    if (!workspace)
      throw new Error(
        'Unsafe legacy Brand Brain retirement: workspace not found',
      );

    // Recompute from providers backed by the actual workspace, not the caller's
    // possibly stale flat maps. This also clears local/Redis memoized entries.
    const keys = [
      ...new Set<WorkspaceCacheKeyName>([
        ...PROOF_KEYS,
        ...(Object.keys(input.maps) as WorkspaceCacheKeyName[]),
      ]),
    ];
    await this.workspaceCacheService.invalidateAndRecompute(
      input.workspaceId,
      keys,
    );
    const current = await this.workspaceCacheService.getOrRecompute(
      input.workspaceId,
      keys,
    );
    const currentInput: LegacyBrandBrainRetirementInput = {
      ...input,
      workspaceDefaultRoleId: workspace.defaultRoleId,
      applications: structuredClone(current.flatApplicationMaps),
      // SAFETY: every AllFlatEntityMaps key was included in the refreshed key set.
      maps: Object.fromEntries(
        Object.keys(input.maps).map((key) => [
          key,
          structuredClone(current[key as keyof typeof current]),
        ]),
      ) as AllFlatEntityMaps,
    };
    const currentSnapshot = {
      ...protectedSnapshot(currentInput),
      maps: Object.fromEntries(
        Object.keys(input.maps).map((key) => [
          key,
          current[key as keyof typeof current],
        ]),
      ),
    };
    if (fingerprint(currentSnapshot) !== approved.fingerprint)
      reject('current workspace metadata differs from approved preflight');

    const freshApproval = await this.preflight(currentInput);
    if (
      !freshApproval ||
      canonical(freshApproval.actions) !== canonical(approved.actions)
    )
      reject('native preflight actions differ from approved plan');
    const plan = buildLegacyBrandBrainRetirementPlan(currentInput)!;
    if (approved.actions.length > 0) {
      const result =
        await this.validator.validateBuildAndRunWorkspaceMigrationFromTo({
          ...detachedNativePlan(plan),
          dryRun: false,
        });
      if (
        result.status !== 'success' ||
        result.workspaceMigration.applicationUniversalIdentifier !==
          LEGACY_BRAND_BRAIN_APPLICATION_UID ||
        canonical(result.workspaceMigration.actions) !==
          canonical(approved.actions)
      )
        reject('native execution result differs from approved plan');
    }

    // The caller must maintain exclusive metadata writers and paused/drained serving
    // processes across retries; a local cache check cannot prove remote freshness.
    // Native run() swallows post-commit invalidation errors. Call its propagating
    // boundary directly, even for a zero-action retry, to allocate a fresh epoch.
    const persistedVersion = async () =>
      (
        await this.coreDataSource.getRepository(WorkspaceEntity).findOne({
          select: ['metadataVersion'],
          where: { id: input.workspaceId },
          withDeleted: true,
        })
      )?.metadataVersion;
    const before = await persistedVersion();
    if (!Number.isSafeInteger(before) || before! < 0)
      reject('invalid persisted metadata version');
    await this.migrationRunner.invalidateCache({
      workspaceId: input.workspaceId,
      allFlatEntityMapsKeys: ALL_FLAT_ENTITY_MAPS_PROPERTIES,
    });
    const after = await persistedVersion();
    if (!Number.isSafeInteger(after) || after! <= before!)
      reject('metadata cache epoch did not advance');
    if (
      (await this.cacheStorage.getMetadataVersion(input.workspaceId)) !== after
    )
      reject('published metadata version differs from persisted epoch');
    await this.coreEntityCache.invalidateAndRecompute(
      'workspaceEntity',
      input.workspaceId,
    );
    const coreWorkspace = await this.coreEntityCache.get(
      'workspaceEntity',
      input.workspaceId,
    );
    if (coreWorkspace?.metadataVersion !== after)
      reject('core workspace cache differs from persisted epoch');

    await this.workspaceCacheService.invalidateAndRecompute(
      input.workspaceId,
      keys,
    );
    const effective = await this.workspaceCacheService.getOrRecompute(
      input.workspaceId,
      keys,
    );
    const expected = plan.fromToAllFlatEntityMaps;
    const pairs = [
      ['flatObjectMetadataMaps', expected.flatObjectMetadataMaps],
      ['flatRoleMaps', expected.flatRoleMaps],
      ['flatObjectPermissionMaps', expected.flatObjectPermissionMaps],
      ['flatFieldPermissionMaps', expected.flatFieldPermissionMaps],
      ['flatPageLayoutMaps', expected.flatPageLayoutMaps],
      ['flatPageLayoutTabMaps', expected.flatPageLayoutTabMaps],
      ['flatPageLayoutWidgetMaps', expected.flatPageLayoutWidgetMaps],
    ] as const;
    for (const [key, pair] of pairs) {
      for (const [uid, target] of Object.entries(
        pair!.to.byUniversalIdentifier,
      )) {
        const actual = effective[key].byUniversalIdentifier[uid];
        const actualFields =
          actual && Object.fromEntries(Object.entries(actual));
        if (
          !actualFields ||
          !target ||
          Object.entries(target).some(
            ([field, value]) =>
              field !== 'updatedAt' &&
              canonical(actualFields[field]) !== canonical(value),
          )
        )
          reject(`cached ${key} retirement or identity drift`);
      }
    }
    if (
      canonical(effective.flatRoleTargetMaps) !==
        canonical(input.maps.flatRoleTargetMaps) ||
      canonical(effective.userWorkspaceRoleMap) !==
        canonical(current.userWorkspaceRoleMap) ||
      canonical(effective.apiKeyRoleMap) !== canonical(current.apiKeyRoleMap) ||
      canonical(effective.flatRoleTargetByAgentIdMaps) !==
        canonical(current.flatRoleTargetByAgentIdMaps) ||
      effective.flatApplicationMaps.idByUniversalIdentifier[
        LEGACY_BRAND_BRAIN_APPLICATION_UID
      ] !==
        input.applications.idByUniversalIdentifier[
          LEGACY_BRAND_BRAIN_APPLICATION_UID
        ]
    )
      reject('cached role targets or owner changed');
    const role =
      expected.flatRoleMaps!.to.byUniversalIdentifier[
        LEGACY_BRAND_BRAIN_ROLE_UID
      ];
    const roleId =
      input.maps.flatRoleMaps.byUniversalIdentifier[LEGACY_BRAND_BRAIN_ROLE_UID]
        ?.id;
    if (role && roleId) {
      if (
        role.canBeAssignedToUsers ||
        role.canBeAssignedToAgents ||
        role.canBeAssignedToApiKeys ||
        !effective.rolesPermissions[roleId]
      )
        reject('cached role is not retired');
      for (const object of Object.values(
        input.maps.flatObjectMetadataMaps.byUniversalIdentifier,
      )) {
        if (!object || !OBJECT_UIDS.has(object.universalIdentifier)) continue;
        const permissions = effective.rolesPermissions[roleId]?.[object.id];
        if (
          !permissions ||
          permissions.canUpdateObjectRecords ||
          permissions.canSoftDeleteObjectRecords ||
          permissions.canDestroyObjectRecords
        )
          reject('effective role retains object writes');
        if (
          permissions.canReadObjectRecords !==
          current.rolesPermissions[roleId]?.[object.id]?.canReadObjectRecords
        )
          reject('effective role read changed');
        const priorFields =
          current.rolesPermissions[roleId]?.[object.id]?.restrictedFields;
        if (
          canonical(
            Object.fromEntries(
              Object.entries(permissions.restrictedFields).map(
                ([id, field]) => [id, field.canRead],
              ),
            ),
          ) !==
          canonical(
            Object.fromEntries(
              Object.entries(priorFields ?? {}).map(([id, field]) => [
                id,
                field.canRead,
              ]),
            ),
          )
        )
          reject('effective field reads changed');
        if (
          Object.values(permissions.restrictedFields).some(
            (field) => field.canUpdate,
          )
        )
          reject('effective field writes remain');
      }
    }
    if ((await persistedVersion()) !== after)
      reject('persisted metadata epoch changed during cache proof');
  }
}
