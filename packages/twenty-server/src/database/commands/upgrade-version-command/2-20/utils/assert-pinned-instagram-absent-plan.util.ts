import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isValidUuid } from 'twenty-shared/utils';

import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { ALL_UNIVERSAL_FLAT_ENTITY_FOREIGN_KEY_AGGREGATOR_PROPERTIES } from 'src/engine/workspace-manager/workspace-migration/universal-flat-entity/constants/all-universal-flat-entity-foreign-key-aggregator-properties.constant';
import { type IdByUniversalIdentifierByMetadataName } from 'src/engine/workspace-manager/workspace-migration/services/utils/enrich-create-workspace-migration-action-with-ids.util';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const OBJECT_NAMES = [
  'myahInstagramAccount',
  'myahSocialConversation',
  'myahSocialMessage',
  'myahInstagramReplyDraft',
] as const;
const CREATOR_UID = MYAH_STANDARD_OBJECTS.creator.universalIdentifier;
// Fixed relation action orientation observed in the native 3604 absent plan.
// Do not derive these pairs from the caller-supplied target or from all
// relations incident to Instagram: that would silently widen the write set.
const FIELD_PAIRS = [
  ['c46dbf9f-ceaf-4fb5-a7b9-8b05dd579935', '6b26848c-ab3b-45dd-ad62-9d194512b116'],
  ['f072449f-7fc3-4481-b9d3-b255add4a574', '2cc8ea09-7c86-41bd-80ea-efcc5edc81e5'],
  ['08930cbe-877b-484d-8570-4ad1b8f8f5c0', '64c89b5d-9b54-4fb0-804e-b0c3cd110711'],
  ['49f3eeac-b8a5-4362-827a-7dc597d2dcb4', '80670f08-59e0-4f45-9058-e7221d66b95f'],
  ['006182fc-786f-4ea3-8168-6a5d440d76ac', 'cbf131df-81b8-4ff5-aadf-42f6ae55d6c8'],
] as const;
const OBJECT_UIDS: string[] = OBJECT_NAMES.map((name) => MYAH_STANDARD_OBJECTS[name].universalIdentifier);
const FIELD_UIDS = new Set([
  ...OBJECT_NAMES.flatMap((name) =>
    Object.values(MYAH_STANDARD_OBJECTS[name].fields).map(({ universalIdentifier }) => universalIdentifier),
  ),
  MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts.universalIdentifier,
]);
const INDEX_UIDS = OBJECT_NAMES.flatMap((name) =>
  Object.values(MYAH_STANDARD_OBJECTS[name].indexes).map(({ universalIdentifier }) => universalIdentifier),
);
const PAIR_UIDS = new Set(FIELD_PAIRS.flat());
// Frozen 2026-09-28 closure: a future Standard builder change cannot silently
// enlarge or substitute a UID while retaining the same total action count.
const fingerprint = (uids: readonly string[]) =>
  createHash('sha256').update([...uids].sort().join('\n')).digest('hex');
const FIELD_UID_FINGERPRINT = '24ba5ad1c76d0f743bd54c2c793edc156e8e737fb7de368fd44218205aab67fa';
const INDEX_UID_FINGERPRINT = 'efee1850d1d16d5eca0bd1ed9dab671cf464f7db03cd18cbdea52c1f3a9daa73';
const fail = (): never => {
  throw new Error('Unsafe pinned 3604 absent Instagram native plan');
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Flat target maps have one-to-many aggregate collections that create actions
// deliberately omit. No other action property is silently ignored.
const createProjection = (
  value: unknown,
  name: 'objectMetadata' | 'fieldMetadata' | 'index',
): Record<string, unknown> => {
  if (!record(value)) return fail();
  const omitted = new Set<string>(
    ALL_UNIVERSAL_FLAT_ENTITY_FOREIGN_KEY_AGGREGATOR_PROPERTIES[name],
  );
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
};

// Only flat entity identities and explicitly generated local FK/aggregate
// properties differ between independent Standard computations. Nested
// metadata values (notably SELECT options[].id and morphId) are durable and
// must be compared against the source-controlled definition verbatim.
type SemanticValue = string | number | boolean | null | undefined | SemanticValue[] | { [key: string]: SemanticValue };
// Compare the complete property tree as well: semantic() intentionally omits
// local IDs, but must never turn an unknown ID-shaped target key into authority.
type PropertyShape = string | PropertyShape[] | { [key: string]: PropertyShape };
const propertyShape = (value: unknown): PropertyShape => {
  if (Array.isArray(value)) return value.map(propertyShape);
  if (!record(value)) return 'value';
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, propertyShape(value[key])]),
  );
};
type PlanMetadataName = 'objectMetadata' | 'fieldMetadata' | 'index';
const LOCAL_ENTITY_KEYS = {
  objectMetadata: new Set([
    'id', 'createdAt', 'updatedAt', 'workspaceId', 'applicationId',
    'labelIdentifierFieldMetadataId', 'imageIdentifierFieldMetadataId',
    'fieldIds', 'indexMetadataIds', 'searchFieldMetadataIds',
    'objectPermissionIds', 'fieldPermissionIds', 'viewIds',
  ]),
  fieldMetadata: new Set([
    'id', 'createdAt', 'updatedAt', 'workspaceId', 'applicationId',
    'objectMetadataId', 'relationTargetFieldMetadataId',
    'relationTargetObjectMetadataId', 'viewFieldIds', 'viewFilterIds',
    'fieldPermissionIds', 'kanbanAggregateOperationViewIds',
    'calendarViewIds', 'mainGroupByFieldMetadataViewIds',
    'viewSortIds', 'searchFieldMetadataIds',
  ]),
  index: new Set([
    'id', 'createdAt', 'updatedAt', 'workspaceId', 'applicationId',
    'objectMetadataId',
  ]),
} satisfies Record<PlanMetadataName, Set<string>>;
const INDEX_FIELD_LOCAL_KEYS = new Set([
  'id', 'createdAt', 'updatedAt', 'workspaceId',
  'fieldMetadataId', 'indexMetadataId',
]);
const semantic = (
  value: unknown,
  name: PlanMetadataName,
  path: readonly string[] = [],
): SemanticValue => {
  if (Array.isArray(value)) return value.map((item) => semantic(item, name, path));
  if (!record(value)) {
    if (value === null || value === undefined || typeof value === 'string' ||
      typeof value === 'number' || typeof value === 'boolean') return value;
    return fail();
  }
  const excluded = path.length === 0
    ? LOCAL_ENTITY_KEYS[name]
    : name === 'index' && path.length === 1 && path[0] === 'flatIndexFieldMetadatas'
      ? INDEX_FIELD_LOCAL_KEYS
      : undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !excluded?.has(key))
      .map(([key, entry]) => [key, semantic(entry, name, [...path, key])]),
  );
};

/**
 * A pure pre-run guard, not a physical classifier or a 3604 apply entry.
 * `before` MUST be the complete, transaction-fresh workspace metadata maps,
 * not a selected-UID projection: collision checks depend on every source row.
 */
export const assertPinnedInstagramAbsentPlan = ({
  migration,
  target,
  before,
  ids,
  workspaceId,
  standardApplicationId,
}: {
  migration: WorkspaceMigration;
  target: Pick<AllFlatEntityMaps, 'flatObjectMetadataMaps' | 'flatFieldMetadataMaps' | 'flatIndexMaps'>;
  before: AllFlatEntityMaps;
  ids: IdByUniversalIdentifierByMetadataName;
  workspaceId: string;
  standardApplicationId: string;
}): void => {
  if (
    !isValidUuid(workspaceId) || !isValidUuid(standardApplicationId) ||
    migration.applicationUniversalIdentifier !== TWENTY_STANDARD_APPLICATION.universalIdentifier ||
    migration.actions.length !== 14 || OBJECT_UIDS.length !== 4 ||
    FIELD_UIDS.size !== 93 || INDEX_UIDS.length !== 5 || PAIR_UIDS.size !== 10 ||
    fingerprint([...FIELD_UIDS]) !== FIELD_UID_FINGERPRINT ||
    fingerprint(INDEX_UIDS) !== INDEX_UID_FINGERPRINT
  ) return fail();

  const targetMaps = {
    objectMetadata: target.flatObjectMetadataMaps,
    fieldMetadata: target.flatFieldMetadataMaps,
    index: target.flatIndexMaps,
  };
  const beforeMaps = {
    objectMetadata: before.flatObjectMetadataMaps,
    fieldMetadata: before.flatFieldMetadataMaps,
    index: before.flatIndexMaps,
  };
  const allowed = {
    objectMetadata: OBJECT_UIDS,
    fieldMetadata: [...FIELD_UIDS],
    index: INDEX_UIDS,
  };
  // A selected ID must never alias another selected UID or any existing row
  // in the same metadata namespace, including rows outside the Instagram graph.
  for (const name of ['objectMetadata', 'fieldMetadata', 'index'] as const) {
    const occupied = new Set([
      ...Object.keys(beforeMaps[name].universalIdentifierById),
      ...Object.values(beforeMaps[name].byUniversalIdentifier)
        .filter((entity) => entity !== undefined)
        .map((entity) => entity.id),
    ]);
    for (const uid of allowed[name]) {
      const id = ids[name]?.[uid];
      if (!id || occupied.has(id)) return fail();
      occupied.add(id);
    }
  }
  const creator = before.flatObjectMetadataMaps.byUniversalIdentifier[CREATOR_UID];
  if (
    creator?.applicationId !== standardApplicationId ||
    creator.workspaceId !== workspaceId ||
    target.flatObjectMetadataMaps.byUniversalIdentifier[CREATOR_UID]?.id !== creator.id
  ) return fail();

  const now = target.flatObjectMetadataMaps.byUniversalIdentifier[OBJECT_UIDS[0]]?.createdAt;
  if (typeof now !== 'string') return fail();
  const canonical = computeTwentyStandardApplicationAllFlatEntityMaps({
    workspaceId, twentyStandardApplicationId: standardApplicationId, now,
  }).allFlatEntityMaps;
  const canonicalMaps = {
    objectMetadata: canonical.flatObjectMetadataMaps,
    fieldMetadata: canonical.flatFieldMetadataMaps,
    index: canonical.flatIndexMaps,
  };
  const targetObjects = OBJECT_UIDS.map((uid) => target.flatObjectMetadataMaps.byUniversalIdentifier[uid]);
  for (const existing of Object.values(before.flatObjectMetadataMaps.byUniversalIdentifier)) {
    if (!existing || existing.workspaceId !== workspaceId || OBJECT_UIDS.includes(existing.universalIdentifier)) continue;
    if (targetObjects.some((object) => object && (
      existing.nameSingular === object.nameSingular ||
      existing.namePlural === object.namePlural ||
      // Standard targetTableName is the shared 'DEPRECATED' sentinel; its
      // effective physical table name is nameSingular, not that sentinel.
      (typeof existing.targetTableName === 'string' && existing.targetTableName !== 'DEPRECATED' &&
        existing.targetTableName === (object.targetTableName === 'DEPRECATED'
          ? object.nameSingular : object.targetTableName))
    ))) return fail();
  }
  for (const name of ['objectMetadata', 'fieldMetadata', 'index'] as const) {
    for (const uid of allowed[name]) {
      const expected = targetMaps[name].byUniversalIdentifier[uid];
      const sourceControlled = canonicalMaps[name].byUniversalIdentifier[uid];
      const suppliedId = ids[name]?.[uid];
      const expectedProjection = createProjection(expected, name);
      const canonicalProjection = createProjection(sourceControlled, name);
      // The existing 2001 native from/to path deletes only the cache-derived
      // top-level field isUnique property before building the migration.
      // Normalize that one optional property; never strip durable nested IDs.
      if (name === 'fieldMetadata' && !Object.prototype.hasOwnProperty.call(expectedProjection, 'isUnique')) {
        Reflect.deleteProperty(canonicalProjection, 'isUnique');
      }
      if (
        beforeMaps[name].byUniversalIdentifier[uid] !== undefined ||
        !expected || !sourceControlled ||
        expected.universalIdentifier !== uid ||
        expected.applicationId !== standardApplicationId ||
        expected.workspaceId !== workspaceId ||
        !isValidUuid(expected.id) || suppliedId !== expected.id ||
        !isDeepStrictEqual(
          propertyShape(expectedProjection),
          propertyShape(canonicalProjection),
        ) ||
        !isDeepStrictEqual(
          semantic(expectedProjection, name),
          semantic(canonicalProjection, name),
        )
      ) return fail();
      if (name === 'objectMetadata') {
        const object = target.flatObjectMetadataMaps.byUniversalIdentifier[uid]!;
        const labelUid = object.labelIdentifierFieldMetadataUniversalIdentifier;
        const imageUid = object.imageIdentifierFieldMetadataUniversalIdentifier;
        if (!labelUid || !FIELD_UIDS.has(labelUid) ||
          object.labelIdentifierFieldMetadataId !== ids.fieldMetadata?.[labelUid] ||
          (imageUid
            ? !FIELD_UIDS.has(imageUid) || object.imageIdentifierFieldMetadataId !== ids.fieldMetadata?.[imageUid]
            : object.imageIdentifierFieldMetadataId != null)) return fail();
      }
      if (name === 'fieldMetadata') {
        const field = target.flatFieldMetadataMaps.byUniversalIdentifier[uid]!;
        const parentUid = field.objectMetadataUniversalIdentifier;
        const parentId = parentUid === CREATOR_UID
          ? creator.id
          : ids.objectMetadata?.[parentUid ?? ''];
        if (!parentId || field.objectMetadataId !== parentId) return fail();
        if (field.relationTargetObjectMetadataUniversalIdentifier) {
          const relationObjectUid = field.relationTargetObjectMetadataUniversalIdentifier;
          const relationObjectId = relationObjectUid === CREATOR_UID
            ? creator.id
            : ids.objectMetadata?.[relationObjectUid];
          if (!relationObjectId || field.relationTargetObjectMetadataId !== relationObjectId) return fail();
        }
        if (field.relationTargetFieldMetadataUniversalIdentifier &&
          field.relationTargetFieldMetadataId !==
            ids.fieldMetadata?.[field.relationTargetFieldMetadataUniversalIdentifier]) return fail();
      }
      if (name === 'index') {
        const indexMetadata = target.flatIndexMaps.byUniversalIdentifier[uid]!;
        if (indexMetadata.objectMetadataId !== ids.objectMetadata?.[indexMetadata.objectMetadataUniversalIdentifier ?? '']) return fail();
        if (indexMetadata.flatIndexFieldMetadatas.length !== indexMetadata.universalFlatIndexFieldMetadatas.length ||
          indexMetadata.flatIndexFieldMetadatas.some((entry, index) =>
            entry.fieldMetadataId !== ids.fieldMetadata?.[
              indexMetadata.universalFlatIndexFieldMetadatas[index].fieldMetadataUniversalIdentifier
            ])) return fail();
      }
    }
  }
  // Unknown metadata attached to any of the selected objects cannot be
  // treated as a wholly absent graph, even if its UID is not in the catalog.
  for (const field of Object.values(before.flatFieldMetadataMaps.byUniversalIdentifier)) {
    if (field && (OBJECT_UIDS.includes(field.objectMetadataUniversalIdentifier as never) ||
      OBJECT_UIDS.includes(field.relationTargetObjectMetadataUniversalIdentifier as never))) return fail();
  }
  for (const index of Object.values(before.flatIndexMaps.byUniversalIdentifier)) {
    if (index && OBJECT_UIDS.includes(index.objectMetadataUniversalIdentifier as never)) return fail();
  }

  const seenObjects = new Set<string>();
  const seenFields = new Set<string>();
  const seenIndexes = new Set<string>();
  const verifyEntity = (name: 'objectMetadata' | 'fieldMetadata' | 'index', value: unknown) => {
    if (!record(value) || typeof value.universalIdentifier !== 'string') return fail();
    const uid = value.universalIdentifier;
    if (!(allowed[name] as readonly string[]).includes(uid) ||
      !isDeepStrictEqual(value, createProjection(targetMaps[name].byUniversalIdentifier[uid], name))) return fail();
    return uid;
  };
  const verifyId = (name: 'objectMetadata' | 'fieldMetadata' | 'index', uid: string, id: unknown) => {
    if (typeof id !== 'string' || !isValidUuid(id) || id !== ids[name]?.[uid]) return fail();
  };
  migration.actions.forEach((action, position) => {
    if (action.type !== 'create' ||
      !['objectMetadata', 'fieldMetadata', 'index'].includes(action.metadataName)) return fail();
    if (position < 4) {
      if (action.metadataName !== 'objectMetadata') return fail();
      const uid = verifyEntity('objectMetadata', action.flatEntity);
      if (uid !== OBJECT_UIDS[position] || seenObjects.has(uid) ||
        !('universalFlatFieldMetadatas' in action) ||
        !Array.isArray(action.universalFlatFieldMetadatas) ||
        !('fieldIdByUniversalIdentifier' in action) ||
        !record(action.fieldIdByUniversalIdentifier) ||
        Object.keys(action).some((key) => !['type', 'metadataName', 'flatEntity', 'id', 'universalFlatFieldMetadatas', 'fieldIdByUniversalIdentifier'].includes(key))) return fail();
      verifyId('objectMetadata', uid, action.id);
      const fields = [...FIELD_UIDS].filter((fieldUid) =>
        target.flatFieldMetadataMaps.byUniversalIdentifier[fieldUid]?.objectMetadataUniversalIdentifier === uid &&
        !PAIR_UIDS.has(fieldUid));
      if (action.universalFlatFieldMetadatas.length !== [22, 17, 19, 25][position] ||
        fields.length !== action.universalFlatFieldMetadatas.length ||
        !isDeepStrictEqual(new Set(Object.keys(action.fieldIdByUniversalIdentifier)), new Set(fields))) return fail();
      for (const field of action.universalFlatFieldMetadatas) {
        const fieldUid = verifyEntity('fieldMetadata', field);
        if (!fields.includes(fieldUid) || seenFields.has(fieldUid)) return fail();
        verifyId('fieldMetadata', fieldUid, action.fieldIdByUniversalIdentifier[fieldUid]);
        seenFields.add(fieldUid);
      }
      seenObjects.add(uid);
    } else if (position < 9) {
      if (action.metadataName !== 'fieldMetadata' ||
        !('relatedUniversalFlatFieldMetadata' in action) ||
        !('relatedFieldId' in action) ||
        !('fieldIdByUniversalIdentifier' in action) ||
        !record(action.fieldIdByUniversalIdentifier) ||
        Object.keys(action).some((key) => !['type', 'metadataName', 'flatEntity', 'id', 'relatedUniversalFlatFieldMetadata', 'relatedFieldId', 'fieldIdByUniversalIdentifier'].includes(key))) return fail();
      const uid = verifyEntity('fieldMetadata', action.flatEntity);
      const relatedUid = verifyEntity('fieldMetadata', action.relatedUniversalFlatFieldMetadata);
      const [expectedUid, expectedRelatedUid] = FIELD_PAIRS[position - 4];
      if (uid !== expectedUid || relatedUid !== expectedRelatedUid ||
        seenFields.has(uid) || seenFields.has(relatedUid) ||
        !isDeepStrictEqual(new Set(Object.keys(action.fieldIdByUniversalIdentifier)), new Set([uid, relatedUid]))) return fail();
      verifyId('fieldMetadata', uid, action.id);
      verifyId('fieldMetadata', relatedUid, action.relatedFieldId);
      verifyId('fieldMetadata', uid, action.fieldIdByUniversalIdentifier[uid]);
      verifyId('fieldMetadata', relatedUid, action.fieldIdByUniversalIdentifier[relatedUid]);
      seenFields.add(uid);
      seenFields.add(relatedUid);
    } else {
      if (action.metadataName !== 'index' ||
        Object.keys(action).some((key) => !['type', 'metadataName', 'flatEntity', 'id'].includes(key))) return fail();
      const uid = verifyEntity('index', action.flatEntity);
      if (uid !== INDEX_UIDS[position - 9] || seenIndexes.has(uid)) return fail();
      verifyId('index', uid, action.id);
      seenIndexes.add(uid);
    }
  });
  if (seenObjects.size !== 4 || seenFields.size !== 93 || seenIndexes.size !== 5) return fail();
};
