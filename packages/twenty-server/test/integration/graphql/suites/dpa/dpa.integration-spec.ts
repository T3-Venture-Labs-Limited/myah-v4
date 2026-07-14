import gql from 'graphql-tag';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

describe('Legacy DPA GraphQL surface (integration)', () => {
  it('does not expose retired DPA operations', async () => {
    const response = await makeGraphqlAPIRequest({
      query: gql`
        query LegacyDpaOperations {
          __schema {
            queryType {
              fields {
                name
              }
            }
            mutationType {
              fields {
                name
              }
            }
          }
        }
      `,
    });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    const queryFieldNames: string[] =
      response.body.data.__schema.queryType.fields.map(
        (field: { name: string }) => field.name,
      );
    const mutationFieldNames: string[] =
      response.body.data.__schema.mutationType.fields.map(
        (field: { name: string }) => field.name,
      );

    expect(queryFieldNames).not.toContain('dpaPreview');
    expect(queryFieldNames).not.toContain('dpaAgreements');
    expect(mutationFieldNames).not.toContain('generateSignedDpa');
  });
});
