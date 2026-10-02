import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { rebindPinnedInstagramAbsentTargetIds } from 'src/database/commands/upgrade-version-command/2-20/utils/rebind-pinned-instagram-absent-target-ids.util';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { getSubFlatEntityMapsByUniversalIdentifiersOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-universal-identifiers-or-throw.util';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const workspaceId = '20202020-0000-4000-8000-000000000002';
const standardApplicationId = '20202020-0000-4000-8000-000000000001';
const creatorUid = MYAH_STANDARD_OBJECTS.creator.universalIdentifier;
const objects = [
  MYAH_STANDARD_OBJECTS.myahInstagramAccount,
  MYAH_STANDARD_OBJECTS.myahSocialConversation,
  MYAH_STANDARD_OBJECTS.myahSocialMessage,
  MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft,
];
const objectUids = objects.map(({ universalIdentifier }) => universalIdentifier);
const fieldUids = new Set([
  ...objects.flatMap(({ fields }) => Object.values(fields).map(({ universalIdentifier }) => universalIdentifier)),
  MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts.universalIdentifier,
]);
const indexUids = objects.flatMap(({ indexes }) => Object.values(indexes).map(({ universalIdentifier }) => universalIdentifier));

const fixture = () => {
  const computed = computeTwentyStandardApplicationAllFlatEntityMaps({
    workspaceId,
    twentyStandardApplicationId: standardApplicationId,
    now: '2026-09-28T00:00:00.000Z',
  });
  const { allFlatEntityMaps, idByUniversalIdentifierByMetadataName } = computed;
  const target = {
    flatObjectMetadataMaps: getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
      flatEntityMaps: allFlatEntityMaps.flatObjectMetadataMaps,
      universalIdentifiers: new Set([creatorUid, ...objectUids]),
    }),
    flatFieldMetadataMaps: getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
      flatEntityMaps: allFlatEntityMaps.flatFieldMetadataMaps,
      universalIdentifiers: fieldUids,
    }),
    flatIndexMaps: getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
      flatEntityMaps: allFlatEntityMaps.flatIndexMaps,
      universalIdentifiers: new Set(indexUids),
    }),
  };
  const ids = {
    objectMetadata: Object.fromEntries([creatorUid, ...objectUids].map((uid) => [uid, idByUniversalIdentifierByMetadataName.objectMetadata![uid]])),
    fieldMetadata: Object.fromEntries([...fieldUids].map((uid) => [uid, idByUniversalIdentifierByMetadataName.fieldMetadata![uid]])),
    index: Object.fromEntries(indexUids.map((uid) => [uid, idByUniversalIdentifierByMetadataName.index![uid]])),
  };
  const before = { ...createEmptyAllFlatEntityMaps(), ...structuredClone(allFlatEntityMaps) };
  for (const uid of objectUids) {
    delete before.flatObjectMetadataMaps.byUniversalIdentifier[uid];
    delete before.flatObjectMetadataMaps.universalIdentifierById[ids.objectMetadata[uid]];
  }
  for (const uid of fieldUids) {
    delete before.flatFieldMetadataMaps.byUniversalIdentifier[uid];
    delete before.flatFieldMetadataMaps.universalIdentifierById[ids.fieldMetadata[uid]];
  }
  for (const uid of indexUids) {
    delete before.flatIndexMaps.byUniversalIdentifier[uid];
    delete before.flatIndexMaps.universalIdentifierById[ids.index[uid]];
  }
  // The standard definition allocates a new transient Creator ID. The real
  // populated workspace has an older stable physical ID that must win.
  const physicalCreatorId = '00000000-0000-4000-8000-000000000006';
  const creator = before.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]!;
  delete before.flatObjectMetadataMaps.universalIdentifierById[creator.id];
  creator.id = physicalCreatorId;
  before.flatObjectMetadataMaps.universalIdentifierById[physicalCreatorId] = creatorUid;
  for (const field of Object.values(before.flatFieldMetadataMaps.byUniversalIdentifier)) {
    if (field?.objectMetadataUniversalIdentifier === creatorUid) field.objectMetadataId = physicalCreatorId;
    if (field?.relationTargetObjectMetadataUniversalIdentifier === creatorUid) {
      field.relationTargetObjectMetadataId = physicalCreatorId;
    }
  }
  return { workspaceId, standardApplicationId, before, target, ids, physicalCreatorId };
};
const project = (input: ReturnType<typeof fixture>) =>
  rebindPinnedInstagramAbsentTargetIds(input);

describe('3604-only pinned absent target ID rebinding (not wired)', () => {
  it('uses existing Creator ID for both reverse fields and every Instagram-to-Creator edge without mutating inputs', () => {
    const input = fixture();
    const originalBefore = structuredClone(input.before);
    const originalTarget = structuredClone(input.target);
    const originalIds = structuredClone(input.ids);
    const result = project(input);
    expect(result.ids.objectMetadata[creatorUid]).toBe(input.physicalCreatorId);
    expect(result.target.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]!.id).toBe(input.physicalCreatorId);
    expect(Object.entries(result.target.flatObjectMetadataMaps.universalIdentifierById)
      .filter(([, uid]) => uid === creatorUid)).toEqual([[input.physicalCreatorId, creatorUid]]);
    for (const uid of fieldUids) {
      const field = result.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!;
      if (field.objectMetadataUniversalIdentifier === creatorUid) {
        expect(field.objectMetadataId).toBe(input.physicalCreatorId);
      }
      if (field.relationTargetObjectMetadataUniversalIdentifier === creatorUid) {
        expect(field.relationTargetObjectMetadataId).toBe(input.physicalCreatorId);
      }
      if (field.objectMetadataUniversalIdentifier !== creatorUid &&
        field.relationTargetObjectMetadataUniversalIdentifier !== creatorUid) {
        expect(field).toEqual(input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]);
      }
    }
    for (const uid of indexUids) {
      const index = result.target.flatIndexMaps.byUniversalIdentifier[uid]!;
      expect(index.objectMetadataId).toBe(result.ids.objectMetadata[index.objectMetadataUniversalIdentifier!]);
      expect(index.flatIndexFieldMetadatas.map((field) => field.fieldMetadataId)).toEqual(
        index.universalFlatIndexFieldMetadatas.map((field) => result.ids.fieldMetadata[field.fieldMetadataUniversalIdentifier]),
      );
    }
    expect(input.before).toEqual(originalBefore);
    expect(input.target).toEqual(originalTarget);
    expect(input.ids).toEqual(originalIds);
  });

  it.each([
    ['missing Creator', (input: ReturnType<typeof fixture>) => { delete input.before.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]; }],
    ['foreign Creator owner', (input: ReturnType<typeof fixture>) => { input.before.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]!.applicationId = '00000000-0000-4000-8000-000000000007'; }],
    ['inconsistent Creator reverse ID index', (input: ReturnType<typeof fixture>) => { delete input.before.flatObjectMetadataMaps.universalIdentifierById[input.physicalCreatorId]; }],
    ['partial Creator reverse field', (input: ReturnType<typeof fixture>) => { const uid = MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier; input.before.flatFieldMetadataMaps.byUniversalIdentifier[uid] = input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]; }],
    ['source reverse index still owns a selected UID', (input: ReturnType<typeof fixture>) => {
      input.before.flatFieldMetadataMaps.universalIdentifierById['00000000-0000-4000-8000-000000000009'] = MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier;
    }],
    ['extra target object', (input: ReturnType<typeof fixture>) => { const uid = '00000000-0000-4000-8000-000000000007'; input.target.flatObjectMetadataMaps.byUniversalIdentifier[uid] = { ...input.target.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]!, universalIdentifier: uid }; }],
    ['extra target field', (input: ReturnType<typeof fixture>) => { const uid = '00000000-0000-4000-8000-000000000007'; input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid] = { ...input.target.flatFieldMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.id.universalIdentifier]!, universalIdentifier: uid }; }],
    ['extra target index', (input: ReturnType<typeof fixture>) => { const uid = '00000000-0000-4000-8000-000000000007'; input.target.flatIndexMaps.byUniversalIdentifier[uid] = { ...input.target.flatIndexMaps.byUniversalIdentifier[indexUids[0]]!, universalIdentifier: uid }; }],
    ['duplicate selected field IDs', (input: ReturnType<typeof fixture>) => { input.ids.fieldMetadata[[...fieldUids][0]] = input.ids.fieldMetadata[[...fieldUids][1]]; }],
    ['colliding selected object and existing Creator ID', (input: ReturnType<typeof fixture>) => { input.ids.objectMetadata[objectUids[0]] = input.physicalCreatorId; input.target.flatObjectMetadataMaps.byUniversalIdentifier[objectUids[0]]!.id = input.physicalCreatorId; }],
    ['wrong object parent ID', (input: ReturnType<typeof fixture>) => { const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.id.universalIdentifier; input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.objectMetadataId = '00000000-0000-4000-8000-000000000007'; }],
    ['Creator endpoint scalar aliases another existing object', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahSocialConversation.fields.creator.universalIdentifier;
      const foreign = Object.values(input.before.flatObjectMetadataMaps.byUniversalIdentifier)
        .find((object) => object && object.universalIdentifier !== creatorUid)!;
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.relationTargetObjectMetadataId = foreign.id;
    }],
    ['foreign Creator endpoint ID with missing source reverse entry', (input: ReturnType<typeof fixture>) => {
      const foreign = Object.values(input.before.flatObjectMetadataMaps.byUniversalIdentifier)
        .find((object) => object && object.universalIdentifier !== creatorUid)!;
      delete input.before.flatObjectMetadataMaps.universalIdentifierById[foreign.id];
      const uid = MYAH_STANDARD_OBJECTS.myahSocialConversation.fields.creator.universalIdentifier;
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.relationTargetObjectMetadataId = foreign.id;
    }],
    ['foreign transient Creator ID with missing source reverse entry', (input: ReturnType<typeof fixture>) => {
      const foreign = Object.values(input.before.flatObjectMetadataMaps.byUniversalIdentifier)
        .find((object) => object && object.universalIdentifier !== creatorUid)!;
      delete input.before.flatObjectMetadataMaps.universalIdentifierById[foreign.id];
      const targetCreator = input.target.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]!;
      delete input.target.flatObjectMetadataMaps.universalIdentifierById[targetCreator.id];
      targetCreator.id = foreign.id;
      input.ids.objectMetadata[creatorUid] = foreign.id;
      input.target.flatObjectMetadataMaps.universalIdentifierById[foreign.id] = creatorUid;
    }],
    ['extra target Creator reverse alias', (input: ReturnType<typeof fixture>) => {
      input.target.flatObjectMetadataMaps.universalIdentifierById['00000000-0000-4000-8000-000000000009'] = creatorUid;
    }],
    ['inconsistent target Creator reverse identity', (input: ReturnType<typeof fixture>) => {
      const targetCreator = input.target.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid]!;
      input.target.flatObjectMetadataMaps.universalIdentifierById[targetCreator.id] = objectUids[0];
    }],
    ['missing Creator endpoint scalar', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahSocialConversation.fields.creator.universalIdentifier;
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.relationTargetObjectMetadataId = null;
    }],
  ])('rejects %s before producing a target', (_name, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() => project(input)).toThrow('Unsafe pinned 3604 target');
  });
});
