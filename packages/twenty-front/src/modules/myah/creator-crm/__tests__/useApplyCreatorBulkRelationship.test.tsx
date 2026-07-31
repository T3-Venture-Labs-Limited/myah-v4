import { act, renderHook } from '@testing-library/react';

import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';

const mockModify = jest.fn();
const mockEvict = jest.fn();
const mockRefetchQueries = jest.fn();
const mockDestroyCreatorListMembers = jest.fn();
const mockBatchCreateCreatorListMembers = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueWarningSnackBar = jest.fn();
const mockCreatorObjectMetadataItem = {
  id: 'creator-object-metadata-id',
  nameSingular: 'creator',
};

jest.mock(
  '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent',
  () => ({
    dispatchObjectRecordOperationBrowserEvent: jest.fn(),
  }),
);

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({
    cache: {
      modify: mockModify,
    },
    refetchQueries: mockRefetchQueries,
  }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: mockCreatorObjectMetadataItem,
  }),
}));

jest.mock('@/object-record/hooks/useDestroyManyRecords', () => ({
  useDestroyManyRecords: () => ({
    destroyManyRecords: mockDestroyCreatorListMembers,
  }),
}));

jest.mock('@/object-record/hooks/useBatchCreateManyRecords', () => ({
  useBatchCreateManyRecords: () => ({
    batchCreateManyRecords: mockBatchCreateCreatorListMembers,
  }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueWarningSnackBar: mockEnqueueWarningSnackBar,
  }),
}));

describe('useApplyCreatorBulkRelationship', () => {
  const mockDispatchObjectRecordOperationBrowserEvent = jest.mocked(
    dispatchObjectRecordOperationBrowserEvent,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroyCreatorListMembers.mockResolvedValue(['membership-1']);
  });

  it('refreshes live List results and resets the contextual Creator table after removal', async () => {
    const executionOrder: string[] = [];
    mockRefetchQueries.mockImplementationOnce(() => {
      executionOrder.push('refetch');
      return Promise.resolve();
    });
    mockModify.mockImplementationOnce(() => {
      executionOrder.push('modify');
    });
    mockDispatchObjectRecordOperationBrowserEvent.mockImplementationOnce(() => {
      executionOrder.push('dispatch');
    });
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await act(async () => {
      await result.current.removeCreatorListMembers({
        creatorListId: 'list-1',
        creatorListMemberIdsToRemove: ['membership-1'],
        creatorIdsToRemove: ['creator-1'],
      });
    });

    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: ['FindManyCreators', 'FindManyCreatorListMembers'],
      updateCache: expect.any(Function),
    });
    expect(executionOrder).toEqual(['modify', 'refetch', 'dispatch']);
    const updateCache = mockRefetchQueries.mock.calls[0][0].updateCache;
    updateCache({ evict: mockEvict });
    expect(mockEvict).toHaveBeenCalledWith({ fieldName: 'creators' });
    expect(mockDispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledWith({
      objectMetadataItem: mockCreatorObjectMetadataItem,
      operation: {
        type: 'update-many',
        result: {
          updateInputs: [
            {
              recordId: 'creator-1',
              updatedFields: [{ listMemberships: null }],
            },
          ],
        },
      },
    });

    const modifyCreators = mockModify.mock.calls[0][0].fields.creators;
    const existingCreatorConnection = {
      edges: [{ node: { id: 'creator-1' } }, { node: { id: 'creator-2' } }],
      totalCount: 2,
    };
    const readField = (fieldName: string, node: { id: string }) =>
      fieldName === 'id' ? node.id : undefined;

    expect(
      modifyCreators(existingCreatorConnection, {
        readField,
        storeFieldName:
          'creators({"filter":{"listMemberships":{"creatorListId":{"in":["list-1"]}}}})',
      }),
    ).toEqual({
      edges: [{ node: { id: 'creator-2' } }],
      totalCount: 2,
    });
    expect(
      modifyCreators(existingCreatorConnection, {
        readField,
        storeFieldName: 'creators({"filter":{}})',
      }),
    ).toBe(existingCreatorConnection);
    expect(
      modifyCreators(undefined, {
        readField,
        storeFieldName:
          'creators({"filter":{"listMemberships":{"creatorListId":{"in":["list-1"]}}}})',
      }),
    ).toBeUndefined();
  });

  it('prunes a cached List table with a combined native filter after removal', async () => {
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await act(async () => {
      await result.current.removeCreatorListMembers({
        creatorListId: 'list-1',
        creatorListMemberIdsToRemove: ['membership-1'],
        creatorIdsToRemove: ['creator-1'],
      });
    });

    const modifyCreators = mockModify.mock.calls[0][0].fields.creators;
    const existingCreatorConnection = {
      edges: [{ node: { id: 'creator-1' } }, { node: { id: 'creator-2' } }],
    };
    const readField = (fieldName: string, node: { id: string }) =>
      fieldName === 'id' ? node.id : undefined;

    expect(
      modifyCreators(existingCreatorConnection, {
        readField,
        storeFieldName:
          'creators({"filter":{"and":[{"listMemberships":{"creatorListId":{"in":["list-1"]}}},{"name":{"eq":"Ada"}}]}})',
      }),
    ).toEqual({ edges: [{ node: { id: 'creator-2' } }] });
  });

  it('does not report removal success when refreshing relationships fails', async () => {
    mockRefetchQueries.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await act(async () => {
      await expect(
        result.current.removeCreatorListMembers({
          creatorListId: 'list-1',
          creatorListMemberIdsToRemove: ['membership-1'],
          creatorIdsToRemove: ['creator-1'],
        }),
      ).rejects.toThrow('Creator List membership refresh failed');
    });

    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Failed to refresh creator relationships.',
    });
    expect(
      mockDispatchObjectRecordOperationBrowserEvent,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      target: { kind: 'creator-list' as const, id: 'list-1', label: 'List' },
      relationshipObjectNamePlural: 'creatorListMembers',
      relationshipFindManyQueryName: 'FindManyCreatorListMembers',
    },
    {
      target: {
        kind: 'campaign' as const,
        id: 'campaign-1',
        label: 'Campaign',
      },
      relationshipObjectNamePlural: 'campaignCreators',
      relationshipFindManyQueryName: 'FindManyCampaignCreators',
    },
  ])(
    'invalidates $relationshipObjectNamePlural after adding creators',
    async ({
      target,
      relationshipObjectNamePlural,
      relationshipFindManyQueryName,
    }) => {
      const { result } = renderHook(() => useApplyCreatorBulkRelationship());

      await act(async () => {
        await result.current.applyCreatorBulkRelationship({
          target,
          creatorIdsToAdd: ['creator-1'],
        });
      });

      expect(mockRefetchQueries).toHaveBeenCalledWith({
        include: ['FindManyCreators', relationshipFindManyQueryName],
        updateCache: expect.any(Function),
      });
      const updateCache = mockRefetchQueries.mock.calls[0][0].updateCache;
      updateCache({ evict: mockEvict });

      expect(mockEvict).toHaveBeenCalledWith({ fieldName: 'creators' });
      expect(mockEvict).toHaveBeenCalledWith({
        fieldName: relationshipObjectNamePlural,
      });
    },
  );
});
