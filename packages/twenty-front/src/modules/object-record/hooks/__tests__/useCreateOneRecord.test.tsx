import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { generateCreateOneRecordMutation } from '@/object-metadata/utils/generateCreateOneRecordMutation';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { gql } from '@apollo/client';
import { act, renderHook } from '@testing-library/react';
import { sanitizeRecordInput } from '@/object-record/utils/sanitizeRecordInput';

jest.mock('@/object-record/utils/sanitizeRecordInput', () => {
  const actual = jest.requireActual(
    '@/object-record/utils/sanitizeRecordInput',
  );
  return {
    ...actual,
    sanitizeRecordInput: jest.fn(actual.sanitizeRecordInput),
  };
});

import { CoreObjectNameSingular } from 'twenty-shared/types';
import {
  query,
  responseData,
} from '@/object-record/hooks/__mocks__/useCreateOneRecord';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const PERSON_ID = 'a7286b9a-c039-4a89-9567-2dfa7953cda9';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a7286b9a-c039-4a89-9567-2dfa7953cda9'),
}));

const input = { name: { firstName: 'John', lastName: 'Doe' } };

jest.mock('@/object-record/hooks/useRefetchAggregateQueries');
const mockRefetchAggregateQueries = jest.fn();
(useRefetchAggregateQueries as jest.Mock).mockReturnValue({
  refetchAggregateQueries: mockRefetchAggregateQueries,
});

const mocks = [
  {
    request: {
      query,
      variables: { input: { ...input, id: PERSON_ID } },
    },
    result: jest.fn(() => ({
      data: {
        createPerson: { ...responseData, ...input, id: PERSON_ID },
      },
    })),
  },
];

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: mocks,
});

describe('useCreateOneRecord', () => {
  it('settles loading when native input preparation throws before any request', async () => {
    const failure = new Error('Synthetic preparation failure');
    jest.mocked(sanitizeRecordInput).mockImplementationOnce(() => {
      throw failure;
    });
    const { result } = renderHook(
      () =>
        useCreateOneRecord({
          objectNameSingular: CoreObjectNameSingular.Person,
        }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await expect(result.current.createOneRecord(input)).rejects.toBe(failure);
    });
    expect(result.current.loading).toBe(false);
    expect(mocks[0].result).not.toHaveBeenCalled();
    expect(mockRefetchAggregateQueries).not.toHaveBeenCalled();
  });

  it.each([undefined, {}])(
    'preserves default rejection and settles loading with options %j',
    async (options) => {
      const failure = new Error('Synthetic default transport failure');
      const errorWrapper = getJestMetadataAndApolloMocksWrapper({
        apolloMocks: [{ request: mocks[0].request, error: failure }],
      });
      const { result } = renderHook(
        () =>
          useCreateOneRecord({
            objectNameSingular: CoreObjectNameSingular.Person,
          }),
        { wrapper: errorWrapper },
      );
      await act(async () => {
        await expect(
          result.current.createOneRecord(input, options),
        ).rejects.toBe(failure);
      });
      expect(result.current.loading).toBe(false);
      expect(mockRefetchAggregateQueries).not.toHaveBeenCalled();
    },
  );
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('works as expected', async () => {
    const { result } = renderHook(
      () =>
        useCreateOneRecord({
          objectNameSingular: CoreObjectNameSingular.Person,
        }),
      {
        wrapper: Wrapper,
      },
    );

    await act(async () => {
      const res = await result.current.createOneRecord(input);
      expect(res).toBeDefined();
      expect(res).toHaveProperty('id', PERSON_ID);
    });

    expect(mocks[0].result).toHaveBeenCalled();
    expect(mockRefetchAggregateQueries).toHaveBeenCalledTimes(1);
  });
});

it.each([
  [undefined, true],
  [{}, true],
  [undefined, false],
  [{}, false],
] as const)(
  'preserves explicit Person selection and native relation inputs with default options %j skip=%s',
  async (options, skipPostOptimisticEffect) => {
    jest.clearAllMocks();
    const metadata = getTestEnrichedObjectMetadataItemsMock();
    const person = metadata.find((item) => item.nameSingular === 'person');
    if (!person) throw new Error('Native Person metadata missing');
    const companyId = '34700000-0000-4000-8000-000000000041';
    const relationInput = {
      ...input,
      companyId,
      company: { connect: { where: { id: companyId } } },
    };
    const recordGqlFields = {
      id: true,
      name: { firstName: true, lastName: true },
    };
    const mutation = generateCreateOneRecordMutation({
      objectMetadataItem: person,
      objectMetadataItems: metadata,
      recordGqlFields,
      objectPermissionsByObjectMetadataId: {},
    });
    const resultResponse = jest.fn(() => ({
      data: { createPerson: { __typename: 'Person', id: PERSON_ID, ...input } },
    }));
    const wrapper = getJestMetadataAndApolloMocksWrapper({
      apolloMocks: [
        {
          request: {
            query: mutation,
            variables: { input: { ...relationInput, id: PERSON_ID } },
          },
          result: resultResponse,
        },
      ],
    });
    const { result } = renderHook(
      () => ({
        ...useCreateOneRecord({
          objectNameSingular: 'person',
          recordGqlFields,
          skipPostOptimisticEffect,
        }),
        client: useApolloCoreClient(),
      }),
      { wrapper },
    );
    const querySpy = jest.spyOn(result.current.client, 'query');
    const mutate = jest.spyOn(result.current.client, 'mutate');
    const modify = jest.spyOn(result.current.client.cache, 'modify');
    await act(async () => {
      await expect(
        result.current.createOneRecord(relationInput, options),
      ).resolves.toMatchObject({ id: PERSON_ID, ...input });
    });
    expect(resultResponse).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      mutation,
      variables: { input: { ...relationInput, id: PERSON_ID } },
    });
    expect(mutate.mock.calls[0][0].context).toBeUndefined();
    expect(querySpy).not.toHaveBeenCalled();
    expect(
      modify.mock.calls.filter(
        ([options]) =>
          typeof options.fields === 'object' && 'people' in options.fields,
      ),
    ).toHaveLength(skipPostOptimisticEffect ? 0 : 2);
    expect(jest.mocked(sanitizeRecordInput).mock.results.at(-1)?.value).toEqual(
      relationInput,
    );
    expect(mockRefetchAggregateQueries).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(
      result.current.client.cache.readFragment({
        id: `Person:${PERSON_ID}`,
        fragment: gql`
          fragment CompatibilityPerson on Person {
            id
            name {
              firstName
              lastName
            }
          }
        `,
      }),
    ).toMatchObject({ id: PERSON_ID, ...input });
  },
);

it.each([undefined, {}])(
  'preserves first-response Person validation rejection with options %j',
  async (options) => {
    jest.clearAllMocks();
    const errors = [
      { message: 'Invalid Person', extensions: { code: 'BAD_USER_INPUT' } },
    ];
    const response = jest.fn(() => ({ errors }));
    const wrapper = getJestMetadataAndApolloMocksWrapper({
      apolloMocks: [{ request: mocks[0].request, result: response }],
    });
    const { result } = renderHook(
      () => ({
        ...useCreateOneRecord({ objectNameSingular: 'person' }),
        client: useApolloCoreClient(),
      }),
      { wrapper },
    );
    const read = jest.spyOn(result.current.client, 'query');
    await act(async () => {
      await expect(
        result.current.createOneRecord(input, options),
      ).rejects.toMatchObject({ errors });
    });
    expect(response).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(mockRefetchAggregateQueries).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(
      result.current.client.cache.readFragment({
        id: `Person:${PERSON_ID}`,
        fragment: gql`
          fragment AbsentPerson on Person {
            id
          }
        `,
      }),
    ).toBeNull();
  },
);

it('settles default loading on native optimistic fragment preparation failure without dispatch', async () => {
  jest.clearAllMocks();
  const { result } = renderHook(
    () => ({
      ...useCreateOneRecord({ objectNameSingular: 'person' }),
      client: useApolloCoreClient(),
    }),
    { wrapper: Wrapper },
  );
  const failure = new Error('Native optimistic cache preparation failed');
  jest
    .spyOn(result.current.client, 'writeFragment')
    .mockImplementationOnce(() => {
      throw failure;
    });
  const mutate = jest.spyOn(result.current.client, 'mutate');
  await act(async () => {
    await expect(result.current.createOneRecord(input)).rejects.toBe(failure);
  });
  expect(result.current.loading).toBe(false);
  expect(mutate).not.toHaveBeenCalled();
  expect(mockRefetchAggregateQueries).not.toHaveBeenCalled();
});
afterEach(() => {
  jest.restoreAllMocks();
});

it.each([true, false])(
  'keeps explicit relation-input failures rejecting with skip=%s and no readback',
  async (skipPostOptimisticEffect) => {
    jest.clearAllMocks();
    const metadata = getTestEnrichedObjectMetadataItemsMock();
    const person = metadata.find((item) => item.nameSingular === 'person');
    if (!person) throw new Error('Native Person metadata missing');
    const companyId = '34700000-0000-4000-8000-000000000041';
    const relationInput = {
      ...input,
      companyId,
      company: { connect: { where: { id: companyId } } },
    };
    const recordGqlFields = {
      id: true,
      name: { firstName: true, lastName: true },
    };
    const mutation = generateCreateOneRecordMutation({
      objectMetadataItem: person,
      objectMetadataItems: metadata,
      recordGqlFields,
      objectPermissionsByObjectMetadataId: {},
    });
    const errors = [
      { message: 'Relation denied', extensions: { code: 'FORBIDDEN' } },
    ];
    const response = jest.fn(() => ({ errors }));
    const wrapper = getJestMetadataAndApolloMocksWrapper({
      apolloMocks: [
        {
          request: {
            query: mutation,
            variables: { input: { ...relationInput, id: PERSON_ID } },
          },
          result: response,
        },
      ],
    });
    const { result } = renderHook(
      () => ({
        ...useCreateOneRecord({
          objectNameSingular: 'person',
          recordGqlFields,
          skipPostOptimisticEffect,
        }),
        client: useApolloCoreClient(),
      }),
      { wrapper },
    );
    const read = jest.spyOn(result.current.client, 'query');
    await act(async () => {
      await expect(
        result.current.createOneRecord(relationInput, {}),
      ).rejects.toMatchObject({ errors });
    });
    expect(response).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(mockRefetchAggregateQueries).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  },
);
