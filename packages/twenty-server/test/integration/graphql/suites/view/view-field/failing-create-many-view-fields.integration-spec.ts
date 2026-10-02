import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { deleteOneView } from 'test/integration/metadata/suites/view/utils/delete-one-view.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { createManyViewFields } from 'test/integration/metadata/suites/view-field/utils/create-many-view-fields.util';
import { createOneView } from 'test/integration/metadata/suites/view/utils/create-one-view.util';
import { v4 as uuidv4 } from 'uuid';

import { type CreateViewFieldInput } from 'src/engine/metadata-modules/view-field/dtos/inputs/create-view-field.input';

describe('View Field Resolver - Failing Create Many Operations', () => {
  let testSetup: {
    testViewId: string;
    firstTestFieldMetadataId: string;
    secondTestFieldMetadataId: string;
  };

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      input: { filter: {}, paging: { first: 1000 } },
      gqlFields: 'id nameSingular fieldsList { id name }',
      expectToFail: false,
    });
    const creator = objects.find((object) => object.nameSingular === 'creator');
    const name = creator?.fieldsList?.find((field) => field.name === 'name');
    const location = creator?.fieldsList?.find(
      (field) => field.name === 'location',
    );

    expect(creator).toBeDefined();
    expect(name).toBeDefined();
    expect(location).toBeDefined();
    const { data } = await createOneView({
      input: {
        icon: 'icon123',
        objectMetadataId: creator!.id,
        name: 'TestViewForFields',
      },
      expectToFail: false,
    });

    testSetup = {
      testViewId: data.createView.id,
      firstTestFieldMetadataId: name!.id,
      secondTestFieldMetadataId: location!.id,
    };
  });

  afterAll(async () => {
    await deleteOneView({ viewId: testSetup.testViewId, expectToFail: false });
    await destroyOneView({ viewId: testSetup.testViewId, expectToFail: false });
  });

  it('should accumulate multiple validation errors when some inputs are invalid', async () => {
    const invalidViewId = uuidv4();
    const invalidFieldMetadataId = uuidv4();

    const inputs: CreateViewFieldInput[] = [
      {
        fieldMetadataId: invalidFieldMetadataId,
        viewId: testSetup.testViewId,
        position: 0,
        isVisible: true,
        size: 150,
      },
      {
        fieldMetadataId: testSetup.firstTestFieldMetadataId,
        viewId: invalidViewId,
        position: 1,
        isVisible: true,
        size: 200,
      },
      {
        fieldMetadataId: invalidFieldMetadataId,
        viewId: invalidViewId,
        position: 2,
        isVisible: true,
        size: 180,
      },
    ];

    const { errors } = await createManyViewFields({
      inputs,
      expectToFail: true,
    });

    expectOneNotInternalServerErrorSnapshot({
      errors,
    });
  });
});
