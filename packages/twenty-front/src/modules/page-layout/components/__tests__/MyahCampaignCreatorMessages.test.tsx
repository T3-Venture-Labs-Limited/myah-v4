import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MyahCampaignCreatorMessages } from '@/page-layout/components/MyahCampaignCreatorMessages';
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const openConversation = jest.fn();
const fetchMore = jest.fn();
const client = { name: 'metadata' };
let queryResult: Record<string, unknown>;
let options: Record<string, unknown>;
let workspace: { id: string } | null = { id: 'workspace-a' };
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => client,
  useQuery: (_query: unknown, opts: Record<string, unknown>) => {
    options = opts;
    return queryResult;
  },
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => workspace,
}));
jest.mock('@/myah/inbox/hooks/useOpenMyahInboxConversation', () => ({
  useOpenMyahInboxConversation: () => ({
    openMyahInboxConversation: openConversation,
  }),
}));
const returnTarget = {
  workspaceId: 'workspace-a',
  campaignId: 'campaign-a',
  membershipId: 'membership-a',
  influencerTabId: 'influencers-tab',
  pathname: '/object/campaign/campaign-a',
  search: '',
};
const row = {
  campaignCreatorId: 'membership-a',
  latestOutbound: { id: 'out', happenedAt: '2026-09-24', state: 'ACCEPTED' },
  latestInbound: null,
  inboxContactId: 'contact-a',
  inboxThreadId: 'thread-a',
};
beforeEach(() => {
  jest.clearAllMocks();
  workspace = { id: 'workspace-a' };
  queryResult = {
    data: {
      campaignActivity: {
        nodes: [{ ...row, campaignCreatorId: 'other' }],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      },
    },
    loading: false,
    fetchMore,
  };
  fetchMore.mockResolvedValue(undefined);
});
it('treats a page without this membership as incomplete and loads more by campaign cursor', async () => {
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(options).toMatchObject({
    client,
    variables: { input: { campaignId: 'campaign-a', first: 50 } },
  });
  expect(screen.getByText(/More pages remain/)).toBeVisible();
  expect(
    screen.queryByRole('link', { name: /read-only message details/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Open exact conversation/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Load more campaign activity' }),
  );
  await waitFor(() =>
    expect(fetchMore).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { campaignId: 'campaign-a', first: 50, after: 'next' },
        },
      }),
    ),
  );
  const update = fetchMore.mock.calls[0][0].updateQuery;
  expect(
    update(queryResult.data, {
      fetchMoreResult: {
        campaignActivity: {
          nodes: [row],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }).campaignActivity.nodes,
  ).toHaveLength(2);
});
it('renders only the selected membership latest events and opens an exact workspace-bound Inbox target', () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [
          { ...row, campaignCreatorId: 'other', inboxContactId: 'wrong' },
          row,
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(screen.getByText(/Latest outbound: ACCEPTED/)).toBeVisible();
  expect(
    screen.getByText('Latest verified inbound unavailable.'),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open exact conversation in Inbox' }),
  );
  expect(openConversation).toHaveBeenCalledWith({
    workspaceId: 'workspace-a',
    contactId: 'contact-a',
    threadId: 'thread-a',
    creatorReturnTarget: returnTarget,
  });
});
it('links only to the authorized campaign-scoped read-only overview, not to a guessed occurrence detail', () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [row],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(
    screen.getByRole('link', {
      name: "Browse this campaign's read-only message details",
    }),
  ).toHaveAttribute('href', '/myah/messages?campaign=campaign-a');
  expect(
    screen.getByText(/Individual messages are not identified/),
  ).toBeVisible();
});

it('does not offer another campaign page once this membership is found', () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [row],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Open exact conversation in Inbox' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Load more campaign activity' }),
  ).not.toBeInTheDocument();
  expect(fetchMore).not.toHaveBeenCalled();
});

it('pages until it finds the membership, then stops even if more campaign pages remain', async () => {
  fetchMore.mockImplementationOnce(({ updateQuery }) => {
    queryResult = {
      ...queryResult,
      data: updateQuery(queryResult.data, {
        fetchMoreResult: {
          campaignActivity: {
            nodes: [row],
            pageInfo: { hasNextPage: true, endCursor: 'later' },
          },
        },
      }),
    };
    return Promise.resolve();
  });
  const view = () => (
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />
  );
  const { rerender } = render(view());
  expect(screen.getByText(/More pages remain/)).toBeVisible();
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more campaign activity' }),
    );
  });
  rerender(view());
  expect(fetchMore).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Latest outbound: ACCEPTED/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Open exact conversation in Inbox' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Load more campaign activity' }),
  ).not.toBeInTheDocument();
});

it('hides a cached exact Inbox target while activity is loading', () => {
  queryResult = {
    ...queryResult,
    loading: true,
    data: {
      campaignActivity: {
        nodes: [row],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Loading campaign activity',
  );
  expect(
    screen.queryByText(/Latest outbound: ACCEPTED/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open exact conversation in Inbox' }),
  ).not.toBeInTheDocument();
});

it('hides cached activity and Inbox authority when the query reports an access error', () => {
  queryResult = {
    ...queryResult,
    error: new Error('forbidden'),
    data: {
      campaignActivity: {
        nodes: [row],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('access has changed');
  expect(
    screen.queryByText(/Latest outbound: ACCEPTED/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open exact conversation in Inbox' }),
  ).not.toBeInTheDocument();
});

it('can retry an unmatched page after a formerly matched row disappears without reviving its Inbox binding', async () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [row],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      },
    },
  };
  const view = () => (
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />
  );
  const { rerender } = render(view());
  expect(
    screen.queryByRole('button', { name: 'Load more campaign activity' }),
  ).not.toBeInTheDocument();

  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [{ ...row, campaignCreatorId: 'other' }],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      },
    },
  };
  rerender(view());
  expect(
    screen.queryByRole('button', { name: 'Open exact conversation in Inbox' }),
  ).not.toBeInTheDocument();
  fetchMore.mockRejectedValueOnce(new Error('access changed'));
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more campaign activity' }),
    );
  });
  expect(screen.getByRole('alert')).toHaveTextContent('access has changed');
  fetchMore.mockImplementationOnce(({ updateQuery }) => {
    queryResult = {
      ...queryResult,
      data: updateQuery(queryResult.data, {
        fetchMoreResult: {
          campaignActivity: {
            nodes: [{ ...row, campaignCreatorId: 'another' }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    };
    return Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading campaign activity' }),
    );
  });
  rerender(view());
  expect(fetchMore).toHaveBeenCalledTimes(2);
  expect(
    screen.getByText(
      'No campaign message activity is available for this membership.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Open exact conversation in Inbox' }),
  ).not.toBeInTheDocument();
  expect(openConversation).not.toHaveBeenCalled();
});

it('does not guess Inbox target for ambiguous duplicate membership linkage', () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [row, { ...row, inboxContactId: 'different' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('ambiguous');
  expect(
    screen.queryByRole('button', { name: /Open exact conversation/ }),
  ).not.toBeInTheDocument();
});

it('does not enable Inbox when the selected row has no exact binding', () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [{ ...row, inboxThreadId: null }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  render(
    <MyahCampaignCreatorMessages
      campaignId="campaign-a"
      membershipId="membership-a"
      returnTarget={returnTarget}
    />,
  );
  expect(screen.getByText('Exact Inbox binding unavailable.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Open exact conversation/ }),
  ).not.toBeInTheDocument();
});
