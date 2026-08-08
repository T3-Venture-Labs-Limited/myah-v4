import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyahCampaignOperations } from '@/page-layout/components/MyahCampaignOperations';

jest.mock('@/page-layout/components/MyahCampaignAudienceControls', () => ({
  MyahCampaignAudienceControls: ({ campaignId }: { campaignId: string }) => (
    <div>{`Campaign audience controls:${campaignId}`}</div>
  ),
}));

const updateOneRecord = jest.fn();
const refetchCampaign = jest.fn();
const refetchAudience = jest.fn();
let campaignQueryResult: Record<string, unknown>;
let audienceQueryResult: Record<string, unknown>;
let campaignPermissions: {
  canReadObjectRecords: boolean;
  canUpdateObjectRecords: boolean;
};

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-metadata-id' },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => campaignPermissions,
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => campaignQueryResult,
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => audienceQueryResult,
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord }),
}));

jest.mock('~/utils/is-graphql-error-of-type.util', () => ({
  isGraphqlErrorOfType: (
    error: { code?: string } | undefined,
    errorCode: string,
  ) => error?.code === errorCode,
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
    button?: { title: string; onClick?: () => void };
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

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
  }: {
    title: string;
    onClick: () => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  useTheme: () => ({
    spacing: { 1: '4px', 2: '8px', 4: '16px', 6: '24px' },
    font: {
      color: {
        primary: 'black',
        secondary: 'gray',
        tertiary: 'lightgray',
        danger: 'red',
      },
      family: 'sans-serif',
      size: { md: '14px' },
      weight: { medium: 500 },
    },
    text: { lineHeight: { md: '20px' } },
    icon: { size: { md: 16 } },
    accent: { primary: 'blue' },
  }),
}));

const renderReadiness = (campaignId: string | undefined) =>
  render(<MyahCampaignOperations campaignId={campaignId} />);

beforeEach(() => {
  jest.clearAllMocks();
  campaignPermissions = {
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
  };
  campaignQueryResult = {
    record: {
      id: 'campaign-1',
      name: 'Spring launch',
      objective: 'Build awareness',
      lifecycleStatus: 'DRAFT',
    },
    loading: false,
    error: undefined,
    refetch: refetchCampaign,
  };
  audienceQueryResult = {
    totalCount: 1,
    hasReadPermission: true,
    loading: false,
    error: undefined,
    refetch: refetchAudience,
  };
  updateOneRecord.mockResolvedValue(undefined);
});

describe('MyahCampaignOperations', () => {
  it('shows the Campaign readiness state and applies an allowed lifecycle transition', async () => {
    renderReadiness('campaign-1');

    expect(screen.getByText('Campaign readiness')).toBeVisible();
    expect(screen.getByText('1 creator')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(updateOneRecord).toHaveBeenCalledWith({
        objectNameSingular: 'campaign',
        idToUpdate: 'campaign-1',
        updateOneRecordInput: { lifecycleStatus: 'ACTIVE' },
      });
    });
  });

  it('disables activation until the Campaign has a name, objective, and audience', () => {
    campaignQueryResult = {
      ...campaignQueryResult,
      record: {
        id: 'campaign-1',
        name: 'Spring launch',
        objective: null,
        lifecycleStatus: 'DRAFT',
      },
    };
    audienceQueryResult = { ...audienceQueryResult, totalCount: 0 };

    renderReadiness('campaign-1');

    expect(
      screen.getByText('Campaign objective is required before activation.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Add at least one creator before activating this campaign.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled();
  });

  it('shows an unavailable state when the Campaign record is missing', () => {
    campaignQueryResult = { ...campaignQueryResult, record: null };

    renderReadiness('campaign-1');

    expect(screen.getByText('This Campaign is unavailable.')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a retryable error when the Campaign lifecycle status is missing', () => {
    campaignQueryResult = {
      ...campaignQueryResult,
      record: {
        id: 'campaign-1',
        name: 'Spring launch',
        objective: 'Build awareness',
        lifecycleStatus: null,
      },
    };

    renderReadiness('campaign-1');

    expect(
      screen.getByText('Campaign status is unavailable. Retry.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('shows only the allowed lifecycle actions for the current Campaign status', () => {
    campaignQueryResult = {
      ...campaignQueryResult,
      record: {
        id: 'campaign-1',
        name: 'Spring launch',
        objective: 'Build awareness',
        lifecycleStatus: 'ACTIVE',
      },
    };

    renderReadiness('campaign-1');

    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
  });

  it('offers resume and complete actions for a paused Campaign', async () => {
    campaignQueryResult = {
      ...campaignQueryResult,
      record: {
        id: 'campaign-1',
        name: 'Spring launch',
        objective: 'Build awareness',
        lifecycleStatus: 'PAUSED',
      },
    };

    renderReadiness('campaign-1');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => {
      expect(updateOneRecord).toHaveBeenCalledWith({
        objectNameSingular: 'campaign',
        idToUpdate: 'campaign-1',
        updateOneRecordInput: { lifecycleStatus: 'ACTIVE' },
      });
    });
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
  });

  it('does not offer lifecycle actions for a completed Campaign', () => {
    campaignQueryResult = {
      ...campaignQueryResult,
      record: {
        id: 'campaign-1',
        name: 'Spring launch',
        objective: 'Build awareness',
        lifecycleStatus: 'COMPLETED',
      },
    };

    renderReadiness('campaign-1');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides status actions without update permission', () => {
    campaignPermissions = {
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    };

    renderReadiness('campaign-1');

    expect(
      screen.getByText(
        "You don't have permission to change this Campaign's status.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gates Campaign data and status actions by the initiating user permissions', () => {
    campaignPermissions = {
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
    };

    renderReadiness('campaign-1');

    expect(
      screen.getByText("You don't have permission to view this Campaign."),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render without a Campaign record identifier', () => {
    const { container } = renderReadiness(undefined);

    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces an explicit retry path when the Campaign query fails', () => {
    campaignQueryResult = {
      ...campaignQueryResult,
      error: new Error('network error'),
    };

    renderReadiness('campaign-1');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      screen.getByText('Campaign data could not load. Retry.'),
    ).toBeVisible();
    expect(refetchCampaign).toHaveBeenCalledTimes(1);
    expect(refetchAudience).toHaveBeenCalledTimes(1);
  });

  it('shows the native permission feedback when a lifecycle update is forbidden', async () => {
    updateOneRecord.mockRejectedValueOnce(
      Object.assign(new Error('not allowed'), { code: 'FORBIDDEN' }),
    );

    renderReadiness('campaign-1');
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    expect(
      await screen.findByText(
        "You don't have permission to change this Campaign's status.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Activate' }),
    ).not.toBeInTheDocument();
  });

  it('shows the concurrent update conflict when the native mutation updates no record', async () => {
    updateOneRecord.mockResolvedValueOnce(null);

    renderReadiness('campaign-1');
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    expect(
      await screen.findByText(
        'This Campaign changed. Review it and try again.',
      ),
    ).toBeVisible();
    expect(refetchCampaign).toHaveBeenCalledTimes(1);
  });
});
