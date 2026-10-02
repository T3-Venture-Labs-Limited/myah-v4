import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isValidUuid } from 'twenty-shared/utils';

import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';

export type InstagramTargetMaps = Pick<AllFlatEntityMaps, 'flatObjectMetadataMaps' | 'flatFieldMetadataMaps' | 'flatIndexMaps'>;
export type InstagramTargetIds = {
  objectMetadata: Record<string, string>;
  fieldMetadata: Record<string, string>;
  index: Record<string, string>;
};

const creatorUid = MYAH_STANDARD_OBJECTS.creator.universalIdentifier;
const objectUids: string[] = [
  MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
  MYAH_STANDARD_OBJECTS.myahSocialConversation.universalIdentifier,
  MYAH_STANDARD_OBJECTS.myahSocialMessage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft.universalIdentifier,
];
const reverseFieldUids = new Set<string>([
  MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts.universalIdentifier,
]);
const fieldUids = new Set<string>([
  ...[
    MYAH_STANDARD_OBJECTS.myahInstagramAccount,
    MYAH_STANDARD_OBJECTS.myahSocialConversation,
    MYAH_STANDARD_OBJECTS.myahSocialMessage,
    MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft,
  ].flatMap((object) => Object.values(object.fields).map(({ universalIdentifier }) => universalIdentifier)),
  ...reverseFieldUids,
]);
const indexUids = new Set<string>([
  MYAH_STANDARD_OBJECTS.myahInstagramAccount,
  MYAH_STANDARD_OBJECTS.myahSocialConversation,
  MYAH_STANDARD_OBJECTS.myahSocialMessage,
  MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft,
].flatMap((object) => Object.values(object.indexes).map(({ universalIdentifier }) => universalIdentifier)));
const fail = (): never => {
  throw new Error('Unsafe pinned 3604 target ID rebinding');
};
const exactKeys = (actual: Record<string, unknown>, expected: ReadonlySet<string>): boolean =>
  Object.keys(actual).length === expected.size &&
  Object.keys(actual).every((uid) => expected.has(uid) && actual[uid] !== undefined);

/**
 * Pure 3604-only projection of a bounded absent Standard target. The caller
 * must supply a complete, transaction-fresh pinned `before` snapshot; this
 * does not check PostgreSQL physical absence or build/run a native migration.
 */
export const rebindPinnedInstagramAbsentTargetIds = ({
  workspaceId,
  standardApplicationId,
  before,
  target,
  ids,
}: {
  workspaceId: string;
  standardApplicationId: string;
  before: AllFlatEntityMaps;
  target: InstagramTargetMaps;
  ids: InstagramTargetIds;
}): { target: InstagramTargetMaps; ids: InstagramTargetIds } => {
  if (!isValidUuid(workspaceId) || !isValidUuid(standardApplicationId) ||
    fieldUids.size !== 93 || indexUids.size !== 5 ||
    !exactKeys(target.flatObjectMetadataMaps.byUniversalIdentifier, new Set([creatorUid, ...objectUids])) ||
    !exactKeys(target.flatFieldMetadataMaps.byUniversalIdentifier, fieldUids) ||
    !exactKeys(target.flatIndexMaps.byUniversalIdentifier, indexUids) ||
    !exactKeys(ids.objectMetadata, new Set([creatorUid, ...objectUids])) ||
    !exactKeys(ids.fieldMetadata, fieldUids) ||
    !exactKeys(ids.index, indexUids)) return fail();

  const creator = before.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid];
  const targetCreator = target.flatObjectMetadataMaps.byUniversalIdentifier[creatorUid];
  // The source reverse index may be incomplete; physical object rows must
  // also exclude aliases before any stale Creator scalar can be rebound.
  const occupiedSourceObjectIds = new Set(Object.values(before.flatObjectMetadataMaps.byUniversalIdentifier)
    .flatMap((object) => object ? [object.id] : []));
  if (!creator || !targetCreator || !isValidUuid(creator.id) || !isValidUuid(targetCreator.id) ||
    creator.universalIdentifier !== creatorUid || targetCreator.universalIdentifier !== creatorUid ||
    creator.applicationId !== standardApplicationId || creator.workspaceId !== workspaceId ||
    targetCreator.applicationId !== standardApplicationId || targetCreator.workspaceId !== workspaceId ||
    targetCreator.id !== ids.objectMetadata[creatorUid] ||
    (targetCreator.id !== creator.id &&
      (before.flatObjectMetadataMaps.universalIdentifierById[targetCreator.id] !== undefined ||
        occupiedSourceObjectIds.has(targetCreator.id))) ||
    target.flatObjectMetadataMaps.universalIdentifierById[targetCreator.id] !== creatorUid ||
    Object.entries(target.flatObjectMetadataMaps.universalIdentifierById).some(([id, uid]) =>
      uid === creatorUid && id !== targetCreator.id) ||
    before.flatObjectMetadataMaps.universalIdentifierById[creator.id] !== creatorUid ||
    Object.values(before.flatObjectMetadataMaps.byUniversalIdentifier).some((object) =>
      object && object.universalIdentifier !== creatorUid && object.id === creator.id)) return fail();

  const creatorIdFieldUid = MYAH_STANDARD_OBJECTS.creator.fields.id.universalIdentifier;
  const creatorIdField = before.flatFieldMetadataMaps.byUniversalIdentifier[creatorIdFieldUid];
  if (!creatorIdField || creatorIdField.applicationId !== standardApplicationId ||
    creatorIdField.workspaceId !== workspaceId || creatorIdField.objectMetadataId !== creator.id ||
    creatorIdField.objectMetadataUniversalIdentifier !== creatorUid ||
    before.flatFieldMetadataMaps.universalIdentifierById[creatorIdField.id] !== creatorIdFieldUid) return fail();

  const allowed = {
    objectMetadata: new Set(objectUids),
    fieldMetadata: fieldUids,
    index: indexUids,
  };
  const source = {
    objectMetadata: before.flatObjectMetadataMaps,
    fieldMetadata: before.flatFieldMetadataMaps,
    index: before.flatIndexMaps,
  };
  const selected = {
    objectMetadata: target.flatObjectMetadataMaps,
    fieldMetadata: target.flatFieldMetadataMaps,
    index: target.flatIndexMaps,
  };
  for (const name of ['objectMetadata', 'fieldMetadata', 'index'] as const) {
    if (Object.values(source[name].universalIdentifierById).some((uid) =>
      uid !== undefined && allowed[name].has(uid))) return fail();
    const occupied = new Set([
      ...(name === 'objectMetadata' ? [ids.objectMetadata[creatorUid]] : []),
      ...Object.keys(source[name].universalIdentifierById),
      ...Object.values(source[name].byUniversalIdentifier)
        .filter((entity) => entity !== undefined)
        .map((entity) => entity.id),
    ]);
    for (const uid of allowed[name]) {
      const entity = selected[name].byUniversalIdentifier[uid];
      const id = ids[name][uid];
      if (!entity || entity.universalIdentifier !== uid || !isValidUuid(id) ||
        entity.id !== id || entity.workspaceId !== workspaceId ||
        entity.applicationId !== standardApplicationId ||
        source[name].byUniversalIdentifier[uid] || occupied.has(id) ||
        selected[name].universalIdentifierById[id] !== uid) return fail();
      occupied.add(id);
    }
  }
  for (const field of Object.values(before.flatFieldMetadataMaps.byUniversalIdentifier)) {
    if (field && (objectUids.includes(field.objectMetadataUniversalIdentifier as never) ||
      objectUids.includes(field.relationTargetObjectMetadataUniversalIdentifier as never))) return fail();
  }
  for (const index of Object.values(before.flatIndexMaps.byUniversalIdentifier)) {
    if (index && objectUids.includes(index.objectMetadataUniversalIdentifier as never)) return fail();
  }

  // Validate every non-Creator reference before copying. The Standard builder
  // may generate a stale Creator scalar independently; only the known Creator
  // endpoint can be rebound, and it cannot alias a foreign existing object.
  const validCreatorScalar = (value: string | null): boolean =>
    typeof value === 'string' && isValidUuid(value) &&
    (value === creator.id ||
      (before.flatObjectMetadataMaps.universalIdentifierById[value] === undefined &&
        !occupiedSourceObjectIds.has(value))) &&
    !objectUids.some((uid) => ids.objectMetadata[uid] === value);
  for (const uid of fieldUids) {
    const field = target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!;
    const parentUid = field.objectMetadataUniversalIdentifier;
    if (parentUid !== creatorUid && !allowed.objectMetadata.has(parentUid ?? '')) return fail();
    if (parentUid === creatorUid) {
      if (!reverseFieldUids.has(uid) || !validCreatorScalar(field.objectMetadataId)) return fail();
    } else if (field.objectMetadataId !== ids.objectMetadata[parentUid!]) return fail();
    const relationUid = field.relationTargetObjectMetadataUniversalIdentifier;
    if (relationUid) {
      if (relationUid !== creatorUid && !allowed.objectMetadata.has(relationUid)) return fail();
      if (relationUid === creatorUid && !validCreatorScalar(field.relationTargetObjectMetadataId)) return fail();
      if (relationUid !== creatorUid &&
        field.relationTargetObjectMetadataId !== ids.objectMetadata[relationUid]) return fail();
    }
    const relatedFieldUid = field.relationTargetFieldMetadataUniversalIdentifier;
    if (relatedFieldUid && (!fieldUids.has(relatedFieldUid) ||
      field.relationTargetFieldMetadataId !== ids.fieldMetadata[relatedFieldUid])) return fail();
  }
  for (const uid of indexUids) {
    const index = target.flatIndexMaps.byUniversalIdentifier[uid]!;
    const parentUid = index.objectMetadataUniversalIdentifier;
    if (!parentUid || !allowed.objectMetadata.has(parentUid) ||
      index.objectMetadataId !== ids.objectMetadata[parentUid] ||
      index.flatIndexFieldMetadatas.length !== index.universalFlatIndexFieldMetadatas.length ||
      index.flatIndexFieldMetadatas.some((entry, position) =>
        entry.fieldMetadataId !== ids.fieldMetadata[
          index.universalFlatIndexFieldMetadatas[position].fieldMetadataUniversalIdentifier
        ])) return fail();
  }

  const reboundTarget = structuredClone(target);
  const reboundIds = structuredClone(ids);
  reboundIds.objectMetadata[creatorUid] = creator.id;
  const reboundObjects = reboundTarget.flatObjectMetadataMaps;
  delete reboundObjects.universalIdentifierById[targetCreator.id];
  reboundObjects.universalIdentifierById[creator.id] = creatorUid;
  reboundObjects.byUniversalIdentifier[creatorUid] = structuredClone(creator);
  for (const uid of fieldUids) {
    const field = reboundTarget.flatFieldMetadataMaps.byUniversalIdentifier[uid]!;
    if (field.objectMetadataUniversalIdentifier === creatorUid) field.objectMetadataId = creator.id;
    if (field.relationTargetObjectMetadataUniversalIdentifier === creatorUid) {
      field.relationTargetObjectMetadataId = creator.id;
    }
  }
  return { target: reboundTarget, ids: reboundIds };
};
