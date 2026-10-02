import { findManyObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/find-many-object-metadata.util';
import { updateOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/update-one-object-metadata.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import {
  eachTestingContextFilter,
  type EachTestingContext,
} from 'twenty-shared/testing';

import { type ObjectMetadataDTO } from 'src/engine/metadata-modules/object-metadata/dtos/object-metadata.dto';
import { type UpdateObjectPayload } from 'src/engine/metadata-modules/object-metadata/dtos/update-object.input';

type TestingRuntimeContext = {
  objectMetadataId: string;
};

type UpdateOneStandardObjectMetadataTestingContext = EachTestingContext<
  | ((args: TestingRuntimeContext) => Partial<UpdateObjectPayload>)
  | Partial<UpdateObjectPayload>
>[];

const deniedUpdateTestsUseCase: UpdateOneStandardObjectMetadataTestingContext =
  [
    {
      title: 'when updating description',
      context: {
        description: 'Updated test description for company',
      },
    },
    {
      title: 'when updating icon',
      context: {
        icon: 'IconBuildingSkyscraper',
      },
    },
    {
      title: 'when setting isActive to false',
      context: {
        isActive: false,
      },
    },
    {
      title: 'when updating labelSingular and labelPlural',
      context: {
        labelSingular: 'Business',
        labelPlural: 'Businesses',
      },
    },
    {
      title: 'when updating color',
      context: {
        color: 'red',
      },
    },
  ];

const companyMetadataFields = `
  id
  nameSingular
  namePlural
  labelSingular
  labelPlural
  color
  description
  icon
  isActive
  shortcut
`;

describe('Product-managed standard object metadata updates are denied', () => {
  let companyObjectMetadataId: string;
  let originalCompanyMetadata: ObjectMetadataDTO;

  beforeAll(async () => {
    const { objects } = await findManyObjectMetadata({
      expectToFail: false,
      input: {
        filter: {},
        paging: { first: 100 },
      },
      gqlFields: companyMetadataFields,
    });

    const companyObject = objects.find((o) => o.nameSingular === 'company');

    jestExpectToBeDefined(companyObject);
    companyObjectMetadataId = companyObject.id;
    originalCompanyMetadata = companyObject;
  });

  it.each(eachTestingContextFilter(deniedUpdateTestsUseCase))(
    '$title',
    async ({ context }) => {
      const updatePayload =
        typeof context === 'function'
          ? context({ objectMetadataId: companyObjectMetadataId })
          : context;

      const { errors } = await updateOneObjectMetadata({
        input: {
          idToUpdate: companyObjectMetadataId,
          updatePayload,
        },
        expectToFail: true,
      });

      expect(errors).toEqual([
        expect.objectContaining({
          message:
            'Schema definitions are managed by the product and cannot be changed by customers',
          extensions: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      ]);

      const { objects } = await findManyObjectMetadata({
        expectToFail: false,
        input: { filter: {}, paging: { first: 100 } },
        gqlFields: companyMetadataFields,
      });

      expect(
        objects.find((object) => object.id === companyObjectMetadataId),
      ).toEqual(originalCompanyMetadata);
    },
  );
});
