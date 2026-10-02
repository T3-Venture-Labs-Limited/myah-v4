import { parse } from 'graphql';
import { signUp } from 'test/integration/graphql/utils/sign-up.util';
import request from 'supertest';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';

jest.mock('supertest');

describe('makeMetadataAPIRequest authentication', () => {
  it('defaults to seeded auth and omits auth for null and public signup', async () => {
    Object.assign(globalThis, {
      APP_PORT: 4000,
      APPLE_JANE_ADMIN_ACCESS_TOKEN: 'seeded-test-token',
    });

    const headers: Record<string, string> = {};
    const client = {
      set: jest.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      send: jest.fn(() => ({ headers: { ...headers }, body: { data: {} } })),
    };

    jest.mocked(request).mockReturnValue({
      post: jest.fn(() => client),
    } as unknown as ReturnType<typeof request>);

    const operation = { query: parse('{ __typename }') };

    makeMetadataAPIRequest(operation);
    expect(client.send.mock.results[0].value.headers).toEqual({
      Authorization: 'Bearer seeded-test-token',
    });

    delete headers.Authorization;

    makeMetadataAPIRequest(operation, null);
    expect(client.send.mock.results[1].value.headers).toEqual({});

    await signUp({
      input: { email: 'test@example.invalid', password: 'test' },
    });

    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.stringContaining('signUp(') }),
    );
    expect(headers).toEqual({});
  });
});
