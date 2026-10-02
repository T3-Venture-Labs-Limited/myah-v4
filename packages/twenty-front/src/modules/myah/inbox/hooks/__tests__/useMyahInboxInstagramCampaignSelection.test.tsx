import { act, renderHook } from '@testing-library/react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useMyahInboxInstagramCampaignSelection } from '@/myah/inbox/hooks/useMyahInboxInstagramCampaignSelection';

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));

const mockUseFindManyRecords = jest.mocked(useFindManyRecords);

type FixtureState = {
  records: Array<Record<string, unknown>>;
  loading?: boolean;
  error?: Error;
  hasReadPermission?: boolean;
  hasNextPage?: boolean;
  isFetchingMoreRecords?: boolean;
  fetchMoreRecords?: jest.Mock;
};

let campaignCreatorState: FixtureState;
let campaignState: FixtureState;

const emptyFindManyResult = () => ({
  objectMetadataItem: {},
  records: [],
  totalCount: 0,
  loading: false,
  hasReadPermission: true,
  error: undefined,
  fetchMoreRecords: jest.fn().mockResolvedValue({}),
  queryIdentifier: '',
  hasNextPage: false,
  isFetchingMoreRecords: false,
  pageInfo: undefined,
  refetch: jest.fn(),
});

const toFindManyResult = (state: FixtureState) => ({
  ...emptyFindManyResult(),
  records: state.records,
  loading: state.loading ?? false,
  error: state.error,
  hasReadPermission: state.hasReadPermission ?? true,
  hasNextPage: state.hasNextPage ?? false,
  isFetchingMoreRecords: state.isFetchingMoreRecords ?? false,
  fetchMoreRecords: state.fetchMoreRecords ?? jest.fn().mockResolvedValue({}),
});

let sequence = 0;
const nextScope = () => {
  sequence += 1;
  return {
    workspaceId: `workspace-${sequence}`,
    contactId: `contact-${sequence}`,
    conversationId: `conversation-${sequence}`,
    creatorId: `creator-${sequence}`,
  };
};

describe('useMyahInboxInstagramCampaignSelection', () => {
  beforeEach(() => {
    campaignCreatorState = { records: [] };
    campaignState = { records: [] };
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular, skip }) => {
        if (skip) return emptyFindManyResult() as never;
        const state =
          objectNameSingular === 'campaignCreator'
            ? campaignCreatorState
            : campaignState;
        return toFindManyResult(state) as never;
      },
    );
  });

  it('fails closed when the Creator is unlinked', () => {
    const scope = nextScope();
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection({ ...scope, creatorId: null }),
    );
    expect(result.current.status).toBe('unavailable');
    expect(result.current.options).toEqual([]);
    expect(result.current.selectedCampaignId).toBeNull();
    expect(result.current.unavailableReason).toMatch(/Link this Instagram/);
  });

  it('fails closed when Campaign membership permission is unavailable', () => {
    const scope = nextScope();
    campaignCreatorState = { records: [], hasReadPermission: false };
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    expect(result.current.status).toBe('unavailable');
    expect(result.current.unavailableReason).toMatch(/could not be read/);
  });

  it('fails closed when Campaign pagination read fails', async () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-1', __typename: 'CampaignCreator' },
      ],
      hasNextPage: true,
      fetchMoreRecords: jest
        .fn()
        .mockResolvedValue({ error: new Error('boom') }),
    };
    campaignState = {
      records: [{ id: 'campaign-1', name: 'Alpha', __typename: 'Campaign' }],
    };
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    expect(result.current.status).toBe('loading');
    await act(async () => {});
    expect(result.current.status).toBe('unavailable');
    expect(result.current.unavailableReason).toMatch(/could not be read/);
  });

  it('lists only readable non-deleted Campaigns and drops a stale unreadable membership', () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-b', __typename: 'CampaignCreator' },
        { id: 'cc-2', campaignId: 'campaign-a', __typename: 'CampaignCreator' },
        {
          id: 'cc-3',
          campaignId: 'campaign-deleted',
          __typename: 'CampaignCreator',
        },
      ],
    };
    campaignState = {
      records: [
        { id: 'campaign-b', name: 'Beta', __typename: 'Campaign' },
        { id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' },
      ],
    };
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.options).toEqual([
      { value: 'campaign-a', label: 'Alpha' },
      { value: 'campaign-b', label: 'Beta' },
    ]);
  });

  it('auto-selects a single readable Campaign', () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-a', __typename: 'CampaignCreator' },
      ],
    };
    campaignState = {
      records: [{ id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' }],
    };
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    expect(result.current.selectedCampaignId).toBe('campaign-a');
  });

  it('requires an explicit choice when several Campaigns are readable', () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-a', __typename: 'CampaignCreator' },
        { id: 'cc-2', campaignId: 'campaign-b', __typename: 'CampaignCreator' },
      ],
    };
    campaignState = {
      records: [
        { id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' },
        { id: 'campaign-b', name: 'Beta', __typename: 'Campaign' },
      ],
    };
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    expect(result.current.selectedCampaignId).toBeNull();

    act(() => result.current.onSelectCampaign('campaign-b'));
    expect(result.current.selectedCampaignId).toBe('campaign-b');
  });

  it('clears a selection that disappears from refreshed options without substituting another', () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-a', __typename: 'CampaignCreator' },
        { id: 'cc-2', campaignId: 'campaign-b', __typename: 'CampaignCreator' },
      ],
    };
    campaignState = {
      records: [
        { id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' },
        { id: 'campaign-b', name: 'Beta', __typename: 'Campaign' },
      ],
    };
    const { result, rerender } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    act(() => result.current.onSelectCampaign('campaign-b'));
    expect(result.current.selectedCampaignId).toBe('campaign-b');

    campaignState = {
      records: [{ id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' }],
    };
    rerender();
    expect(result.current.selectedCampaignId).toBeNull();
  });

  it('survives a guidance round trip by keeping the selection for the exact same scope', () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-a', __typename: 'CampaignCreator' },
        { id: 'cc-2', campaignId: 'campaign-b', __typename: 'CampaignCreator' },
      ],
    };
    campaignState = {
      records: [
        { id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' },
        { id: 'campaign-b', name: 'Beta', __typename: 'Campaign' },
      ],
    };
    const { result, unmount } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    act(() => result.current.onSelectCampaign('campaign-b'));
    unmount();

    const { result: remounted } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    expect(remounted.current.selectedCampaignId).toBe('campaign-b');
  });

  it('scopes selection to the exact conversation so a different conversation starts unselected', () => {
    const scope = nextScope();
    campaignCreatorState = {
      records: [
        { id: 'cc-1', campaignId: 'campaign-a', __typename: 'CampaignCreator' },
        { id: 'cc-2', campaignId: 'campaign-b', __typename: 'CampaignCreator' },
      ],
    };
    campaignState = {
      records: [
        { id: 'campaign-a', name: 'Alpha', __typename: 'Campaign' },
        { id: 'campaign-b', name: 'Beta', __typename: 'Campaign' },
      ],
    };
    const { result } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection(scope),
    );
    act(() => result.current.onSelectCampaign('campaign-b'));

    const { result: otherConversation } = renderHook(() =>
      useMyahInboxInstagramCampaignSelection({
        ...scope,
        conversationId: `${scope.conversationId}-other`,
      }),
    );
    expect(otherConversation.current.selectedCampaignId).toBeNull();
  });
});
