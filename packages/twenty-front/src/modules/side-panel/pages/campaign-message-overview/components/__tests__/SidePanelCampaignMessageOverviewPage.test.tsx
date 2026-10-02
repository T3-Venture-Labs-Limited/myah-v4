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
