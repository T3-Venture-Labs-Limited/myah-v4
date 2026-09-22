import { FieldMetadataType, OrderByDirection } from 'twenty-shared/types';

import { type ObjectRecordOrderBy } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { decodeCursor, encodeCursor } from '../cursors.util';

const buildMockField = (
  id: string,
  name: string,
  type: FieldMetadataType,
): FlatFieldMetadata =>
  ({
    id,
    universalIdentifier: id,
    name,
    type,
    objectMetadataId: 'obj-id',
    workspaceId: 'ws-id',
    label: name,
    isNullable: true,
    isLabelSyncedWithName: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    viewFieldIds: [],
    viewFilterIds: [],
    kanbanAggregateOperationViewIds: [],
    calendarViewIds: [],
    applicationId: null,
  }) as unknown as FlatFieldMetadata;

const nameField = buildMockField('name-id', 'name', FieldMetadataType.TEXT);
const fullNameField = buildMockField(
  'fullname-id',
  'fullName',
  FieldMetadataType.FULL_NAME,
);
const noteField = {
  ...buildMockField('note-id', 'note', FieldMetadataType.RELATION),
  settings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'noteId',
  },
} as FlatFieldMetadata;

const flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata> = {
  byUniversalIdentifier: {
    'name-id': nameField,
    'fullname-id': fullNameField,
    'note-id': noteField,
  },
  universalIdentifierById: {
    'name-id': 'name-id',
    'fullname-id': 'fullname-id',
    'note-id': 'note-id',
  },
  universalIdentifiersByApplicationId: {},
};

const flatObjectMetadata: FlatObjectMetadata = {
  id: 'obj-id',
  universalIdentifier: 'obj-id',
  workspaceId: 'ws-id',
  nameSingular: 'person',
  namePlural: 'people',
  labelSingular: 'Person',
  labelPlural: 'People',
  targetTableName: 'person',
  isRemote: false,
  isActive: true,
  isSystem: false,
  isAuditLogged: false,
  isSearchable: false,
  icon: 'Icon123',
  createdAt: new Date(),
  updatedAt: new Date(),
  fieldIds: ['name-id', 'fullname-id', 'note-id'],
  indexMetadataIds: [],
  viewIds: [],
  applicationId: null,
} as unknown as FlatObjectMetadata;

const callEncodeCursor = (
  record: Record<string, unknown>,
  orderBy: Parameters<typeof encodeCursor>[0]['order'],
) =>
  encodeCursor({
    objectRecord: record as never,
    order: orderBy,
    flatObjectMetadata,
    flatFieldMetadataMaps,
  });

describe('encodeCursor', () => {
  it('should encode scalar fields from the orderBy', () => {
    const record = { id: 'abc', name: 'John', age: 30 };
    const orderBy = [{ name: OrderByDirection.AscNullsLast }];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toEqual({ name: 'John', id: 'abc' });
  });

  it('should always include id even if not in orderBy', () => {
    const record = { id: 'abc', name: 'John' };
    const orderBy = [{ name: OrderByDirection.AscNullsLast }];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toHaveProperty('id', 'abc');
  });

  it('should only include ordered sub-fields for composite fields', () => {
    const record = {
      id: 'abc',
      fullName: { firstName: 'Katherine', lastName: 'Abbott' },
    };
    const orderBy = [
      { fullName: { firstName: OrderByDirection.AscNullsLast } },
    ];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toEqual({
      fullName: { firstName: 'Katherine' },
      id: 'abc',
    });
    expect(decoded.fullName).not.toHaveProperty('lastName');
  });

  it('should include all sub-fields when all are in the orderBy', () => {
    const record = {
      id: 'abc',
      fullName: { firstName: 'Katherine', lastName: 'Abbott' },
    };
    const orderBy = [
      {
        fullName: {
          firstName: OrderByDirection.AscNullsLast,
          lastName: OrderByDirection.AscNullsLast,
        },
      },
    ];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toEqual({
      fullName: { firstName: 'Katherine', lastName: 'Abbott' },
      id: 'abc',
    });
  });

  it('should encode relation records for nested ordering', () => {
    const record = {
      id: 'note-target-id',
      note: {
        id: 'note-id',
        title: 'Example note',
        createdAt: '2026-09-22T05:56:05.787Z',
      },
    };
    const orderBy = [{ note: { createdAt: OrderByDirection.DescNullsFirst } }];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toEqual({
      note: record.note,
      id: 'note-target-id',
    });
  });

  it('should deep-merge two separate entries for the same composite parent', () => {
    const record = {
      id: 'abc',
      fullName: { firstName: 'Katherine', lastName: 'Watts' },
    };
    const orderBy: ObjectRecordOrderBy = [
      { fullName: { firstName: OrderByDirection.AscNullsFirst } },
      { fullName: { lastName: OrderByDirection.DescNullsLast } },
    ];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toEqual({
      fullName: { firstName: 'Katherine', lastName: 'Watts' },
      id: 'abc',
    });
  });

  it('should not filter sub-fields for scalar fields', () => {
    const record = { id: 'abc', name: 'John' };
    const orderBy = [{ name: OrderByDirection.AscNullsLast }];

    const decoded = decodeCursor(callEncodeCursor(record, orderBy));

    expect(decoded).toEqual({ name: 'John', id: 'abc' });
  });

  it('should handle undefined orderBy', () => {
    const record = { id: 'abc', name: 'John' };

    const decoded = decodeCursor(callEncodeCursor(record, undefined));

    expect(decoded).toEqual({ id: 'abc' });
  });
});
