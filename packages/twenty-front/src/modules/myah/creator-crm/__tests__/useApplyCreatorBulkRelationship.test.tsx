import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client';
import { act, renderHook } from '@testing-library/react';
import { Observable } from 'rxjs';

import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useApplyCreatorBulkRelationship } from '@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship';

const mockModify = jest.fn();
const mockUseApolloCoreClient = jest.fn();
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
  useApolloCoreClient: () => mockUseApolloCoreClient(),
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
    mockUseApolloCoreClient.mockReturnValue({
      cache: { modify: mockModify },
      refetchQueries: mockRefetchQueries,
    });
    mockAddCreatorListMembersIntent.mockResolvedValue({ data: {} });
    mockRemoveCreatorListMemberIntent.mockResolvedValue({ data: {} });
    mockAddDirectCampaignCreators.mockResolvedValue({ data: {} });
    mockUseMutation
      .mockReturnValueOnce([mockAddCreatorListMembersIntent])
      .mockReturnValueOnce([mockRemoveCreatorListMemberIntent])
      .mockReturnValueOnce([mockAddDirectCampaignCreators]);
  });

  it('notifies filtered Creator indexes only after new List membership is committed', async () => {
    let completeMembership: (() => void) | undefined;
    mockAddCreatorListMembersIntent.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeMembership = resolve;
        }),
    );
    const { result } = renderHook(() => useApplyCreatorBulkRelationship());
    let addition: Promise<void>;
    act(() => {
      addition = result.current.applyCreatorBulkRelationship({
        target: { kind: 'creator-list', id: 'list-1', label: 'List' },
        creatorIdsToAdd: ['creator-1'],
      });
    });
    expect(
      mockDispatchObjectRecordOperationBrowserEvent,
    ).not.toHaveBeenCalled();
    await act(async () => {
      completeMembership?.();
      await addition;
    });
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

    expect(executionOrder).toEqual(['modify', 'refetch', 'dispatch']);
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

  it('refreshes live Creator data without executing skipped empty-ID queries', async () => {
    const query = gql`
      query FindManyCreators($filter: CreatorFilterInput!) {
        creators(filter: $filter) {
          id
          name
        }
      }
    `;
    const variables = { filter: { id: { in: ['creator-1'] } } };
    const refreshedData = {
      creators: [{ id: 'creator-1', name: 'Updated Creator' }],
    };
    const requestedCreatorIds: string[][] = [];
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        (operation) =>
          new Observable((observer) => {
            const creatorIds = operation.variables.filter.id.in as string[];
            requestedCreatorIds.push(creatorIds);
            observer.next(
              creatorIds.length === 0
                ? {
                    errors: [
                      {
                        message:
                          'Invalid filter value for field id. Expected non-empty array',
                      },
                    ],
                  }
                : { data: refreshedData },
            );
            observer.complete();
          }),
      ),
    });
    client.writeQuery({
      query,
      variables,
      data: { creators: [{ id: 'creator-1', name: 'Before refresh' }] },
    });
    const liveQuery = client.watchQuery({ query, variables });
    const skippedQuery = client.watchQuery({
      query,
      variables: { filter: { id: { in: [] } } },
      fetchPolicy: 'standby',
    });
    const subscriptions = [liveQuery.subscribe({}), skippedQuery.subscribe({})];
    mockUseApolloCoreClient.mockReturnValue(client);

    try {
      const { result } = renderHook(() => useApplyCreatorBulkRelationship());
      await act(async () => {
        await result.current.applyCreatorBulkRelationship({
          target: { kind: 'creator-list', id: 'list-1', label: 'List' },
          creatorIdsToAdd: ['creator-1'],
        });
      });

      expect(liveQuery.getCurrentResult().data).toEqual(refreshedData);
      expect(requestedCreatorIds).toEqual([['creator-1']]);
      expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
    } finally {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      client.stop();
    }
  });
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
