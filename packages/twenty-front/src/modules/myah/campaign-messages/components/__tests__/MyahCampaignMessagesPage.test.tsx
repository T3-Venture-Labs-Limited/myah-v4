import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MyahCampaignMessagesPage } from '@/myah/campaign-messages/components/MyahCampaignMessagesPage';

const mockOpenPanel = jest.fn();
const mockUseQuery = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: 'workspace' }),
}));
jest.mock(
  '@/myah/campaign-messages/hooks/useOpenCampaignMessageOverviewPanel',
  () => ({
    useOpenCampaignMessageOverviewPanel: () => ({
      openCampaignMessageOverviewPanel: mockOpenPanel,
    }),
  }),
);

const queryResult = () => ({
  loading: false,
  error: undefined,
  fetchMore: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn(),
  data: {
    campaignMessageOverview: {
      filterOptions: {
        campaigns: [{ id: 'campaign', name: 'Launch' }],
        connectedAccounts: [],
      },
      nodes: [
        {
          occurrenceId: 'occurrence',
          campaignId: 'campaign',
          campaignName: 'Launch',
          creatorId: 'creator',
          creatorName: 'Ada',
          recipient: 'ada@example.com',
          subject: 'Hello',
          preview: 'Preview',
          sequenceStep: 1,
          platform: 'Email',
          status: 'SCHEDULED',
          estimatedSendAt: null,
          sentAt: null,
          eligibleAfter: '2026-09-25T10:00:00.000Z',
          connectedAccountId: null,
          connectedAccountLabel: null,
          senderIsEstimated: false,
          needsAttention: false,
          reason: null,
          inboxContactId: null,
          inboxThreadId: null,
        },
      ],
      pageInfo: {
        hasNextPage: false,
        endCursor: null as string | null,
        generationId: 'generation',
        generatedAt: '2026-09-21T09:00:00.000Z',
        horizonEndsAt: '2026-09-23T09:00:00.000Z',
        forecastComplete: false,
        refreshing: true,
      },
    },
  },
});

describe('MyahCampaignMessagesPage', () => {
  beforeEach(() => {
    mockOpenPanel.mockClear();
    mockUseQuery.mockReturnValue(queryResult());
  });

  it('keeps undated queued work visible and opens Creator details through the native panel', () => {
    render(
      <MemoryRouter initialEntries={['/myah/messages?view=SCHEDULED']}>
        <MyahCampaignMessagesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Forecast pending or incomplete')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('refreshing');
    fireEvent.click(screen.getByRole('button', { name: 'Ada' }));
    expect(mockOpenPanel).toHaveBeenCalledWith({
      row: expect.objectContaining({ occurrenceId: 'occurrence' }),
      workspaceId: 'workspace',
      returnTarget: {
        workspaceId: 'workspace',
        pathname: '/myah/messages',
        search: '?view=SCHEDULED',
        occurrenceId: 'occurrence',
      },
    });
  });

  it('keeps an existing explicit date range as a custom filter', () => {
    const start = new Date(2026, 8, 21);
    const end = new Date(2026, 8, 22);
    const params = new URLSearchParams({
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
    });

    render(
      <MemoryRouter initialEntries={[`/myah/messages?${params}`]}>
        <MyahCampaignMessagesPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Date')).toHaveValue('custom');
    expect(
      screen.getByRole('columnheader', { name: 'Recipient' }),
    ).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Message' })).toBeVisible();
  });

  it('does not mislabel an empty filtered result as a missing forecast', () => {
    const result = queryResult();
    result.data.campaignMessageOverview.nodes = [];
    result.data.campaignMessageOverview.pageInfo.generatedAt = null as never;
    mockUseQuery.mockReturnValue(result);

    render(
      <MemoryRouter initialEntries={['/myah/messages?search=no-match']}>
        <MyahCampaignMessagesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('No permitted Campaign messages match these filters.'),
    ).toBeVisible();
    expect(
      screen.queryByText('No forecast is available yet.'),
    ).not.toBeInTheDocument();
  });

  it('retains Campaign B after empty Campaign A and sends [A, B] with OR semantics', async () => {
    const resultForCampaigns = (campaignIds?: string[]) => {
      const result = queryResult();
      result.data.campaignMessageOverview.filterOptions.campaigns = [
        { id: 'campaign-a', name: 'Campaign A' },
        { id: 'campaign-b', name: 'Campaign B' },
      ];
      if (campaignIds?.includes('campaign-a')) {
        result.data.campaignMessageOverview.nodes = [];
      }

      return result;
    };
    mockUseQuery.mockImplementation(
      (_query, options: { variables: { input: { campaignIds?: string[] } } }) =>
        resultForCampaigns(options.variables.input.campaignIds),
    );

    render(
      <MemoryRouter initialEntries={['/myah/messages']}>
        <MyahCampaignMessagesPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Campaign A'));
    await waitFor(() =>
      expect(mockUseQuery).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          variables: expect.objectContaining({
            input: expect.objectContaining({ campaignIds: ['campaign-a'] }),
          }),
        }),
      ),
    );

    expect(
      screen.getByText('No permitted Campaign messages match these filters.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Campaign B')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Campaign B'));
    await waitFor(() =>
      expect(mockUseQuery).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          variables: expect.objectContaining({
            input: expect.objectContaining({
              campaignIds: ['campaign-a', 'campaign-b'],
            }),
          }),
        }),
      ),
    );
  });

  it('loads subsequent pages before restoring an Inbox return target', async () => {
    const result = queryResult();
    result.data.campaignMessageOverview.pageInfo.hasNextPage = true;
    result.data.campaignMessageOverview.pageInfo.endCursor = 'next-page';
    mockUseQuery.mockReturnValue(result);

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/myah/messages',
            state: {
              campaignMessageOverviewReturnTarget: {
                workspaceId: 'workspace',
                pathname: '/myah/messages',
                search: '',
                occurrenceId: 'later-occurrence',
              },
            },
          },
        ]}
      >
        <MyahCampaignMessagesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(result.fetchMore).toHaveBeenCalledTimes(1));
    expect(result.fetchMore).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({ after: 'next-page' }),
        },
      }),
    );
  });
});
