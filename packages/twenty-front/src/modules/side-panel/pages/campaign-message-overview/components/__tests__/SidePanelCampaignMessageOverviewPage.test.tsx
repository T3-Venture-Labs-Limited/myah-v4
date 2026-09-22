import { fireEvent, render, screen } from '@testing-library/react';

import { SidePanelCampaignMessageOverviewPage } from '@/side-panel/pages/campaign-message-overview/components/SidePanelCampaignMessageOverviewPage';

const mockOpenInbox = jest.fn();
const mockOpenRecord = jest.fn();
const selection = {
  workspaceId: 'workspace',
  returnTarget: {
    workspaceId: 'workspace',
    pathname: '/myah/messages',
    search: '?view=SENT',
    occurrenceId: 'occurrence',
  },
  row: {
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
  },
};

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: jest
    .fn()
    .mockImplementationOnce(() => selection)
    .mockImplementationOnce(() => ({ id: 'workspace' })),
}));
jest.mock('@/myah/inbox/hooks/useOpenMyahInboxConversation', () => ({
  useOpenMyahInboxConversation: () => ({
    openMyahInboxConversation: mockOpenInbox,
  }),
}));
jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: mockOpenRecord }),
}));

describe('SidePanelCampaignMessageOverviewPage', () => {
  it('uses native Creator navigation and exact Inbox handoff', () => {
    render(<SidePanelCampaignMessageOverviewPage />);

    expect(screen.getByText(/ada@example.com/)).toBeVisible();
    expect(screen.getByText('Hello')).toBeVisible();
    expect(screen.getByText('Preview')).toBeVisible();
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
      returnTarget: selection.returnTarget,
    });
  });
});
