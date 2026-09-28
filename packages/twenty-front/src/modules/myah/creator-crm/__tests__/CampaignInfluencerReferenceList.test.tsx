import { fireEvent, render, screen } from '@testing-library/react';
import { CampaignInfluencerReferenceList } from '@/myah/creator-crm/components/CampaignInfluencerReferenceList';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(),
}));

const onOpen = jest.fn();
const fetchMore = jest.fn();
const refetch = jest.fn();
const records = [
  {
    id: 'membership-1',
    campaignId: 'campaign-1',
    creatorId: 'creator-1',
    stage: 'NEGOTIATING',
    creator: {
      id: 'creator-1',
      name: 'Ava Rivera',
      instagramUsername: 'ava.studio',
    },
  },
];

const setup = (overrides: Record<string, unknown> = {}) => {
  (useFindManyRecords as jest.Mock).mockReturnValue({
    records,
    totalCount: 3,
    loading: false,
    error: undefined,
    hasReadPermission: true,
    hasNextPage: true,
    isFetchingMoreRecords: false,
    fetchMoreRecords: fetchMore,
    refetch,
    ...overrides,
  });
  return render(
    <CampaignInfluencerReferenceList
      campaignId="campaign-1"
      campaignCreatorMetadataId="membership-metadata"
      creatorMetadataId="creator-metadata"
      creatorFieldIds={{
        name: 'name-field',
        instagramUsername: 'handle-field',
      }}
      stageOptions={[{ value: 'NEGOTIATING', label: 'Negotiating' }]}
      onOpenCreatorContext={onOpen}
    />,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  (useObjectMetadataItems as jest.Mock).mockReturnValue({
    objectMetadataItems: [
      {
        id: 'membership-metadata',
        nameSingular: 'campaignCreator',
        fields: [{ id: 'stage-field', name: 'stage' }],
      },
    ],
  });
  (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
    canReadObjectRecords: true,
  });
});

it('renders only permission-scoped Campaign rows with recorded metadata stage, search, and load more', () => {
  setup();
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      objectNameSingular: 'campaignCreator',
      filter: { campaignId: { eq: 'campaign-1' } },
    }),
  );
  expect(screen.getByText('Partnership stage')).toBeVisible();
  expect(screen.getByText('Outreach progress')).toBeVisible();
  expect(screen.getByText('Latest activity')).toBeVisible();
  const row = screen.getByRole('button', { name: /Ava Rivera/ });
  expect(row).toHaveTextContent('@ava.studio');
  expect(row).toHaveTextContent('Negotiating');
  expect(row).toHaveTextContent('Not available yet');
  fireEvent.click(row);
  expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(onOpen).toHaveBeenCalledWith({
    recordId: 'membership-1',
    source: 'table-identifier-action',
    activationElement: row,
  });
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search loaded influencers' }),
    {
      target: { value: 'other' },
    },
  );
  expect(screen.getByText(/No matches in loaded influencers/)).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Load more influencers' }),
  );
  expect(fetchMore).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/1 loaded of 3/)).toBeVisible();
});

it('does not misrepresent an incomplete or failed page as an empty campaign', () => {
  const view = setup({ records: [], totalCount: undefined, loading: true });
  expect(screen.getByRole('status')).toHaveTextContent('Loading influencers');
  view.unmount();
  setup({
    records: [],
    totalCount: undefined,
    error: new Error('offline'),
    hasNextPage: false,
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Unable to load influencers',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry influencers' }));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByText('No influencers in this Campaign.'),
  ).not.toBeInTheDocument();
});

it('keeps already loaded rows visible while fetching the next page', () => {
  setup({ loading: true, isFetchingMoreRecords: true });
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Loading more influencers…' }),
  ).toBeDisabled();
});

it('hides cached rows when membership or Creator read permission is revoked', () => {
  (useObjectPermissionsForObject as jest.Mock).mockImplementation(
    (id: string) => ({
      canReadObjectRecords: id !== 'creator-metadata',
    }),
  );
  setup();
  expect(screen.queryByText('Ava Rivera')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Creator unavailable/ }),
  ).toBeVisible();
});

it('does not request or show restricted Creator identity fields', () => {
  (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
    canReadObjectRecords: true,
    restrictedFields: {
      'name-field': { canRead: false },
      'handle-field': { canRead: false },
    },
  });
  setup();
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      recordGqlFields: expect.objectContaining({ creator: { id: true } }),
    }),
  );
  expect(screen.queryByText('Ava Rivera')).not.toBeInTheDocument();
  expect(screen.queryByText('@ava.studio')).not.toBeInTheDocument();
  expect(screen.getByText('Creator unavailable')).toBeVisible();
  expect(
    screen.getByRole('button', { name: /Creator unavailable/ }),
  ).toHaveTextContent('?');
});

it('keeps readable membership rows when stage is denied without requesting or displaying cached stage', () => {
  (useObjectPermissionsForObject as jest.Mock).mockImplementation(
    (id: string) => ({
      canReadObjectRecords: true,
      restrictedFields:
        id === 'membership-metadata'
          ? { 'stage-field': { canRead: false } }
          : {},
    }),
  );
  setup();
  expect(
    (useFindManyRecords as jest.Mock).mock.calls[0][0].recordGqlFields,
  ).not.toHaveProperty('stage');
  const row = screen.getByRole('button', { name: /Ava Rivera/ });
  expect(row).toHaveTextContent('Stage unavailable');
  expect(row).not.toHaveTextContent('Negotiating');
});

it('does not display cached audience records after membership read is revoked', () => {
  setup({ hasReadPermission: false });
  expect(screen.getByRole('alert')).toHaveTextContent('do not have permission');
  expect(screen.queryByText('Ava Rivera')).not.toBeInTheDocument();
});
