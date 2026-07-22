import gql from 'graphql-tag';
import { createManyOperationFactory } from 'test/integration/graphql/utils/create-many-operation-factory.util';
import { deleteManyOperationFactory } from 'test/integration/graphql/utils/delete-many-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

const TEST_COMPANY_IDS = {
  AIRBNB: '20202020-cccc-4000-8000-000000000001',
  STRIPE: '20202020-cccc-4000-8000-000000000002',
  NOTION: '20202020-cccc-4000-8000-000000000003',
};

const TEST_PERSON_IDS = {
  AIRBNB_ENGINEER: '20202020-dddd-4000-8000-000000000001',
  AIRBNB_DESIGNER: '20202020-dddd-4000-8000-000000000002',
  STRIPE_ENGINEER: '20202020-dddd-4000-8000-000000000003',
  NOTION_ENGINEER: '20202020-dddd-4000-8000-000000000004',
  UNAFFILIATED: '20202020-dddd-4000-8000-000000000005',
};

const TEST_ROCKET_IDS = {
  FALCON: '20202020-cccc-4000-8000-100000000001',
  STARSHIP: '20202020-cccc-4000-8000-100000000002',
};

const TEST_PET_IDS = {
  FALCON_PET: '20202020-dddd-4000-8000-100000000001',
  STARSHIP_PET: '20202020-dddd-4000-8000-100000000002',
};

const ALL_TEST_PERSON_IDS = Object.values(TEST_PERSON_IDS);
const ALL_TEST_PET_IDS = Object.values(TEST_PET_IDS);

const TEST_CREATOR_IDS = {
  MATCHING: '20202020-ffff-4000-8000-000000000001',
  NON_MEMBER: '20202020-ffff-4000-8000-000000000002',
  ZERO_CHILD: '20202020-ffff-4000-8000-000000000003',
  SOFT_DELETED_CHILD: '20202020-ffff-4000-8000-000000000004',
};

const TEST_CREATOR_LIST_IDS = {
  A: '20202020-ffff-4000-8000-000000000005',
  B: '20202020-ffff-4000-8000-000000000006',
};

const TEST_CREATOR_LIST_MEMBER_IDS = {
  MATCHING_A_1: '20202020-ffff-4000-8000-000000000007',
  MATCHING_A_2: '20202020-ffff-4000-8000-000000000008',
  MATCHING_B: '20202020-ffff-4000-8000-000000000009',
  NON_MEMBER_B: '20202020-ffff-4000-8000-000000000010',
  SOFT_DELETED_A: '20202020-ffff-4000-8000-000000000011',
};

describe('Filter by relation field (e2e)', () => {
  beforeAll(async () => {
    const createCompanies = createManyOperationFactory({
      objectMetadataSingularName: 'company',
      objectMetadataPluralName: 'companies',
      gqlFields: 'id name',
      data: [
        {
          id: TEST_COMPANY_IDS.AIRBNB,
          name: 'Airbnb',
          annualRevenue: {
            amountMicros: 50_000_000_000_000,
            currencyCode: 'USD',
          },
        },
        {
          id: TEST_COMPANY_IDS.STRIPE,
          name: 'Stripe',
          annualRevenue: {
            amountMicros: 10_000_000_000_000,
            currencyCode: 'USD',
          },
        },
        {
          id: TEST_COMPANY_IDS.NOTION,
          name: 'Notion',
          annualRevenue: {
            amountMicros: 5_000_000_000_000,
            currencyCode: 'USD',
          },
        },
      ],
      upsert: true,
    });

    await makeGraphqlAPIRequest(createCompanies);

    const createPeople = createManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: 'id',
      data: [
        {
          id: TEST_PERSON_IDS.AIRBNB_ENGINEER,
          companyId: TEST_COMPANY_IDS.AIRBNB,
          jobTitle: 'Engineer',
        },
        {
          id: TEST_PERSON_IDS.AIRBNB_DESIGNER,
          companyId: TEST_COMPANY_IDS.AIRBNB,
          jobTitle: 'Designer',
        },
        {
          id: TEST_PERSON_IDS.STRIPE_ENGINEER,
          companyId: TEST_COMPANY_IDS.STRIPE,
          jobTitle: 'Engineer',
        },
        {
          id: TEST_PERSON_IDS.NOTION_ENGINEER,
          companyId: TEST_COMPANY_IDS.NOTION,
          jobTitle: 'Engineer',
        },
        {
          id: TEST_PERSON_IDS.UNAFFILIATED,
          companyId: null,
          jobTitle: 'Engineer',
        },
      ],
      upsert: true,
    });

    await makeGraphqlAPIRequest(createPeople);

    const createRockets = createManyOperationFactory({
      objectMetadataSingularName: 'rocket',
      objectMetadataPluralName: 'rockets',
      gqlFields: 'id name',
      data: [
        { id: TEST_ROCKET_IDS.FALCON, name: 'FilterFalcon' },
        { id: TEST_ROCKET_IDS.STARSHIP, name: 'FilterStarship' },
      ],
      upsert: true,
    });

    await makeGraphqlAPIRequest(createRockets);

    const createPets = createManyOperationFactory({
      objectMetadataSingularName: 'pet',
      objectMetadataPluralName: 'pets',
      gqlFields: 'id',
      data: [
        {
          id: TEST_PET_IDS.FALCON_PET,
          name: 'FilterFalconPet',
          polymorphicOwnerRocketId: TEST_ROCKET_IDS.FALCON,
        },
        {
          id: TEST_PET_IDS.STARSHIP_PET,
          name: 'FilterStarshipPet',
          polymorphicOwnerRocketId: TEST_ROCKET_IDS.STARSHIP,
        },
      ],
      upsert: true,
    });

    await makeGraphqlAPIRequest(createPets);

    await makeGraphqlAPIRequest(
      createManyOperationFactory({
        objectMetadataSingularName: 'creator',
        objectMetadataPluralName: 'creators',
        gqlFields: 'id',
        data: [
          {
            id: TEST_CREATOR_IDS.MATCHING,
            name: 'Matching creator',
            twitterFollowerCount: 100,
          },
          {
            id: TEST_CREATOR_IDS.NON_MEMBER,
            name: 'Non-member creator',
            twitterFollowerCount: 200,
          },
          {
            id: TEST_CREATOR_IDS.ZERO_CHILD,
            name: 'Creator without memberships',
            twitterFollowerCount: 300,
          },
          {
            id: TEST_CREATOR_IDS.SOFT_DELETED_CHILD,
            name: 'Creator with a soft-deleted membership',
            twitterFollowerCount: 400,
          },
        ],
        upsert: true,
      }),
    );
    await makeGraphqlAPIRequest(
      createManyOperationFactory({
        objectMetadataSingularName: 'creatorList',
        objectMetadataPluralName: 'creatorLists',
        gqlFields: 'id',
        data: [
          { id: TEST_CREATOR_LIST_IDS.A, name: 'Creator list A' },
          { id: TEST_CREATOR_LIST_IDS.B, name: 'Creator list B' },
        ],
        upsert: true,
      }),
    );
    await makeGraphqlAPIRequest(
      createManyOperationFactory({
        objectMetadataSingularName: 'creatorListMember',
        objectMetadataPluralName: 'creatorListMembers',
        gqlFields: 'id',
        data: [
          {
            id: TEST_CREATOR_LIST_MEMBER_IDS.MATCHING_A_1,
            name: 'Matching membership A 1',
            creatorId: TEST_CREATOR_IDS.MATCHING,
            creatorListId: TEST_CREATOR_LIST_IDS.A,
          },
          {
            id: TEST_CREATOR_LIST_MEMBER_IDS.MATCHING_A_2,
            name: 'Matching membership A 2',
            creatorId: TEST_CREATOR_IDS.MATCHING,
            creatorListId: TEST_CREATOR_LIST_IDS.A,
          },
          {
            id: TEST_CREATOR_LIST_MEMBER_IDS.MATCHING_B,
            name: 'Matching membership B',
            creatorId: TEST_CREATOR_IDS.MATCHING,
            creatorListId: TEST_CREATOR_LIST_IDS.B,
          },
          {
            id: TEST_CREATOR_LIST_MEMBER_IDS.NON_MEMBER_B,
            name: 'Non-member membership B',
            creatorId: TEST_CREATOR_IDS.NON_MEMBER,
            creatorListId: TEST_CREATOR_LIST_IDS.B,
          },
          {
            id: TEST_CREATOR_LIST_MEMBER_IDS.SOFT_DELETED_A,
            name: 'Soft-deleted membership A',
            creatorId: TEST_CREATOR_IDS.SOFT_DELETED_CHILD,
            creatorListId: TEST_CREATOR_LIST_IDS.A,
          },
        ],
        upsert: true,
      }),
    );
  });

  it('should filter people by company name (exact match)', async () => {
    const queryData = {
      query: gql`
        query People($filter: PersonFilterInput) {
          people(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: ALL_TEST_PERSON_IDS } },
            { company: { name: { eq: 'Airbnb' } } },
          ],
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toBeDefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids.sort()).toEqual(
      [TEST_PERSON_IDS.AIRBNB_ENGINEER, TEST_PERSON_IDS.AIRBNB_DESIGNER].sort(),
    );
  });

  it('should filter people by company name with like operator', async () => {
    const queryData = {
      query: gql`
        query People($filter: PersonFilterInput) {
          people(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: ALL_TEST_PERSON_IDS } },
            { company: { name: { like: '%irbnb%' } } },
          ],
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids.sort()).toEqual(
      [TEST_PERSON_IDS.AIRBNB_ENGINEER, TEST_PERSON_IDS.AIRBNB_DESIGNER].sort(),
    );
  });

  it('should combine a relation filter with a scalar filter on the root object', async () => {
    const queryData = {
      query: gql`
        query People($filter: PersonFilterInput) {
          people(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: ALL_TEST_PERSON_IDS } },
            { company: { name: { eq: 'Airbnb' } } },
            { jobTitle: { eq: 'Designer' } },
          ],
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids).toEqual([TEST_PERSON_IDS.AIRBNB_DESIGNER]);
  });

  it('should combine a relation filter with an order-by on the same relation (join dedupe)', async () => {
    const queryData = {
      query: gql`
        query People(
          $filter: PersonFilterInput
          $orderBy: [PersonOrderByInput]
        ) {
          people(filter: $filter, orderBy: $orderBy, first: 10) {
            edges {
              node {
                id
                company {
                  name
                }
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: ALL_TEST_PERSON_IDS } },
            { company: { name: { like: '%i%' } } },
          ],
        },
        orderBy: [{ company: { name: 'AscNullsLast' } }],
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();

    const companyNames = response.body.data.people.edges.map(
      (edge: { node: { company: { name: string } | null } }) =>
        edge.node.company?.name ?? null,
    );

    // Airbnb, Notion, Stripe all contain "i"; ascending order
    expect(companyNames).toEqual(['Airbnb', 'Airbnb', 'Notion', 'Stripe']);
  });

  it('should filter on a composite sub-field of the related object without tripping the depth cap', async () => {
    const queryData = {
      query: gql`
        query People($filter: PersonFilterInput) {
          people(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: ALL_TEST_PERSON_IDS } },
            {
              company: {
                annualRevenue: {
                  amountMicros: { gte: 20_000_000_000_000 },
                },
              },
            },
          ],
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    // Only Airbnb (50M) is >= 20M; Stripe (10M) and Notion (5M) excluded.
    expect(ids.sort()).toEqual(
      [TEST_PERSON_IDS.AIRBNB_ENGINEER, TEST_PERSON_IDS.AIRBNB_DESIGNER].sort(),
    );
  });

  it('should reject relation filters nested deeper than one hop', async () => {
    const queryData = {
      query: gql`
        query People($filter: PersonFilterInput) {
          people(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          company: {
            accountOwner: {
              name: { firstName: { eq: 'Anything' } },
            },
          },
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('should not widen the root query when a relation block contains a deletedAt filter', async () => {
    // A deletedAt nested inside a relation block belongs to the related
    // entity — it must not call `withDeleted()` on the root builder and
    // surface soft-deleted root rows.
    const liveId = '20202020-dddd-4000-8000-000000000098';
    const softDeletedId = '20202020-dddd-4000-8000-000000000099';

    await makeGraphqlAPIRequest(
      createManyOperationFactory({
        objectMetadataSingularName: 'person',
        objectMetadataPluralName: 'people',
        gqlFields: 'id',
        data: [
          { id: liveId, companyId: TEST_COMPANY_IDS.AIRBNB },
          { id: softDeletedId, companyId: TEST_COMPANY_IDS.AIRBNB },
        ],
        upsert: true,
      }),
    );

    await makeGraphqlAPIRequest(
      deleteManyOperationFactory({
        objectMetadataSingularName: 'person',
        objectMetadataPluralName: 'people',
        gqlFields: 'id',
        filter: { id: { in: [softDeletedId] } },
      }),
    );

    const queryData = {
      query: gql`
        query People($filter: PersonFilterInput) {
          people(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: [liveId, softDeletedId] } },
            { company: { deletedAt: { is: 'NULL' } } },
          ],
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids).toEqual([liveId]);
  });

  it('should filter pets by a MORPH_RELATION target field (rocket name)', async () => {
    const queryData = {
      query: gql`
        query Pets($filter: PetFilterInput) {
          pets(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { in: ALL_TEST_PET_IDS } },
            { polymorphicOwnerRocket: { name: { eq: 'FilterFalcon' } } },
          ],
        },
      },
    };

    const response = await makeGraphqlAPIRequest(queryData);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.pets.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids).toEqual([TEST_PET_IDS.FALCON_PET]);
  });
  it('should expose a one-to-many relation as a nested filter without a source join column', async () => {
    const response = await makeGraphqlAPIRequest({
      query: gql`
        query CreatorFilterInput {
          __type(name: "CreatorFilterInput") {
            inputFields {
              name
            }
          }
        }
      `,
    });

    expect(response.body.errors).toBeUndefined();

    const fieldNames = response.body.data.__type.inputFields.map(
      (field: { name: string }) => field.name,
    );

    expect(fieldNames).toContain('listMemberships');
    expect(fieldNames).not.toContain('listMembershipsId');
  });

  it('should return only creators with a matching one-to-many list membership', async () => {
    const response = await makeGraphqlAPIRequest({
      query: gql`
        query Creators($filter: CreatorFilterInput) {
          creators(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            {
              id: {
                in: [TEST_CREATOR_IDS.MATCHING, TEST_CREATOR_IDS.NON_MEMBER],
              },
            },
            {
              listMemberships: {
                creatorListId: { in: [TEST_CREATOR_LIST_IDS.A] },
              },
            },
          ],
        },
      },
    });

    expect(response.body.errors).toBeUndefined();
    expect(
      response.body.data.creators.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      ),
    ).toEqual([TEST_CREATOR_IDS.MATCHING]);
  });
  it('should allow separate one-to-many children to satisfy AND relation predicates', async () => {
    const response = await makeGraphqlAPIRequest({
      query: gql`
        query Creators($filter: CreatorFilterInput) {
          creators(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { eq: TEST_CREATOR_IDS.MATCHING } },
            {
              listMemberships: {
                creatorListId: { eq: TEST_CREATOR_LIST_IDS.A },
              },
            },
            {
              listMemberships: {
                creatorListId: { eq: TEST_CREATOR_LIST_IDS.B },
              },
            },
          ],
        },
      },
    });

    expect(response.body.errors).toBeUndefined();
    expect(
      response.body.data.creators.edges.map(
        (edge: { node: { id: string } }) => edge.node.id,
      ),
    ).toEqual([TEST_CREATOR_IDS.MATCHING]);
  });

  it('should include a creator with no children when negating a one-to-many relation filter', async () => {
    const response = await makeGraphqlAPIRequest({
      query: gql`
        query Creators($filter: CreatorFilterInput) {
          creators(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            {
              id: {
                in: [
                  TEST_CREATOR_IDS.MATCHING,
                  TEST_CREATOR_IDS.NON_MEMBER,
                  TEST_CREATOR_IDS.ZERO_CHILD,
                  TEST_CREATOR_IDS.SOFT_DELETED_CHILD,
                ],
              },
            },
            {
              not: {
                listMemberships: {
                  creatorListId: { eq: TEST_CREATOR_LIST_IDS.A },
                },
              },
            },
          ],
        },
      },
    });

    expect(response.body.errors).toBeUndefined();
    expect(
      response.body.data.creators.edges
        .map((edge: { node: { id: string } }) => edge.node.id)
        .sort(),
    ).toEqual(
      [TEST_CREATOR_IDS.NON_MEMBER, TEST_CREATOR_IDS.ZERO_CHILD].sort(),
    );
  });

  it('should preserve root aggregate cardinality when multiple children match', async () => {
    const response = await makeGraphqlAPIRequest({
      query: gql`
        query Creators($filter: CreatorFilterInput) {
          creators(filter: $filter, first: 10) {
            totalCount
            sumTwitterFollowerCount
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { eq: TEST_CREATOR_IDS.MATCHING } },
            {
              listMemberships: {
                creatorListId: { eq: TEST_CREATOR_LIST_IDS.A },
              },
            },
          ],
        },
      },
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.creators.totalCount).toBe(1);
    expect(response.body.data.creators.sumTwitterFollowerCount).toBe(100);
  });

  it('should not match a one-to-many relation through a soft-deleted child', async () => {
    await makeGraphqlAPIRequest(
      deleteManyOperationFactory({
        objectMetadataSingularName: 'creatorListMember',
        objectMetadataPluralName: 'creatorListMembers',
        gqlFields: 'id',
        filter: {
          id: { eq: TEST_CREATOR_LIST_MEMBER_IDS.SOFT_DELETED_A },
        },
      }),
    );

    const response = await makeGraphqlAPIRequest({
      query: gql`
        query Creators($filter: CreatorFilterInput) {
          creators(filter: $filter, first: 10) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: {
        filter: {
          and: [
            { id: { eq: TEST_CREATOR_IDS.SOFT_DELETED_CHILD } },
            {
              listMemberships: {
                creatorListId: { eq: TEST_CREATOR_LIST_IDS.A },
              },
            },
          ],
        },
      },
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.creators.edges).toEqual([]);
  });
});
