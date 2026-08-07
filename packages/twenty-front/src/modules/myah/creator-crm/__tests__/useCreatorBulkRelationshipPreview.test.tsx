import { InMemoryCache } from '@apollo/client/cache';

jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  }),
}));
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

  it('treats an existing indirectly sourced CampaignCreator as actionable direct add', () => {
    expect(
      buildCreatorBulkRelationshipPreview({
        selectedCreatorIds: ['creator-a', 'creator-b'],
        targetKind: 'campaign',
        relationshipRecords: [
          {
            id: 'campaign-creator-a',
            creatorId: 'creator-a',
            isDirectlyAdded: false,
          },
          {
            id: 'campaign-creator-b',
            creatorId: 'creator-b',
            isDirectlyAdded: true,
          },
        ],
      }),
    ).toEqual({
      selectedCreatorIds: ['creator-a', 'creator-b'],
      linkedCreatorIds: ['creator-b'],
      unlinkedCreatorIds: ['creator-a'],
      relationshipRecordIds: ['campaign-creator-a', 'campaign-creator-b'],
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
