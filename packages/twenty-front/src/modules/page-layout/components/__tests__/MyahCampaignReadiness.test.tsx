import { fireEvent, render, screen } from '@testing-library/react';

import { MyahCampaignReadiness } from '@/page-layout/components/MyahCampaignReadiness';

const refetchCampaign = jest.fn();
const refetchAudience = jest.fn();
let campaignQueryResult: Record<string, unknown>;
let audienceQueryResult: Record<string, unknown>;
let canRead = true;

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-meta' },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: canRead,
    canUpdateObjectRecords: true,
  }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => campaignQueryResult,
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => audienceQueryResult,
}));
jest.mock('twenty-ui/data-display', () => ({
  Status: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock('twenty-ui/feedback', () => ({
  InlineBanner: ({
    message,
    button,
  }: {
    message: string;
    button?: { title: string; onClick: () => void };
  }) => (
    <div>
      <span>{message}</span>
      {button ? <button onClick={button.onClick}>{button.title}</button> : null}
    </div>
  ),
  Loader: () => <span>Loading</span>,
}));
jest.mock('twenty-ui/icon', () => ({
  IconAlertTriangle: () => null,
  IconCheck: () => null,
  IconCircleX: () => null,
  IconLock: () => null,
}));
jest.mock('twenty-ui/theme-constants', () => ({
  useTheme: () => ({
    spacing: { 1: '4px', 2: '8px', 4: '16px' },
    font: {
      color: { primary: 'black', secondary: 'gray', danger: 'red' },
      family: 'sans-serif',
      size: { md: '14px' },
      weight: { medium: 500 },
    },
    text: { lineHeight: { md: '20px' } },
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  canRead = true;
  campaignQueryResult = {
    record: {
      id: 'campaign',
      name: 'Launch',
      objective: 'Awareness',
      lifecycleStatus: 'DRAFT',
    },
    loading: false,
    error: undefined,
    refetch: refetchCampaign,
  };
  audienceQueryResult = {
    totalCount: 1,
    loading: false,
    error: undefined,
    hasReadPermission: true,
    refetch: refetchAudience,
  };
});

it('shows read-only readiness and directs Start/Stop to Operations without generic lifecycle actions', () => {
  render(<MyahCampaignReadiness campaignId="campaign" />);
  expect(screen.getByText('Campaign readiness')).toBeVisible();
  expect(screen.getByText('Draft')).toBeVisible();
  expect(
    screen.getByText('Use Start and Stop in Campaign Operations.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /activate|pause|resume|complete/i }),
  ).not.toBeInTheDocument();
});

it('maps internal PAUSED to user-facing Stopped', () => {
  campaignQueryResult = {
    ...campaignQueryResult,
    record: {
      id: 'campaign',
      name: 'Launch',
      objective: 'Awareness',
      lifecycleStatus: 'PAUSED',
    },
  };
  render(<MyahCampaignReadiness campaignId="campaign" />);
  expect(screen.getByText('Stopped')).toBeVisible();
  expect(screen.queryByText('Paused')).not.toBeInTheDocument();
});

it('reports incomplete audience truthfully', () => {
  audienceQueryResult = { ...audienceQueryResult, totalCount: 0 };
  render(<MyahCampaignReadiness campaignId="campaign" />);
  expect(screen.getByText('Audience incomplete')).toBeVisible();
});

it('gates Campaign data by read permission', () => {
  canRead = false;
  render(<MyahCampaignReadiness campaignId="campaign" />);
  expect(
    screen.getByText("You don't have permission to view this Campaign."),
  ).toBeVisible();
});

it('provides canonical reload on a load error', () => {
  campaignQueryResult = { ...campaignQueryResult, error: new Error('failed') };
  render(<MyahCampaignReadiness campaignId="campaign" />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(refetchCampaign).toHaveBeenCalled();
  expect(refetchAudience).toHaveBeenCalled();
});
