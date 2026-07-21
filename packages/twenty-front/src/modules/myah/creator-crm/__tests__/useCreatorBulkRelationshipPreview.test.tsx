import { renderHook } from '@testing-library/react';

import {
  buildCreatorBulkRelationshipPreview,
  useCreatorBulkRelationshipPreview,
} from '@/myah/creator-crm/hooks/useCreatorBulkRelationshipPreview';
import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';

const mockBatchCreateManyRecords = jest.fn();
const mockUseBatchCreateManyRecords = jest.fn((_args: unknown) => ({
  batchCreateManyRecords: mockBatchCreateManyRecords,
}));
const mockRefetchQueries = jest.fn();
const mockUseFindManyRecords = jest.fn();

jest.mock('@/object-record/hooks/useBatchCreateManyRecords', () => ({
  useBatchCreateManyRecords: (args: unknown) =>
    mockUseBatchCreateManyRecords(args),
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ refetchQueries: mockRefetchQueries }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (args: unknown) => mockUseFindManyRecords(args),
}));

describe('buildCreatorBulkRelationshipPreview', () => {
  it('separates missing and existing creator links', () => {
    expect(
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds: ['creator-a', 'creator-b', 'creator-c'],
        existingCreatorIds: new Set(['creator-b']),
      }),
    ).toEqual({
      selectedCreatorIds: ['creator-a', 'creator-b', 'creator-c'],
      creatorIdsToAdd: ['creator-a', 'creator-c'],
      alreadyLinkedCreatorIds: ['creator-b'],
    });
  });

  it('returns no additions for an empty selection', () => {
    expect(
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds: [],
        existingCreatorIds: new Set(['creator-a']),
      }),
    ).toEqual({
      selectedCreatorIds: [],
      creatorIdsToAdd: [],
      alreadyLinkedCreatorIds: [],
    });
  });

  it('skips every selected creator already linked to the target', () => {
    expect(
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds: ['creator-a', 'creator-b'],
        existingCreatorIds: new Set(['creator-a', 'creator-b']),
      }),
    ).toEqual({
      selectedCreatorIds: ['creator-a', 'creator-b'],
      creatorIdsToAdd: [],
      alreadyLinkedCreatorIds: ['creator-a', 'creator-b'],
    });
  });
});

describe('useCreatorBulkRelationshipPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries every selected creator when more than the default page size are selected', () => {
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
    });

    const { result } = renderHook(() =>
      useCreatorBulkRelationshipPreview({
        target: {
          kind: 'creator-list',
          id: 'list-a',
          label: 'Spring creators',
        },
        selectedCreatorIds,
      }),
    );

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 61 }),
    );
    expect(result.current.creatorIdsToAdd).toEqual([]);
    expect(result.current.alreadyLinkedCreatorIds).toEqual(selectedCreatorIds);
  });
});

describe('useApplyCreatorBulkRelationship', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchCreateManyRecords.mockResolvedValue([]);
    mockRefetchQueries.mockResolvedValue([]);
  });

  it('creates only missing creator-list membership rows', async () => {
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await result.current.applyCreatorBulkRelationship({
      target: {
        kind: 'creator-list',
        id: 'list-a',
        label: 'Spring creators',
      },
      creatorIdsToAdd: ['creator-a', 'creator-c'],
    });

    expect(mockBatchCreateManyRecords).toHaveBeenCalledWith({
      recordsToCreate: [
        { name: '', creatorId: 'creator-a', creatorListId: 'list-a' },
        { name: '', creatorId: 'creator-c', creatorListId: 'list-a' },
      ],
    });
    expect(mockRefetchQueries).toHaveBeenCalled();
  });

  it('does not mutate when there are no missing creators', async () => {
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await result.current.applyCreatorBulkRelationship({
      target: {
        kind: 'campaign',
        id: 'campaign-a',
        label: 'Spring campaign',
      },
      creatorIdsToAdd: [],
    });

    expect(mockBatchCreateManyRecords).not.toHaveBeenCalled();
    expect(mockRefetchQueries).not.toHaveBeenCalled();
  });
});
