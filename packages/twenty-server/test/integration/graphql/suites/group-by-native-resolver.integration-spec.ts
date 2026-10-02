import { randomUUID } from 'crypto';

import gql from 'graphql-tag';
import request from 'supertest';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { destroyOneOperationFactory } from 'test/integration/graphql/utils/destroy-one-operation-factory.util';
import { groupByOperationFactory } from 'test/integration/graphql/utils/group-by-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { deleteRole } from 'test/integration/graphql/utils/delete-one-role.util';
import { makeGraphqlAPIRequestWithMemberRole } from 'test/integration/graphql/utils/make-graphql-api-request-with-member-role.util';
import { updateWorkspaceMemberRole } from 'test/integration/graphql/utils/update-workspace-member-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { OrderByDirection } from 'twenty-shared/types';
import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { PermissionsExceptionMessage } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

describe('native Creator group-by resolver (integration)', () => {
  describe('standard case', () => {
    const testPersonId = randomUUID();
    const testPerson2Id = randomUUID();
    const testPerson3Id = randomUUID();

    afterEach(async () => {
      // cleanup created people
      await makeGraphqlAPIRequest(
        destroyOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id',
          recordId: testPersonId,
        }),
      );
      await makeGraphqlAPIRequest(
        destroyOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id',
          recordId: testPerson2Id,
        }),
      );
      await makeGraphqlAPIRequest(
        destroyOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id',
          recordId: testPerson3Id,
        }),
      );
    });
    it('groups by city', async () => {
      const cityA = 'City A';
      const cityB = 'City B';

      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPersonId,
            name: 'Group test creator',
            location: cityA,
          },
        }),
      );
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPerson2Id,
            name: 'Group test creator',
            location: cityB,
          },
        }),
      );
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPerson3Id,
            name: 'Group test creator',
            location: cityB,
          },
        }),
      );

      const response = await makeGraphqlAPIRequest(
        groupByOperationFactory({
          objectMetadataSingularName: 'creator',
          objectMetadataPluralName: 'creators',
          groupBy: [{ location: true }],
          orderBy: [{ location: OrderByDirection.AscNullsFirst }], // needed for City groups to be in 300 first groups
          limit: 300,
        }),
      );

      const groups = response.body.data.creatorsGroupBy;

      expect(groups).toBeDefined();
      expect(groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ groupByDimensionValues: [cityA] }),
          expect.objectContaining({ groupByDimensionValues: [cityB] }),
        ]),
      );

      const groupWithCityA = groups.find(
        (group: any) => group.groupByDimensionValues[0] === cityA,
      );

      expect(groupWithCityA.groupByDimensionValues).toEqual([cityA]);
      expect(groupWithCityA.totalCount).toEqual(1);

      const groupWithCityB = groups.find(
        (group: any) => group.groupByDimensionValues[0] === cityB,
      );

      expect(groupWithCityB.groupByDimensionValues).toEqual([cityB]);
      expect(groupWithCityB.totalCount).toEqual(2);
    });

    it('limits the number of groups when limit argument is provided', async () => {
      const cityA = 'City A';
      const cityB = 'City B';
      const cityC = 'City C';

      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPersonId,
            name: 'Group test creator',
            location: cityA,
          },
        }),
      );
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPerson2Id,
            name: 'Group test creator',
            location: cityB,
          },
        }),
      );
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPerson3Id,
            name: 'Group test creator',
            location: cityC,
          },
        }),
      );

      const response = await makeGraphqlAPIRequest(
        groupByOperationFactory({
          objectMetadataSingularName: 'creator',
          objectMetadataPluralName: 'creators',
          groupBy: [{ location: true }],
          limit: 2,
        }),
      );

      const groups = response.body.data.creatorsGroupBy;

      expect(groups).toBeDefined();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups).toHaveLength(2);
    });

    it('computes aggregated metrics on date time field', async () => {
      const cityA = 'City A';
      const cityB = 'City B';

      const person1 = (
        await makeGraphqlAPIRequest(
          createOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id name location createdAt',
            data: {
              id: testPersonId,
              name: 'Group test creator',
              location: cityA,
            },
          }),
        )
      ).body.data.createCreator;

      const person2 = (
        await makeGraphqlAPIRequest(
          createOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id name location createdAt',
            data: {
              id: testPerson2Id,
              name: 'Group test creator',
              location: cityB,
            },
          }),
        )
      ).body.data.createCreator;

      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: testPerson3Id,
            name: 'Group test creator',
            location: cityB,
          },
        }),
      );

      const response = await makeGraphqlAPIRequest(
        groupByOperationFactory({
          objectMetadataSingularName: 'creator',
          objectMetadataPluralName: 'creators',
          groupBy: [{ location: true }],
          orderBy: [{ location: OrderByDirection.AscNullsFirst }], // needed for City groups to be in 300 first groups
          gqlFields: 'minCreatedAt',
          limit: 300,
        }),
      );

      const groups = response.body.data.creatorsGroupBy;

      expect(groups).toBeDefined();
      expect(groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ groupByDimensionValues: [cityA] }),
          expect.objectContaining({ groupByDimensionValues: [cityB] }),
        ]),
      );

      const groupWithCityA = groups.find(
        (group: any) => group.groupByDimensionValues[0] === cityA,
      );

      expect(groupWithCityA.groupByDimensionValues).toEqual([cityA]);
      expect(groupWithCityA.minCreatedAt).toEqual(person1.createdAt);

      const groupWithCityB = groups.find(
        (group: any) => group.groupByDimensionValues[0] === cityB,
      );

      expect(groupWithCityB.groupByDimensionValues).toEqual([cityB]);
      expect(groupWithCityB.minCreatedAt).toEqual(person2.createdAt);
    });
  });

  describe('date range', () => {
    const testPersonId = randomUUID();
    const testPerson2Id = randomUUID();
    const testPerson3Id = randomUUID();

    const idJan2 = testPersonId;
    const idJan8 = testPerson2Id;
    const idMar3 = testPerson3Id;

    beforeAll(async () => {
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: idJan2,
            name: 'Group test creator',
            createdAt: '2025-01-02T12:00:00.000Z', // thursday, january, Q1, 2025
          },
        }),
      );
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: idJan8,
            name: 'Group test creator',
            createdAt: '2025-01-08T08:00:00.000Z',
          }, // wednesday, january, Q1, 2025
        }),
      );
      await makeGraphqlAPIRequest(
        createOneOperationFactory({
          objectMetadataSingularName: 'creator',
          gqlFields: 'id name location createdAt',
          data: {
            id: idMar3,
            name: 'Group test creator',
            createdAt: '2025-03-03T09:30:00.000Z',
          }, // monday, march, Q1, 2025
        }),
      );
    });

    afterAll(async () => {
      // cleanup created people
      for (const id of [testPersonId, testPerson2Id, testPerson3Id]) {
        await makeGraphqlAPIRequest(
          destroyOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id',
            recordId: id,
          }),
        );
      }
    });

    const filter2025 = {
      and: [
        {
          createdAt: {
            gte: '2025-01-01T00:00:00.000Z',
          },
        },
        {
          createdAt: {
            lt: '2025-03-04T00:00:00.000Z',
          },
        },
      ],
    };

    it('datetime field - groups by createdAt MONTH', async () => {
      const response = await makeGraphqlAPIRequest(
        groupByOperationFactory({
          objectMetadataSingularName: 'creator',
          objectMetadataPluralName: 'creators',
          groupBy: [
            { createdAt: { granularity: 'MONTH', timeZone: 'Europe/Paris' } },
          ],
          filter: filter2025,
        }),
      );

      const groups = response.body.data.creatorsGroupBy;

      expect(groups).toBeDefined();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBe(2);

      const groupWith2Records = groups.find((g: any) => g.totalCount === 2);
      const groupWith1Record = groups.find((g: any) => g.totalCount === 1);

      expect(groupWith2Records).toBeDefined();
      expect(groupWith1Record).toBeDefined();

      expect(groupWith2Records.totalCount).toBe(2);
      expect(groupWith1Record.totalCount).toBe(1);
    });

    describe('group by week', () => {
      const idMarch1st = randomUUID();
      const idMarch2nd = randomUUID();
      const idMarch3rd = randomUUID();

      beforeAll(async () => {
        await makeGraphqlAPIRequest(
          createOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id name location createdAt',
            data: {
              id: idMarch3rd,
              name: 'Group test creator',
              createdAt: '2025-03-03T09:30:00.000Z',
            }, // monday, march, Q1, 2025
          }),
        );
        await makeGraphqlAPIRequest(
          createOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id name location createdAt',
            data: {
              id: idMarch2nd,
              name: 'Group test creator',
              createdAt: '2025-03-02T09:30:00.000Z',
            }, // sunday, march, Q1, 2025
          }),
        );
        await makeGraphqlAPIRequest(
          createOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id name location createdAt',
            data: {
              id: idMarch1st,
              name: 'Group test creator',
              createdAt: '2025-03-01T09:30:00.000Z',
            }, // saturday, march, Q1, 2025
          }),
        );
      });

      afterAll(async () => {
        await makeGraphqlAPIRequest(
          destroyOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id',
            recordId: idMarch1st,
          }),
        );
        await makeGraphqlAPIRequest(
          destroyOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id',
            recordId: idMarch2nd,
          }),
        );
        await makeGraphqlAPIRequest(
          destroyOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id',
            recordId: idMarch3rd,
          }),
        );
      });

      it('datetime field - groups by createdAt WEEK with default (MONDAY)', async () => {
        const response = await makeGraphqlAPIRequest(
          groupByOperationFactory({
            objectMetadataSingularName: 'creator',
            objectMetadataPluralName: 'creators',
            groupBy: [
              { createdAt: { granularity: 'WEEK', timeZone: 'Europe/Paris' } },
            ],
            gqlFields: `
              edges {
                node {
                  id
                }
              }
            `,
            filter: filter2025,
            limit: 10,
          }),
        );

        const groups = response.body.data.creatorsGroupBy;

        expect(groups).toBeDefined();
        expect(groups.length).toBe(4);

        // Group starting week of monday dec 30th, 2024
        const mondayDec30thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2024-12-30'),
        );

        expect(mondayDec30thGroup).toBeDefined();
        expect(mondayDec30thGroup.edges[0].node.id).toBe(idJan2);
        expect(mondayDec30thGroup.totalCount).toBe(1);

        // Group starting week of monday jan 6th, 2025
        const mondayJan6thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-01-06'),
        );

        expect(mondayJan6thGroup).toBeDefined();
        expect(mondayJan6thGroup.edges[0].node.id).toBe(idJan8);
        expect(mondayJan6thGroup.totalCount).toBe(1);

        // Group starting week of monday feb 24th, 2025
        const mondayFeb24thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-02-24'),
        );

        expect(mondayFeb24thGroup).toBeDefined();
        expect(mondayFeb24thGroup.edges.length).toBe(2);
        expect(
          mondayFeb24thGroup.edges.find(
            (edge: any) => edge.node.id === idMarch2nd,
          ),
        ).toBeDefined();
        expect(
          mondayFeb24thGroup.edges.find(
            (edge: any) => edge.node.id === idMarch1st,
          ),
        ).toBeDefined();

        // Group starting week of monday march 3rd, 2025
        const mondayMarch3rdGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-03-03'),
        );

        expect(mondayMarch3rdGroup).toBeDefined();
        expect(mondayMarch3rdGroup.edges.length).toBe(2);
        expect(
          mondayMarch3rdGroup.edges.find(
            (edge: any) => edge.node.id === idMarch3rd,
          ),
        ).toBeDefined();
        expect(
          mondayMarch3rdGroup.edges.find(
            (edge: any) => edge.node.id === idMar3,
          ),
        ).toBeDefined();
      });

      it('datetime field - groups by createdAt WEEK with weekStartDay SUNDAY', async () => {
        const response = await makeGraphqlAPIRequest(
          groupByOperationFactory({
            objectMetadataSingularName: 'creator',
            objectMetadataPluralName: 'creators',
            groupBy: [
              {
                createdAt: {
                  granularity: 'WEEK',
                  weekStartDay: 'SUNDAY',
                  timeZone: 'Europe/Paris',
                },
              },
            ],
            gqlFields: `
              edges {
                node {
                  id
                }
              }
            `,
            filter: filter2025,
            limit: 10,
          }),
        );

        const groups = response.body.data.creatorsGroupBy;

        expect(groups).toBeDefined();
        expect(groups.length).toBe(4);

        // Group starting week of sunday dec 29th, 2024
        const sundayDec29thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2024-12-29'),
        );

        expect(sundayDec29thGroup).toBeDefined();
        expect(sundayDec29thGroup.totalCount).toBe(1);
        expect(
          sundayDec29thGroup.edges.find((edge: any) => edge.node.id === idJan2),
        ).toBeDefined();

        // Group starting week of sunday jan 5th, 2025
        const sundayJan5thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-01-05'),
        );

        expect(sundayJan5thGroup).toBeDefined();
        expect(sundayJan5thGroup.totalCount).toBe(1);
        expect(
          sundayJan5thGroup.edges.find((edge: any) => edge.node.id === idJan8),
        ).toBeDefined();

        // Group starting week of sunday feb 23rd, 2025
        const sundayFeb23rdGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-02-23'),
        );

        expect(sundayFeb23rdGroup).toBeDefined();
        expect(sundayFeb23rdGroup.totalCount).toBe(1);
        expect(
          sundayFeb23rdGroup.edges.find(
            (edge: any) => edge.node.id === idMarch1st,
          ),
        ).toBeDefined();

        // Group starting week of sunday march 2nd, 2025
        const sundayMarch2ndGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-03-02'),
        );

        expect(sundayMarch2ndGroup).toBeDefined();
        expect(sundayMarch2ndGroup.totalCount).toBe(3);
        expect(
          sundayMarch2ndGroup.edges.find(
            (edge: any) => edge.node.id === idMarch2nd,
          ),
        ).toBeDefined();
        expect(
          sundayMarch2ndGroup.edges.find(
            (edge: any) => edge.node.id === idMarch3rd,
          ),
        ).toBeDefined();
        expect(
          sundayMarch2ndGroup.edges.find(
            (edge: any) => edge.node.id === idMar3,
          ),
        ).toBeDefined();
      });

      it('datetime field - groups by createdAt WEEK with weekStartDay SATURDAY', async () => {
        const response = await makeGraphqlAPIRequest(
          groupByOperationFactory({
            objectMetadataSingularName: 'creator',
            objectMetadataPluralName: 'creators',
            groupBy: [
              {
                createdAt: {
                  granularity: 'WEEK',
                  weekStartDay: 'SATURDAY',
                  timeZone: 'Europe/Paris',
                },
              },
            ],
            gqlFields: `
              edges {
                node {
                  id
                }
              }
            `,
            filter: filter2025,
            limit: 10,
          }),
        );

        const groups = response.body.data.creatorsGroupBy;

        expect(groups).toBeDefined();
        expect(groups.length).toBe(3);

        // Group starting week of saturday dec 28th, 2024
        const saturdayDec28thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2024-12-28'),
        );

        expect(saturdayDec28thGroup).toBeDefined();
        expect(saturdayDec28thGroup.totalCount).toBe(1);
        expect(
          saturdayDec28thGroup.edges.find(
            (edge: any) => edge.node.id === idJan2,
          ),
        ).toBeDefined();

        // Group starting week of saturday jan 4th, 2025
        const saturdayJan4thGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-01-04'),
        );

        expect(saturdayJan4thGroup).toBeDefined();
        expect(saturdayJan4thGroup.totalCount).toBe(1);
        expect(
          saturdayJan4thGroup.edges.find(
            (edge: any) => edge.node.id === idJan8,
          ),
        ).toBeDefined();

        // Group starting week of saturday march 1st, 2025
        const saturdayMarch1stGroup = groups.find((group: any) =>
          group.groupByDimensionValues[0].startsWith('2025-03-01'),
        );

        expect(saturdayMarch1stGroup).toBeDefined();
        expect(saturdayMarch1stGroup.totalCount).toBe(4);
        expect(
          saturdayMarch1stGroup.edges.find(
            (edge: any) => edge.node.id === idMarch1st,
          ),
        ).toBeDefined();
        expect(
          saturdayMarch1stGroup.edges.find(
            (edge: any) => edge.node.id === idMarch2nd,
          ),
        ).toBeDefined();
        expect(
          saturdayMarch1stGroup.edges.find(
            (edge: any) => edge.node.id === idMarch3rd,
          ),
        ).toBeDefined();
        expect(
          saturdayMarch1stGroup.edges.find(
            (edge: any) => edge.node.id === idMar3,
          ),
        ).toBeDefined();
      });
    });

    describe('cyclic date', () => {
      const filter2024And2025 = {
        and: [
          {
            createdAt: {
              gte: '2024-01-01T00:00:00.000Z',
            },
          },
          {
            createdAt: {
              lt: '2025-03-04T00:00:00.000Z',
            },
          },
        ],
      };

      const testPersonId2024 = randomUUID();

      beforeAll(async () => {
        await makeGraphqlAPIRequest(
          createOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id name location createdAt',
            data: {
              id: testPersonId2024,
              name: 'Group test creator',
              createdAt: '2024-04-11T12:00:00.000Z', // thursday, april, Q2, 2024
            },
          }),
        );
      });

      afterAll(async () => {
        await makeGraphqlAPIRequest(
          destroyOneOperationFactory({
            objectMetadataSingularName: 'creator',
            gqlFields: 'id',
            recordId: testPersonId2024,
          }),
        );
      });
      it('datetime field - groups by createdAt DAY_OF_THE_WEEK', async () => {
        const response = await makeGraphqlAPIRequest(
          groupByOperationFactory({
            objectMetadataSingularName: 'creator',
            objectMetadataPluralName: 'creators',
            groupBy: [{ createdAt: { granularity: 'DAY_OF_THE_WEEK' } }],
            // adding a filter for test not to fail when we are in january again
            filter: filter2024And2025,
          }),
        );

        const groups = response.body.data.creatorsGroupBy;

        expect(groups).toBeDefined();
        expect(Array.isArray(groups)).toBe(true);

        const thursdayGroup = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('Thursday'),
        );
        const mondayGroup = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('Monday'),
        );
        const wednesdayGroup = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('Wednesday'),
        );

        expect(thursdayGroup).toBeDefined();
        expect(mondayGroup).toBeDefined();
        expect(wednesdayGroup).toBeDefined();

        expect(thursdayGroup.totalCount).toBe(2);
        expect(mondayGroup.totalCount).toBe(1);
        expect(wednesdayGroup.totalCount).toBe(1);
      });

      it('datetime field - groups by createdAt MONTH_OF_THE_YEAR', async () => {
        const response = await makeGraphqlAPIRequest(
          groupByOperationFactory({
            objectMetadataSingularName: 'creator',
            objectMetadataPluralName: 'creators',
            groupBy: [{ createdAt: { granularity: 'MONTH_OF_THE_YEAR' } }],
            filter: filter2024And2025,
          }),
        );

        const groups = response.body.data.creatorsGroupBy;

        expect(groups).toBeDefined();
        expect(Array.isArray(groups)).toBe(true);

        const janGroup = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('January'),
        );
        const marGroup = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('March'),
        );
        const aprGroup = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('April'),
        );

        expect(janGroup).toBeDefined();
        expect(marGroup).toBeDefined();
        expect(aprGroup).toBeDefined();

        expect(janGroup.totalCount).toBe(2);
        expect(marGroup.totalCount).toBe(1);
        expect(aprGroup.totalCount).toBe(1);
      });

      it('datetime field - groups by createdAt QUARTER_OF_THE_YEAR', async () => {
        const response = await makeGraphqlAPIRequest(
          groupByOperationFactory({
            objectMetadataSingularName: 'creator',
            objectMetadataPluralName: 'creators',
            groupBy: [{ createdAt: { granularity: 'QUARTER_OF_THE_YEAR' } }],
            filter: filter2024And2025,
          }),
        );

        const groups = response.body.data.creatorsGroupBy;

        expect(groups).toBeDefined();
        expect(Array.isArray(groups)).toBe(true);

        const q1Group = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('Q1'),
        );
        const q2Group = groups.find((g: any) =>
          g.groupByDimensionValues?.[0]?.startsWith?.('Q2'),
        );

        expect(q1Group).toBeDefined();
        expect(q2Group).toBeDefined();

        expect(q1Group.totalCount).toBe(3);
        expect(q2Group.totalCount).toBe(1);
      });
    });
  });
});

describe('native relation group-by permission (integration)', () => {
  const client = request(`http://localhost:${APP_PORT}`);
  let roleId: string;
  let originalRoleId: string;

  beforeAll(async () => {
    const roles = await makeMetadataAPIRequest({
      query: gql`
        query {
          getRoles {
            id
            label
          }
        }
      `,
    });
    originalRoleId = roles.body.data.getRoles.find(
      ({ label }: { label: string }) => label === 'Member',
    ).id;

    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular',
      expectToFail: false,
    });
    const creator = objects.find((object) => object.nameSingular === 'creator');
    const profile = objects.find(
      (object) => object.nameSingular === 'socialProfile',
    );
    expect(creator).toBeDefined();
    expect(profile).toBeDefined();

    const role = await makeMetadataAPIRequest({
      query: gql`
        mutation {
          createOneRole(
            createRoleInput: {
              label: "ProfileGroupByOnlyRole"
              description: "Can read profile records but not related creators"
              canUpdateAllSettings: false
              canReadAllObjectRecords: false
              canUpdateAllObjectRecords: false
              canSoftDeleteAllObjectRecords: false
              canDestroyAllObjectRecords: false
            }
          ) {
            id
          }
        }
      `,
    });
    roleId = role.body.data.createOneRole.id;

    await makeMetadataAPIRequest({
      query: gql`
        mutation UpsertObjectPermissions(
          $roleId: UUID!
          $objectPermissions: [ObjectPermissionInput!]!
        ) {
          upsertObjectPermissions(
            upsertObjectPermissionsInput: {
              roleId: $roleId
              objectPermissions: $objectPermissions
            }
          ) {
            objectMetadataId
            canReadObjectRecords
          }
        }
      `,
      variables: {
        roleId,
        objectPermissions: [
          {
            objectMetadataId: profile!.id,
            canReadObjectRecords: true,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
          },
          {
            objectMetadataId: creator!.id,
            canReadObjectRecords: false,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
          },
        ],
      },
    });

    await updateWorkspaceMemberRole({
      client,
      roleId,
      workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    });
  });

  afterAll(async () => {
    if (originalRoleId) {
      await updateWorkspaceMemberRole({
        client,
        roleId: originalRoleId,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
      });
    }
    if (roleId) await deleteRole(client, roleId);
  });

  it('forbids grouping readable profiles by unreadable Creator relationship', async () => {
    const allowed = await makeGraphqlAPIRequestWithMemberRole(
      groupByOperationFactory({
        objectMetadataSingularName: 'socialProfile',
        objectMetadataPluralName: 'socialProfiles',
        groupBy: [{ platform: true }],
      }),
    );
    expect(allowed.body.errors).toBeUndefined();
    expect(allowed.body.data.socialProfilesGroupBy).toEqual(expect.any(Array));

    const response = await makeGraphqlAPIRequestWithMemberRole(
      groupByOperationFactory({
        objectMetadataSingularName: 'socialProfile',
        objectMetadataPluralName: 'socialProfiles',
        groupBy: [{ creator: { name: true } }],
      }),
    );
    expect(response.body.errors?.[0]).toMatchObject({
      message: PermissionsExceptionMessage.PERMISSION_DENIED,
      extensions: { code: ErrorCode.FORBIDDEN },
    });
  });
});
