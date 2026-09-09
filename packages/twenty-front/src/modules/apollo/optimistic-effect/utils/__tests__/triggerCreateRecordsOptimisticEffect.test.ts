import { gql, InMemoryCache } from '@apollo/client';
import { type ObjectPermissions } from 'twenty-shared/types';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { triggerCreateRecordsOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerCreateRecordsOptimisticEffect';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { z } from 'zod';
const CAMPAIGN_METADATA_ID = '34700000-0000-4000-8000-000000000001';
const standardMetadata = getTestEnrichedObjectMetadataItemsMock();
const company = standardMetadata.find(
  (item) => item.nameSingular === 'company',
);
if (!company) throw new Error('Native Company metadata fixture missing');
const requiredField = (name: string): FieldMetadataItem => {
  const field = company.fields.find((item) => item.name === name);
  if (!field) throw new Error(`Native scalar metadata missing: ${name}`);
  return field;
};
const fieldNames = [
  'id',
  'name',
  'objective',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'position',
];
const fields: FieldMetadataItem[] = fieldNames.map((name, index) => ({
  ...requiredField(name === 'objective' ? 'name' : name),
  id: `34700000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  objectMetadataId: CAMPAIGN_METADATA_ID,
  universalIdentifier: `34700000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
  name,
  label: name === 'objective' ? 'Objective' : requiredField(name).label,
  ...(['name', 'objective'].includes(name)
    ? {
        type: FieldMetadataType.TEXT,
        defaultValue: name === 'name' ? "''" : null,
        isNullable: true,
      }
    : {}),
}));
const campaign: EnrichedObjectMetadataItem = {
  ...company,
  id: CAMPAIGN_METADATA_ID,
  universalIdentifier: '34700000-0000-4000-8000-000000000007',
  nameSingular: 'campaign',
  namePlural: 'campaigns',
  labelSingular: 'Campaign',
  labelPlural: 'Campaigns',
  isUICreatable: true,
  isUIEditable: true,
  isRemote: false,
  fields,
  readableFields: fields,
  updatableFields: fields,
  labelIdentifierFieldMetadataId: fields[1].id,
  imageIdentifierFieldMetadataId: null,
  indexMetadatas: [],
  searchFieldMetadatas: [],
};
const metadata = [...standardMetadata, campaign];
const permissions: ObjectPermissions & { objectMetadataId: string } = {
  objectMetadataId: CAMPAIGN_METADATA_ID,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
};

const query = gql`
  query FindManyCampaigns(
    $filter: CampaignFilterInput
    $orderBy: [CampaignOrderByInput!]
  ) {
    campaigns(filter: $filter, orderBy: $orderBy) {
      edges {
        node {
          id
          position
          __typename
        }
        cursor
        __typename
      }
      totalCount
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
        __typename
      }
      __typename
    }
  }
`;
const fragment = gql`
  fragment Position on Campaign {
    id
    position
  }
`;
it.each([
  [undefined, [], {}, ['new', 'a', 'b']],
  [undefined, [{ position: 'AscNullsLast' }], {}, ['a', 'new', 'b']],
  ['first', [], {}, ['new', 'a', 'b']],
  ['last', [], {}, ['a', 'b', 'new']],
  ['first', [{ position: 'AscNullsLast' }], {}, ['a', 'new', 'b']],
  ['last', [{ position: 'AscNullsLast' }], {}, ['a', 'new', 'b']],
  ['first', [], { position: { eq: 15 } }, ['new', 'a', 'b']],
  ['last', [], { position: { eq: 99 } }, ['a', 'b']],
] as const)(
  'honors %s only for unsorted matching lists (%j, %j)',
  (creationPosition, orderBy, filter, expected) => {
    const cache = new InMemoryCache();
    const variables = { filter, orderBy };
    const records = [
      { id: 'a', position: 10 },
      { id: 'b', position: 20 },
    ].map((record) => ({ ...record, __typename: 'Campaign' }));
    cache.writeQuery({
      query,
      variables,
      data: {
        campaigns: {
          __typename: 'CampaignConnection',
          edges: records.map((node) => ({
            __typename: 'CampaignEdge',
            node,
            cursor: node.id,
          })),
          totalCount: 2,
          pageInfo: {
            __typename: 'PageInfo',
            startCursor: 'a',
            endCursor: 'b',
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      },
    });
    const record = { __typename: 'Campaign', id: 'new', position: 15 };
    cache.writeFragment({ id: 'Campaign:new', fragment, data: record });
    const args = {
      cache,
      objectMetadataItem: campaign,
      objectMetadataItems: metadata,
      recordsToCreate: [record],
      shouldMatchRootQueryFilter: true,
      creationPosition,
      objectPermissionsByObjectMetadataId: { [campaign.id]: permissions },
      upsertRecordsInStore: jest.fn(),
    };
    triggerCreateRecordsOptimisticEffect(args);
    triggerCreateRecordsOptimisticEffect(args);
    const result = z
      .object({
        campaigns: z.object({
          edges: z.array(z.object({ node: z.object({ id: z.string() }) })),
          totalCount: z.number(),
        }),
      })
      .parse(cache.readQuery({ query, variables }));
    expect(result.campaigns.edges.map((edge) => edge.node.id)).toEqual(
      expected,
    );
    expect(result.campaigns.totalCount).toBe(expected.length);
    expect(cache.readFragment({ id: 'Campaign:new', fragment })).toMatchObject({
      position: 15,
    });
    expect(record.position).toBe(15);
  },
);
