import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { destroyOneViewGroup } from 'test/integration/metadata/suites/view-group/utils/destroy-one-view-group.util';
import { makeRestAPIRequest } from 'test/integration/rest/utils/make-rest-api-request.util';
import {
  assertRestApiErrorNotFoundResponse,
  assertRestApiSuccessfulResponse,
} from 'test/integration/rest/utils/rest-test-assertions.util';
import {
  createTestViewGroupWithRestApi,
  createTestViewWithRestApi,
} from 'test/integration/rest/utils/view-rest-api.util';
import { assertViewGroupStructure } from 'test/integration/utils/view-test.util';
import { extractRecordIdsAndDatesAsExpectAny } from 'test/utils/extract-record-ids-and-dates-as-expect-any';

describe('View Group REST API', () => {
  let testObjectMetadataId: string;
  let testFieldMetadataId: string;
  let testViewId: string;
  let testViewGroupId: string | undefined;

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular fieldsList { id name type }',
      expectToFail: false,
    });
    const socialProfile = objects.find(
      (object) => object.nameSingular === 'socialProfile',
    );
    const platform = socialProfile?.fieldsList?.find(
      (field) => field.name === 'platform',
    );

    expect(socialProfile).toBeDefined();
    expect(platform?.type).toBe('SELECT');
    testObjectMetadataId = socialProfile!.id;
    testFieldMetadataId = platform!.id;

    const testView = await createTestViewWithRestApi({
      name: 'Test View for Group Integration',
      objectMetadataId: testObjectMetadataId,
      mainGroupByFieldMetadataId: testFieldMetadataId,
    });

    testViewId = testView.id;
  });

  afterAll(async () => {
    await destroyOneView({ viewId: testViewId, expectToFail: false });
  });

  afterEach(async () => {
    if (!testViewGroupId) return;

    await destroyOneViewGroup({
      input: {
        id: testViewGroupId,
      },
      expectToFail: false,
    });
    testViewGroupId = undefined;
  });

  describe('GET /metadata/viewGroups', () => {
    it('should return all view groups for workspace when no viewId provided', async () => {
      const response = await makeRestAPIRequest({
        method: 'get',
        path: '/metadata/viewGroups',
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return view groups for a specific view after creating one', async () => {
      const response = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewGroups?viewId=${testViewId}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      expect(Array.isArray(response.body)).toBe(true);

      const returnedViewGroups = response.body;

      expect(returnedViewGroups).toHaveLength(6);
      const expectedFieldValues = [
        'INSTAGRAM',
        'TIKTOK',
        'YOUTUBE',
        'TWITTER',
        'TWITCH',
        'PATREON',
      ];

      // Check structure and visibility for each group
      expectedFieldValues.forEach((expectedFieldValue) => {
        const group = returnedViewGroups.find(
          (group: any) => group.fieldValue === expectedFieldValue,
        );

        expect(group).toBeDefined();
        expect(group.isVisible).toBe(true);
        expect(group.viewId).toBe(testViewId);
      });
    });
  });

  describe('GET /metadata/viewGroups/:id', () => {
    it('should return a specific view group by id', async () => {
      const viewGroupsFromViewReponse = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewGroups?viewId=${testViewId}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      const viewGroup = viewGroupsFromViewReponse.body.find(
        (group: any) => group.fieldValue === 'INSTAGRAM',
      );

      const response = await makeRestAPIRequest({
        method: 'get',
        path: `/metadata/viewGroups/${viewGroup.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      assertViewGroupStructure(response.body, {
        id: viewGroup.id,
        viewId: testViewId,
        fieldValue: 'INSTAGRAM',
        isVisible: true,
      });

      testViewGroupId = viewGroup.id;
    });
  });

  describe('POST /metadata/viewGroups', () => {
    it('should create a new view group', async () => {
      const viewGroupData = {
        viewId: testViewId,
        fieldValue: 'new-group-value',
        isVisible: true,
        position: 5,
      };

      const response = await makeRestAPIRequest({
        method: 'post',
        path: '/metadata/viewGroups',
        body: viewGroupData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response, 201);
      assertViewGroupStructure(response.body, {
        viewId: testViewId,
        fieldValue: 'new-group-value',
        isVisible: true,
        position: 5,
      });

      testViewGroupId = response.body.id;
    });

    it('should create view group with minimal required fields', async () => {
      const viewGroupData = {
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        fieldValue: 'minimal-group',
      };

      const response = await makeRestAPIRequest({
        method: 'post',
        path: '/metadata/viewGroups',
        body: viewGroupData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response, 201);
      assertViewGroupStructure(response.body, {
        viewId: testViewId,
        fieldValue: 'minimal-group',
        isVisible: true,
        position: 0,
      });

      testViewGroupId = response.body.id;
    });

    it('should fail to create view group with missing required fields', async () => {
      const invalidData = {
        viewId: testViewId,
      };

      const response = await makeRestAPIRequest({
        method: 'post',
        path: '/metadata/viewGroups',
        body: invalidData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      expect(response.status).toBe(400);

      const errorResponse = JSON.parse(response.text);

      expect(errorResponse).toMatchSnapshot(
        extractRecordIdsAndDatesAsExpectAny(errorResponse),
      );
    });
  });

  describe('PATCH /metadata/viewGroups/:id', () => {
    it('should update an existing view group', async () => {
      const viewGroup = await createTestViewGroupWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        fieldValue: 'original-value',
        isVisible: true,
        position: 1,
      });

      testViewGroupId = viewGroup.id;

      const updateData = {
        fieldValue: 'updated-value',
        isVisible: false,
        position: 2,
      };

      const response = await makeRestAPIRequest({
        method: 'patch',
        path: `/metadata/viewGroups/${viewGroup.id}`,
        body: updateData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      assertViewGroupStructure(response.body, {
        id: viewGroup.id,
        viewId: testViewId,
        fieldValue: 'updated-value',
        isVisible: false,
        position: 2,
      });
    });

    it('should update only specific fields', async () => {
      const viewGroup = await createTestViewGroupWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        fieldValue: 'original-value',
        isVisible: true,
        position: 1,
      });

      testViewGroupId = viewGroup.id;

      const updateData = {
        fieldValue: 'partially-updated',
      };

      const response = await makeRestAPIRequest({
        method: 'patch',
        path: `/metadata/viewGroups/${viewGroup.id}`,
        body: updateData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(response);
      assertViewGroupStructure(response.body, {
        id: viewGroup.id,
        fieldValue: 'partially-updated',
        isVisible: true,
        position: 1,
      });
    });

    it('should return 404 for non-existent view group', async () => {
      const updateData = {
        fieldValue: 'test-update',
      };

      const response = await makeRestAPIRequest({
        method: 'patch',
        path: `/metadata/viewGroups/20202020-9c8b-4a7e-9f2d-1a2b3c4d5e6f`,
        body: updateData,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiErrorNotFoundResponse(response);
    });
  });

  describe('DELETE /metadata/viewGroups/:id', () => {
    it('should delete an existing view group', async () => {
      const viewGroup = await createTestViewGroupWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        fieldValue: 'to-be-deleted',
      });

      testViewGroupId = viewGroup.id;

      const deleteResponse = await makeRestAPIRequest({
        method: 'delete',
        path: `/metadata/viewGroups/${viewGroup.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(deleteResponse);
      expect(deleteResponse.body).toEqual({ success: true });
    });

    it('should return 404 for non-existent view group', async () => {
      const response = await makeRestAPIRequest({
        method: 'delete',
        path: `/metadata/viewGroups/20202020-9c8b-4a7e-9f2d-1a2b3c4d5e6f`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiErrorNotFoundResponse(response);
    });

    it('should return success even when group is already deleted', async () => {
      const viewGroup = await createTestViewGroupWithRestApi({
        viewId: testViewId,
        fieldMetadataId: testFieldMetadataId,
        fieldValue: 'double-delete-test',
      });

      testViewGroupId = viewGroup.id;

      const deleteResponse = await makeRestAPIRequest({
        method: 'delete',
        path: `/metadata/viewGroups/${viewGroup.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(deleteResponse);

      const deleteResponse2 = await makeRestAPIRequest({
        method: 'delete',
        path: `/metadata/viewGroups/${viewGroup.id}`,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });

      assertRestApiSuccessfulResponse(deleteResponse2);
    });
  });
});
