import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { assertPinnedInstagramAbsentPlan } from 'src/database/commands/upgrade-version-command/2-20/utils/assert-pinned-instagram-absent-plan.util';
import { ALL_UNIVERSAL_FLAT_ENTITY_FOREIGN_KEY_AGGREGATOR_PROPERTIES } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/constants/all-universal-flat-entity-foreign-key-aggregator-properties.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const workspaceId = '20202020-0000-4000-8000-000000000002';
const standardApplicationId = '20202020-0000-4000-8000-000000000001';
const objectNames = ['myahInstagramAccount', 'myahSocialConversation', 'myahSocialMessage', 'myahInstagramReplyDraft'] as const;
// The real dry-run has five relation-pair actions; the two Creator reverse fields
// are primary actions, not nested in an object-create action.
const pairUids = [
  ['c46dbf9f-ceaf-4fb5-a7b9-8b05dd579935', '6b26848c-ab3b-45dd-ad62-9d194512b116'],
  ['f072449f-7fc3-4481-b9d3-b255add4a574', '2cc8ea09-7c86-41bd-80ea-efcc5edc81e5'],
  ['08930cbe-877b-484d-8570-4ad1b8f8f5c0', '64c89b5d-9b54-4fb0-804e-b0c3cd110711'],
  ['49f3eeac-b8a5-4362-827a-7dc597d2dcb4', '80670f08-59e0-4f45-9058-e7221d66b95f'],
  ['006182fc-786f-4ea3-8168-6a5d440d76ac', 'cbf131df-81b8-4ff5-aadf-42f6ae55d6c8'],
] as const;

const fixture = () => {
  const { allFlatEntityMaps: target, idByUniversalIdentifierByMetadataName: ids } =
    computeTwentyStandardApplicationAllFlatEntityMaps({
      workspaceId,
      twentyStandardApplicationId: standardApplicationId,
      now: '2026-09-28T00:00:00.000Z',
    });
  const before = structuredClone(target);
  const objectUids = objectNames.map((name) => MYAH_STANDARD_OBJECTS[name].universalIdentifier);
  const fieldUids = new Set([
    ...objectNames.flatMap((name) => Object.values(MYAH_STANDARD_OBJECTS[name].fields).map(({ universalIdentifier }) => universalIdentifier)),
    MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier,
    MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts.universalIdentifier,
  ]);
  const indexUids = objectNames.flatMap((name) => Object.values(MYAH_STANDARD_OBJECTS[name].indexes).map(({ universalIdentifier }) => universalIdentifier));
  for (const uid of objectUids) {
    delete before.flatObjectMetadataMaps.byUniversalIdentifier[uid];
    delete before.flatObjectMetadataMaps.universalIdentifierById[ids.objectMetadata![uid]];
  }
  for (const uid of fieldUids) {
    delete before.flatFieldMetadataMaps.byUniversalIdentifier[uid];
    delete before.flatFieldMetadataMaps.universalIdentifierById[ids.fieldMetadata![uid]];
  }
  for (const uid of indexUids) {
    delete before.flatIndexMaps.byUniversalIdentifier[uid];
    delete before.flatIndexMaps.universalIdentifierById[ids.index![uid]];
  }
  const fieldMap = target.flatFieldMetadataMaps.byUniversalIdentifier;
  const projection = (value: object, metadataName: 'objectMetadata' | 'fieldMetadata' | 'index') =>
    Object.fromEntries(Object.entries(value).filter(([key]) =>
      !ALL_UNIVERSAL_FLAT_ENTITY_FOREIGN_KEY_AGGREGATOR_PROPERTIES[metadataName].includes(key as never)));
  const paired = new Set(pairUids.flat());
  const actions = [
    ...objectUids.map((uid) => {
      const fields = [...fieldUids].filter((fieldUid) =>
        fieldMap[fieldUid]?.objectMetadataUniversalIdentifier === uid && !paired.has(fieldUid));
      return {
        type: 'create', metadataName: 'objectMetadata',
        flatEntity: projection(target.flatObjectMetadataMaps.byUniversalIdentifier[uid]!, 'objectMetadata'),
        id: ids.objectMetadata?.[uid],
        universalFlatFieldMetadatas: fields.map((fieldUid) => projection(fieldMap[fieldUid]!, 'fieldMetadata')),
        fieldIdByUniversalIdentifier: Object.fromEntries(fields.map((fieldUid) => [fieldUid, ids.fieldMetadata?.[fieldUid]])),
      };
    }),
    ...pairUids.map(([uid, relatedUid]) => ({
      type: 'create', metadataName: 'fieldMetadata',
      flatEntity: projection(fieldMap[uid]!, 'fieldMetadata'), id: ids.fieldMetadata?.[uid],
      relatedUniversalFlatFieldMetadata: projection(fieldMap[relatedUid]!, 'fieldMetadata'),
      relatedFieldId: ids.fieldMetadata?.[relatedUid],
      fieldIdByUniversalIdentifier: {
        [uid]: ids.fieldMetadata?.[uid], [relatedUid]: ids.fieldMetadata?.[relatedUid],
      },
    })),
    ...indexUids.map((uid) => ({
      type: 'create', metadataName: 'index',
      flatEntity: projection(target.flatIndexMaps.byUniversalIdentifier[uid]!, 'index'),
      id: ids.index?.[uid],
    })),
  ];
  const input = {
    migration: { applicationUniversalIdentifier: '20202020-64aa-4b6f-b003-9c74b97cee20', actions },
    target, before, ids, workspaceId, standardApplicationId,
  };
  return input;
};

const assert = (input: ReturnType<typeof fixture>) =>
  assertPinnedInstagramAbsentPlan(input as never);

const addForeignObject = (input: ReturnType<typeof fixture>) => {
  const foreignUid = '00000000-0000-4000-8000-000000000003';
  const foreignId = '00000000-0000-4000-8000-000000000004';
  const creator = input.before.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.creator.universalIdentifier]!;
  const foreign = {
    ...creator,
    id: foreignId,
    universalIdentifier: foreignUid,
    applicationId: '00000000-0000-4000-8000-000000000005',
    nameSingular: 'unrelatedForeign',
    namePlural: 'unrelatedForeigns',
    targetTableName: 'DEPRECATED',
  };
  input.before.flatObjectMetadataMaps.byUniversalIdentifier[foreignUid] = foreign;
  input.before.flatObjectMetadataMaps.universalIdentifierById[foreignId] = foreignUid;
  return foreign;
};

describe('pinned 3604 absent-graph native plan guard (not wired to apply)', () => {
  it('accepts the actual 4 nested-object + 5 relation-pair + 5 index action shape', () => {
    const input = fixture();
    expect(input.migration.actions.map(({ metadataName }) => metadataName)).toEqual([
      ...Array(4).fill('objectMetadata'), ...Array(5).fill('fieldMetadata'), ...Array(5).fill('index'),
    ]);
    expect(input.migration.actions.slice(0, 4).map((action) => ('universalFlatFieldMetadatas' in action && Array.isArray(action.universalFlatFieldMetadatas) ? action.universalFlatFieldMetadatas.length : 0))).toEqual([22, 17, 19, 25]);
    expect(() => assert(input)).not.toThrow();
  });

  it('accepts the real 2001 native target projection with only cache-derived isUnique omitted', () => {
    const input = fixture();
    for (const field of Object.values(input.target.flatFieldMetadataMaps.byUniversalIdentifier)) {
      if (field) Reflect.deleteProperty(field, 'isUnique');
    }
    for (const action of input.migration.actions) {
      if ('universalFlatFieldMetadatas' in action && Array.isArray(action.universalFlatFieldMetadatas)) {
        for (const field of action.universalFlatFieldMetadatas) Reflect.deleteProperty(field, 'isUnique');
      }
      if (action.metadataName === 'fieldMetadata') {
        Reflect.deleteProperty(action.flatEntity, 'isUnique');
        if ('relatedUniversalFlatFieldMetadata' in action && action.relatedUniversalFlatFieldMetadata) {
          Reflect.deleteProperty(action.relatedUniversalFlatFieldMetadata, 'isUnique');
        }
      }
    }
    expect(() => assert(input)).not.toThrow();
    const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.status.universalIdentifier;
    input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.options![0].id = '00000000-0000-4000-8000-000000000001';
    const nested = (input.migration.actions[0] as never as { universalFlatFieldMetadatas: { universalIdentifier: string; options: { id: string }[] }[] })
      .universalFlatFieldMetadatas.find((field) => field.universalIdentifier === uid)!;
    nested.options[0].id = '00000000-0000-4000-8000-000000000001';
    expect(() => assert(input)).toThrow('Unsafe pinned 3604');
  });

  it('permits an unrelated, noncolliding foreign object in the complete source', () => {
    const input = fixture();
    addForeignObject(input);
    expect(() => assert(input)).not.toThrow();
  });

  it.each([
    ['forged durable status option ID with matching nested action', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.status.universalIdentifier;
      const forged = '00000000-0000-4000-8000-000000000001';
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.options![0].id = forged;
      const nested = (input.migration.actions[0] as never as { universalFlatFieldMetadatas: { universalIdentifier: string; options: { id: string }[] }[] })
        .universalFlatFieldMetadatas.find((field) => field.universalIdentifier === uid)!;
      nested.options[0].id = forged;
    }],
    ['forged durable morphId with matching nested action', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.id.universalIdentifier;
      const forged = '00000000-0000-4000-8000-000000000001';
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.morphId = forged;
      const nested = (input.migration.actions[0] as never as { universalFlatFieldMetadatas: { universalIdentifier: string; morphId: string | null }[] })
        .universalFlatFieldMetadatas.find((field) => field.universalIdentifier === uid)!;
      nested.morphId = forged;
    }],
    ['forged object label scalar ID with matching action', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier;
      const forged = '00000000-0000-4000-8000-000000000001';
      input.target.flatObjectMetadataMaps.byUniversalIdentifier[uid]!.labelIdentifierFieldMetadataId = forged;
      input.migration.actions[0].flatEntity.labelIdentifierFieldMetadataId = forged;
    }],
    ['forged object image scalar ID with matching action', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier;
      const forged = '00000000-0000-4000-8000-000000000001';
      input.target.flatObjectMetadataMaps.byUniversalIdentifier[uid]!.imageIdentifierFieldMetadataId = forged;
      input.migration.actions[0].flatEntity.imageIdentifierFieldMetadataId = forged;
    }],
    ['two selected fields sharing an ID', (input: ReturnType<typeof fixture>) => {
      const first = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.username.universalIdentifier;
      const second = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.label.universalIdentifier;
      const sameId = input.ids.fieldMetadata![second];
      input.ids.fieldMetadata![first] = sameId;
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[first]!.id = sameId;
      const action = input.migration.actions[0] as never as { universalFlatFieldMetadatas: { universalIdentifier: string; id: string }[]; fieldIdByUniversalIdentifier: Record<string, string> };
      action.universalFlatFieldMetadatas.find((field) => field.universalIdentifier === first)!.id = sameId;
      action.fieldIdByUniversalIdentifier[first] = sameId;
    }],
    ['selected object ID colliding with existing Creator ID', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier;
      const sameId = input.before.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.creator.universalIdentifier]!.id;
      input.ids.objectMetadata![uid] = sameId;
      input.target.flatObjectMetadataMaps.byUniversalIdentifier[uid]!.id = sameId;
      input.migration.actions[0].flatEntity.id = sameId;
      input.migration.actions[0].id = sameId;
    }],
    ['selected field ID colliding with an existing Creator field row', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.username.universalIdentifier;
      const sameId = input.before.flatFieldMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.creator.fields.id.universalIdentifier]!.id;
      input.ids.fieldMetadata![uid] = sameId;
      input.target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!.id = sameId;
      const action = input.migration.actions[0] as never as { universalFlatFieldMetadatas: { universalIdentifier: string; id: string }[]; fieldIdByUniversalIdentifier: Record<string, string> };
      action.universalFlatFieldMetadatas.find((field) => field.universalIdentifier === uid)!.id = sameId;
      action.fieldIdByUniversalIdentifier[uid] = sameId;
    }],
    ['selected index ID colliding with existing foreign ID indexed only by universalIdentifierById', (input: ReturnType<typeof fixture>) => {
      const uid = MYAH_STANDARD_OBJECTS.myahInstagramAccount.indexes.connectedAccountIdUniqueIndex.universalIdentifier;
      const sameId = '00000000-0000-4000-8000-000000000002';
      input.before.flatIndexMaps.universalIdentifierById[sameId] = '00000000-0000-4000-8000-000000000003';
      input.ids.index![uid] = sameId;
      input.target.flatIndexMaps.byUniversalIdentifier[uid]!.id = sameId;
      input.migration.actions[9].flatEntity.id = sameId;
      input.migration.actions[9].id = sameId;
    }],
    ['foreign singular name collision', (input: ReturnType<typeof fixture>) => {
      addForeignObject(input).nameSingular = 'myahInstagramAccount';
    }],
    ['foreign plural name collision', (input: ReturnType<typeof fixture>) => {
      addForeignObject(input).namePlural = 'myahInstagramAccounts';
    }],
    ['foreign target table collision', (input: ReturnType<typeof fixture>) => {
      addForeignObject(input).targetTableName = 'myahInstagramAccount';
    }],
    ['extra ID-shaped key on action and target', (input: ReturnType<typeof fixture>) => {
      const target = input.target.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier]! as unknown as Record<string, unknown>;
      target.unexpectedId = '00000000-0000-4000-8000-000000000001';
      input.migration.actions[0].flatEntity.unexpectedId = target.unexpectedId;
    }],
    ['forged nested UID', (input: ReturnType<typeof fixture>) => { (input.migration.actions[0] as never as { universalFlatFieldMetadatas: { universalIdentifier: string }[] }).universalFlatFieldMetadatas[0].universalIdentifier = '00000000-0000-4000-8000-000000000001'; }],
    ['forged nested ID', (input: ReturnType<typeof fixture>) => { (input.migration.actions[0] as never as { fieldIdByUniversalIdentifier: Record<string, string> }).fieldIdByUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.id.universalIdentifier] = '00000000-0000-4000-8000-000000000001'; }],
    ['forged related UID', (input: ReturnType<typeof fixture>) => { (input.migration.actions[4] as never as { relatedUniversalFlatFieldMetadata: { universalIdentifier: string } }).relatedUniversalFlatFieldMetadata.universalIdentifier = '00000000-0000-4000-8000-000000000001'; }],
    ['forged related ID', (input: ReturnType<typeof fixture>) => { (input.migration.actions[4] as never as { relatedFieldId: string }).relatedFieldId = '00000000-0000-4000-8000-000000000001'; }],
    ['foreign owner', (input: ReturnType<typeof fixture>) => { input.migration.actions[0].flatEntity.applicationId = '00000000-0000-4000-8000-000000000001'; }],
    ['wrong workspace', (input: ReturnType<typeof fixture>) => { input.migration.actions[0].flatEntity.workspaceId = '00000000-0000-4000-8000-000000000001'; }],
    ['extra update', (input: ReturnType<typeof fixture>) => { input.migration.actions.push({ type: 'update', metadataName: 'fieldMetadata', flatEntity: {}, id: undefined }); }],
    ['extra delete', (input: ReturnType<typeof fixture>) => { input.migration.actions.push({ type: 'delete', metadataName: 'objectMetadata', flatEntity: {}, id: undefined }); }],
    ['extra role', (input: ReturnType<typeof fixture>) => { input.migration.actions.push({ type: 'create', metadataName: 'role', flatEntity: {}, id: undefined }); }],
    ['missing object', (input: ReturnType<typeof fixture>) => { input.migration.actions.splice(0, 1); }],
    ['missing index', (input: ReturnType<typeof fixture>) => { input.migration.actions.pop(); }],
    ['duplicate object instead of another', (input: ReturnType<typeof fixture>) => { input.migration.actions[1] = structuredClone(input.migration.actions[0]); }],
    ['forged index ID', (input: ReturnType<typeof fixture>) => { input.migration.actions[9].id = '00000000-0000-4000-8000-000000000001'; }],
    ['forged expected owner', (input: ReturnType<typeof fixture>) => { input.target.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier]!.applicationId = '00000000-0000-4000-8000-000000000001'; }],
    ['forged target field foreign key', (input: ReturnType<typeof fixture>) => { input.target.flatFieldMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahSocialConversation.fields.creator.universalIdentifier]!.relationTargetObjectMetadataId = '00000000-0000-4000-8000-000000000001'; }],
    ['unrelated source field on absent object', (input: ReturnType<typeof fixture>) => { input.before.flatFieldMetadataMaps.byUniversalIdentifier['00000000-0000-4000-8000-000000000001'] = { ...input.target.flatFieldMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.id.universalIdentifier]!, universalIdentifier: '00000000-0000-4000-8000-000000000001' }; }],
    ['wrong old state', (input: ReturnType<typeof fixture>) => { input.before.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier] = input.target.flatObjectMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier]; }],
    ['target tampering', (input: ReturnType<typeof fixture>) => { input.target.flatFieldMetadataMaps.byUniversalIdentifier[MYAH_STANDARD_OBJECTS.myahInstagramAccount.fields.id.universalIdentifier]!.name = 'tampered'; }],
  ])('rejects %s', (_name, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() => assert(input)).toThrow('Unsafe pinned 3604');
  });
});
