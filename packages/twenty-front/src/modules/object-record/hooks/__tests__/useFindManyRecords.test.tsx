import { renderHook } from '@testing-library/react';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(() => ({
    canReadObjectRecords: true,
  })),
}));

setTestObjectMetadataItemsInMetadataStore(
  jotaiStore,
  getTestEnrichedObjectMetadataItemsMock(),
);

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
});

describe('useFindManyRecords', () => {
  afterEach(() => {
    jest.mocked(useObjectPermissionsForObject).mockReturnValue({
      canReadObjectRecords: true,
    } as ReturnType<typeof useObjectPermissionsForObject>);
    jest.mocked(useObjectPermissionsForObject).mockClear();
  });

  it('skips NoteTarget reads when object permission is denied without claiming a query error', () => {
    jest.mocked(useObjectPermissionsForObject).mockReturnValue({
      canReadObjectRecords: false,
    } as ReturnType<typeof useObjectPermissionsForObject>);

    const { result } = renderHook(
      () => useFindManyRecords({ objectNameSingular: 'noteTarget' }),
      { wrapper: Wrapper },
    );

    expect(result.current.hasReadPermission).toBe(false);
    expect(result.current.records).toEqual([]);
    expect(result.current.error).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('should work as expected', async () => {
    jotaiStore.set(currentWorkspaceMemberState.atom, {
      id: '32219445-f587-4c40-b2b1-6d3205ed96da',
      name: { firstName: 'John', lastName: 'Connor' },
      locale: 'en',
      colorScheme: 'Light',
      userEmail: 'userEmail',
    });

    const onCompleted = jest.fn();

    const { result } = renderHook(
      () => {
        return useFindManyRecords({
          objectNameSingular: 'person',
          onCompleted,
          skip: true,
        });
      },
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.records.length).toBe(0);
    expect(result.current.objectMetadataItem).toBeDefined();
  });
});
