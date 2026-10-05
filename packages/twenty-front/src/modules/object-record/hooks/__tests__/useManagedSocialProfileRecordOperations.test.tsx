import { gql } from '@apollo/client';
import { act, renderHook } from '@testing-library/react';

import {
  RESTORE_SOCIAL_PROFILE,
  RETIRE_SOCIAL_PROFILE,
  UPDATE_SOCIAL_PROFILE_IDENTITY,
} from '@/myah/creator-crm/socialProfileOperations';
import { useDeleteManyRecords } from '@/object-record/hooks/useDeleteManyRecords';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useIncrementalDeleteManyRecords } from '@/object-record/hooks/useIncrementalDeleteManyRecords';
import { useRestoreManyRecords } from '@/object-record/hooks/useRestoreManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

const mockCoreMutate = jest.fn();
const mockMetadataMutate = jest.fn();
const mockCoreCache = {};
const mockMetadataCache = {};
const mockRefetchAggregateQueries = jest.fn();
const mockUpsertRecordsInStore = jest.fn();
const mockTriggerUpdateRecordOptimisticEffect = jest.fn();
const mockUpdateRecordFromCache = jest.fn();
const mockCachedRecord = {
  id: 'p1',
  __typename: 'SocialProfile',
  deletedAt: '2026-01-01T00:00:00.000Z',
};
const mockGenericDelete = gql`
  mutation GenericDelete {
    deleteSocialProfile
  }
`;
const mockGenericRestore = gql`
  mutation GenericRestore {
    restoreSocialProfiles
  }
`;
const mockSocialProfileMetadata = {
  id: 'social-profile-object',
  nameSingular: 'socialProfile',
  namePlural: 'socialProfiles',
  fields: [],
};

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ cache: mockCoreCache, mutate: mockCoreMutate }),
}));
jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useApolloClient: () => ({
    cache: mockMetadataCache,
    mutate: mockMetadataMutate,
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [mockSocialProfileMetadata],
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: mockSocialProfileMetadata,
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));
jest.mock('@/object-record/hooks/useRefetchAggregateQueries', () => ({
  useRefetchAggregateQueries: () => ({
    refetchAggregateQueries: mockRefetchAggregateQueries,
  }),
}));
jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({
    upsertRecordsInStore: mockUpsertRecordsInStore,
  }),
}));
jest.mock('@/object-record/cache/hooks/useGetRecordFromCache', () => ({
  useGetRecordFromCache: () => (id: string) => ({ ...mockCachedRecord, id }),
}));
jest.mock('@/object-record/hooks/useDeleteOneRecordMutation', () => ({
  useDeleteOneRecordMutation: () => ({
    deleteOneRecordMutation: mockGenericDelete,
  }),
}));
jest.mock(
  '@/apollo/optimistic-effect/utils/triggerUpdateRecordOptimisticEffectByBatch',
  () => ({ triggerUpdateRecordOptimisticEffectByBatch: jest.fn() }),
);
jest.mock('@/object-record/hooks/useDeleteManyRecordsMutation', () => ({
  useDeleteManyRecordsMutation: () => ({
    deleteManyRecordsMutation: mockGenericDelete,
  }),
}));
jest.mock(
  '@/navigation-menu-item/common/hooks/useRemoveNavigationMenuItemByTargetRecordId',
  () => ({
    useRemoveNavigationMenuItemByTargetRecordId: () => ({
      removeNavigationMenuItemsByTargetRecordIds: jest.fn(),
    }),
  }),
);
jest.mock('@/object-record/hooks/useIncrementalFetchAndMutateRecords', () => ({
  useIncrementalFetchAndMutateRecords: () => ({
    incrementalFetchAndMutate: (
      mutate: (batch: {
        recordIds: string[];
        totalCount: number;
        abortSignal: AbortSignal;
      }) => Promise<void>,
    ) =>
      mutate({
        recordIds: ['p1', 'p2'],
        totalCount: 2,
        abortSignal: new AbortController().signal,
      }),
    progress: {},
    isProcessing: false,
    updateProgress: jest.fn(),
  }),
}));
jest.mock('@/object-record/hooks/useRestoreManyRecordsMutation', () => ({
  useRestoreManyRecordsMutation: () => ({
    restoreManyRecordsMutation: mockGenericRestore,
  }),
}));
jest.mock('@/object-record/utils/computeOptimisticRecordFromInput', () => ({
  computeOptimisticRecordFromInput: ({
    recordInput,
  }: {
    recordInput: unknown;
  }) => recordInput,
}));
jest.mock('@/object-record/cache/utils/getRecordFromCache', () => ({
  getRecordFromCache: () => mockCachedRecord,
}));
jest.mock(
  '@/object-record/graphql/record-gql-fields/utils/generateDepthRecordGqlFieldsFromObject',
  () => ({
    generateDepthRecordGqlFieldsFromObject: () => ({}),
  }),
);
jest.mock('@/object-record/utils/sanitizeRecordInput', () => ({
  sanitizeRecordInput: ({ recordInput }: { recordInput: unknown }) =>
    recordInput,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => null,
}));
jest.mock('@/object-record/cache/utils/getRecordNodeFromRecord', () => ({
  getRecordNodeFromRecord: ({ record }: { record: unknown }) => record,
}));
jest.mock('@/object-record/cache/utils/getRecordFromRecordNode', () => ({
  getRecordFromRecordNode: ({ recordNode }: { recordNode: unknown }) =>
    recordNode,
}));
jest.mock('@/object-record/cache/utils/updateRecordFromCache', () => ({
  updateRecordFromCache: (...args: unknown[]) =>
    mockUpdateRecordFromCache(...args),
}));
jest.mock(
  '@/apollo/optimistic-effect/utils/triggerUpdateRecordOptimisticEffect',
  () => ({
    triggerUpdateRecordOptimisticEffect: (...args: unknown[]) =>
      mockTriggerUpdateRecordOptimisticEffect(...args),
  }),
);
jest.mock(
  '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent',
  () => ({
    dispatchObjectRecordOperationBrowserEvent: jest.fn(),
  }),
);

const mockGenericUpdate = gql`
  mutation GenericUpdate {
    updateSocialProfile
  }
`;
jest.mock('@/object-metadata/utils/generateUpdateOneRecordMutation', () => ({
  generateUpdateOneRecordMutation: () => mockGenericUpdate,
}));

describe('managed SocialProfile record operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const respond = ({
      mutation,
      variables,
      update,
    }: {
      mutation: unknown;
      variables: any;
      update?: any;
    }) => {
      const responseField =
        mutation === UPDATE_SOCIAL_PROFILE_IDENTITY
          ? 'updateSocialProfileIdentity'
          : mutation === RETIRE_SOCIAL_PROFILE
            ? 'retireSocialProfile'
            : 'restoreSocialProfile';
      const response = {
        id: variables.input.id,
        __typename: 'SocialProfileDTO',
        deletedAt:
          responseField === 'retireSocialProfile'
            ? '2026-02-01T00:00:00.000Z'
            : null,
      };
      const data = { [responseField]: response };
      update?.({}, { data });

      return Promise.resolve({ data });
    };
    mockMetadataMutate.mockImplementation(respond);
    mockCoreMutate.mockImplementation(respond);
  });

  it('routes identity updates to the managed mutation without issuing generic update', async () => {
    await useUpdateOneRecord().updateOneRecord({
      objectNameSingular: 'socialProfile',
      idToUpdate: 'p1',
      updateOneRecordInput: { handle: '@ada', followerCount: 42 },
    });

    expect(mockMetadataMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: UPDATE_SOCIAL_PROFILE_IDENTITY,
        fetchPolicy: 'no-cache',
        variables: { input: { id: 'p1', handle: '@ada', followerCount: 42 } },
      }),
    );
    expect(mockCoreMutate).not.toHaveBeenCalled();
    expect(mockUpdateRecordFromCache).toHaveBeenCalledWith(
      expect.objectContaining({ cache: mockCoreCache }),
    );
    expect(mockUpsertRecordsInStore).toHaveBeenCalledWith({
      partialRecords: [
        expect.objectContaining({ __typename: 'SocialProfile' }),
      ],
    });
    expect(mockTriggerUpdateRecordOptimisticEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedRecord: expect.objectContaining({ __typename: 'SocialProfile' }),
      }),
    );
  });

  it('routes retirement to the managed mutation without issuing generic delete', async () => {
    const { result } = renderHook(() =>
      useDeleteOneRecord({ objectNameSingular: 'socialProfile' }),
    );

    await act(async () => result.current.deleteOneRecord('p1'));

    expect(mockMetadataMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: RETIRE_SOCIAL_PROFILE,
        fetchPolicy: 'no-cache',
        variables: { input: { id: 'p1' } },
      }),
    );
    expect(mockCoreMutate).not.toHaveBeenCalled();
    expect(mockMetadataMutate.mock.calls[0][0].mutation).not.toBe(
      mockGenericDelete,
    );
    expect(mockUpdateRecordFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cache: mockCoreCache,
        record: expect.objectContaining({
          __typename: 'SocialProfile',
          deletedAt: '2026-02-01T00:00:00.000Z',
        }),
      }),
    );
    expect(mockTriggerUpdateRecordOptimisticEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedRecord: expect.objectContaining({ __typename: 'SocialProfile' }),
      }),
    );
  });

  it('restores each SocialProfile with the managed mutation without generic batches', async () => {
    await useRestoreManyRecords({
      objectNameSingular: 'socialProfile',
    }).restoreManyRecords({
      idsToRestore: ['p1', 'p2'],
      skipOptimisticEffect: true,
    });

    expect(mockMetadataMutate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mutation: RESTORE_SOCIAL_PROFILE,
        fetchPolicy: 'no-cache',
        variables: { input: { id: 'p1' } },
      }),
    );
    expect(mockMetadataMutate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mutation: RESTORE_SOCIAL_PROFILE,
        fetchPolicy: 'no-cache',
        variables: { input: { id: 'p2' } },
      }),
    );
    expect(mockCoreMutate).not.toHaveBeenCalled();
    expect(
      mockMetadataMutate.mock.calls.map(([options]) => options.mutation),
    ).not.toContain(mockGenericRestore);
    expect(mockUpdateRecordFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cache: mockCoreCache,
        record: expect.objectContaining({
          __typename: 'SocialProfile',
          deletedAt: null,
        }),
      }),
    );
    expect(mockUpsertRecordsInStore).toHaveBeenCalledWith({
      partialRecords: [
        expect.objectContaining({
          __typename: 'SocialProfile',
          deletedAt: null,
        }),
      ],
    });
    expect(mockTriggerUpdateRecordOptimisticEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedRecord: expect.objectContaining({
          __typename: 'SocialProfile',
          deletedAt: null,
        }),
      }),
    );
  });

  // MYAH-458: the Delete command uses the many-record paths.
  const expectEachProfileRetired = () => {
    expect(
      mockMetadataMutate.mock.calls.map(([options]) => [
        options.mutation,
        options.variables,
      ]),
    ).toEqual([
      [RETIRE_SOCIAL_PROFILE, { input: { id: 'p1' } }],
      [RETIRE_SOCIAL_PROFILE, { input: { id: 'p2' } }],
    ]);
    expect(mockCoreMutate).not.toHaveBeenCalled();
  };

  it('removes each SocialProfile with the managed mutation in deleteManyRecords', async () => {
    const { result } = renderHook(() =>
      useDeleteManyRecords({ objectNameSingular: 'socialProfile' }),
    );

    await act(async () => {
      await result.current.deleteManyRecords({
        recordIdsToDelete: ['p1', 'p2'],
      });
    });

    expectEachProfileRetired();
  });

  it('does not restore a successfully retired profile when the next removal fails', async () => {
    mockMetadataMutate.mockImplementation(({ variables }) =>
      variables.input.id === 'p2'
        ? Promise.reject(new Error('Removal rejected'))
        : Promise.resolve({
            data: {
              retireSocialProfile: {
                id: 'p1',
                deletedAt: '2026-10-05T00:00:00Z',
              },
            },
          }),
    );
    const { result } = renderHook(() =>
      useDeleteManyRecords({ objectNameSingular: 'socialProfile' }),
    );
    await act(async () => {
      await expect(
        result.current.deleteManyRecords({ recordIdsToDelete: ['p1', 'p2'] }),
      ).rejects.toThrow('Removal rejected');
    });
    const restoredIds = mockUpdateRecordFromCache.mock.calls
      .map(([options]) => options.record)
      .filter((record) => record.deletedAt === null)
      .map((record) => record.id);
    expect(restoredIds).toEqual(['p2']);
  });

  it('removes each SocialProfile with the managed mutation in incrementalDeleteManyRecords', async () => {
    const { result } = renderHook(() =>
      useIncrementalDeleteManyRecords({
        objectNameSingular: 'socialProfile',
        filter: { id: { in: ['p1', 'p2'] } },
        delayInMsBetweenMutations: 0,
      }),
    );

    await act(async () => {
      await result.current.incrementalDeleteManyRecords();
    });

    expectEachProfileRetired();
  });
});
