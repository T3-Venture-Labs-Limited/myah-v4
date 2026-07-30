import { InMemoryCache } from '@apollo/client/cache';
import gql from 'graphql-tag';
import { renderHook } from '@testing-library/react';

import {
  buildCreatorBulkRelationshipPreview,
  useCreatorBulkRelationshipPreview,
} from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';

const mockBatchCreateManyRecords = jest.fn();
const mockDestroyManyRecords = jest.fn();
const mockUseBatchCreateManyRecords = jest.fn((_args: unknown) => ({
  batchCreateManyRecords: mockBatchCreateManyRecords,
}));
const mockUseDestroyManyRecords = jest.fn((_args: unknown) => ({
  destroyManyRecords: mockDestroyManyRecords,
}));
const mockRefetchQueries = jest.fn();
const mockApolloCoreClient = {
  cache: new InMemoryCache(),
  refetchQueries: mockRefetchQueries,
};
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueWarningSnackBar = jest.fn();
const mockUseFindManyRecords = jest.fn();

jest.mock('@/object-record/hooks/useBatchCreateManyRecords', () => ({
  useBatchCreateManyRecords: (args: unknown) =>
    mockUseBatchCreateManyRecords(args),
}));

jest.mock('@/object-record/hooks/useDestroyManyRecords', () => ({
  useDestroyManyRecords: (args: unknown) => mockUseDestroyManyRecords(args),
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'creator-object' },
  }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueWarningSnackBar: mockEnqueueWarningSnackBar,
  }),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (args: unknown) => mockUseFindManyRecords(args),
}));

const creatorListTarget = {
  kind: 'creator-list' as const,
  id: 'list-a',
  label: 'Spring creators',
};

describe('buildCreatorBulkRelationshipPreview', () => {
  it('separates linked and unlinked creators and retains only matched membership IDs', () => {
    expect(
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds: ['creator-a', 'creator-b', 'creator-c'],
        relationshipRecords: [
          { id: 'membership-b', creatorId: 'creator-b' },
          { id: 'membership-c', creatorId: 'creator-c' },
        ],
      }),
    ).toEqual({
      selectedCreatorIds: ['creator-a', 'creator-b', 'creator-c'],
      linkedCreatorIds: ['creator-b', 'creator-c'],
      unlinkedCreatorIds: ['creator-a'],
      relationshipRecordIds: ['membership-b', 'membership-c'],
    });
  });

  it('returns no actionable membership IDs for an empty selection', () => {
    expect(
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds: [],
        relationshipRecords: [{ id: 'membership-a', creatorId: 'creator-a' }],
      }),
    ).toEqual({
      selectedCreatorIds: [],
      linkedCreatorIds: [],
      unlinkedCreatorIds: [],
      relationshipRecordIds: [],
    });
  });
});

describe('useCreatorBulkRelationshipPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries every selected creator and exposes only matching relationship IDs', () => {
    const selectedCreatorIds = Array.from(
      { length: 61 },
      (_, index) => `creator-${index}`,
    );
    mockUseFindManyRecords.mockReturnValue({
      records: selectedCreatorIds.map((creatorId) => ({
        id: `${creatorId}-membership`,
        __typename: 'CreatorListMember',
        creatorId,
      })),
      loading: false,
      refetch: jest.fn(),
      error: undefined,
      hasReadPermission: true,
    });

    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: creatorListTarget,
        selectedCreatorIds,
      }),
    );

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 61 }),
    );
    expect(result.current.linkedCreatorIds).toEqual(selectedCreatorIds);
    expect(result.current.unlinkedCreatorIds).toEqual([]);
    expect(result.current.relationshipRecordIds).toEqual(
      selectedCreatorIds.map((creatorId) => `${creatorId}-membership`),
    );
    expect(result.current.isPreviewUnavailable).toBe(false);
  });

  it('marks the preview unavailable when the relationship query fails', () => {
    mockUseFindManyRecords.mockReturnValue({
      records: [],
      loading: false,
      error: new Error('network unavailable'),
      hasReadPermission: true,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: creatorListTarget,
        selectedCreatorIds: ['creator-a'],
      }),
    );

    expect(result.current.isPreviewUnavailable).toBe(true);
  });
});

describe('useApplyCreatorBulkRelationship', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchCreateManyRecords.mockResolvedValue([]);
    mockDestroyManyRecords.mockResolvedValue([]);
    mockApolloCoreClient.cache = new InMemoryCache();
    mockRefetchQueries.mockResolvedValue([]);
  });

  it('invalidates a cached inactive Creator List query after creating memberships', async () => {
    const inactiveCreatorListQuery = gql`
      query FindManyCreators($filter: CreatorFilterInput) {
        creators(filter: $filter) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const variables = {
      filter: {
        listMemberships: {
          some: {
            creatorListId: {
              eq: 'list-a',
            },
          },
        },
      },
    };

    mockApolloCoreClient.cache.writeQuery({
      query: inactiveCreatorListQuery,
      variables,
      data: {
        creators: {
          __typename: 'CreatorConnection',
          edges: [],
        },
      },
    });
    mockRefetchQueries.mockImplementationOnce(({ updateCache }) => {
      updateCache(mockApolloCoreClient.cache);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await result.current.applyCreatorBulkRelationship({
      target: creatorListTarget,
      creatorIdsToAdd: ['creator-a', 'creator-c'],
    });

    expect(mockBatchCreateManyRecords).toHaveBeenCalledWith({
      recordsToCreate: [
        { name: '', creatorId: 'creator-a', creatorListId: 'list-a' },
        { name: '', creatorId: 'creator-c', creatorListId: 'list-a' },
      ],
    });
    expect(
      mockApolloCoreClient.cache.diff({
        query: inactiveCreatorListQuery,
        variables,
        optimistic: false,
        returnPartialData: true,
      }).complete,
    ).toBe(false);
  });

  it('keeps successful creation complete when cache refresh fails', async () => {
    mockRefetchQueries.mockRejectedValueOnce(new Error('network unavailable'));
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await expect(
      result.current.applyCreatorBulkRelationship({
        target: {
          kind: 'campaign',
          id: 'campaign-a',
          label: 'Spring campaign',
        },
        creatorIdsToAdd: ['creator-a'],
      }),
    ).resolves.toBeUndefined();

    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Failed to refresh creator relationships.',
    });
  });

  it('does not mutate when there are no creators to add', async () => {
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await result.current.applyCreatorBulkRelationship({
      target: creatorListTarget,
      creatorIdsToAdd: [],
    });

    expect(mockBatchCreateManyRecords).not.toHaveBeenCalled();
    expect(mockRefetchQueries).not.toHaveBeenCalled();
  });

  it('destroys only previewed Creator List membership records and refreshes the filtered Creator table', async () => {
    mockDestroyManyRecords.mockResolvedValue([
      { id: 'membership-a' },
      { id: 'membership-c' },
    ]);
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await expect(
      result.current.removeCreatorListMembers({
        creatorListId: 'list-a',
        creatorListMemberIdsToRemove: ['membership-a', 'membership-c'],
        creatorIdsToRemove: [],
      }),
    ).resolves.toEqual({ removedCount: 2, wasPartial: false });

    expect(mockDestroyManyRecords).toHaveBeenCalledWith({
      recordIdsToDestroy: ['membership-a', 'membership-c'],
      skipOptimisticEffect: true,
    });
    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: ['FindManyCreators', 'FindManyCreatorListMembers'],
      updateCache: expect.any(Function),
    });
  });

  it('warns when a membership disappears after preview without retrying another deletion', async () => {
    mockDestroyManyRecords.mockResolvedValue([]);
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await expect(
      result.current.removeCreatorListMembers({
        creatorListId: 'list-a',
        creatorListMemberIdsToRemove: ['membership-a'],
        creatorIdsToRemove: [],
      }),
    ).resolves.toEqual({ removedCount: 0, wasPartial: true });

    expect(mockEnqueueWarningSnackBar).toHaveBeenCalledWith({
      message: 'Some creators were already absent from this list.',
    });
    expect(mockDestroyManyRecords).toHaveBeenCalledTimes(1);
  });

  it('keeps removal available for retry when membership destruction fails', async () => {
    mockDestroyManyRecords.mockRejectedValueOnce(
      new Error('network unavailable'),
    );
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await expect(
      result.current.removeCreatorListMembers({
        creatorListId: 'list-a',
        creatorListMemberIdsToRemove: ['membership-a'],
        creatorIdsToRemove: [],
      }),
    ).rejects.toThrow('Creator List membership removal failed');

    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Failed to remove creators from this list.',
    });
  });
});
