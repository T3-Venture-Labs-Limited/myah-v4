import { fireEvent, render, screen } from '@testing-library/react';
import { CampaignInfluencerReferenceList } from '@/myah/creator-crm/components/CampaignInfluencerReferenceList';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

const mockAgentReviewRefetch = jest.fn();
const mockAgentReviewQuery = jest.fn(() => ({
  data: undefined,
  refetch: mockAgentReviewRefetch,
}));
const mockReviewListeners: Array<{
  objectMetadataItemId: string;
  onObjectRecordOperationBrowserEvent: () => void;
}> = [];
jest.mock(
  '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent',
  () => ({
    useListenToObjectRecordOperationBrowserEvent: (listener: never) =>
      mockReviewListeners.push(listener),
  }),
);
jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useQuery: (...args: unknown[]) => mockAgentReviewQuery(...(args as [])),
}));
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
const refetch = jest.fn().mockResolvedValue(undefined);
const records = [
  {
    id: 'membership-1',
    campaignId: 'campaign-1',
    creatorId: 'creator-1',
    stage: 'NEGOTIATING',
    creator: {
      id: 'creator-1',
      name: 'Ava Rivera',
    },
  },
];

const fetchMoreProfiles = jest.fn();
const refetchProfiles = jest.fn();
const setup = (
  overrides: Record<string, unknown> = {},
  profileOverrides: Record<string, unknown> = {},
) => {
  (useFindManyRecords as jest.Mock).mockImplementation(
    ({ objectNameSingular }: { objectNameSingular: string }) =>
      objectNameSingular === 'socialProfile'
        ? {
            records: [
              {
                id: 'profile-1',
                creatorId: 'creator-1',
                platform: 'INSTAGRAM',
                handle: 'ava.studio',
              },
            ],
            totalCount: 1,
            loading: false,
            error: undefined,
            hasReadPermission: true,
            hasNextPage: false,
            isFetchingMoreRecords: false,
            fetchMoreRecords: fetchMoreProfiles,
            refetch: refetchProfiles,
            ...profileOverrides,
          }
        : {
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
          },
  );
  return render(
    <CampaignInfluencerReferenceList
      campaignId="campaign-1"
      campaignCreatorMetadataId="membership-metadata"
      creatorMetadataId="creator-metadata"
      creatorFieldIds={{
        name: 'name-field',
        socialProfiles: 'social-profiles-field',
      }}
      socialProfileMetadataId="profile-metadata"
      socialProfileFieldIds={{
        platform: 'platform-field',
        handle: 'handle-field',
        creator: 'profile-creator-field',
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
      { id: 'creator-metadata', nameSingular: 'creator', fields: [] },
      { id: 'profile-metadata', nameSingular: 'socialProfile', fields: [] },
    ],
  });
  (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
    canReadObjectRecords: true,
  });
});

it('shows live sequence progress, a reply badge and status filters', () => {
  mockAgentReviewQuery.mockReturnValue({
    data: {
      myahReplyAgentReview: {
        needReviewCount: 0,
        nodes: [
          {
            campaignCreatorId: 'membership-1',
            nextAction: null,
            outreach: {
              state: 'CONTACTED',
              sentSteps: 1,
              totalSteps: 2,
              nextEligibleAt: '2026-10-05T17:14:00Z',
              reason: null,
            },
          },
          {
            campaignCreatorId: 'membership-2',
            nextAction: null,
            outreach: {
              state: 'REPLIED',
              sentSteps: 1,
              totalSteps: 2,
              nextEligibleAt: null,
              reason: null,
            },
          },
        ],
      },
    },
    refetch: mockAgentReviewRefetch,
  } as never);
  setup({
    records: [
      ...records,
      {
        id: 'membership-2',
        campaignId: 'campaign-1',
        creatorId: 'creator-2',
        stage: 'NEGOTIATING',
        creator: { id: 'creator-2', name: 'Luca Romano' },
      },
    ],
  });
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toHaveTextContent(
    'Step 1 of 2',
  );
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toHaveTextContent(
    'Next eligible',
  );
  expect(screen.getByRole('status')).toHaveTextContent('1 replied');
  fireEvent.change(screen.getByRole('combobox', { name: 'Outreach status' }), {
    target: { value: 'REPLIED' },
  });
  expect(
    screen.queryByRole('button', { name: /Ava Rivera/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Luca Romano/ })).toHaveTextContent(
    'Replied',
  );
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      objectNameSingular: 'campaignCreator',
      filter: {
        campaignId: { eq: 'campaign-1' },
        id: { in: ['membership-2'] },
      },
    }),
  );
  mockAgentReviewQuery.mockReturnValue({
    data: undefined,
    refetch: mockAgentReviewRefetch,
  });
});

it('uses a valid match-nothing filter when no influencers have the selected status', () => {
  setup();
  fireEvent.change(screen.getByRole('combobox', { name: 'Outreach status' }), {
    target: { value: 'REPLIED' },
  });
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      objectNameSingular: 'campaignCreator',
      filter: { campaignId: { eq: 'campaign-1' }, id: { is: 'NULL' } },
    }),
  );
  expect(screen.getByText('No influencers match this status.')).toBeVisible();
});

it('shows why the reply agent needs help without hiding the usage reason in a tooltip', () => {
  mockAgentReviewQuery.mockReturnValue({
    data: {
      myahReplyAgentReview: {
        needReviewCount: 1,
        nodes: [
          {
            campaignCreatorId: 'membership-1',
            creatorId: 'creator-1',
            nextAction: 'NEEDS_YOU',
            reason:
              'Your AI usage is used up. Review Billing, then regenerate, or reply yourself.',
          },
        ],
      },
    },
    refetch: mockAgentReviewRefetch,
  } as never);
  setup();
  expect(
    screen.getByText(
      'Needs you · Your AI usage is used up. Review Billing, then regenerate, or reply yourself.',
    ),
  ).toBeVisible();
});

it('shows current usage wording for runs that failed before MYAH-463', () => {
  mockAgentReviewQuery.mockReturnValue({
    data: {
      myahReplyAgentReview: {
        needReviewCount: 1,
        nodes: [
          {
            campaignCreatorId: 'membership-1',
            creatorId: 'creator-1',
            nextAction: 'NEEDS_YOU',
            reason:
              'AI credit is used up. Add credit, then Regenerate, or reply yourself.',
          },
        ],
      },
    },
    refetch: mockAgentReviewRefetch,
  } as never);
  setup();
  expect(
    screen.getByText(
      'Needs you · Your AI usage is used up. Review Billing, then regenerate, or reply yourself.',
    ),
  ).toBeVisible();
});

it('shows the agent next action and filters to influencers that need review', () => {
  mockAgentReviewQuery.mockReturnValue({
    data: {
      myahReplyAgentReview: {
        needReviewCount: 1,
        nodes: [
          {
            campaignCreatorId: 'membership-1',
            creatorId: 'creator-1',
            nextAction: 'REVIEW_DRAFT',
            reason: null,
            channel: 'INSTAGRAM',
            conversationRecordId: 'conversation-1',
            inboxContactId: 'contact-1',
          },
          {
            campaignCreatorId: 'membership-2',
            creatorId: 'creator-2',
            nextAction: 'SKIPPED',
            reason: 'Skipped: active in Summer SPF drop',
            channel: null,
            conversationRecordId: null,
            inboxContactId: null,
          },
        ],
      },
    },
    refetch: mockAgentReviewRefetch,
  } as never);
  setup({
    records: [
      ...records,
      {
        id: 'membership-2',
        campaignId: 'campaign-1',
        creatorId: 'creator-2',
        stage: 'READY',
        creator: { id: 'creator-2', name: 'Luca Romano' },
      },
    ],
  });

  expect(screen.getByText('Review draft')).toBeVisible();
  expect(screen.getByText('Skipped: active in Summer SPF drop')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Need review 1' }));
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Luca Romano/ })).toBeNull();
  mockAgentReviewQuery.mockReturnValue({
    data: undefined,
    refetch: mockAgentReviewRefetch,
  });
});

it('refreshes the agent review when memberships or social profiles change', () => {
  setup();
  for (const id of ['membership-metadata', 'profile-metadata'])
    mockReviewListeners
      .filter((listener) => listener.objectMetadataItemId === id)
      .at(-1)
      ?.onObjectRecordOperationBrowserEvent();

  expect(mockAgentReviewRefetch).toHaveBeenCalledTimes(2);
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
  expect(screen.getByText('Next action')).toBeVisible();
  const row = screen.getByRole('button', { name: /Ava Rivera/ });
  expect(row).toHaveTextContent('@ava.studio');
  expect(
    (useFindManyRecords as jest.Mock).mock.calls[0][0].recordGqlFields.creator,
  ).toEqual({ id: true, name: true });
  expect((useFindManyRecords as jest.Mock).mock.calls[1][0]).toEqual(
    expect.objectContaining({
      objectNameSingular: 'socialProfile',
      filter: {
        and: [
          { creatorId: { in: ['creator-1'] } },
          { platform: { eq: 'INSTAGRAM' } },
        ],
      },
      recordGqlFields: {
        id: true,
        creatorId: true,
        platform: true,
        handle: true,
      },
    }),
  );
  expect(row).toHaveTextContent('Negotiating');
  expect(row).toHaveTextContent('Progress unavailable');
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

it('searches every loaded readable Instagram account without choosing a default identity', () => {
  setup(
    {},
    {
      records: [
        {
          id: 'profile-1',
          creatorId: 'creator-1',
          platform: 'INSTAGRAM',
          handle: 'ava.studio',
        },
        {
          id: 'profile-2',
          creatorId: 'creator-1',
          platform: 'INSTAGRAM',
          handle: 'ava.second',
        },
        {
          id: 'profile-3',
          creatorId: 'creator-2',
          platform: 'INSTAGRAM',
          handle: 'foreign',
        },
      ],
      totalCount: 3,
    },
  );
  const search = screen.getByRole('searchbox', {
    name: 'Search loaded influencers',
  });
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toHaveTextContent(
    '2 Instagram accounts',
  );
  expect(screen.queryByText('@ava.studio')).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'ava.second' } });
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toBeVisible();
  fireEvent.change(search, { target: { value: 'foreign' } });
  expect(screen.getByText(/No matches in loaded influencers/)).toBeVisible();
});

it('does not claim a unique handle or a complete search when 61st Instagram profile is not loaded', () => {
  const firstPage = Array.from({ length: 60 }, (_, i) => ({
    id: `profile-${i}`,
    creatorId: 'creator-1',
    platform: 'INSTAGRAM',
    handle: `ava.${i}`,
  }));
  const view = setup(
    {},
    { records: firstPage, totalCount: 61, hasNextPage: true },
  );
  const search = screen.getByRole('searchbox', {
    name: 'Search loaded influencers',
  });
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toHaveTextContent(
    'Instagram profiles still loading',
  );
  fireEvent.change(search, { target: { value: 'ava.last' } });
  expect(
    screen.getByText(/Load more profiles to search further/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Load more profiles' }));
  expect(fetchMoreProfiles).toHaveBeenCalledTimes(1);
  view.unmount();
  setup(
    {},
    {
      records: [
        ...firstPage,
        {
          id: 'profile-last',
          creatorId: 'creator-1',
          platform: 'INSTAGRAM',
          handle: 'ava.last',
        },
      ],
      totalCount: 61,
      hasNextPage: false,
    },
  );
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search loaded influencers' }),
    { target: { value: 'ava.last' } },
  );
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toHaveTextContent(
    '61 Instagram accounts',
  );
});

it('retries a failed profile page instead of treating it as a complete search', () => {
  setup({}, { error: new Error('Profile read failed'), hasNextPage: true });
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search loaded influencers' }),
    { target: { value: 'missing' } },
  );
  expect(
    screen.getByText('Profile search is unavailable. Retry profiles.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Load more profiles' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry profiles' }));
  expect(refetchProfiles).toHaveBeenCalledTimes(1);
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
      'social-profiles-field': { canRead: false },
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
  expect(
    (useFindManyRecords as jest.Mock).mock.calls[0][0].recordGqlFields.creator,
  ).not.toHaveProperty('socialProfiles');
  expect((useFindManyRecords as jest.Mock).mock.calls[1][0].skip).toBe(true);
  expect(screen.getByText('Creator unavailable')).toBeVisible();
  expect(
    screen.getByRole('button', { name: /Creator unavailable/ }),
  ).toHaveTextContent('?');
});

it('never displays another platform or Creator handle from a profile response', () => {
  setup(
    {},
    {
      records: [
        {
          id: 'other-platform',
          creatorId: 'creator-1',
          platform: 'TIKTOK',
          handle: 'wrong-platform',
        },
        {
          id: 'other-creator',
          creatorId: 'creator-2',
          platform: 'INSTAGRAM',
          handle: 'wrong-creator',
        },
      ],
      totalCount: 2,
    },
  );
  expect(screen.getByRole('button', { name: /Ava Rivera/ })).toHaveTextContent(
    'Handle unavailable',
  );
  expect(screen.queryByText('@wrong-platform')).not.toBeInTheDocument();
  expect(screen.queryByText('@wrong-creator')).not.toBeInTheDocument();
});

it('does not show a handle when the SocialProfile read permission is denied', () => {
  (useObjectPermissionsForObject as jest.Mock).mockImplementation(
    (id: string) => ({
      canReadObjectRecords: id !== 'profile-metadata',
    }),
  );
  setup();
  expect(screen.queryByText('@ava.studio')).not.toBeInTheDocument();
  expect(
    (useFindManyRecords as jest.Mock).mock.calls[0][0].recordGqlFields.creator,
  ).not.toHaveProperty('socialProfiles');
  expect((useFindManyRecords as jest.Mock).mock.calls[1][0].skip).toBe(true);
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
