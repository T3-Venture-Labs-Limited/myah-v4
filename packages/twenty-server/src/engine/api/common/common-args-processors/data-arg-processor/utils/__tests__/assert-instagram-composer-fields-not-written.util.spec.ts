import { FieldMetadataType } from 'twenty-shared/types';

import {
  assertInstagramComposerFieldsNotWritten,
  INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
} from '../assert-instagram-composer-fields-not-written.util';

const composerDigestField = {
  id: 'digest-id',
  name: 'composerInputDigest',
  universalIdentifier: '5d78a1f7-79ea-4b67-9a8d-3b0a6109a5d4',
  type: FieldMetadataType.TEXT,
};
const composerSnapshotField = {
  id: 'snapshot-id',
  name: 'instagramMessageSnapshot',
  universalIdentifier: '3a80e3bb-cc44-4c97-9e89-a849776a9580',
  type: FieldMetadataType.RAW_JSON,
};
const ordinaryField = {
  id: 'body-id',
  name: 'body',
  universalIdentifier: 'ordinary-field',
  type: FieldMetadataType.TEXT,
};
const fieldMaps = {
  byUniversalIdentifier: {
    [composerDigestField.universalIdentifier]: composerDigestField,
    [composerSnapshotField.universalIdentifier]: composerSnapshotField,
    [ordinaryField.universalIdentifier]: ordinaryField,
  },
  universalIdentifierById: {
    [composerDigestField.id]: composerDigestField.universalIdentifier,
    [composerSnapshotField.id]: composerSnapshotField.universalIdentifier,
    [ordinaryField.id]: ordinaryField.universalIdentifier,
  },
  universalIdentifiersByApplicationId: {},
} as never;
const composerDraftObject = {
  universalIdentifier: INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
  fieldIds: [
    composerDigestField.id,
    composerSnapshotField.id,
    ordinaryField.id,
  ],
};

const assertWrite = (partialRecordInputs: Record<string, unknown>[]) =>
  assertInstagramComposerFieldsNotWritten({
    partialRecordInputs,
    flatObjectMetadata: composerDraftObject as never,
    flatFieldMetadataMaps: fieldMaps,
  });

describe('assertInstagramComposerFieldsNotWritten', () => {
  it.each([
    { composerInputDigest: 'a'.repeat(64) },
    { composerInputDigest: null },
    { composerInputDigest: undefined },
    { instagramMessageSnapshot: { actionKind: 'START_CHAT' } },
    { instagramMessageSnapshot: null },
  ])('rejects every present protected generic value %#', (record) => {
    expect(() => assertWrite([record])).toThrow(
      'Instagram composer fields are server-managed',
    );
  });

  it('rejects protected keys in every bulk/upsert record before any record is accepted', () => {
    expect(() =>
      assertWrite([
        { body: 'ordinary first record' },
        { instagramMessageSnapshot: undefined },
        { composerInputDigest: null },
      ]),
    ).toThrow('Instagram composer fields are server-managed');
  });

  it('allows adjacent fields and the same field identifiers on another object', () => {
    expect(() => assertWrite([{ body: 'hello' }])).not.toThrow();
    expect(() =>
      assertInstagramComposerFieldsNotWritten({
        partialRecordInputs: [{ composerInputDigest: 'a'.repeat(64) }],
        flatObjectMetadata: {
          ...composerDraftObject,
          universalIdentifier: 'another-object',
        } as never,
        flatFieldMetadataMaps: fieldMaps,
      }),
    ).not.toThrow();
  });
});
