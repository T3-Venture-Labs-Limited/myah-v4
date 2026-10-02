import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { createTestViewWithGraphQL } from 'test/integration/graphql/utils/view-graphql.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { createOneViewGroup } from 'test/integration/metadata/suites/view-group/utils/create-one-view-group.util';
import { deleteOneViewGroup } from 'test/integration/metadata/suites/view-group/utils/delete-one-view-group.util';
import { destroyOneViewGroup } from 'test/integration/metadata/suites/view-group/utils/destroy-one-view-group.util';
import { updateOneViewGroup } from 'test/integration/metadata/suites/view-group/utils/update-one-view-group.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { assertViewGroupStructure } from 'test/integration/utils/view-test.util';

const TEST_NOT_EXISTING_VIEW_GROUP_ID = '20202020-0000-4000-8000-000000000003';

describe('View Group Resolver', () => {
  let testViewId: string;
  let testObjectMetadataId: string;
  let testFieldMetadataId: string;

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular fieldsList { id name }',
      expectToFail: false,
    });
    const socialProfile = objects.find(
      (object) => object.nameSingular === 'socialProfile',
    );
    const platform = socialProfile?.fieldsList?.find(
      (field) => field.name === 'platform',
    );

    expect(socialProfile).toBeDefined();
    expect(platform).toBeDefined();
    testObjectMetadataId = socialProfile!.id;
    testFieldMetadataId = platform!.id;
  });

  beforeEach(async () => {
    const view = await createTestViewWithGraphQL({
      name: 'Test View for Groups',
      objectMetadataId: testObjectMetadataId,
      mainGroupByFieldMetadataId: testFieldMetadataId,
    });

    testViewId = view.id;
  });

  afterEach(async () => {
    await destroyOneView({
      viewId: testViewId,
      expectToFail: false,
    });
  });

  describe('createViewGroup', () => {
    it('should create a new view group', async () => {
      const { data } = await createOneViewGroup({
        expectToFail: false,
        input: {
          viewId: testViewId,
          isVisible: false,
          fieldValue: 'inactive',
          position: 1,
        },
      });

      assertViewGroupStructure(data.createViewGroup, {
        isVisible: false,
        fieldValue: 'inactive',
        position: 1,
        viewId: testViewId,
      });
    });

    it('should create a view group with null fieldValue', async () => {
      const { data } = await createOneViewGroup({
        expectToFail: false,
        input: {
          viewId: testViewId,
          isVisible: true,
          fieldValue: '',
          position: 2,
        },
      });

      assertViewGroupStructure(data.createViewGroup, {
        isVisible: true,
        fieldValue: '',
        position: 2,
      });
    });
  });

  describe('updateViewGroup', () => {
    it('should update an existing view group', async () => {
      const { data: createData } = await createOneViewGroup({
        expectToFail: false,
        input: {
          viewId: testViewId,
          isVisible: true,
          fieldValue: 'original',
          position: 0,
        },
      });
      const viewGroup = createData.createViewGroup;

      const { data } = await updateOneViewGroup({
        expectToFail: false,
        input: {
          id: viewGroup.id,
          update: {
            isVisible: false,
            fieldValue: 'updated',
            position: 5,
          },
        },
      });

      expect(data.updateViewGroup).toMatchObject({
        id: viewGroup.id,
        isVisible: false,
        fieldValue: 'updated',
        position: 5,
      });
    });

    it('should throw an error when updating non-existent view group', async () => {
      const { errors } = await updateOneViewGroup({
        expectToFail: true,
        input: {
          id: TEST_NOT_EXISTING_VIEW_GROUP_ID,
          update: {
            isVisible: false,
          },
        },
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });

  describe('deleteViewGroup', () => {
    it('should delete an existing view group', async () => {
      const { data: createData } = await createOneViewGroup({
        expectToFail: false,
        input: {
          viewId: testViewId,
          isVisible: true,
          fieldValue: 'to delete',
          position: 0,
        },
      });
      const viewGroup = createData.createViewGroup;

      const { data } = await deleteOneViewGroup({
        expectToFail: false,
        input: {
          id: viewGroup.id,
        },
      });

      expect(data.deleteViewGroup).toMatchObject({
        id: viewGroup.id,
      });
      expect(data.deleteViewGroup.deletedAt).toBeDefined();
    });

    it('should throw an error when deleting non-existent view group', async () => {
      const { errors } = await deleteOneViewGroup({
        expectToFail: true,
        input: {
          id: TEST_NOT_EXISTING_VIEW_GROUP_ID,
        },
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });

  describe('destroyViewGroup', () => {
    it('should destroy an existing view group', async () => {
      const { data: createData } = await createOneViewGroup({
        expectToFail: false,
        input: {
          viewId: testViewId,
          isVisible: true,
          fieldValue: 'to destroy',
          position: 0,
        },
      });
      const viewGroup = createData.createViewGroup;

      await deleteOneViewGroup({
        input: {
          id: viewGroup.id,
        },
        expectToFail: false,
      });

      const { data } = await destroyOneViewGroup({
        expectToFail: false,
        input: {
          id: viewGroup.id,
        },
      });

      expect(data.destroyViewGroup).toMatchObject({
        id: viewGroup.id,
      });
    });

    it('should throw an error when destroying non-existent view group', async () => {
      const { errors } = await destroyOneViewGroup({
        expectToFail: true,
        input: {
          id: TEST_NOT_EXISTING_VIEW_GROUP_ID,
        },
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    });
  });
});
