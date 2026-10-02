import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { createOneView } from 'test/integration/metadata/suites/view/utils/create-one-view.util';
import { deleteOneView } from 'test/integration/metadata/suites/view/utils/delete-one-view.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { findOneView } from 'test/integration/metadata/suites/view/utils/find-one-view.util';

const TEST_NOT_EXISTING_VIEW_ID = '20202020-0000-4000-8000-000000000000';

describe('Destroy core view', () => {
  let testObjectMetadataId: string;

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular',
      expectToFail: false,
    });
    const creator = objects.find((object) => object.nameSingular === 'creator');

    expect(creator).toBeDefined();
    testObjectMetadataId = creator!.id;
  });

  it('should destroy an existing view', async () => {
    const {
      data: { createView: view },
    } = await createOneView({
      input: {
        icon: '123Icon',
        name: 'View to Destroy',
        objectMetadataId: testObjectMetadataId,
      },
      expectToFail: false,
    });

    const { data: deleteData, errors: deleteErrors } = await deleteOneView({
      viewId: view.id,
      expectToFail: false,
    });

    expect(deleteErrors).toBeUndefined();
    expect(deleteData.deleteView).toBe(true);

    const { data: destroyData, errors: destroyErrors } = await destroyOneView({
      viewId: view.id,
      expectToFail: false,
    });

    expect(destroyErrors).toBeUndefined();
    expect(destroyData.destroyView).toBe(true);

    const { data: getData } = await findOneView({
      viewId: view.id,
      expectToFail: false,
    });

    expect(getData.getView).toBeNull();
  });

  it('should throw an error when destroying non-existent view', async () => {
    const { errors } = await destroyOneView({
      viewId: TEST_NOT_EXISTING_VIEW_ID,
      expectToFail: true,
    });

    expectOneNotInternalServerErrorSnapshot({ errors });
  });
});
