import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { projectLegacyBrandBrainStandardTarget } from 'src/engine/workspace-manager/twenty-standard-application/utils/project-legacy-brand-brain-standard-target.util';

const OLD_APP_UID = '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991';
const OLD_ROLE_UID = '8563f1a9-4e02-408a-a5d7-45f68779023a';
const OBJECT_UIDS = [
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
];
const add = (maps: any, kind: string, row: any) => {
  const map = maps[`flat${kind[0].toUpperCase()}${kind.slice(1)}Maps`];
  map.byUniversalIdentifier[row.universalIdentifier] = row;
  map.universalIdentifierById[row.id] = row.universalIdentifier;
  (map.universalIdentifiersByApplicationId[row.applicationId] ??= []).push(
    row.universalIdentifier,
  );
};
const makeGraph = () => {
  const existing = createEmptyAllFlatEntityMaps();
  const target = createEmptyAllFlatEntityMaps();
  const oldId = 'old-app-id';
  const standardId = 'standard-app-id';
  const applications = {
    idByUniversalIdentifier: { [OLD_APP_UID]: oldId },
    byId: { [oldId]: { id: oldId, universalIdentifier: OLD_APP_UID } },
  };
  OBJECT_UIDS.forEach((uid, index) => {
    add(existing, 'objectMetadata', {
      id: `old-object-${index}`,
      applicationId: oldId,
      universalIdentifier: uid,
    });
    add(target, 'objectMetadata', {
      id: `canonical-object-${index}`,
      applicationId: standardId,
      universalIdentifier: uid,
    });
    for (let n = 0; n < 8; n++) {
      const fieldUid = `${uid}-system-${n}`;
      add(existing, 'fieldMetadata', {
        id: `old-field-${index}-${n}`,
        applicationId: oldId,
        universalIdentifier: fieldUid,
        objectMetadataId: `old-object-${index}`,
        objectMetadataUniversalIdentifier: uid,
      });
      add(target, 'fieldMetadata', {
        id: `canonical-field-${index}-${n}`,
        applicationId: standardId,
        universalIdentifier: fieldUid,
        objectMetadataUniversalIdentifier: uid,
      });
    }
  });
  add(existing, 'role', {
    id: 'old-role-id',
    applicationId: oldId,
    universalIdentifier: OLD_ROLE_UID,
  });
  add(target, 'role', {
    id: 'canonical-role-id',
    applicationId: standardId,
    universalIdentifier: OLD_ROLE_UID,
  });
  for (let n = 0; n < 2; n++) {
    const uid = `old-permission-${n}`;
    add(existing, 'objectPermission', {
      id: `old-permission-id-${n}`,
      applicationId: oldId,
      universalIdentifier: uid,
      roleId: 'old-role-id',
      roleUniversalIdentifier: OLD_ROLE_UID,
      objectMetadataId: `old-object-${n}`,
      objectMetadataUniversalIdentifier: OBJECT_UIDS[n],
      canReadObjectRecords: n === 0,
    });
    add(target, 'objectPermission', {
      id: `canonical-permission-id-${n}`,
      applicationId: standardId,
      universalIdentifier: uid,
      roleUniversalIdentifier: OLD_ROLE_UID,
      objectMetadataUniversalIdentifier: OBJECT_UIDS[n],
    });
  }
  for (let n = 0; n < 4; n++) {
    const uid = `note-task-reciprocal-${n}`;
    add(existing, 'fieldMetadata', {
      id: `old-reciprocal-${n}`,
      applicationId: oldId,
      universalIdentifier: uid,
      relationTargetObjectMetadataUniversalIdentifier: OBJECT_UIDS[n % 3],
    });
    add(target, 'fieldMetadata', {
      id: `canonical-reciprocal-${n}`,
      applicationId: standardId,
      universalIdentifier: uid,
      relationTargetObjectMetadataUniversalIdentifier: OBJECT_UIDS[n % 3],
    });
  }
  add(target, 'objectMetadata', {
    id: 'creator-id',
    applicationId: standardId,
    universalIdentifier: MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
  });
  add(target, 'objectMetadata', {
    id: 'campaign-id',
    applicationId: standardId,
    universalIdentifier: MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
  });
  add(target, 'pageLayout', {
    id: 'canonical-brain-layout',
    applicationId: standardId,
    universalIdentifier: 'brain-layout',
    objectMetadataUniversalIdentifier: OBJECT_UIDS[0],
  });
  add(target, 'navigationMenuItem', {
    id: 'canonical-brain-menu',
    applicationId: standardId,
    universalIdentifier: 'brain-menu',
    targetObjectMetadataUniversalIdentifier: OBJECT_UIDS[0],
  });
  return { existing, target, applications, oldId };
};

const makeStandardGraph = () => {
  const graph = makeGraph();
  for (const kind of [
    'objectMetadata',
    'fieldMetadata',
    'role',
    'objectPermission',
  ]) {
    const maps = (graph.existing as any)[
      `flat${kind[0].toUpperCase()}${kind.slice(1)}Maps`
    ];
    for (const row of Object.values(maps.byUniversalIdentifier) as any[])
      row.applicationId = 'standard-app-id';
    maps.universalIdentifiersByApplicationId = {};
  }
  const applications = {
    idByUniversalIdentifier: {
      [TWENTY_STANDARD_APPLICATION.universalIdentifier]: 'standard-app-id',
    },
    byId: {
      'standard-app-id': {
        id: 'standard-app-id',
        universalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
      },
    },
  };
  return { ...graph, applications };
};

describe('projectLegacyBrandBrainStandardTarget', () => {
  it('preserves the installed Standard-owned graph, reciprocal fields, views and presentation without re-authoring', () => {
    const { existing, target, applications } = makeStandardGraph();
    const source = createEmptyAllFlatEntityMaps();
    const first = OBJECT_UIDS[0];
    add(existing, 'view', {
      id: 'installed-view',
      applicationId: 'standard-app-id',
      universalIdentifier: 'view-uid',
      objectMetadataId: 'old-object-0',
      objectMetadataUniversalIdentifier: first,
    });
    add(existing, 'viewSort', {
      id: 'installed-sort',
      applicationId: 'standard-app-id',
      universalIdentifier: 'sort-uid',
      viewId: 'installed-view',
    });
    add(existing, 'pageLayout', {
      id: 'installed-layout',
      applicationId: 'standard-app-id',
      universalIdentifier: 'brain-layout',
      objectMetadataId: 'old-object-0',
      objectMetadataUniversalIdentifier: first,
      deletedAt: null,
    });
    add(existing, 'pageLayoutTab', {
      id: 'installed-tab',
      applicationId: 'standard-app-id',
      universalIdentifier: 'tab-uid',
      pageLayoutId: 'installed-layout',
    });
    add(existing, 'pageLayoutWidget', {
      id: 'installed-widget',
      applicationId: 'standard-app-id',
      universalIdentifier: 'widget-uid',
      pageLayoutTabId: 'installed-tab',
      universalConfiguration: { viewId: 'installed-view' },
    });
    add(existing, 'navigationMenuItem', {
      id: 'installed-menu',
      applicationId: 'standard-app-id',
      universalIdentifier: 'brain-menu',
      targetObjectMetadataId: 'old-object-0',
      targetObjectMetadataUniversalIdentifier: first,
    });
    const original = structuredClone(existing);

    projectLegacyBrandBrainStandardTarget({
      existing,
      source,
      target,
      applications: applications as any,
    });

    for (const kind of [
      'objectMetadata',
      'fieldMetadata',
      'role',
      'objectPermission',
      'view',
      'pageLayout',
      'pageLayoutTab',
      'pageLayoutWidget',
      'navigationMenuItem',
    ]) {
      const key = `flat${kind[0].toUpperCase()}${kind.slice(1)}Maps`;
      for (const [uid, row] of Object.entries(
        (original as any)[key].byUniversalIdentifier,
      )) {
        expect((target as any)[key].byUniversalIdentifier[uid]).toEqual(row);
        expect((source as any)[key].byUniversalIdentifier[uid]).toEqual(row);
      }
    }
    // View sorts are not selected by the standard synchronizer: they remain
    // intact in the persisted dependency graph, not copied into its target.
    expect(existing.flatViewSortMaps.byUniversalIdentifier['sort-uid']).toEqual(
      original.flatViewSortMaps.byUniversalIdentifier['sort-uid'],
    );
    expect(
      target.flatPageLayoutMaps.byUniversalIdentifier['brain-layout']?.id,
    ).toBe('installed-layout');
    expect(
      target.flatNavigationMenuItemMaps.byUniversalIdentifier['brain-menu']?.id,
    ).toBe('installed-menu');
    expect(
      target.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ],
    ).toBeDefined();
  });

  it('retains the installed Note relation without absorbing CreatorOps through flat-cache backreferences', () => {
    const { existing, target, applications } = makeStandardGraph();
    const source = createEmptyAllFlatEntityMaps();
    const external = [
      [
        'fieldMetadata',
        'note-brain-field',
        'note-brain',
        {
          relationTargetObjectMetadataId: 'old-object-0',
          objectMetadataId: 'note-object',
        },
      ],
      [
        'viewField',
        'note-view-field',
        'note-view-field-uid',
        {
          fieldMetadataId: 'note-brain-field',
        },
      ],
      [
        'view',
        'note-view',
        'note-view-uid',
        {
          viewFieldIds: ['note-view-field'],
          objectMetadataId: 'note-object',
        },
      ],
      [
        'objectMetadata',
        'note-object',
        'note-object-uid',
        {
          viewIds: ['note-view'],
          fieldIds: ['note-creator-field'],
        },
      ],
      [
        'fieldMetadata',
        'note-creator-field',
        'note-creator-uid',
        {
          objectMetadataId: 'note-object',
          relationTargetFieldMetadataId: 'creator-note-field',
        },
      ],
      [
        'fieldMetadata',
        'creator-note-field',
        'creator-note-uid',
        {
          objectMetadataId: 'creator-object',
          relationTargetFieldMetadataId: 'note-creator-field',
        },
      ],
      [
        'objectMetadata',
        'creator-object',
        'creator-object-uid',
        {
          fieldIds: ['creator-note-field'],
        },
      ],
      [
        'objectPermission',
        'creator-permission',
        'creator-permission-uid',
        {
          objectMetadataId: 'creator-object',
          roleId: 'creator-ops-role',
        },
      ],
      [
        'objectPermission',
        'brand-external-permission',
        'brand-external-permission-uid',
        {
          objectMetadataId: 'old-object-0',
          roleId: 'creator-ops-role',
          canReadObjectRecords: true,
          canUpdateObjectRecords: false,
        },
      ],
      [
        'role',
        'creator-ops-role',
        'creator-ops-role-uid',
        {
          objectPermissionIds: [
            'creator-permission',
            'brand-external-permission',
          ],
        },
      ],
      [
        'rolePermissionFlag',
        'creator-ops-flag',
        'creator-ops-flag-uid',
        {
          roleId: 'creator-ops-role',
        },
      ],
    ] as const;
    for (const [kind, id, universalIdentifier, references] of external)
      add(existing, kind, {
        id,
        universalIdentifier,
        applicationId: 'standard-app-id',
        ...references,
      });

    expect(() =>
      projectLegacyBrandBrainStandardTarget({
        existing,
        source,
        target,
        applications: applications as any,
      }),
    ).not.toThrow();
    expect(
      source.flatFieldMetadataMaps.byUniversalIdentifier['note-brain'],
    ).toBe(existing.flatFieldMetadataMaps.byUniversalIdentifier['note-brain']);
    expect(
      target.flatFieldMetadataMaps.byUniversalIdentifier['note-brain'],
    ).toBe(existing.flatFieldMetadataMaps.byUniversalIdentifier['note-brain']);
    expect(
      target.flatObjectPermissionMaps.byUniversalIdentifier[
        'brand-external-permission-uid'
      ],
    ).toBe(
      existing.flatObjectPermissionMaps.byUniversalIdentifier[
        'brand-external-permission-uid'
      ],
    );
    expect(
      source.flatObjectMetadataMaps.byUniversalIdentifier['creator-object-uid'],
    ).toBeUndefined();
    expect(
      source.flatObjectPermissionMaps.byUniversalIdentifier[
        'creator-permission-uid'
      ],
    ).toBeUndefined();
    expect(
      source.flatRoleMaps.byUniversalIdentifier['creator-ops-role-uid'],
    ).toBeUndefined();
    expect(
      target.flatRolePermissionFlagMaps.byUniversalIdentifier[
        'creator-ops-flag-uid'
      ],
    ).toBeUndefined();
  });

  it('rejects a direct unknown permission flag on the installed Brand Brain role', () => {
    const { existing, target, applications } = makeStandardGraph();
    add(existing, 'rolePermissionFlag', {
      id: 'brand-role-flag',
      universalIdentifier: 'brand-role-flag-uid',
      applicationId: 'standard-app-id',
      roleId: 'old-role-id',
    });
    const before = structuredClone(target);
    expect(() =>
      projectLegacyBrandBrainStandardTarget({
        existing,
        source: createEmptyAllFlatEntityMaps(),
        target,
        applications: applications as any,
      }),
    ).toThrow(/unknown or foreign Standard dependency rolePermissionFlag/);
    expect(target).toEqual(before);
  });

  it('rejects a widget owned by a different layout that directly targets Brand Brain', () => {
    const { existing, target, applications } = makeStandardGraph();
    add(existing, 'pageLayoutWidget', {
      id: 'shared-widget',
      applicationId: 'standard-app-id',
      universalIdentifier: 'shared-widget-uid',
      pageLayoutTabId: 'retained-other-tab',
      objectMetadataId: 'old-object-0',
      objectMetadataUniversalIdentifier: OBJECT_UIDS[0],
    });
    const before = structuredClone(target);
    expect(() =>
      projectLegacyBrandBrainStandardTarget({
        existing,
        source: createEmptyAllFlatEntityMaps(),
        target,
        applications: applications as any,
      }),
    ).toThrow(/shared Brand Brain widget ancestry/);
    expect(target).toEqual(before);
  });

  it('preserves an installed availability-scoped command and rejects a foreign one', () => {
    const { existing, target, applications } = makeStandardGraph();
    add(existing, 'commandMenuItem', {
      id: 'brain-command',
      applicationId: 'standard-app-id',
      universalIdentifier: 'brain-command-uid',
      availabilityObjectMetadataId: 'old-object-0',
      availabilityObjectMetadataUniversalIdentifier: OBJECT_UIDS[0],
    });
    const source = createEmptyAllFlatEntityMaps();
    projectLegacyBrandBrainStandardTarget({
      existing,
      source,
      target,
      applications: applications as any,
    });
    expect(
      source.flatCommandMenuItemMaps.byUniversalIdentifier['brain-command-uid'],
    ).toBe(
      existing.flatCommandMenuItemMaps.byUniversalIdentifier[
        'brain-command-uid'
      ],
    );
    expect(
      target.flatCommandMenuItemMaps.byUniversalIdentifier['brain-command-uid'],
    ).toBe(
      existing.flatCommandMenuItemMaps.byUniversalIdentifier[
        'brain-command-uid'
      ],
    );

    const foreign = makeStandardGraph();
    add(foreign.existing, 'commandMenuItem', {
      id: 'foreign-command',
      applicationId: 'foreign',
      universalIdentifier: 'foreign-command-uid',
      availabilityObjectMetadataId: 'old-object-0',
    });
    expect(() =>
      projectLegacyBrandBrainStandardTarget({
        existing: foreign.existing,
        source: createEmptyAllFlatEntityMaps(),
        target: foreign.target,
        applications: foreign.applications as any,
      }),
    ).toThrow(/unknown or foreign Standard dependency commandMenuItem/);
  });

  it('suppresses candidate-only Brand Brain dependencies without creating missing fields or relations', () => {
    const { existing, target, applications } = makeStandardGraph();
    add(target, 'fieldMetadata', {
      id: 'new-field',
      applicationId: 'standard-app-id',
      universalIdentifier: 'new-brain-field',
      objectMetadataUniversalIdentifier: OBJECT_UIDS[0],
    });
    add(target, 'fieldMetadata', {
      id: 'new-reciprocal',
      applicationId: 'standard-app-id',
      universalIdentifier: 'new-note-reciprocal',
      relationTargetObjectMetadataUniversalIdentifier: OBJECT_UIDS[0],
    });
    add(target, 'index', {
      id: 'new-index',
      applicationId: 'standard-app-id',
      universalIdentifier: 'new-index-uid',
      universalFlatIndexFieldMetadatas: [
        { fieldMetadataUniversalIdentifier: 'new-brain-field' },
      ],
    });
    const source = createEmptyAllFlatEntityMaps();
    projectLegacyBrandBrainStandardTarget({
      existing,
      source,
      target,
      applications: applications as any,
    });
    for (const uid of ['new-brain-field', 'new-note-reciprocal']) {
      expect(
        target.flatFieldMetadataMaps.byUniversalIdentifier[uid],
      ).toBeUndefined();
      expect(
        source.flatFieldMetadataMaps.byUniversalIdentifier[uid],
      ).toBeUndefined();
    }
    expect(
      target.flatIndexMaps.byUniversalIdentifier['new-index-uid'],
    ).toBeUndefined();
  });

  it('rejects incomplete, mixed or foreign Standard-owned graphs without mutating projection', () => {
    for (const corrupt of [
      (existing: any) => {
        delete existing.flatObjectMetadataMaps.byUniversalIdentifier[
          OBJECT_UIDS[2]
        ];
      },
      (existing: any) => {
        existing.flatObjectMetadataMaps.byUniversalIdentifier[
          OBJECT_UIDS[0]
        ].applicationId = 'foreign';
      },
      (existing: any) => {
        existing.flatFieldMetadataMaps.byUniversalIdentifier[
          'note-task-reciprocal-0'
        ].applicationId = 'foreign';
      },
      (existing: any) => {
        add(existing, 'pageLayout', {
          id: 'foreign-layout',
          applicationId: 'foreign',
          universalIdentifier: 'foreign-layout-uid',
          objectMetadataId: 'old-object-0',
        });
      },
      (existing: any) => {
        add(existing, 'agent', {
          id: 'unexpected-agent',
          applicationId: 'standard-app-id',
          universalIdentifier: 'unexpected-agent-uid',
          objectMetadataUniversalIdentifier: OBJECT_UIDS[0],
        });
      },
    ]) {
      const { existing, target, applications } = makeStandardGraph();
      corrupt(existing);
      const before = structuredClone(target);
      expect(() =>
        projectLegacyBrandBrainStandardTarget({
          existing,
          source: createEmptyAllFlatEntityMaps(),
          target,
          applications: applications as any,
        }),
      ).toThrow(/Unsafe/);
      expect(target).toEqual(before);
    }
  });
  it('preserves real old-owner identities and permissions while suppressing canonical closure, leaving Creator/Campaign intact', () => {
    const { existing, target, applications, oldId } = makeGraph();
    const source = createEmptyAllFlatEntityMaps();
    projectLegacyBrandBrainStandardTarget({
      existing,
      source,
      target,
      applications: applications as any,
    });
    for (const uid of OBJECT_UIDS) {
      expect(target.flatObjectMetadataMaps.byUniversalIdentifier[uid]).toBe(
        existing.flatObjectMetadataMaps.byUniversalIdentifier[uid],
      );
    }
    expect(
      Object.values(target.flatFieldMetadataMaps.byUniversalIdentifier),
    ).toHaveLength(28);
    for (const field of Object.values(
      target.flatFieldMetadataMaps.byUniversalIdentifier,
    ) as any[]) {
      expect(field.applicationId).toBe(oldId);
      expect(field.id).toMatch(/^old-/);
      expect(
        source.flatFieldMetadataMaps.byUniversalIdentifier[
          field.universalIdentifier
        ],
      ).toBe(field);
      expect(
        target.flatFieldMetadataMaps.universalIdentifierById[field.id],
      ).toBe(field.universalIdentifier);
    }
    expect(target.flatRoleMaps.byUniversalIdentifier[OLD_ROLE_UID]).toBe(
      existing.flatRoleMaps.byUniversalIdentifier[OLD_ROLE_UID],
    );
    expect(
      Object.values(target.flatObjectPermissionMaps.byUniversalIdentifier),
    ).toEqual(
      Object.values(existing.flatObjectPermissionMaps.byUniversalIdentifier),
    );
    expect(
      target.flatPageLayoutMaps.byUniversalIdentifier['brain-layout'],
    ).toBeUndefined();
    expect(
      target.flatNavigationMenuItemMaps.byUniversalIdentifier['brain-menu'],
    ).toBeUndefined();
    expect(
      target.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      target.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
      ],
    ).toBeDefined();
    expect(
      target.flatFieldMetadataMaps.universalIdentifierById[
        'canonical-field-0-0'
      ],
    ).toBeUndefined();
  });

  it('fails closed when known objects or role have contradictory owners', () => {
    const { existing, target, applications } = makeGraph();
    (
      existing.flatObjectMetadataMaps.byUniversalIdentifier[
        OBJECT_UIDS[0]
      ] as any
    ).applicationId = 'foreign';
    expect(() =>
      projectLegacyBrandBrainStandardTarget({
        existing,
        source: createEmptyAllFlatEntityMaps(),
        target,
        applications: applications as any,
      }),
    ).toThrow(/mixed-owner/);
  });

  it('does not create an absent old role or reciprocal endpoint', () => {
    const { existing, target, applications } = makeGraph();
    delete existing.flatRoleMaps.byUniversalIdentifier[OLD_ROLE_UID];
    existing.flatObjectPermissionMaps =
      createEmptyAllFlatEntityMaps().flatObjectPermissionMaps;
    delete existing.flatFieldMetadataMaps.byUniversalIdentifier[
      'note-task-reciprocal-0'
    ];
    const source = createEmptyAllFlatEntityMaps();

    projectLegacyBrandBrainStandardTarget({
      existing,
      source,
      target,
      applications: applications as any,
    });

    expect(
      target.flatRoleMaps.byUniversalIdentifier[OLD_ROLE_UID],
    ).toBeUndefined();
    expect(
      target.flatFieldMetadataMaps.byUniversalIdentifier[
        'note-task-reciprocal-0'
      ],
    ).toBeUndefined();
  });

  it('does not synthesize legacy entities when no recognized application exists', () => {
    const { existing, target } = makeGraph();
    const source = createEmptyAllFlatEntityMaps();
    projectLegacyBrandBrainStandardTarget({
      existing: createEmptyAllFlatEntityMaps(),
      source,
      target,
      applications: { byId: {}, idByUniversalIdentifier: {} } as any,
    });
    expect(
      target.flatObjectMetadataMaps.byUniversalIdentifier[OBJECT_UIDS[0]]?.id,
    ).toBe('canonical-object-0');
    expect(
      source.flatObjectMetadataMaps.byUniversalIdentifier[OBJECT_UIDS[0]],
    ).toBeUndefined();
    expect(
      existing.flatObjectMetadataMaps.byUniversalIdentifier[OBJECT_UIDS[0]],
    ).toBeDefined();
  });
});
