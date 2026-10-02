import { fireEvent, render, screen } from '@testing-library/react';

import { MyahCampaignReplyStatus } from '@/page-layout/components/MyahCampaignReplyStatus';

const refetch = jest.fn();
let canRead = true;
let readableFieldNames: string[];
let querySkipped = false;
let campaignQuery: Record<string, unknown>;

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      id: 'campaign-meta',
      readableFields: readableFieldNames.map((name) => ({ name })),
    },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canReadObjectRecords: canRead }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: ({ skip }: { skip?: boolean }) => {
    querySkipped = skip ?? false;
    return campaignQuery;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  canRead = true;
  readableFieldNames = [
    'id',
    'replyAgentEnabled',
    'replyAgentEnabledAt',
    'replyAgentMode',
  ];
  querySkipped = false;
  campaignQuery = {
    record: {
      id: 'campaign',
      replyAgentEnabled: false,
      replyAgentEnabledAt: null,
      replyAgentMode: 'REVIEW',
    },
    loading: false,
    error: undefined,
    refetch,
  };
});

it('shows the persisted default as disabled without implying that Review is running', () => {
  render(<MyahCampaignReplyStatus campaignId="campaign" />);
  expect(screen.getByText('Agent disabled for this Campaign')).toBeVisible();
  expect(screen.queryByText('Agent · Review mode')).not.toBeInTheDocument();
});

it('shows enabled Review mode but makes no automatic-send claim', () => {
  campaignQuery = {
    ...campaignQuery,
    record: {
      id: 'campaign',
      replyAgentEnabled: true,
      replyAgentEnabledAt: '2026-09-25T00:00:00Z',
      replyAgentMode: 'REVIEW',
    },
  };
  render(<MyahCampaignReplyStatus campaignId="campaign" />);
  expect(screen.getByText('Agent · Review mode')).toBeVisible();
  expect(
    screen.getByText('Replies require human review before sending.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /send|enable|autonomous/i }),
  ).not.toBeInTheDocument();
});

it('does not claim a malformed enabled state is explicitly disabled', () => {
  campaignQuery = {
    ...campaignQuery,
    record: {
      id: 'campaign',
      replyAgentEnabled: true,
      replyAgentEnabledAt: null,
      replyAgentMode: 'REVIEW',
    },
  };
  render(<MyahCampaignReplyStatus campaignId="campaign" />);
  expect(
    screen.getByText('Campaign agent status is unavailable.'),
  ).toBeVisible();
  expect(
    screen.queryByText('Agent disabled for this Campaign'),
  ).not.toBeInTheDocument();
});

it('withholds state when the row is visible but a status field is not readable', () => {
  readableFieldNames = readableFieldNames.filter(
    (name) => name !== 'replyAgentEnabledAt',
  );
  render(<MyahCampaignReplyStatus campaignId="campaign" />);
  expect(querySkipped).toBe(true);
  expect(
    screen.getByText(
      'Campaign agent status is unavailable with current permissions.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText('Agent disabled for this Campaign'),
  ).not.toBeInTheDocument();
});

it('withholds status when the Campaign is hidden, and supports retry on error', () => {
  canRead = false;
  const view = render(<MyahCampaignReplyStatus campaignId="campaign" />);
  expect(
    screen.getByText("You don't have permission to view this Campaign."),
  ).toBeVisible();
  expect(
    screen.queryByText('Agent disabled for this Campaign'),
  ).not.toBeInTheDocument();
  canRead = true;
  campaignQuery = { ...campaignQuery, error: new Error('failed') };
  view.rerender(<MyahCampaignReplyStatus campaignId="campaign" />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(refetch).toHaveBeenCalledTimes(1);
});
