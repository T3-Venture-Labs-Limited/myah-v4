import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { assertPinnedStandardMetadataActions } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const standardApplicationId = '20202020-0000-4000-8000-000000000001';
const workspaceId = '20202020-0000-4000-8000-000000000002';
const uid = '27519164-4421-49a2-a988-8bd4a6f18f89';

const fixture = () => {
  const { allFlatEntityMaps } = computeTwentyStandardApplicationAllFlatEntityMaps({
    workspaceId,
    twentyStandardApplicationId: standardApplicationId,
    now: '2026-09-27T00:00:00.000Z',
  });
  const target = allFlatEntityMaps.flatFieldMetadataMaps;
  const before = structuredClone(target);
  const oldField = before.byUniversalIdentifier[uid]!;
  const newField = target.byUniversalIdentifier[uid]!;
  oldField.universalSettings = {
    ...oldField.universalSettings,
    junctionTargetFieldId: '20202020-0000-4000-8000-000000000003',
  } as unknown as typeof oldField.universalSettings;
  const action = {
    type: 'update',
    metadataName: 'fieldMetadata',
    universalIdentifier: uid,
    update: { universalSettings: newField.universalSettings },
    diff: {
      universalSettings: {
        before: oldField.universalSettings,
        after: newField.universalSettings,
      },
    },
    flatEntity: {
      universalIdentifier: uid,
      applicationUniversalIdentifier:
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
      objectMetadataUniversalIdentifier:
        oldField.objectMetadataUniversalIdentifier,
      relationTargetObjectMetadataUniversalIdentifier:
        oldField.relationTargetObjectMetadataUniversalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        oldField.relationTargetFieldMetadataUniversalIdentifier,
      universalSettings: newField.universalSettings,
    },
  };
  const migration = {
    applicationUniversalIdentifier:
      TWENTY_STANDARD_APPLICATION.universalIdentifier,
    actions: [action],
  };
  return { before, target, migration, action };
};

describe('pinned 2001 native action boundary', () => {
  it('accepts only the known Standard-owned universalSettings projection', () => {
    const input = fixture();
    expect(() =>
      assertPinnedStandardMetadataActions({
        ...input,
        standardApplicationId,
        migration: input.migration as never,
      }),
    ).not.toThrow();
  });

  it.each([
    ['deletion', (input: ReturnType<typeof fixture>) => { input.action.type = 'delete'; }],
    ['foreign UID', (input: ReturnType<typeof fixture>) => { input.action.universalIdentifier = MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier; }],
    ['extra write', (input: ReturnType<typeof fixture>) => { (input.action.update as Record<string, unknown>).label = 'bad'; }],
    ['wrong native diff', (input: ReturnType<typeof fixture>) => { input.action.diff.universalSettings.after = { bad: true } as never; }],
    ['foreign native owner', (input: ReturnType<typeof fixture>) => { input.action.flatEntity.applicationUniversalIdentifier = 'foreign' as never; }],
    ['changed relation', (input: ReturnType<typeof fixture>) => { input.action.flatEntity.objectMetadataUniversalIdentifier = 'foreign'; }],
    ['foreign source owner', (input: ReturnType<typeof fixture>) => { input.before.byUniversalIdentifier[uid]!.applicationId = 'foreign'; }],
  ])('rejects %s before mutation', (_name, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() =>
      assertPinnedStandardMetadataActions({
        ...input,
        standardApplicationId,
        migration: input.migration as never,
      }),
    ).toThrow('Unsafe pinned 2001');
  });
});
