import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { buildOrphanedObjectNavigationCommandRepairPlan } from 'src/database/commands/upgrade-version-command/2-20/utils/build-orphaned-object-navigation-command-repair-plan.util';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { buildNavigationFlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/utils/build-navigation-flat-command-menu-item.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const APPLICATION_ID = 'standard-application';
const buildMaps = <T extends FlatCommandMenuItem | FlatObjectMetadata>(
  entities: T[],
): FlatEntityMaps<T> => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});
const object = getFlatObjectMetadataMock({
  universalIdentifier: 'current-object',
  id: 'current-id',
});
const navigation = (target = object): FlatCommandMenuItem =>
  buildNavigationFlatCommandMenuItem({
    objectMetadata: { ...target, id: 'missing-id' },
    commandMenuItemId: `command-${target.universalIdentifier}`,
    applicationId: APPLICATION_ID,
    applicationUniversalIdentifier:
      TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    workspaceId: 'workspace-id',
    position: 7,
    now: '2026-01-01T00:00:00.000Z',
  });
const plan = (objects: FlatObjectMetadata[], commands: FlatCommandMenuItem[]) =>
  buildOrphanedObjectNavigationCommandRepairPlan({
    flatObjectMetadataMaps: buildMaps(objects),
    flatCommandMenuItemMaps: buildMaps(commands),
    twentyStandardApplicationId: APPLICATION_ID,
  });
const emptyPlan = {
  operations: {
    flatEntityToCreate: [],
    flatEntityToUpdate: [],
    flatEntityToDelete: [],
  },
  unclassifiedOrphanCommandUniversalIdentifiers: [],
};

describe('buildOrphanedObjectNavigationCommandRepairPlan', () => {
  it('repairs only the payload of the deterministic active-object command without mutating input', () => {
    const command = navigation();
    const before = structuredClone(command);
    expect(plan([object], [command])).toEqual({
      ...emptyPlan,
      operations: {
        ...emptyPlan.operations,
        flatEntityToUpdate: [
          { ...command, payload: { objectMetadataItemId: object.id } },
        ],
      },
    });
    expect(command).toEqual(before);
  });

  it('never creates missing commands, including helper objects', () => {
    expect(
      plan(
        [
          object,
          getFlatObjectMetadataMock({
            universalIdentifier: 'campaignCreatorList',
          }),
          getFlatObjectMetadataMock({
            universalIdentifier: 'campaignCreatorListSource',
          }),
        ],
        [],
      ),
    ).toEqual(emptyPlan);
  });

  it('preserves any resolving target, including an inactive different object', () => {
    const inactive = getFlatObjectMetadataMock({
      universalIdentifier: 'inactive',
      id: 'missing-id',
      isActive: false,
    });
    expect(plan([object, inactive], [navigation()])).toEqual(emptyPlan);
  });

  it.each([
    { applicationId: 'custom-app' },
    { isSystemSideEffect: false },
    { engineComponentKey: EngineComponentKey.FRONT_COMPONENT_RENDERER },
    { payload: { path: '/settings' } },
    { payload: null },
  ])(
    'preserves commands outside the standard/system/object-navigation boundary: %j',
    (overrides) => {
      expect(plan([object], [{ ...navigation(), ...overrides }])).toEqual(
        emptyPlan,
      );
    },
  );

  it.each([
    { objectMetadataItemId: 'missing-id', path: '/settings' },
    { objectMetadataItemId: '' },
    { objectMetadataItemId: 'missing-id', extra: true },
    { objectMetadataItemId: null },
    { objectMetadataItemId: 123 },
    Object.assign([], { objectMetadataItemId: 'missing-id' }),
  ])('diagnoses but never mutates malformed/hybrid payload %j', (payload) => {
    const command = {
      ...navigation(),
      payload: payload as FlatCommandMenuItem['payload'],
    };
    expect(plan([object], [command])).toEqual({
      ...emptyPlan,
      unclassifiedOrphanCommandUniversalIdentifiers: [
        command.universalIdentifier,
      ],
    });
  });

  it('diagnoses unknown identities without inferring from matching labels or expressions', () => {
    const command = {
      ...navigation(),
      universalIdentifier: 'unknown-identity',
    };
    expect(plan([object], [command])).toEqual({
      ...emptyPlan,
      unclassifiedOrphanCommandUniversalIdentifiers: ['unknown-identity'],
    });
  });

  it('diagnoses inactive-object orphans instead of repairing them', () => {
    const command = navigation();
    expect(plan([{ ...object, isActive: false }], [command])).toEqual({
      ...emptyPlan,
      unclassifiedOrphanCommandUniversalIdentifiers: [
        command.universalIdentifier,
      ],
    });
  });

  it('deletes only the three absent CRM identities with orphan targets', () => {
    const commands = [
      STANDARD_OBJECTS.person,
      STANDARD_OBJECTS.company,
      STANDARD_OBJECTS.opportunity,
    ].map(({ universalIdentifier }) =>
      navigation(getFlatObjectMetadataMock({ universalIdentifier })),
    );
    const custom = {
      ...commands[0],
      universalIdentifier: 'custom-lookalike',
      applicationId: 'custom-app',
    };
    const result = plan([object], [...commands, custom]);
    expect(result).toEqual({
      ...emptyPlan,
      operations: {
        ...emptyPlan.operations,
        flatEntityToDelete: [...commands].sort((a, b) =>
          a.universalIdentifier.localeCompare(b.universalIdentifier),
        ),
      },
    });
    expect(
      plan(
        [object],
        [{ ...commands[0], payload: { objectMetadataItemId: object.id } }],
      ),
    ).toEqual(emptyPlan);
  });

  it.each(['person', 'company', 'opportunity'] as const)(
    'preserves valid full-workspace %s and repairs its orphan instead of deleting',
    (name) => {
      const current = getFlatObjectMetadataMock({
        universalIdentifier: STANDARD_OBJECTS[name].universalIdentifier,
      });
      const command = navigation(current);
      const repaired = {
        ...command,
        payload: { objectMetadataItemId: current.id },
      };
      expect(plan([current], [repaired])).toEqual(emptyPlan);
      expect(plan([current], [command])).toEqual({
        ...emptyPlan,
        operations: { ...emptyPlan.operations, flatEntityToUpdate: [repaired] },
      });
    },
  );

  it('sorts all outputs by identity and is idempotent after applying operations', () => {
    const objects = ['z', 'a', 'b'].map((universalIdentifier) =>
      getFlatObjectMetadataMock({ universalIdentifier }),
    );
    const removed = [
      STANDARD_OBJECTS.company,
      STANDARD_OBJECTS.person,
      STANDARD_OBJECTS.opportunity,
    ].map(({ universalIdentifier }) =>
      navigation(getFlatObjectMetadataMock({ universalIdentifier })),
    );
    const commands = [...objects.map(navigation), ...removed];
    const result = plan(objects, commands);
    for (const operations of [
      result.operations.flatEntityToUpdate,
      result.operations.flatEntityToDelete,
    ]) {
      const identities = operations.map(
        ({ universalIdentifier }) => universalIdentifier,
      );
      expect(identities).toEqual([...identities].sort());
    }
    expect(plan(objects, [...commands].reverse())).toEqual(result);
    expect(
      plan(
        objects,
        objects.map(navigation).map((command) => ({
          ...command,
          ...result.operations.flatEntityToUpdate.find(
            ({ universalIdentifier }) =>
              universalIdentifier === command.universalIdentifier,
          ),
        })),
      ),
    ).toEqual(emptyPlan);
    const unknown = ['z-unknown', 'a-unknown'].map((universalIdentifier) => ({
      ...navigation(),
      universalIdentifier,
    }));
    expect(
      plan(objects, unknown).unclassifiedOrphanCommandUniversalIdentifiers,
    ).toEqual(['a-unknown', 'z-unknown']);
  });
});
