import gql from 'graphql-tag';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { createOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/create-one-field-metadata.util';
import { createOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/create-one-object-metadata.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { FieldMetadataType } from 'twenty-shared/types';

const readSchemaFingerprint = async () => {
  const [fingerprint] = await global.testDataSource.query(
    `SELECT
      (SELECT md5(string_agg(o.id::text || ':' || o."nameSingular", ',' ORDER BY o.id))
       FROM core."objectMetadata" o WHERE o."workspaceId" = $1) AS objects,
      (SELECT md5(string_agg(f.id::text || ':' || f.name, ',' ORDER BY f.id))
       FROM core."fieldMetadata" f
       JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
       WHERE o."workspaceId" = $1) AS fields,
      (SELECT md5(string_agg(table_name || ':' || column_name || ':' || data_type, ','
                            ORDER BY table_name, column_name))
       FROM information_schema.columns WHERE table_schema = $2) AS columns`,
    [SEED_APPLE_WORKSPACE_ID, getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID)],
  );

  return fingerprint;
};

describe('fresh product-owned schema', () => {
  it('exposes native Creator and SocialProfile but denies customer object and field creation without schema changes', async () => {
    const metadata = await makeMetadataAPIRequest({
      query: gql`
        query {
          objects(paging: { first: 1000 }) {
            edges {
              node {
                id
                nameSingular
              }
            }
          }
        }
      `,
    });

    expect(metadata.body.errors).toBeUndefined();
    const objects = metadata.body.data.objects.edges.map(
      ({ node }: { node: { id: string; nameSingular: string } }) => node,
    );
    const creator = objects.find(
      ({ nameSingular }: { nameSingular: string }) =>
        nameSingular === 'creator',
    );

    expect(creator).toBeDefined();
    expect(
      objects.map(({ nameSingular }: { nameSingular: string }) => nameSingular),
    ).toContain('socialProfile');

    const before = await readSchemaFingerprint();
    const object = await createOneObjectMetadata({
      input: {
        nameSingular: 'customerDefinedProbe',
        namePlural: 'customerDefinedProbes',
        labelSingular: 'Customer Defined Probe',
        labelPlural: 'Customer Defined Probes',
        icon: 'IconListNumbers',
      },
      expectToFail: true,
    });
    const field = await createOneFieldMetadata({
      input: {
        objectMetadataId: creator.id,
        name: 'customerDefinedProbe',
        label: 'Customer Defined Probe',
        type: FieldMetadataType.TEXT,
      },
      expectToFail: true,
    });

    for (const response of [object, field]) {
      expect(response.errors).toEqual([
        expect.objectContaining({
          message:
            'Schema definitions are managed by the product and cannot be changed by customers',
          extensions: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      ]);
    }
    expect(await readSchemaFingerprint()).toEqual(before);
  });
});
