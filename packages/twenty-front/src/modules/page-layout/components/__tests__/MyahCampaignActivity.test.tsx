import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyahCampaignActivity } from '@/page-layout/components/MyahCampaignActivity';

const refetch = jest.fn();
const fetchMore = jest.fn();
const excludeCreator = jest.fn();
const openMyahInboxConversation = jest.fn();
const metadataClient = { name: 'metadata-client' };
let queryResult: Record<string, unknown>;
let queryOptions: Record<string, unknown>;
let mutationOptions: Record<string, unknown>;
let mutationLoading = false;

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => metadataClient,
  useQuery: (_query: unknown, options: Record<string, unknown>) => {
    queryOptions = options;
    return queryResult;
  },
  useMutation: (_mutation: unknown, options: Record<string, unknown>) => {
    mutationOptions = options;
    return [excludeCreator, { loading: mutationLoading }];
  },
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({}),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: 'workspace' }),
}));
jest.mock('@/myah/inbox/hooks/useOpenMyahInboxConversation', () => ({
  useOpenMyahInboxConversation: () => ({ openMyahInboxConversation }),
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
  }: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {title}
    </button>
  ),
}));

const fullRow = {
  campaignCreatorId: 'campaign-creator',
  creatorId: 'creator',
  creatorName: 'Ada',
  stage: 'CONTACTED',
  stageLabel: 'Contacted',
  latestOutbound: {
    id: 'outbound',
    threadId: 'thread',
    happenedAt: '2026-09-16T10:00:00.000Z',
    state: 'ACCEPTED',
  },
  latestInbound: {
    id: 'inbound',
    threadId: 'thread',
    happenedAt: '2026-09-16T11:00:00.000Z',
    state: 'VERIFIED_REPLY',
  },
  plannedAt: '2026-09-17T10:00:00.000Z',
  currentAttemptState: 'PROCESSING',
  reason: null,
  needsAttention: false,
  inboxContactId: 'contact',
  inboxThreadId: 'thread',
  excluded: false,
  mayStillSend: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mutationLoading = false;
  queryResult = {
    data: {
      campaignActivity: {
        nodes: [fullRow],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      },
    },
    loading: false,
    error: undefined,
    refetch,
    fetchMore,
  };
  jest.spyOn(window, 'prompt').mockReturnValue('No longer suitable');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  excludeCreator.mockResolvedValue({
    data: { excludeCampaignCreator: { mayStillSend: true } },
  });
});

afterEach(() => jest.restoreAllMocks());

it('uses the metadata GraphQL client for Campaign activity and exclusion', () => {
  render(<MyahCampaignActivity campaignId="campaign" />);

  expect(queryOptions.client).toBe(metadataClient);
  expect(mutationOptions.client).toBe(metadataClient);
});

it('renders loading, empty, full-error, and partial-error states truthfully', () => {
  queryResult = { loading: true, data: undefined, error: undefined };
  const { rerender } = render(<MyahCampaignActivity campaignId="campaign" />);
  expect(screen.getByText('Loading activity…')).toBeVisible();

  queryResult = {
    loading: false,
    data: {
      campaignActivity: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
    error: undefined,
  };
  rerender(<MyahCampaignActivity campaignId="campaign" />);
  expect(screen.getByText('No Creators in this Campaign.')).toBeVisible();

  queryResult = {
    loading: false,
    data: undefined,
    error: new Error('forbidden'),
  };
  rerender(<MyahCampaignActivity campaignId="campaign" />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'unavailable or you no longer have permission',
  );

  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [fullRow],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  rerender(<MyahCampaignActivity campaignId="campaign" />);
  expect(screen.getByRole('status')).toHaveTextContent(
    'Some Campaign activity is unavailable',
  );
  expect(screen.getByText('Ada')).toBeVisible();
});

it('shows only Campaign reader facts, loads the next page, and opens the exact readable Inbox target', () => {
  render(<MyahCampaignActivity campaignId="campaign" />);

  expect(
    screen.getByText('Last outbound: ACCEPTED at 2026-09-16T10:00:00.000Z'),
  ).toBeVisible();
  expect(
    screen.getByText('Last verified inbound: 2026-09-16T11:00:00.000Z'),
  ).toBeVisible();
  expect(screen.getByText('Current send state: PROCESSING')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
  expect(openMyahInboxConversation).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    contactId: 'contact',
    threadId: 'thread',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(fetchMore).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: { campaignId: 'campaign', first: 25, after: 'next' },
      },
    }),
  );
});

it('keeps unavailable facts explicit and omits an Inbox action without an exact readable thread', () => {
  queryResult = {
    ...queryResult,
    data: {
      campaignActivity: {
        nodes: [
          {
            ...fullRow,
            latestOutbound: null,
            latestInbound: null,
            plannedAt: null,
            currentAttemptState: null,
            inboxContactId: null,
            inboxThreadId: null,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
  render(<MyahCampaignActivity campaignId="campaign" />);
  expect(screen.getByText('Last outbound: unavailable')).toBeVisible();
  expect(screen.getByText('Last verified inbound: unavailable')).toBeVisible();
  expect(screen.getByText('Next planned action: unavailable')).toBeVisible();
  expect(screen.getByText('Current send state: unavailable')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Open conversation' }),
  ).not.toBeInTheDocument();
});

it('confirms in-flight risk before durable exclusion and refreshes truthful state', async () => {
  render(<MyahCampaignActivity campaignId="campaign" />);
  fireEvent.click(screen.getByRole('button', { name: 'Exclude Creator' }));

  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('may still finish'),
  );
  expect(excludeCreator).toHaveBeenCalledWith({
    variables: {
      input: {
        campaignId: 'campaign',
        campaignCreatorId: 'campaign-creator',
        reason: 'No longer suitable',
      },
    },
  });
  await waitFor(() => expect(refetch).toHaveBeenCalled());
  expect(window.alert).toHaveBeenCalledWith(
    expect.stringContaining('may still finish'),
  );
});
