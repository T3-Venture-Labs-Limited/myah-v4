import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { makeRestAPIRequest } from 'test/integration/rest/utils/make-rest-api-request.util';
import {
  assertRestApiErrorNotFoundResponse,
  assertRestApiErrorResponse,
  assertRestApiSuccessfulResponse,
} from 'test/integration/rest/utils/rest-test-assertions.util';
import {
  createTestViewFieldWithRestApi,
  createTestViewWithRestApi,
} from 'test/integration/rest/utils/view-rest-api.util';
import { assertViewFieldStructure } from 'test/integration/utils/view-test.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import { destroyOneViewField } from 'test/integration/metadata/suites/view-field/utils/destroy-one-view-field.util';

import { type ViewFieldDTO } from 'src/engine/metadata-modules/view-field/dtos/view-field.dto';
import {
  generateViewFieldExceptionMessage,
  ViewFieldExceptionMessageKey,
} from 'src/engine/metadata-modules/view-field/exceptions/view-field.exception';

describe('View Field REST API', () => {
  let testObjectMetadataId: string;
  let testFieldMetadataId: string;
  let testViewId: string;
  let testViewFieldId: string | undefined;

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

    const testView = await createTestViewWithRestApi({
      name: 'Test View for Field Integration',
      objectMetadataId: testObjectMetadataId,
    });

    testViewId = testView.id;
  });

  afterAll(async () => {
    await destroyOneView({ viewId: testViewId, expectToFail: false });
  });

  afterEach(async () => {
    if (!testViewFieldId) return;

    await destroyOneViewField({
      expectToFail: false,
      input: {
        id: testViewFieldId,
      },
    });
    testViewFieldId = undefined;
  });

  describe('GET /metadata/viewFields', () => {
    it('should return empty array when no view fields exist', async () => {
      const response = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewFields?viewId=${testViewId}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      expect(response.body).toEqual([]);
    });

    it('should return all view fields for workspace when no viewId provided', async () => {
      const response = await makeRestAPIRequest({
        method: 'get',
        path: '/metadata/viewFields',
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return view fields for a specific view after creating one', async () => {
      const viewField = await createTestViewFieldWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        position: 0,
        isVisible: true,
        size: 150,
      });

      testViewFieldId = viewField.id;

      const response = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewFields?viewId=${testViewId}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      expect(Array.isArray(response.body)).toBe(true);

      const returnedViewField = response.body.find(
        (el: ViewFieldDTO) => el.id === viewField.id,
      );

      jestExpectToBeDefined(returnedViewField);

      assertViewFieldStructure(returnedViewField, {
        id: viewField.id,
        fieldMetadataId: testFieldMetadataId,
        viewId: testViewId,
        position: 0,
        isVisible: true,
        size: 150,
      });
    });
  });

  describe('POST /metadata/viewFields', () => {
    it('should create a new view field', async () => {
      const viewField = await createTestViewFieldWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        position: 1,
        isVisible: true,
        size: 200,
      });

      testViewFieldId = viewField.id;

      assertViewFieldStructure(viewField, {
        fieldMetadataId: testFieldMetadataId,
        viewId: testViewId,
        position: 1,
        isVisible: true,
        size: 200,
      });
    });

    it('should create a hidden view field', async () => {
      const hiddenField = await createTestViewFieldWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        position: 2,
        isVisible: false,
        size: 100,
      });

      testViewFieldId = hiddenField.id;

      assertViewFieldStructure(hiddenField, {
        fieldMetadataId: testFieldMetadataId,
        viewId: testViewId,
        position: 2,
        isVisible: false,
        size: 100,
      });
    });
  });

  describe('GET /metadata/viewFields/:id', () => {
    it('should return a view field by id', async () => {
      const viewField = await createTestViewFieldWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        position: 0,
        isVisible: true,
        size: 150,
      });

      testViewFieldId = viewField.id;

      const response = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewFields/${viewField.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      assertViewFieldStructure(response.body, {
        id: viewField.id,
        fieldMetadataId: testFieldMetadataId,
        viewId: testViewId,
      });
    });

    it('should return empty object for non-existent view field', async () => {
      const response = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewFields/20202020-f891-4d2a-8b23-c1e4d7f6a9b2`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiErrorNotFoundResponse(response);
    });
  });

  describe('PATCH /metadata/viewFields/:id', () => {
    it('should update an existing view field', async () => {
      const viewField = await createTestViewFieldWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        position: 0,
        isVisible: true,
        size: 150,
      });

      testViewFieldId = viewField.id;

      const updateData = {
        position: 5,
        isVisible: false,
        size: 300,
      };

      const response = await makeRestAPIRequest({
        method: 'patch',
        path: `/metadata/viewFields/${viewField.id}`,
        body: updateData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      assertViewFieldStructure(response.body, {
        id: viewField.id,
        position: 5,
        isVisible: false,
        size: 300,
        fieldMetadataId: testFieldMetadataId,
        viewId: testViewId,
      });
    });

    it('should return 404 error when updating non-existent view field', async () => {
      const updateData = {
        position: 5,
        isVisible: false,
        size: 300,
      };

      const response = await makeRestAPIRequest({
        method: 'patch',
        path: `/metadata/viewFields/20202020-f891-4d2a-8b23-c1e4d7f6a9b2`,
        body: updateData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiErrorResponse(
        response,
        404,
        generateViewFieldExceptionMessage(
          ViewFieldExceptionMessageKey.VIEW_FIELD_NOT_FOUND,
          '20202020-f891-4d2a-8b23-c1e4d7f6a9b2',
        ),
      );
    });
  });

  describe('DELETE /metadata/viewFields/:id', () => {
    it('should delete an existing view field', async () => {
      const viewField = await createTestViewFieldWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        position: 0,
        isVisible: true,
        size: 150,
      });

      testViewFieldId = viewField.id;

      const deleteResponse = await makeRestAPIRequest({
        method: 'delete',
        path: `/metadata/viewFields/${viewField.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(deleteResponse);
      expect(deleteResponse.body.success).toBe(true);

      const getResponse = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewFields/${viewField.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiErrorNotFoundResponse(getResponse);
    });

    it('should return 404 error when deleting non-existent view field', async () => {
      const response = await makeRestAPIRequest({
        method: 'delete',
        path: `/metadata/viewFields/20202020-f891-4d2a-8b23-c1e4d7f6a9b2`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiErrorNotFoundResponse(response);
    });
  });
});
