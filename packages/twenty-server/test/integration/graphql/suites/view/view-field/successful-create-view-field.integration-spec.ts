import { type ViewFieldTestSetup } from 'test/integration/graphql/suites/view/utils/setup-view-field-test.util';
import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { createOneViewField } from 'test/integration/metadata/suites/view-field/utils/create-one-view-field.util';
import { deleteOneViewField } from 'test/integration/metadata/suites/view-field/utils/delete-one-view-field.util';
import { destroyOneViewField } from 'test/integration/metadata/suites/view-field/utils/destroy-one-view-field.util';
import { createOneView } from 'test/integration/metadata/suites/view/utils/create-one-view.util';
import { deleteOneView } from 'test/integration/metadata/suites/view/utils/delete-one-view.util';
import { destroyOneView } from 'test/integration/metadata/suites/view/utils/destroy-one-view.util';
import { assertViewFieldStructure } from 'test/integration/utils/view-test.util';
import {
  type EachTestingContext,
  eachTestingContextFilter,
} from 'twenty-shared/testing';
import { isDefined } from 'twenty-shared/utils';

import { type CreateViewFieldInput } from 'src/engine/metadata-modules/view-field/dtos/inputs/create-view-field.input';
import { type ViewFieldDTO } from 'src/engine/metadata-modules/view-field/dtos/view-field.dto';

type TestContext = {
  viewFieldInput: (testSetup: ViewFieldTestSetup) => CreateViewFieldInput;
  expected: Partial<ViewFieldDTO>;
};

describe('View Field Resolver - Successful Create Operations', () => {
  let testSetup: ViewFieldTestSetup;
  let createdViewFieldId: string | undefined;

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
      testObjectMetadataId: creator!.id,
      testFieldMetadataId: location!.id,
    };
  });

  afterAll(async () => {
    await deleteOneView({ viewId: testSetup.testViewId, expectToFail: false });
    await destroyOneView({ viewId: testSetup.testViewId, expectToFail: false });
  });

  afterEach(async () => {
    if (isDefined(createdViewFieldId)) {
      const {
        data: { deleteViewField },
      } = await deleteOneViewField({
        expectToFail: false,
        input: {
          id: createdViewFieldId,
        },
      });

      expect(deleteViewField.deletedAt).not.toBeNull();
      await destroyOneViewField({
        expectToFail: false,
        input: {
          id: createdViewFieldId,
        },
      });
      createdViewFieldId = undefined;
    }
  });

  const successfulTestCases: EachTestingContext<TestContext>[] = [
    {
      title: 'visible field with position and size',
      context: {
        viewFieldInput: (testSetup) => ({
          fieldMetadataId: testSetup.testFieldMetadataId,
          viewId: testSetup.testViewId,
          position: 1,
          isVisible: true,
          size: 200,
        }),
        expected: {
          position: 1,
          isVisible: true,
          size: 200,
        },
      },
    },
    {
      title: 'hidden field with position and size',
      context: {
        viewFieldInput: (testSetup) => ({
          fieldMetadataId: testSetup.testFieldMetadataId,
          viewId: testSetup.testViewId,
          position: 2,
          isVisible: false,
          size: 100,
        }),
        expected: {
          position: 2,
          isVisible: false,
          size: 100,
        },
      },
    },
    {
      title: 'field with minimum required properties',
      context: {
        viewFieldInput: (testSetup) => ({
          fieldMetadataId: testSetup.testFieldMetadataId,
          viewId: testSetup.testViewId,
        }),
        expected: {
          position: 0,
          isVisible: true,
          size: 0,
        },
      },
    },
    {
      title: 'field with maximum size',
      context: {
        viewFieldInput: (testSetup) => ({
          fieldMetadataId: testSetup.testFieldMetadataId,
          viewId: testSetup.testViewId,
          position: 3,
          isVisible: true,
          size: 1000,
        }),
        expected: {
          position: 3,
          isVisible: true,
          size: 1000,
        },
      },
    },
  ];

  test.each(eachTestingContextFilter(successfulTestCases))(
    'Create $title',
    async ({ context: { viewFieldInput, expected } }) => {
      const response = await createOneViewField({
        input: viewFieldInput(testSetup),
        expectToFail: false,
      });

      expect(response.errors).toBeUndefined();
      expect(response.data.createViewField).toBeDefined();
      createdViewFieldId = response.data.createViewField.id;

      assertViewFieldStructure(response.data.createViewField, {
        fieldMetadataId: testSetup.testFieldMetadataId,
        viewId: testSetup.testViewId,
        ...expected,
      });
    },
  );
});
