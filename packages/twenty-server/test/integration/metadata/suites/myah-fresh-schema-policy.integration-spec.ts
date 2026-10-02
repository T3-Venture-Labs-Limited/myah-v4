import gql from 'graphql-tag';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { createOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/create-one-field-metadata.util';
import { updateOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/update-one-field-metadata.util';
import { createOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/create-one-object-metadata.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { updateFeatureFlag } from 'test/integration/metadata/suites/utils/update-feature-flag.util';
import { makeRestAPIRequest } from 'test/integration/rest/utils/make-rest-api-request.util';
import {
  extractMetadataItemPayload,
  extractMetadataListPayload,
} from 'test/integration/rest/utils/metadata-rest-api.util';
import { assertRestApiSuccessfulResponse } from 'test/integration/rest/utils/rest-test-assertions.util';
import { FeatureFlagKey, FieldMetadataType } from 'twenty-shared/types';

const readSchemaFingerprint = async () => {
  const [fingerprint] = await global.testDataSource.query(
    `SELECT
      (SELECT md5(string_agg(o.id::text || ':' || o."nameSingular" || ':' || COALESCE(o."labelSingular", '<NULL>'), ',' ORDER BY o.id))
       FROM core."objectMetadata" o WHERE o."workspaceId" = $1) AS objects,
      (SELECT md5(string_agg(f.id::text || ':' || f.name || ':' || COALESCE(f.label, '<NULL>'), ',' ORDER BY f.id))
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
  it.each([false, true])(
    'reads and paginates native object and field metadata through REST (new format: %s)',
    async (isNewFormat) => {
      const initialResponse = await makeRestAPIRequest({
        method: 'get',
        path: '/metadata/objects?limit=1',
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });
      assertRestApiSuccessfulResponse(initialResponse);
      const initiallyNewFormat = Array.isArray(initialResponse.body.data);
      try {
        await updateFeatureFlag({
          featureFlag: FeatureFlagKey.IS_REST_METADATA_API_NEW_FORMAT_DIRECT,
          value: isNewFormat,
          expectToFail: false,
        });
        const read = async (path: string) => {
          const response = await makeRestAPIRequest({
            method: 'get',
            path,
            bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
          });

          assertRestApiSuccessfulResponse(response);
          return response.body;
        };

        for (const plural of ['objects', 'fields'] as const) {
          const firstBody = await read(`/metadata/${plural}?limit=2`);
          const first = extractMetadataListPayload<{
            id: string;
            fields?: unknown[];
            objectMetadataId?: string;
          }>(firstBody, plural);
          const secondBody = await read(
            `/metadata/${plural}?limit=2&starting_after=${first.pageInfo.endCursor}`,
          );
          const second = extractMetadataListPayload<{ id: string }>(
            secondBody,
            plural,
          );

          if (isNewFormat) {
            expect(firstBody.data).toEqual(expect.any(Array));
          } else {
            expect(firstBody.data[plural]).toEqual(expect.any(Array));
          }
          expect(first.items).toHaveLength(2);
          expect(first.pageInfo.hasNextPage).toBe(true);
          expect(second.items).toHaveLength(2);
          const firstIds = first.items.map(({ id }) => id);
          expect(second.items.every(({ id }) => !firstIds.includes(id))).toBe(
            true,
          );

          const singular = plural === 'objects' ? 'object' : 'field';
          const itemBody = await read(
            `/metadata/${plural}/${first.items[0].id}`,
          );
          const item = extractMetadataItemPayload<{
            id: string;
            fields?: unknown[];
            objectMetadataId?: string;
          }>(itemBody, singular);

          expect(item.id).toBe(first.items[0].id);
          if (plural === 'objects') {
            expect(Array.isArray(item.fields)).toBe(true);
          } else {
            expect(item.objectMetadataId).toBeDefined();
          }
          if (isNewFormat) {
            expect(itemBody).not.toHaveProperty(`data.${singular}`);
          } else {
            expect(itemBody).toHaveProperty(
              `data.${singular}`,
              expect.objectContaining({ id: item.id }),
            );
          }
        }
      } finally {
        await updateFeatureFlag({
          featureFlag: FeatureFlagKey.IS_REST_METADATA_API_NEW_FORMAT_DIRECT,
          value: initiallyNewFormat,
          expectToFail: false,
        });
        const restored = await makeRestAPIRequest({
          method: 'get',
          path: '/metadata/objects?limit=1',
          bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
        });
        assertRestApiSuccessfulResponse(restored);
        expect(Array.isArray(restored.body.data)).toBe(initiallyNewFormat);
      }
    },
  );

  it('exposes native Creator and SocialProfile but denies customer object and field creation without schema changes', async () => {
    const metadata = await makeMetadataAPIRequest({
      query: gql`
        query {
          objects(paging: { first: 1000 }) {
            edges {
              node {
                id
                nameSingular
                fieldsList {
                  id
                  name
                }
              }
            }
          }
        }
      `,
    });

    expect(metadata.body.errors).toBeUndefined();
    const objects = metadata.body.data.objects.edges.map(
      ({
        node,
      }: {
        node: {
          id: string;
          nameSingular: string;
          fieldsList: { id: string; name: string }[];
        };
      }) => node,
    );
    const creator = objects.find(
      ({ nameSingular }: { nameSingular: string }) =>
        nameSingular === 'creator',
    );

    expect(creator).toBeDefined();
    const location = creator!.fieldsList.find(
      (field: { id: string; name: string }) => field.name === 'location',
    );
    expect(location).toBeDefined();
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

    const update = await updateOneFieldMetadata({
      input: {
        idToUpdate: location!.id,
        updatePayload: { label: 'Customer-defined location' },
      },
      expectToFail: true,
    });

    for (const response of [object, field, update]) {
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

  it('rejects direct REST object and field schema writes without changing metadata or storage', async () => {
    const metadata = await makeMetadataAPIRequest({
      query: gql`
        query {
          objects(paging: { first: 1000 }) {
            edges {
              node {
                id
                nameSingular
                fieldsList {
                  id
                  name
                }
              }
            }
          }
        }
      `,
    });
    expect(metadata.body.errors).toBeUndefined();
    const creator = metadata.body.data.objects.edges.find(
      ({ node }: { node: { nameSingular: string } }) =>
        node.nameSingular === 'creator',
    )?.node;
    const location = creator?.fieldsList.find(
      ({ name }: { name: string }) => name === 'location',
    );
    expect(location).toBeDefined();

    const before = await readSchemaFingerprint();
    const requests = [
      {
        method: 'post' as const,
        path: '/metadata/objects',
        body: {
          nameSingular: 'restSchemaProbe',
          namePlural: 'restSchemaProbes',
          labelSingular: 'REST Schema Probe',
          labelPlural: 'REST Schema Probes',
          icon: 'IconListNumbers',
        },
      },
      {
        method: 'patch' as const,
        path: `/metadata/objects/${creator.id}`,
        body: { labelSingular: 'Customer Creator' },
      },
      {
        method: 'post' as const,
        path: '/metadata/fields',
        body: {
          objectMetadataId: creator.id,
          name: 'restSchemaProbe',
          label: 'REST Schema Probe',
          type: FieldMetadataType.TEXT,
        },
      },
      {
        method: 'patch' as const,
        path: `/metadata/fields/${location.id}`,
        body: { label: 'Customer location' },
      },
    ];

    for (const { method, path, body } of requests) {
      const response = await makeRestAPIRequest({
        method,
        path,
        body,
        bearer: APPLE_JANE_ADMIN_ACCESS_TOKEN,
      });
      expect(response.status).toBe(403);
      expect(response.text).toContain(
        'Schema definitions are managed by the product and cannot be changed by customers',
      );
      expect(await readSchemaFingerprint()).toEqual(before);
    }
  });
});
