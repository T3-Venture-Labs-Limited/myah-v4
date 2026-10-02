import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { createTestViewWithGraphQL } from 'test/integration/graphql/utils/view-graphql.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { createOneViewFilter } from 'test/integration/metadata/suites/view-filter/utils/create-one-view-filter.util';
import { deleteOneViewFilter } from 'test/integration/metadata/suites/view-filter/utils/delete-one-view-filter.util';
import { destroyOneViewFilter } from 'test/integration/metadata/suites/view-filter/utils/destroy-one-view-filter.util';
import { findViewFilters } from 'test/integration/metadata/suites/view-filter/utils/find-view-filters.util';
import { updateOneViewFilter } from 'test/integration/metadata/suites/view-filter/utils/update-one-view-filter.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { ViewFilterOperand } from 'twenty-shared/types';

const TEST_NOT_EXISTING_VIEW_FILTER_ID = '20202020-52c5-4152-8c09-76a845fb8ece';

describe('View Filter Resolver', () => {
  let testViewId: string;
  let testObjectMetadataId: string;
  let testFieldMetadataId: string;

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular fieldsList { id name }',
      expectToFail: false,
    });
    const creator = objects.find((object) => object.nameSingular === 'creator');
    const location = creator?.fieldsList?.find(
      (field) => field.name === 'location',
    );

    expect(creator).toBeDefined();
    expect(location).toBeDefined();
    testObjectMetadataId = creator!.id;
    testFieldMetadataId = location!.id;
  });

  beforeEach(async () => {
    const view = await createTestViewWithGraphQL({
      name: 'Test View for Filters',
      objectMetadataId: testObjectMetadataId,
    });

    testViewId = view.id;
  });

  afterEach(async () => {
    await destroyOneView({
      viewId: testViewId,
      expectToFail: false,
    });
  });

  describe('getViewFilters', () => {
    it('should return empty array when no view filters exist', async () => {
      const { data, errors } = await findViewFilters({
        viewId: testViewId,
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.getViewFilters).toEqual([]);
    });

    it('should return view filters for a specific view', async () => {
      await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: 'test',
        },
        expectToFail: false,
      });

      const { data, errors } = await findViewFilters({
        viewId: testViewId,
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.getViewFilters).toHaveLength(1);
      expect(data.getViewFilters[0]).toMatchObject({
        fieldMetadataId: testFieldMetadataId,
        operand: ViewFilterOperand.CONTAINS,
        value: 'test',
        viewId: testViewId,
      });
    });
  });

  describe('createViewFilter', () => {
    it('should create a new view filter with string value', async () => {
      const { data, errors } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: 'test value',
        },
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.createViewFilter).toMatchObject({
        fieldMetadataId: testFieldMetadataId,
        operand: ViewFilterOperand.CONTAINS,
        value: 'test value',
        viewId: testViewId,
      });
    });

    it('should create a view filter with a numeric value payload', async () => {
      const { data, errors } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: 100,
        },
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.createViewFilter).toMatchObject({
        fieldMetadataId: testFieldMetadataId,
        operand: ViewFilterOperand.CONTAINS,
        value: 100,
        viewId: testViewId,
      });
    });

    it('should create a view filter with a boolean value payload', async () => {
      const { data, errors } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: true,
        },
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.createViewFilter).toMatchObject({
        fieldMetadataId: testFieldMetadataId,
        operand: ViewFilterOperand.CONTAINS,
        value: true,
        viewId: testViewId,
      });
    });

    it('should reject a view filter with an operand incompatible with the field type', async () => {
      const { errors } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.IS,
          value: 'test',
        },
        expectToFail: true,
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });

  describe('updateViewFilter', () => {
    it('should update an existing view filter', async () => {
      const { data: createData } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: 'original',
        },
        expectToFail: false,
      });

      const viewFilterId = createData.createViewFilter.id;

      const { data, errors } = await updateOneViewFilter({
        input: {
          id: viewFilterId,
          update: {
            operand: ViewFilterOperand.DOES_NOT_CONTAIN,
            value: 'updated',
          },
        },
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.updateViewFilter).toMatchObject({
        id: viewFilterId,
        operand: ViewFilterOperand.DOES_NOT_CONTAIN,
        value: 'updated',
      });
    });

    it('should throw an error when updating non-existent view filter', async () => {
      const { errors } = await updateOneViewFilter({
        input: {
          id: TEST_NOT_EXISTING_VIEW_FILTER_ID,
          update: {},
        },
        expectToFail: true,
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });

  describe('deleteViewFilter', () => {
    it('should delete an existing view filter', async () => {
      const { data: createData } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: 'to delete',
        },
        expectToFail: false,
      });

      const viewFilterId = createData.createViewFilter.id;

      const { data, errors } = await deleteOneViewFilter({
        input: { id: viewFilterId },
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.deleteViewFilter).toMatchObject({
        id: viewFilterId,
      });
      expect(data.deleteViewFilter.deletedAt).toBeDefined();
    });

    it('should throw an error when deleting non-existent view filter', async () => {
      const { errors } = await deleteOneViewFilter({
        input: { id: TEST_NOT_EXISTING_VIEW_FILTER_ID },
        expectToFail: true,
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });

  describe('destroyViewFilter', () => {
    it('should destroy an existing view filter', async () => {
      const { data: createData } = await createOneViewFilter({
        input: {
          fieldMetadataId: testFieldMetadataId,
          viewId: testViewId,
          operand: ViewFilterOperand.CONTAINS,
          value: 'to destroy',
        },
        expectToFail: false,
      });

      const viewFilterId = createData.createViewFilter.id;

      await deleteOneViewFilter({
        input: {
          id: viewFilterId,
        },
        expectToFail: false,
      });
      const { data, errors } = await destroyOneViewFilter({
        input: { id: viewFilterId },
        expectToFail: false,
      });

      expect(errors).toBeUndefined();
      expect(data.destroyViewFilter).toMatchObject({
        id: viewFilterId,
      });
    });

    it('should throw an error when destroying non-existent view filter', async () => {
      const { errors } = await destroyOneViewFilter({
        input: { id: TEST_NOT_EXISTING_VIEW_FILTER_ID },
        expectToFail: true,
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });
});
