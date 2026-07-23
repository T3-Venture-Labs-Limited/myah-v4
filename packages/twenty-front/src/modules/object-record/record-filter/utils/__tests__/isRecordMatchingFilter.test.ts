import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import { mockedCompanyRecords } from '~/testing/mock-data/generated/data/companies/mock-companies-data';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

import { type Company } from '@/companies/types/Company';
import { getCompanyDomainName } from '@/object-metadata/utils/getCompanyDomainName';
import { getRecordFromRecordNode } from '@/object-record/cache/utils/getRecordFromRecordNode';
import { isRecordMatchingFilter } from '@/object-record/record-filter/utils/isRecordMatchingFilter';

const companiesMock = mockedCompanyRecords.map((record) =>
  getRecordFromRecordNode<Company>({ recordNode: record }),
);

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const companyMockObjectMetadataItem = objectMetadataItems.find(
  (item) => item.nameSingular === 'company',
)!;

describe('isRecordMatchingFilter', () => {
  describe('Empty Filters', () => {
    it('matches any record when no filter is provided', () => {
      const emptyFilter = {};

      companiesMock.forEach((company) => {
        expect(
          isRecordMatchingFilter({
            record: company,
            filter: emptyFilter,
            objectMetadataItem: companyMockObjectMetadataItem,
          }),
        ).toBe(true);
      });
    });

    it('matches any record when filter fields are empty', () => {
      const filterWithEmptyFields = {
        name: {},
        employees: {},
      };

      companiesMock.forEach((company) => {
        expect(
          isRecordMatchingFilter({
            record: company,
            filter: filterWithEmptyFields,
            objectMetadataItem: companyMockObjectMetadataItem,
          }),
        ).toBe(true);
      });
    });

    it('matches any record with an empty and filter', () => {
      const filter = { and: [] };

      companiesMock.forEach((company) => {
        expect(
          isRecordMatchingFilter({
            record: company,
            filter,
            objectMetadataItem: companyMockObjectMetadataItem,
          }),
        ).toBe(true);
      });
    });

    it('matches any record with an empty or filter', () => {
      const filter = { or: [] };

      companiesMock.forEach((company) => {
        expect(
          isRecordMatchingFilter({
            record: company,
            filter,
            objectMetadataItem: companyMockObjectMetadataItem,
          }),
        ).toBe(true);
      });
    });

    it('matches any record with an empty not filter', () => {
      const filter = { not: {} };

      companiesMock.forEach((company) => {
        expect(
          isRecordMatchingFilter({
            record: company,
            filter,
            objectMetadataItem: companyMockObjectMetadataItem,
          }),
        ).toBe(true);
      });
    });
  });

  describe('Simple Filters', () => {
    it('matches a record with a simple equality filter on name', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        name: companyMockInFilter.name + 'Different',
      };

      const filter = { name: { eq: companyMockInFilter.name } };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches a record with a simple equality filter on domainName', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        domainName: {
          primaryLinkUrl:
            getCompanyDomainName(companyMockInFilter as Company) + 'Different',
        },
      };

      const filter = {
        domainName: {
          primaryLinkUrl: {
            eq: getCompanyDomainName(companyMockInFilter as Company),
          },
        },
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);
      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches a record with a greater than filter on employees', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        employees: 100,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        employees: companyMockInFilter.employees - 50,
      };

      const filter = {
        employees: { gt: companyMockInFilter.employees - 1 },
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches a record with a boolean filter on idealCustomerProfile', () => {
      const companyIdealCustomerProfileTrue = {
        ...companiesMock[0],
        idealCustomerProfile: true,
      };

      const companyIdealCustomerProfileFalse = {
        ...companiesMock[0],
        idealCustomerProfile: false,
      };

      const filter = {
        idealCustomerProfile: {
          eq: companyIdealCustomerProfileTrue.idealCustomerProfile,
        },
      };

      expect(
        isRecordMatchingFilter({
          record: companyIdealCustomerProfileTrue,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(companyIdealCustomerProfileTrue.idealCustomerProfile);
      expect(
        isRecordMatchingFilter({
          record: companyIdealCustomerProfileFalse,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(companyIdealCustomerProfileFalse.idealCustomerProfile);
    });
  });

  describe('Complex And/Or/Not Nesting', () => {
    it('matches record with a combination of and + or filters', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: true,
        employees: 100,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: false,
        employees: 0,
      };

      const filter: RecordGqlOperationFilter = {
        and: [
          {
            domainName: {
              primaryLinkUrl: {
                eq: getCompanyDomainName(companyMockInFilter as Company),
              },
            },
          },
          {
            or: [
              {
                employees: {
                  gt: companyMockInFilter.employees - 1,
                },
              },
              {
                idealCustomerProfile: {
                  eq: companyMockInFilter.idealCustomerProfile,
                },
              },
            ],
          },
        ],
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches record with nested not filter', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: true,
        employees: 100,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: false,
        name: companyMockInFilter.name + 'Different',
      };

      const filter: RecordGqlOperationFilter = {
        not: {
          and: [
            { name: { eq: companyMockInFilter.name } },
            {
              idealCustomerProfile: {
                eq: companyMockInFilter.idealCustomerProfile,
              },
            },
          ],
        },
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);
    });

    it('matches record with deep nesting of and, or, and not filters', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: true,
        employees: 100,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        domainName: {
          primaryLinkUrl:
            getCompanyDomainName(companyMockInFilter as Company) + 'Different',
        },
        employees: 5,
        name: companyMockInFilter.name + 'Different',
      };

      const filter: RecordGqlOperationFilter = {
        and: [
          {
            domainName: {
              primaryLinkUrl: {
                eq: getCompanyDomainName(companyMockInFilter as Company),
              },
            },
          },
          {
            or: [
              { employees: { eq: companyMockInFilter.employees } },
              { not: { name: { eq: companyMockInFilter.name } } },
            ],
          },
        ],
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches record with and filter at root level', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: true,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: false,
        name: companyMockInFilter.name + 'Different',
      };

      const filter: RecordGqlOperationFilter = {
        and: [
          { name: { eq: companyMockInFilter.name } },
          {
            idealCustomerProfile: {
              eq: companyMockInFilter.idealCustomerProfile,
            },
          },
        ],
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches record with or filter at root level including a not condition', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: true,
        employees: 100,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: false,
        name: companyMockInFilter.name + 'Different',
        employees: companyMockInFilter.employees - 1,
      };

      const filter: RecordGqlOperationFilter = {
        or: [
          { name: { eq: companyMockInFilter.name } },
          { not: { employees: { eq: companyMockInFilter.employees - 1 } } },
        ],
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });
  });

  describe('Implicit And Conditions', () => {
    it('matches record with implicit and of multiple operators within the same field', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: true,
        employees: 100,
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        idealCustomerProfile: false,
        name: companyMockInFilter.name + 'Different',
        employees: companyMockInFilter.employees + 100,
      };

      const filter = {
        employees: {
          gt: companyMockInFilter.employees - 10,
          lt: companyMockInFilter.employees + 10,
        },
        name: { eq: companyMockInFilter.name },
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true); // Matches as Airbnb's employee count is between 10 and 100000

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false); // Does not match as Aircall's employee count is not within the range
    });

    it('matches record with implicit and within an object passed to or', () => {
      const companyMockInFilter = {
        ...companiesMock[0],
      };

      const companyMockNotInFilter = {
        ...companiesMock[0],
        name: companyMockInFilter.name + 'Different',
        domainName: { primaryLinkUrl: companyMockInFilter.name + 'Different' },
      };

      const filter = {
        or: {
          name: { eq: companyMockInFilter.name },
          domainName: {
            primaryLinkUrl: {
              eq: getCompanyDomainName(companyMockInFilter as Company),
            },
          },
        },
      };

      expect(
        isRecordMatchingFilter({
          record: companyMockInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyMockNotInFilter,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });
  });

  describe('Relation Filters', () => {
    const accountOwnerId = '20202020-0687-4c41-b707-ed1bfca972a7';

    const companyWithAccountOwner = {
      ...companiesMock[0],
      accountOwner: { id: accountOwnerId },
      accountOwnerId,
    };

    const companyWithoutAccountOwner = {
      ...companyWithAccountOwner,
      accountOwner: null,
      accountOwnerId: null,
    };

    it('matches "is not empty" on a relation field by its related record id', () => {
      const filter: RecordGqlOperationFilter = {
        accountOwner: { is: 'NOT_NULL' },
      };

      expect(
        isRecordMatchingFilter({
          record: companyWithAccountOwner,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyWithoutAccountOwner,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches "is empty" on a relation field by its related record id', () => {
      const filter: RecordGqlOperationFilter = {
        accountOwner: { is: 'NULL' },
      };

      expect(
        isRecordMatchingFilter({
          record: companyWithoutAccountOwner,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyWithAccountOwner,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('does not match an unloaded to-one relation as empty', () => {
      const companyWithUnloadedAccountOwner = {
        ...companiesMock[0],
        accountOwner: undefined,
        accountOwnerId: undefined,
      };

      expect(
        isRecordMatchingFilter({
          record: companyWithUnloadedAccountOwner,
          filter: { accountOwner: { is: 'NULL' } },
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('matches an "in" filter on a relation field by its related record id', () => {
      expect(
        isRecordMatchingFilter({
          record: companyWithAccountOwner,
          filter: { accountOwner: { in: [accountOwnerId] } },
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);

      expect(
        isRecordMatchingFilter({
          record: companyWithAccountOwner,
          filter: { accountOwner: { in: ['unknown-id'] } },
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('does not match an unloaded one-to-many relation filter', () => {
      const companyWithoutPeople = {
        ...companiesMock[0],
        people: undefined,
      };

      const peopleFilter = {
        people: {
          companyId: { in: [companyWithoutPeople.id] },
        },
      } as unknown as RecordGqlOperationFilter;

      expect(
        isRecordMatchingFilter({
          record: companyWithoutPeople,
          filter: peopleFilter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(false);
    });

    it('preserves an unloaded one-to-many relation when requested by an optimistic update', () => {
      const companyWithoutPeople = {
        ...companiesMock[0],
        people: undefined,
      };
      const peopleFilter = {
        people: {
          companyId: { in: [companyWithoutPeople.id] },
        },
      } as unknown as RecordGqlOperationFilter;

      expect(
        isRecordMatchingFilter({
          record: companyWithoutPeople,
          filter: peopleFilter,
          objectMetadataItem: companyMockObjectMetadataItem,
          shouldMatchUnloadedOneToManyRelations: true,
        }),
      ).toBe(true);
    });

    it('preserves an unloaded one-to-many relation through a negated filter when requested by an optimistic update', () => {
      const companyWithoutPeople = {
        ...companiesMock[0],
        people: undefined,
      };
      const peopleFilter = {
        not: {
          people: {
            companyId: { in: [companyWithoutPeople.id] },
          },
        },
      } as unknown as RecordGqlOperationFilter;

      expect(
        isRecordMatchingFilter({
          record: companyWithoutPeople,
          filter: peopleFilter,
          objectMetadataItem: companyMockObjectMetadataItem,
          shouldMatchUnloadedOneToManyRelations: true,
        }),
      ).toBe(true);
    });

    it('keeps default unloaded-relation semantics through a negated filter', () => {
      const companyWithoutPeople = {
        ...companiesMock[0],
        people: undefined,
      };
      const peopleFilter = {
        not: {
          people: {
            companyId: { in: [companyWithoutPeople.id] },
          },
        },
      } as unknown as RecordGqlOperationFilter;

      expect(
        isRecordMatchingFilter({
          record: companyWithoutPeople,
          filter: peopleFilter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);
    });

    it('matches a loaded one-to-many relation filter', () => {
      const companyWithPeople = {
        ...companiesMock[0],
        people: [{ id: 'person-1', name: 'Taylor' }],
      };
      const peopleFilter = {
        people: {
          name: { eq: 'Taylor' },
        },
      } as unknown as RecordGqlOperationFilter;

      expect(
        isRecordMatchingFilter({
          record: companyWithPeople,
          filter: peopleFilter,
          objectMetadataItem: companyMockObjectMetadataItem,
          objectMetadataItems,
        } as Parameters<typeof isRecordMatchingFilter>[0]),
      ).toBe(true);
    });

    it('matches a loaded one-to-many relation connection filter', () => {
      const companyWithPeople = {
        ...companiesMock[0],
        people: {
          edges: [{ node: { id: 'person-1', name: 'Taylor' } }],
        },
      };
      const peopleFilter = {
        people: {
          name: { eq: 'Taylor' },
        },
      } as unknown as RecordGqlOperationFilter;

      expect(
        isRecordMatchingFilter({
          record: companyWithPeople,
          filter: peopleFilter,
          objectMetadataItem: companyMockObjectMetadataItem,
          objectMetadataItems,
        } as Parameters<typeof isRecordMatchingFilter>[0]),
      ).toBe(true);
    });

    it('still matches the relation join column field', () => {
      const filter: RecordGqlOperationFilter = {
        accountOwnerId: { is: 'NOT_NULL' },
      };

      expect(
        isRecordMatchingFilter({
          record: companyWithAccountOwner,
          filter,
          objectMetadataItem: companyMockObjectMetadataItem,
        }),
      ).toBe(true);
    });
  });
});
