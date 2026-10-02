import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { deleteOneView } from 'test/integration/metadata/suites/view/utils/delete-one-view.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { createOneView } from 'test/integration/metadata/suites/view/utils/create-one-view.util';
import { assertViewStructure } from 'test/integration/utils/view-test.util';
import { ViewOpenRecordIn, ViewType } from 'twenty-shared/types';

describe('Create core view', () => {
  let testObjectMetadataId: string;
  let testSelectFieldMetadataId: string;
  const createdViewIds: string[] = [];

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
    testSelectFieldMetadataId = platform!.id;
  });

  afterAll(async () => {
    for (const viewId of createdViewIds) {
      await deleteOneView({ viewId, expectToFail: false });
      await destroyOneView({ viewId, expectToFail: false });
    }
  });

  it('should create a new view with all properties', async () => {
    const { data, errors } = await createOneView({
      input: {
        name: 'Kanban View',
        objectMetadataId: testObjectMetadataId,
        icon: 'IconDeal',
        type: ViewType.KANBAN,
        mainGroupByFieldMetadataId: testSelectFieldMetadataId,
        position: 1,
        isCompact: true,
        openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
      },
      expectToFail: false,
    });

    expect(errors).toBeUndefined();
    createdViewIds.push(data.createView.id);
    assertViewStructure(data.createView, {
      name: 'Kanban View',
      objectMetadataId: testObjectMetadataId,
      mainGroupByFieldMetadataId: testSelectFieldMetadataId,
      type: ViewType.KANBAN,
      key: null,
      icon: 'IconDeal',
      position: 1,
      isCompact: true,
      openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
    });
  });

  it('should create a view with minimum required fields', async () => {
    const input = {
      name: 'Minimal View',
      objectMetadataId: testObjectMetadataId,
      icon: 'IconList',
    };

    const { data, errors } = await createOneView({
      input,
      expectToFail: false,
    });

    expect(errors).toBeUndefined();
    createdViewIds.push(data.createView.id);
    assertViewStructure(data.createView, {
      name: input.name,
      objectMetadataId: input.objectMetadataId,
      icon: input.icon,
      type: ViewType.TABLE,
      mainGroupByFieldMetadataId: null,
      key: null,
      position: 0,
      isCompact: false,
      openRecordIn: ViewOpenRecordIn.SIDE_PANEL,
    });
  });
});
