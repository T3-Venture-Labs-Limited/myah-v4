import { type ApolloCache } from '@apollo/client';

import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

import { triggerUpdateRecordOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerUpdateRecordOptimisticEffect';

jest.mock(
  '@/apollo/optimistic-effect/group-by/utils/triggerUpdateGroupByQueriesOptimisticEffect',
  () => ({ triggerUpdateGroupByQueriesOptimisticEffect: jest.fn() }),
);
jest.mock(
  '@/apollo/optimistic-effect/utils/triggerUpdateRelationsOptimisticEffect',
  () => ({ triggerUpdateRelationsOptimisticEffect: jest.fn() }),
);

describe('triggerUpdateRecordOptimisticEffect', () => {
  it('preserves an existing edge when a one-to-many filter relation is absent from an inline update', () => {
    const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
    const companyObjectMetadataItem = objectMetadataItems.find(
      (item) => item.nameSingular === 'company',
    )!;
    const creator = {
      __ref: 'Company:company-a',
    };
    const connection = {
      __typename: 'CompanyConnection',
      edges: [
        {
          __typename: 'CompanyEdge',
          node: creator,
          cursor: 'cursor-a',
        },
      ],
      totalCount: 1,
    };
    let nextConnection = connection;
    const cache = {
      modify: ({ fields }: { fields: Record<string, Function> }) => {
        nextConnection = fields.companies(connection, {
          readField: (
            fieldName: string,
            source: typeof connection | typeof creator,
          ) => {
            if (fieldName === 'edges') {
              return 'edges' in source ? source.edges : undefined;
            }

            if (fieldName === 'id' && '__ref' in source) {
              return source.__ref.replace('Company:', '');
            }

            if (fieldName === 'totalCount' && 'totalCount' in source) {
              return source.totalCount;
            }

            return undefined;
          },
          storeFieldName:
            'companies({"filter":{"people":{"companyId":{"eq":"company-a"}}}})',
          toReference: () => creator,
        });
      },
    } as unknown as ApolloCache;

    triggerUpdateRecordOptimisticEffect({
      cache,
      objectMetadataItem: companyObjectMetadataItem,
      currentRecord: {
        __typename: 'Company',
        id: 'company-a',
        deletedAt: null,
        people: undefined,
      },
      updatedRecord: {
        __typename: 'Company',
        id: 'company-a',
        deletedAt: null,
        people: undefined,
      },
      objectMetadataItems,
      objectPermissionsByObjectMetadataId: {},
      upsertRecordsInStore: jest.fn(),
    });

    expect(nextConnection.edges).toHaveLength(1);
    expect(nextConnection.totalCount).toBe(1);
  });
});
