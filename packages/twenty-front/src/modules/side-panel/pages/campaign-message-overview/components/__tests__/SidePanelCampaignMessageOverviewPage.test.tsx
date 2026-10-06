import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SidePanelCampaignMessageOverviewPage } from '@/side-panel/pages/campaign-message-overview/components/SidePanelCampaignMessageOverviewPage';

const mockOpenInbox = jest.fn();
const mockOpenRecord = jest.fn();
const mockCloseSidePanel = jest.fn();
const mockUseQuery = jest.fn();

const row = {
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
  status: 'SENT',
  estimatedSendAt: null,
  sentAt: '2026-09-21T10:00:00.000Z',
  eligibleAfter: null,
  connectedAccountId: 'account',
  connectedAccountLabel: 'sender@example.com',
  senderIsEstimated: false,
  needsAttention: false,
  reason: null,
  inboxContactId: 'contact',
  inboxThreadId: 'thread',
};

let selection: {
  occurrenceId: string;
  workspaceId: string;
  returnTarget: {
    workspaceId: string;
    pathname: string;
    search: string;
    occurrenceId: string;
  };
} | null;
let workspace: { id: string } | null;

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: jest
    .fn()
    .mockImplementation((state) =>
      state?.key === 'myah/campaign-message-overview-selection'
        ? selection
        : workspace,
    ),
}));
jest.mock('@/myah/inbox/hooks/useOpenMyahInboxConversation', () => ({
  useOpenMyahInboxConversation: () => ({
    openMyahInboxConversation: mockOpenInbox,
  }),
}));
jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: mockOpenRecord }),
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockCloseSidePanel }),
}));

const setSelection = () => {
  selection = {
    occurrenceId: 'occurrence',
    workspaceId: 'workspace',
    returnTarget: {
      workspaceId: 'workspace',
      pathname: '/myah/messages',
      search: '?view=SENT',
      occurrenceId: 'occurrence',
    },
  };
};

describe('SidePanelCampaignMessageOverviewPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSelection();
    workspace = { id: 'workspace' };
    mockUseQuery.mockReturnValue({
      data: { campaignMessageOverviewDetail: row },
      loading: false,
    });
  });

  it('hydrates a selected occurrence through the detail read before native navigation', () => {
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fetchPolicy: 'network-only',
        pollInterval: 30_000,
        variables: { input: { occurrenceId: 'occurrence' } },
      }),
    );
    expect(screen.getByText(/ada@example.com/)).toBeVisible();
    expect(screen.getByText('Hello')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View Creator' }));
    expect(mockOpenRecord).toHaveBeenCalledWith({
      recordId: 'creator',
      objectNameSingular: 'creator',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open in Inbox' }));
    expect(mockOpenInbox).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      contactId: 'contact',
      threadId: 'thread',
      returnTarget: selection?.returnTarget,
    });
  });

  it('redacts and closes when revalidation returns null in the same workspace', async () => {
    mockUseQuery.mockReturnValue({
      data: { campaignMessageOverviewDetail: null },
      loading: false,
    });
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(
      screen.getByText('Message details are unavailable in this workspace.'),
    ).toBeVisible();
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    await waitFor(() => expect(mockCloseSidePanel).toHaveBeenCalled());
  });

  it('keeps the panel open with a retry when the detail request fails (MYAH-455)', async () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('occurrenceId must be a UUID'),
      refetch,
    });
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(
      screen.getByText('Message details could not be loaded.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCloseSidePanel).not.toHaveBeenCalled();
  });

  it('labels Instagram steps and explains why one needs attention', () => {
    mockUseQuery.mockReturnValue({
      data: {
        campaignMessageOverviewDetail: {
          ...row,
          platform: 'Instagram',
          status: 'NEEDS_ATTENTION',
          sentAt: null,
          needsAttention: true,
          reason: 'SENDER_NOT_READY',
        },
      },
      loading: false,
    });
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(
      screen.getByText('Campaign Instagram message · Read only'),
    ).toBeVisible();
    expect(
      screen.getByText(/sending account is not connected or not ready/),
    ).toBeVisible();
  });

  it('says a cancelled step was not sent instead of an unavailable eligible time', () => {
    mockUseQuery.mockReturnValue({
      data: {
        campaignMessageOverviewDetail: {
          ...row,
          status: 'CANCELLED',
          sentAt: null,
          eligibleAfter: null,
        },
      },
      loading: false,
    });
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(screen.getByText('Not sent')).toBeVisible();
    expect(screen.queryByText(/Eligible after/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
  });

  it('redacts and closes immediately after a workspace switch', async () => {
    workspace = { id: 'other-workspace' };
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(
      screen.getByText('Message details are unavailable in this workspace.'),
    ).toBeVisible();
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    );
    await waitFor(() => expect(mockCloseSidePanel).toHaveBeenCalled());
  });
});
