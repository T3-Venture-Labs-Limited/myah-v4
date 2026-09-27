import { fireEvent, render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { CampaignPortfolioList } from '@/myah/campaign/components/CampaignPortfolioList';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';

jest.mock('@/apollo/utils/getTokenPair', () => ({ getTokenPair: jest.fn() }));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      id: 'campaign-metadata',
      fields: [
        { name: 'name', id: 'name-field' },
        { name: 'lifecycleStatus', id: 'lifecycle-field' },
      ],
    },
  }),
}));

const fetchMore = jest.fn();
const refetch = jest.fn();
const renderPortfolio = () => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: 'workspace-1' } as never);
  store.set(currentUserState.atom, { id: 'user-1' } as never);
  store.set(currentWorkspaceMemberState.atom, {
    id: 'member-1',
    userWorkspaceId: 'uw-1',
  } as never);
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CampaignPortfolioList />
      </MemoryRouter>
    </Provider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getTokenPair).mockReturnValue({
    accessOrWorkspaceAgnosticToken: {
      token: `x.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId: 'workspace-1', userId: 'user-1', userWorkspaceId: 'uw-1' }))}.y`,
    },
  } as never);
  jest.mocked(useObjectPermissionsForObject).mockReturnValue({
    canReadObjectRecords: true,
    restrictedFields: {},
  } as never);
  jest.mocked(useFindManyRecords).mockReturnValue({
    records: [
      {
        id: 'campaign-1',
        name: 'Autumn studio launch',
        lifecycleStatus: 'PAUSED',
      },
    ],
    totalCount: 2,
    loading: false,
    error: undefined,
    hasReadPermission: true,
    hasNextPage: true,
    isFetchingMoreRecords: false,
    fetchMoreRecords: fetchMore,
    refetch,
  } as never);
});

it('renders a navigable portfolio without inventing per-Campaign partnership totals', () => {
  renderPortfolio();
  expect(
    screen.getByRole('link', { name: 'Autumn studio launch' }),
  ).toHaveAttribute('href', expect.stringContaining('campaign-1'));
  expect(screen.getByText('PAUSED')).toBeVisible();
  expect(screen.getByText('Contacting')).toBeVisible();
  expect(
    screen.getByText(/Partnership counts are not yet available/),
  ).toBeVisible();
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      objectNameSingular: 'campaign',
      skip: false,
      recordGqlFields: { id: true, name: true, lifecycleStatus: true },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Load more campaigns' }));
  expect(fetchMore).toHaveBeenCalledTimes(1);
});

it('does not request a restricted field or show a cached name', () => {
  jest.mocked(useObjectPermissionsForObject).mockReturnValue({
    canReadObjectRecords: true,
    restrictedFields: { 'name-field': { canRead: false } },
  } as never);
  renderPortfolio();
  expect(screen.queryByText('Autumn studio launch')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Campaign' })).toBeVisible();
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      recordGqlFields: { id: true, lifecycleStatus: true },
    }),
  );
});
