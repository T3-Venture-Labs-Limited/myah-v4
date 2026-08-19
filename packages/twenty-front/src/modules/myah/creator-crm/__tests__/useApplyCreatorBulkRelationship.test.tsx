import { act, renderHook } from '@testing-library/react';

import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';

const mockModify = jest.fn();
const mockEvict = jest.fn();
const mockRefetchQueries = jest.fn();
const mockAddCreatorListMembersIntent = jest.fn();
const mockRemoveCreatorListMemberIntent = jest.fn();
const mockAddDirectCampaignCreators = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueWarningSnackBar = jest.fn();
const mockUseMutation = jest.fn();
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

jest.mock('@apollo/client/react', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

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
    mockAddCreatorListMembersIntent.mockResolvedValue({ data: {} });
    mockRemoveCreatorListMemberIntent.mockResolvedValue({ data: {} });
    mockAddDirectCampaignCreators.mockResolvedValue({ data: {} });
    mockUseMutation
      .mockReturnValueOnce([mockAddCreatorListMembersIntent])
      .mockReturnValueOnce([mockRemoveCreatorListMemberIntent])
      .mockReturnValueOnce([mockAddDirectCampaignCreators]);
  });

  it('uses the current shared membership input type for bulk removal', () => {
    renderHook(() => useApplyCreatorBulkRelationship());

    expect(mockUseMutation.mock.calls[1][0].loc.source.body).toContain(
      '$input: CreatorListMembershipIntentInput!',
    );
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
      include: [
        'active',
        'inactive',
        'FindManyCreators',
        'FindManyCreatorListMembers',
        'FindManyCampaignCreators',
      ],
      updateCache: expect.any(Function),
    });
    expect(executionOrder).toEqual(['modify', 'refetch', 'dispatch']);
    const updateCache = mockRefetchQueries.mock.calls[0][0].updateCache;
    updateCache({ evict: mockEvict });
    expect(mockEvict).toHaveBeenCalledWith({ fieldName: 'creators' });
    expect(mockEvict).toHaveBeenCalledWith({ fieldName: 'creatorListMembers' });
    expect(mockEvict).toHaveBeenCalledWith({ fieldName: 'campaignCreators' });
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
      relationshipObjectNamesPlural: ['creatorListMembers', 'campaignCreators'],
      relationshipFindManyQueryNames: [
        'FindManyCreatorListMembers',
        'FindManyCampaignCreators',
      ],
    },
    {
      target: {
        kind: 'campaign' as const,
        id: 'campaign-1',
        label: 'Campaign',
      },
      relationshipObjectNamesPlural: ['campaignCreators'],
      relationshipFindManyQueryNames: ['FindManyCampaignCreators'],
    },
  ])(
    'invalidates $relationshipObjectNamesPlural after adding creators',
    async ({
      target,
      relationshipObjectNamesPlural,
      relationshipFindManyQueryNames,
    }) => {
      const { result } = renderHook(() => useApplyCreatorBulkRelationship());

      await act(async () => {
        await result.current.applyCreatorBulkRelationship({
          target,
          creatorIdsToAdd: ['creator-1'],
        });
      });

      expect(mockRefetchQueries).toHaveBeenCalledWith({
        include: [
          'active',
          'inactive',
          'FindManyCreators',
          ...relationshipFindManyQueryNames,
        ],
        updateCache: expect.any(Function),
      });
      const updateCache = mockRefetchQueries.mock.calls[0][0].updateCache;
      updateCache({ evict: mockEvict });

      expect(mockEvict).toHaveBeenCalledWith({ fieldName: 'creators' });
      for (const fieldName of relationshipObjectNamesPlural) {
        expect(mockEvict).toHaveBeenCalledWith({ fieldName });
      }
    },
  );
  it('adds direct campaign creators without a mailbox assignment', async () => {
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());

    await act(async () => {
      await result.current.applyCreatorBulkRelationship({
        target: { kind: 'campaign', id: 'campaign-1', label: 'Campaign' },
        creatorIdsToAdd: ['creator-1', 'creator-2'],
      });
    });

    expect(mockAddDirectCampaignCreators).toHaveBeenCalledWith({
      variables: {
        input: {
          campaignId: 'campaign-1',
          creatorIds: ['creator-1', 'creator-2'],
        },
      },
    });
  });
});
