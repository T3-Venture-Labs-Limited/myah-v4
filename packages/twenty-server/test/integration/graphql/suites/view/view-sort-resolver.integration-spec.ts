import { createViewSortOperationFactory } from 'test/integration/graphql/utils/create-view-sort-operation-factory.util';
import { deleteViewSortOperationFactory } from 'test/integration/graphql/utils/delete-view-sort-operation-factory.util';
import { destroyViewSortOperationFactory } from 'test/integration/graphql/utils/destroy-view-sort-operation-factory.util';
import { findViewSortsOperationFactory } from 'test/integration/graphql/utils/find-view-sorts-operation-factory.util';
import {
  assertGraphQLErrorResponse,
  assertGraphQLSuccessfulResponse,
} from 'test/integration/graphql/utils/graphql-test-assertions.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { updateViewSortOperationFactory } from 'test/integration/graphql/utils/update-view-sort-operation-factory.util';
import {
  createViewSortData,
  updateViewSortData,
} from 'test/integration/graphql/utils/view-data-factory.util';
import { createTestViewWithGraphQL } from 'test/integration/graphql/utils/view-graphql.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { assertViewSortStructure } from 'test/integration/utils/view-test.util';
import { ViewSortDirection } from 'twenty-shared/types';

import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  generateViewSortExceptionMessage,
  ViewSortExceptionMessageKey,
} from 'src/engine/metadata-modules/view-sort/exceptions/view-sort.exception';

const TEST_NOT_EXISTING_VIEW_SORT_ID = '20202020-0000-4000-8000-000000000004';

describe('View Sort Resolver', () => {
  let testViewId: string;
  let testObjectMetadataId: string;
  let testFieldMetadataId: string;

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular fieldsList { id name type }',
      expectToFail: false,
    });
    const creator = objects.find((object) => object.nameSingular === 'creator');
    const location = creator?.fieldsList?.find(
      (field) => field.name === 'location',
    );

    expect(creator).toBeDefined();
    expect(location?.type).toBe('TEXT');
    testObjectMetadataId = creator!.id;
    testFieldMetadataId = location!.id;
  });

  beforeEach(async () => {
    const view = await createTestViewWithGraphQL({
      name: 'Test View for Sorts',
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

  describe('getViewSorts', () => {
    it('should return empty array when no view sorts exist', async () => {
      const operation = findViewSortsOperationFactory({ viewId: testViewId });
      const response = await makeMetadataAPIRequest(operation);

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.getViewSorts).toEqual([]);
    });

    it('should return view sorts for a specific view', async () => {
      const sortData = createViewSortData(testViewId, {
        direction: ViewSortDirection.ASC,
        fieldMetadataId: testFieldMetadataId,
      });
      const createOperation = createViewSortOperationFactory({
        data: sortData,
      });

      await makeMetadataAPIRequest(createOperation);

      const getOperation = findViewSortsOperationFactory({
        viewId: testViewId,
      });
      const response = await makeMetadataAPIRequest(getOperation);

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.getViewSorts).toHaveLength(1);
      assertViewSortStructure(response.body.data.getViewSorts[0], {
        fieldMetadataId: testFieldMetadataId,
        direction: ViewSortDirection.ASC,
        viewId: testViewId,
      });
    });
  });

  describe('createViewSort', () => {
    it('should create a new view sort with ASC direction', async () => {
      const sortData = createViewSortData(testViewId, {
        direction: ViewSortDirection.ASC,
        fieldMetadataId: testFieldMetadataId,
      });

      const operation = createViewSortOperationFactory({ data: sortData });
      const response = await makeMetadataAPIRequest(operation);

      assertGraphQLSuccessfulResponse(response);
      assertViewSortStructure(response.body.data.createViewSort, {
        fieldMetadataId: testFieldMetadataId,
        direction: ViewSortDirection.ASC,
        viewId: testViewId,
      });
    });

    it('should create a view sort with DESC direction', async () => {
      const sortData = createViewSortData(testViewId, {
        direction: ViewSortDirection.DESC,
        fieldMetadataId: testFieldMetadataId,
      });

      const operation = createViewSortOperationFactory({ data: sortData });
      const response = await makeMetadataAPIRequest(operation);

      assertGraphQLSuccessfulResponse(response);
      assertViewSortStructure(response.body.data.createViewSort, {
        fieldMetadataId: testFieldMetadataId,
        direction: ViewSortDirection.DESC,
        viewId: testViewId,
      });
    });
  });

  describe('updateViewSort', () => {
    it('should update an existing view sort', async () => {
      const sortData = createViewSortData(testViewId, {
        direction: ViewSortDirection.ASC,
        fieldMetadataId: testFieldMetadataId,
      });
      const createOperation = createViewSortOperationFactory({
        data: sortData,
      });
      const createResponse = await makeMetadataAPIRequest(createOperation);
      const viewSort = createResponse.body.data.createViewSort;

      const updateInput = updateViewSortData({
        direction: ViewSortDirection.DESC,
      });
      const updateOperation = updateViewSortOperationFactory({
        viewSortId: viewSort.id,
        data: updateInput,
      });
      const response = await makeMetadataAPIRequest(updateOperation);

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.updateViewSort).toMatchObject({
        id: viewSort.id,
        direction: 'DESC',
      });
    });

    it('should throw an error when updating non-existent view sort', async () => {
      const operation = updateViewSortOperationFactory({
        viewSortId: TEST_NOT_EXISTING_VIEW_SORT_ID,
      });
      const response = await makeMetadataAPIRequest(operation);

      assertGraphQLErrorResponse(
        response,
        ErrorCode.NOT_FOUND,
        generateViewSortExceptionMessage(
          ViewSortExceptionMessageKey.VIEW_SORT_NOT_FOUND,
        ),
      );
    });
  });

  describe('deleteViewSort', () => {
    it('should delete an existing view sort', async () => {
      const sortData = createViewSortData(testViewId, {
        fieldMetadataId: testFieldMetadataId,
      });
      const createOperation = createViewSortOperationFactory({
        data: sortData,
      });
      const createResponse = await makeMetadataAPIRequest(createOperation);
      const viewSort = createResponse.body.data.createViewSort;

      const deleteOperation = deleteViewSortOperationFactory({
        viewSortId: viewSort.id,
      });
      const response = await makeMetadataAPIRequest(deleteOperation);

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.deleteViewSort).toBe(true);
    });

    it('should throw an error when deleting non-existent view sort', async () => {
      const operation = deleteViewSortOperationFactory({
        viewSortId: TEST_NOT_EXISTING_VIEW_SORT_ID,
      });
      const response = await makeMetadataAPIRequest(operation);

      assertGraphQLErrorResponse(
        response,
        ErrorCode.NOT_FOUND,
        generateViewSortExceptionMessage(
          ViewSortExceptionMessageKey.VIEW_SORT_NOT_FOUND,
        ),
      );
    });
  });

  describe('destroyViewSort', () => {
    it('should destroy an existing view sort', async () => {
      const sortData = createViewSortData(testViewId, {
        fieldMetadataId: testFieldMetadataId,
      });
      const createOperation = createViewSortOperationFactory({
        data: sortData,
      });
      const createResponse = await makeMetadataAPIRequest(createOperation);
      const viewSort = createResponse.body.data.createViewSort;

      const destroyOperation = destroyViewSortOperationFactory({
        viewSortId: viewSort.id,
      });
      const response = await makeMetadataAPIRequest(destroyOperation);

      assertGraphQLSuccessfulResponse(response);
      expect(response.body.data.destroyViewSort).toBe(true);
    });

    it('should throw an error when destroying non-existent view sort', async () => {
      const operation = destroyViewSortOperationFactory({
        viewSortId: TEST_NOT_EXISTING_VIEW_SORT_ID,
      });
      const response = await makeMetadataAPIRequest(operation);

      assertGraphQLErrorResponse(
        response,
        ErrorCode.NOT_FOUND,
        generateViewSortExceptionMessage(
          ViewSortExceptionMessageKey.VIEW_SORT_NOT_FOUND,
        ),
      );
    });
  });
});
