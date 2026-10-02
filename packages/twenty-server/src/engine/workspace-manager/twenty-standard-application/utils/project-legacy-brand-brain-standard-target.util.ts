import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import type { FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

const LEGACY_APPLICATION_UID = '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991';
const LEGACY_ROLE_UID = '8563f1a9-4e02-408a-a5d7-45f68779023a';
const OBJECT_UIDS = new Set<string>([
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
]);

type Row = {
  id: string;
  universalIdentifier: string;
  applicationId?: string;
  [key: string]: unknown;
};
type Maps = {
  byUniversalIdentifier: Record<string, Row | undefined>;
  universalIdentifierById: Record<string, string | undefined>;
  universalIdentifiersByApplicationId: Record<string, string[] | undefined>;
};
type Name = (typeof TWENTY_STANDARD_ALL_METADATA_NAME)[number];
const map = (maps: TwentyStandardAllFlatEntityMaps, name: Name): Maps => {
  // SAFETY: every metadata map has the same three indexes; no row shapes are converted.
  const indexedMaps: Record<string, Maps> = maps as unknown as Record<
    string,
    Maps
  >;

  return indexedMaps[getMetadataFlatEntityMapsKey(name)];
};
const rows = (maps: Maps) =>
  Object.values(maps.byUniversalIdentifier).filter(isDefined);
const rebuild = (maps: Maps) => {
  maps.universalIdentifierById = {};
  maps.universalIdentifiersByApplicationId = {};
  for (const row of rows(maps)) {
    maps.universalIdentifierById[row.id] = row.universalIdentifier;
    if (isDefined(row.applicationId))
      (maps.universalIdentifiersByApplicationId[row.applicationId] ??= []).push(
        row.universalIdentifier,
      );
  }
};
const fail = (reason: string): never => {
  throw new Error(`Unsafe legacy Brand Brain standard projection: ${reason}`);
};

// This branch is a preservation projection, not retirement. 0410 owns the
// separately verified mutation of the installed Standard-owned graph.
const projectInstalledStandardGraph = ({
  existing,
  source,
  target,
  applications,
  objects,
}: {
  existing: TwentyStandardAllFlatEntityMaps;
  source: TwentyStandardAllFlatEntityMaps;
  target: TwentyStandardAllFlatEntityMaps;
  applications: FlatApplicationCacheMaps;
  objects: Row[];
}): void => {
  const standardId =
    applications.idByUniversalIdentifier[
      TWENTY_STANDARD_APPLICATION.universalIdentifier
    ];
  const standard = standardId && applications.byId[standardId];
  if (
    !standard ||
    standard.id !== standardId ||
    standard.universalIdentifier !==
      TWENTY_STANDARD_APPLICATION.universalIdentifier ||
    objects.length !== OBJECT_UIDS.size ||
    objects.some((row) => row.applicationId !== standardId)
  )
    fail('incomplete or mixed-owner Standard objects');

  const role = map(existing, 'role').byUniversalIdentifier[LEGACY_ROLE_UID];
  if (!role) return fail('incomplete Standard role');
  if (role.applicationId !== standardId)
    return fail('mixed-owner Standard role');
  const installedRole: Row = role;

  // Follow only existing dependencies. Looking at target alone would fabricate
  // canonical Brand Brain fields or presentation missing from the installation.
  const selected: Partial<Record<Name, Row[]>> = {
    objectMetadata: objects,
    role: [installedRole],
  };
  const objectIds = new Set(objects.map((row) => row.id));
  const knownIds = new Set([...objects, installedRole].map((row) => row.id));
  const knownUids = new Set(
    [...objects, installedRole].map((row) => row.universalIdentifier),
  );
  const visited = new Set([
    ...objects.map((row) => `objectMetadata:${row.universalIdentifier}`),
    `role:${installedRole.universalIdentifier}`,
  ]);
  const allowed = new Set<Name>([
    'objectMetadata',
    'fieldMetadata',
    'index',
    'searchFieldMetadata',
    'role',
    'objectPermission',
    'fieldPermission',
    'view',
    'viewField',
    'viewFilter',
    'viewGroup',
    'viewFieldGroup',
    'navigationMenuItem',
    'commandMenuItem',
    'pageLayout',
    'pageLayoutTab',
    'pageLayoutWidget',
  ]);
  // Only forward/owning references can grow the protected graph. Flat-cache
  // reverse arrays (fieldIds, viewIds, objectPermissionIds, etc.) are not
  // ownership edges: following them reaches unrelated CreatorOps grants.
  const dependencyKeys: Partial<Record<Name, readonly string[]>> = {
    objectMetadata: [],
    role: [],
    fieldMetadata: [
      'objectMetadataId',
      'objectMetadataUniversalIdentifier',
      'relationTargetObjectMetadataId',
      'relationTargetObjectMetadataUniversalIdentifier',
      'relationTargetFieldMetadataId',
      'relationTargetFieldMetadataUniversalIdentifier',
    ],
    index: [
      'objectMetadataId',
      'objectMetadataUniversalIdentifier',
      'universalFlatIndexFieldMetadatas',
    ],
    searchFieldMetadata: [
      'objectMetadataId',
      'fieldMetadataId',
      'fieldMetadataUniversalIdentifier',
    ],
    objectPermission: [
      'objectMetadataId',
      'objectMetadataUniversalIdentifier',
      'roleId',
      'roleUniversalIdentifier',
    ],
    fieldPermission: [
      'fieldMetadataId',
      'fieldMetadataUniversalIdentifier',
      'roleId',
      'roleUniversalIdentifier',
    ],
    view: ['objectMetadataId', 'objectMetadataUniversalIdentifier'],
    viewField: [
      'viewId',
      'fieldMetadataId',
      'fieldMetadataUniversalIdentifier',
    ],
    viewFilter: [
      'viewId',
      'fieldMetadataId',
      'fieldMetadataUniversalIdentifier',
    ],
    viewGroup: [
      'viewId',
      'fieldMetadataId',
      'fieldMetadataUniversalIdentifier',
    ],
    viewFieldGroup: [
      'viewId',
      'fieldMetadataId',
      'fieldMetadataUniversalIdentifier',
    ],
    navigationMenuItem: [
      'targetObjectMetadataId',
      'targetObjectMetadataUniversalIdentifier',
      'pageLayoutId',
      'viewId',
      'parentNavigationMenuItemId',
    ],
    commandMenuItem: [
      'availabilityObjectMetadataId',
      'availabilityObjectMetadataUniversalIdentifier',
      'pageLayoutId',
      'overrides',
    ],
    pageLayout: ['objectMetadataId', 'objectMetadataUniversalIdentifier'],
    pageLayoutTab: ['pageLayoutId', 'overrides'],
    pageLayoutWidget: [
      'pageLayoutTabId',
      'pageLayoutTabUniversalIdentifier',
      'objectMetadataId',
      'objectMetadataUniversalIdentifier',
      'overrides',
      'universalConfiguration',
    ],
  };
  const referencesKnown = (value: unknown): boolean => {
    if (typeof value === 'string')
      return knownIds.has(value) || knownUids.has(value);
    if (Array.isArray(value)) return value.some(referencesKnown);
    return (
      value !== null &&
      typeof value === 'object' &&
      Object.values(value).some(referencesKnown)
    );
  };
  const dependsOnProtected = (name: Name, row: Row): boolean =>
    (
      dependencyKeys[name] ??
      Object.keys(row).filter(
        (key) => key !== 'id' && key !== 'universalIdentifier',
      )
    ).some((key) => referencesKnown(row[key]));
  const isExternal = (name: Name, row: Row): boolean =>
    (name === 'fieldMetadata' &&
      !objectIds.has(String(row.objectMetadataId)) &&
      !OBJECT_UIDS.has(String(row.objectMetadataUniversalIdentifier))) ||
    ((name === 'objectPermission' || name === 'fieldPermission') &&
      row.roleId !== installedRole.id &&
      row.roleUniversalIdentifier !== installedRole.universalIdentifier);
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
      for (const row of rows(map(existing, name))) {
        const key = `${name}:${row.universalIdentifier}`;
        if (visited.has(key) || !dependsOnProtected(name, row)) continue;
        if (!allowed.has(name) || row.applicationId !== standardId)
          fail(`unknown or foreign Standard dependency ${name}`);
        if (name === 'pageLayoutWidget') {
          const overrideTab =
            row.overrides && typeof row.overrides === 'object'
              ? (row.overrides as { pageLayoutTabId?: string }).pageLayoutTabId
              : undefined;
          if (
            !knownIds.has(String(row.pageLayoutTabId)) ||
            (overrideTab && !knownIds.has(overrideTab))
          )
            fail('shared Brand Brain widget ancestry');
        }
        (selected[name] ??= []).push(row);
        visited.add(key);
        // Shared reciprocal fields and grants are retained, but do not pull
        // their owning Note/Creator objects, roles or unrelated permissions in.
        if (!isExternal(name, row)) {
          knownIds.add(row.id);
          knownUids.add(row.universalIdentifier);
          changed = true;
        }
      }
    }
  }
  // Candidate-only metadata linked to the installed graph must not be created.
  // A source row is accepted only if it is exactly the installed identity/owner.
  const candidateSuppressed: Partial<Record<Name, Set<string>>> = {};
  let suppressing = true;
  while (suppressing) {
    suppressing = false;
    for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
      for (const row of rows(map(target, name))) {
        if (
          visited.has(`${name}:${row.universalIdentifier}`) ||
          knownUids.has(row.universalIdentifier) ||
          candidateSuppressed[name]?.has(row.universalIdentifier)
        )
          continue;
        if (!dependsOnProtected(name, row)) continue;
        if (!allowed.has(name)) fail(`unknown candidate dependency ${name}`);
        (candidateSuppressed[name] ??= new Set()).add(row.universalIdentifier);
        if (!isExternal(name, row)) {
          knownUids.add(row.universalIdentifier);
          knownIds.add(row.id);
          suppressing = true;
        }
      }
    }
  }
  for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
    const from = map(source, name);
    for (const row of selected[name] ?? []) {
      const prior = from.byUniversalIdentifier[row.universalIdentifier];
      if (
        prior &&
        (prior.id !== row.id || prior.applicationId !== row.applicationId)
      )
        fail(`selected ${name} identity collision`);
    }
  }
  for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
    const from = map(source, name);
    const to = map(target, name);
    for (const uid of candidateSuppressed[name] ?? [])
      delete to.byUniversalIdentifier[uid];
    for (const row of selected[name] ?? []) {
      from.byUniversalIdentifier[row.universalIdentifier] = row;
      to.byUniversalIdentifier[row.universalIdentifier] = row;
    }
    rebuild(from);
    rebuild(to);
  }
};

/** A pure target projection: never re-owners or generates an installed legacy row. */
export const projectLegacyBrandBrainStandardTarget = ({
  existing,
  source,
  target,
  applications,
}: {
  existing: TwentyStandardAllFlatEntityMaps;
  source: TwentyStandardAllFlatEntityMaps;
  target: TwentyStandardAllFlatEntityMaps;
  applications: FlatApplicationCacheMaps;
}): void => {
  const appId = applications.idByUniversalIdentifier[LEGACY_APPLICATION_UID];
  const app = appId && applications.byId[appId];
  const objects = rows(map(existing, 'objectMetadata')).filter((row) =>
    OBJECT_UIDS.has(row.universalIdentifier),
  );
  const role = map(existing, 'role').byUniversalIdentifier[LEGACY_ROLE_UID];
  const knownPermissions = (
    ['objectPermission', 'fieldPermission'] as const
  ).flatMap((name) =>
    rows(map(existing, name)).filter(
      (row) => row.roleUniversalIdentifier === LEGACY_ROLE_UID,
    ),
  );
  if (
    !app ||
    app.id !== appId ||
    app.universalIdentifier !== LEGACY_APPLICATION_UID
  ) {
    if (objects.length || role || knownPermissions.length) {
      if (app) fail('mixed old and Standard application owners');
      projectInstalledStandardGraph({
        existing,
        source,
        target,
        applications,
        objects,
      });
    }
    return;
  }
  if (
    objects.length !== OBJECT_UIDS.size ||
    objects.some((row) => row.applicationId !== appId)
  )
    fail('incomplete or mixed-owner known objects');
  const objectIds = new Set(objects.map((row) => row.id));
  if (role && role.applicationId !== appId) fail('mixed-owner known role');
  if (!role && knownPermissions.length)
    fail('known permissions exist without their role');
  if (
    knownPermissions.some(
      (row) => row.applicationId !== appId || row.roleId !== role?.id,
    )
  )
    fail('mixed-owner known permission');
  const legacyFields = rows(map(existing, 'fieldMetadata')).filter(
    (row) =>
      objectIds.has(String(row.objectMetadataId)) ||
      (typeof row.relationTargetObjectMetadataUniversalIdentifier ===
        'string' &&
        OBJECT_UIDS.has(row.relationTargetObjectMetadataUniversalIdentifier)),
  );
  if (
    legacyFields.some(
      (row) =>
        row.applicationId !== appId &&
        OBJECT_UIDS.has(String(row.objectMetadataUniversalIdentifier)),
    )
  )
    fail('mixed-owner known field');
  const fieldIds = new Set(legacyFields.map((row) => row.id));
  const preserved: Partial<Record<Name, Row[]>> = {
    objectMetadata: objects,
    fieldMetadata: legacyFields,
    role: role ? [role] : [],
  };
  for (const name of ['objectPermission', 'fieldPermission'] as const) {
    preserved[name] = rows(map(existing, name)).filter(
      (row) =>
        role?.id === row.roleId &&
        (objectIds.has(String(row.objectMetadataId)) ||
          fieldIds.has(String(row.fieldMetadataId))),
    );
    if (preserved[name]!.some((row) => row.applicationId !== appId))
      fail('mixed-owner known permission');
  }
  // Indexes and views are dependency metadata; do not replace installed rows by generated definitions.
  preserved.index = rows(map(existing, 'index')).filter(
    (row) =>
      objectIds.has(String(row.objectMetadataId)) ||
      (Array.isArray(row.universalFlatIndexFieldMetadatas) &&
        row.universalFlatIndexFieldMetadatas.some(
          (entry: unknown) =>
            typeof entry === 'object' &&
            entry !== null &&
            'fieldMetadataUniversalIdentifier' in entry &&
            legacyFields.some(
              (field) =>
                field.universalIdentifier ===
                entry.fieldMetadataUniversalIdentifier,
            ),
        )),
  );
  preserved.view = rows(map(existing, 'view')).filter((row) =>
    objectIds.has(String(row.objectMetadataId)),
  );
  const viewIds = new Set(preserved.view.map((row) => row.id));
  for (const name of [
    'viewField',
    'viewGroup',
    'viewFilter',
    'viewFieldGroup',
  ] as const)
    preserved[name] = rows(map(existing, name)).filter((row) =>
      viewIds.has(String(row.viewId)),
    );

  const suppressed: Partial<Record<Name, Set<string>>> = {};
  const suppress = (name: Name, uid: string) =>
    (suppressed[name] ??= new Set()).add(uid);
  for (const uid of OBJECT_UIDS) suppress('objectMetadata', uid);
  suppress('role', LEGACY_ROLE_UID);
  const references = (row: Row, removed: Set<string>): boolean =>
    Object.entries(row).some(
      ([key, value]) =>
        (key.endsWith('UniversalIdentifier') &&
          typeof value === 'string' &&
          removed.has(value)) ||
        (key === 'universalFlatIndexFieldMetadatas' &&
          Array.isArray(value) &&
          value.some(
            (entry) =>
              entry &&
              typeof entry === 'object' &&
              removed.has(entry.fieldMetadataUniversalIdentifier),
          )),
    );
  // Compute the canonical transitive closure after selection, including view/index/permission dependencies.
  let changed = true;
  while (changed) {
    changed = false;
    const removed = new Set(
      Object.values(suppressed).flatMap((uids) => [...uids]),
    );
    for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
      for (const row of rows(map(target, name))) {
        if (
          !suppressed[name]?.has(row.universalIdentifier) &&
          references(row, removed)
        ) {
          suppress(name, row.universalIdentifier);
          changed = true;
        }
      }
    }
  }
  for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
    const from = map(source, name);

    if (
      (preserved[name] ?? []).some((row) => {
        const selected = from.byUniversalIdentifier[row.universalIdentifier];

        return (
          isDefined(selected) &&
          (selected.id !== row.id ||
            selected.applicationId !== row.applicationId)
        );
      })
    )
      fail(`mixed-owner selected ${name} collision`);
  }
  for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
    const from = map(source, name);
    const to = map(target, name);

    for (const uid of suppressed[name] ?? [])
      delete to.byUniversalIdentifier[uid];
    for (const row of preserved[name] ?? []) {
      // External reciprocal endpoints are retained only when actually installed; no synthetic sibling.
      from.byUniversalIdentifier[row.universalIdentifier] = row;
      to.byUniversalIdentifier[row.universalIdentifier] = row;
    }
    rebuild(from);
    rebuild(to);
  }
};
