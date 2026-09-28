import { InMemoryCache } from '@apollo/client';
import { renderHook, waitFor } from '@testing-library/react';

import {
  query,
  variables,
} from '@/object-record/hooks/__mocks__/useFindOneRecord';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { generateMockRecordNode } from '~/testing/utils/generateMockRecordNode';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mocks = [
  {
    request: {
      query,
      variables,
    },
    result: jest.fn(() => ({
      data: {
        person: generateMockRecordNode({
          objectNameSingular: 'person',
          input: { id: '6205681e-7c11-40b4-9e32-f523dbe54590' },
          withDepthOneRelation: true,
        }),
      },
    })),
  },
];

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: mocks,
});

const objectRecordId = '6205681e-7c11-40b4-9e32-f523dbe54590';

describe('useFindOneRecord', () => {
  it('should skip fetch if currentWorkspace is undefined', async () => {
    const { result } = renderHook(
      () => useFindOneRecord({ objectNameSingular: 'person', objectRecordId }),
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.record).toBeUndefined();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.record).toBeDefined();
    });

    expect(mocks[0].result).toHaveBeenCalled();
  });

  it('does not surface a cached record before a fresh show read settles', async () => {
    const cache = new InMemoryCache();
    cache.writeQuery({
      query,
      variables,
      data: {
        person: generateMockRecordNode({
          objectNameSingular: 'person',
          input: { id: objectRecordId },
          withDepthOneRelation: true,
        }),
      },
    });
    const networkResult = jest.fn(() => ({
      data: {
        person: generateMockRecordNode({
          objectNameSingular: 'person',
          input: { id: objectRecordId },
          withDepthOneRelation: true,
        }),
      },
    }));
    const FreshWrapper = getJestMetadataAndApolloMocksWrapper({
      cache,
      apolloMocks: [{ request: { query, variables }, result: networkResult }],
    });
    const { result } = renderHook(
      () =>
        useFindOneRecord({
          objectNameSingular: 'person',
          objectRecordId,
          freshRead: true,
        }),
      { wrapper: FreshWrapper },
    );
    expect(result.current.record).toBeUndefined();
    await waitFor(() => expect(networkResult).toHaveBeenCalledTimes(1));
    expect(result.current.record?.id).toBe(objectRecordId);
  });
});
