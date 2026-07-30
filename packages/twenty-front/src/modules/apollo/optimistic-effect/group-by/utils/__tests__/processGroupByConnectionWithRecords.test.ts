import { type Reference } from '@apollo/client';
import { type FieldFunctionOptions } from '@apollo/client/cache';

type ReadFieldFunction = FieldFunctionOptions['readField'];
type ToReferenceFunction = FieldFunctionOptions['toReference'];

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type RecordGqlRefEdge } from '@/object-record/cache/types/RecordGqlRefEdge';
import { type RecordGqlNode } from '@/object-record/graphql/types/RecordGqlNode';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { processGroupByConnectionWithRecords } from '@/apollo/optimistic-effect/group-by/utils/processGroupByConnectionWithRecords';

describe('processGroupByConnectionWithRecords', () => {
  const mockObjectMetadataItem: EnrichedObjectMetadataItem = {
    nameSingular: 'person',
    namePlural: 'people',
  } as EnrichedObjectMetadataItem;

  const mockRecord: RecordGqlNode = {
    __typename: 'Person',
    id: '123',
    name: 'John',
    deletedAt: null,
  };

  const mockReference: Reference = {
    __ref: 'Person:123',
  };

  const mockReadField = jest.fn(
    (fieldName: any, from: any, ..._args: any[]) => {
      if (fieldName === 'id' && from === mockReference) {
        return '123';
      }
      return undefined;
    },
  ) as unknown as ReadFieldFunction;

  const mockToReference: ToReferenceFunction = jest.fn(() => mockReference);

  it('should return cached data when no records match', () => {
    const cachedEdges: RecordGqlRefEdge[] = [];
    const cachedPageInfo = {
      hasNextPage: false,
      hasPreviousPage: false,
    };

    const result = processGroupByConnectionWithRecords({
      cachedEdges,
      cachedPageInfo,
      records: [],
      operation: 'create',
      queryFilter: {},
      shouldMatchRootQueryFilter: false,
      groupByDimensionValues: [],
      groupByConfig: undefined,
      objectMetadataItem: mockObjectMetadataItem,
      readField: mockReadField,
      toReference: mockToReference,
    });

    expect(result.nextEdges).toEqual([]);
    expect(result.totalCountDelta).toBe(0);
  });

  it('should handle create operation', () => {
    const cachedEdges: RecordGqlRefEdge[] = [];
    const cachedPageInfo = {
      hasNextPage: false,
      hasPreviousPage: false,
    };

    const result = processGroupByConnectionWithRecords({
      cachedEdges,
      cachedPageInfo,
      records: [mockRecord],
      operation: 'create',
      queryFilter: {},
      shouldMatchRootQueryFilter: false,
      groupByDimensionValues: [],
      groupByConfig: undefined,
      objectMetadataItem: mockObjectMetadataItem,
      readField: mockReadField,
      toReference: mockToReference,
    });

    expect(result.totalCountDelta).toBe(1);
    expect(result.nextEdges.length).toBe(1);
  });

  it('should handle delete operation', () => {
    const mockEdge: RecordGqlRefEdge = {
      __typename: 'PersonEdge',
      node: mockReference,
      cursor: 'cursor123',
    };

    const cachedEdges: RecordGqlRefEdge[] = [mockEdge];
    const cachedPageInfo = {
      hasNextPage: false,
      hasPreviousPage: false,
    };

    const result = processGroupByConnectionWithRecords({
      cachedEdges,
      cachedPageInfo,
      records: [mockRecord],
      operation: 'delete',
      queryFilter: {},
      shouldMatchRootQueryFilter: false,
      groupByDimensionValues: [],
      groupByConfig: undefined,
      objectMetadataItem: mockObjectMetadataItem,
      readField: mockReadField,
      toReference: mockToReference,
    });

    expect(result.totalCountDelta).toBe(-1);
    expect(result.nextEdges.length).toBe(0);
  });

  it('keeps a cached record on update when its filtered one-to-many relation is unloaded', () => {
    const creatorObjectMetadataItem = {
      ...mockObjectMetadataItem,
      nameSingular: 'creator',
      namePlural: 'creators',
      fields: [
        {
          name: 'listMemberships',
          type: FieldMetadataType.RELATION,
          settings: { relationType: RelationType.ONE_TO_MANY },
        },
      ],
    } as EnrichedObjectMetadataItem;
    const cachedEdge: RecordGqlRefEdge = {
      __typename: 'CreatorEdge',
      node: mockReference,
      cursor: 'cursor123',
    };

    const result = processGroupByConnectionWithRecords({
      cachedEdges: [cachedEdge],
      cachedPageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
      },
      records: [{ ...mockRecord, __typename: 'Creator' }],
      operation: 'update',
      queryFilter: {
        listMemberships: { creatorList: { eq: 'creator-list-id' } },
      },
      shouldMatchRootQueryFilter: false,
      groupByDimensionValues: [],
      groupByConfig: undefined,
      objectMetadataItem: creatorObjectMetadataItem,
      readField: mockReadField,
      toReference: mockToReference,
    });

    expect(result.nextEdges).toEqual([cachedEdge]);
    expect(result.totalCountDelta).toBe(0);
  });
});
