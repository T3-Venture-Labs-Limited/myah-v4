import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

import { MyahInboxThreadPanel } from '@/myah/inbox/components/MyahInboxThreadPanel';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white' },
    border: { color: { light: 'lightgray' } },
    font: {
      color: { primary: 'black', secondary: 'dimgray', tertiary: 'gray' },
      size: { md: '14px', xs: '11px' },
      weight: { semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px' },
  },
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({ title, onClick }: { title: string; onClick: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
}));

const mockUseEmailThread = jest.fn();
const mockFetchMoreMessages = jest.fn();
const mockRefetchMessages = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
let mockObjectMetadataItems = [{ nameSingular: 'messageThread' }];

jest.mock('@/activities/emails/hooks/useEmailThread', () => ({
  useEmailThread: (...args: unknown[]) => mockUseEmailThread(...args),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('@/activities/emails/components/EmailThreadMessage', () => ({
  EmailThreadMessage: ({ message }: { message: { id: string } }) => (
    <article>Native email message {message.id}</article>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxThreadActions', () => ({
  MyahInboxThreadActions: ({
    onThreadUpdated,
  }: {
    onThreadUpdated?: (message: string) => void;
  }) => (
    <div aria-label="Thread actions">
      Creator Campaign Owner State Snooze
      <button onClick={() => onThreadUpdated?.('Conversation updated')}>
        Update conversation test double
      </button>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxReplyWorkspace', () => ({
  MyahInboxReplyWorkspace: ({ thread }: { thread: { id: string } }) => {
    const [draft] = useState(`Draft for ${thread.id}`);

    return (
      <section
        aria-label="Reply composer"
        id={`myah-inbox-reply-workspace-${thread.id}`}
        tabIndex={-1}
      >
        Reply workspace: {draft}
      </section>
    );
  },
}));

const thread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  subject: 'First conversation',
  lastMessagePreview: 'First preview',
  lastMessageSender: 'Ada',
  state: 'NEEDS_REPLY' as const,
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Ada Creator' },
  campaign: null,
  inboxOwner: { id: 'member-1', name: 'Zachary' },
};

describe('MyahInboxThreadPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockObjectMetadataItems = [{ nameSingular: 'messageThread' }];
    mockUseEmailThread.mockReturnValue({
      messages: [{ id: 'message-1' }, { id: 'message-2' }],
      threadLoading: false,
      hasNextPage: false,
      isMessagesFetchComplete: true,
      historyError: null,
      refetchMessages: mockRefetchMessages,
      fetchMoreMessages: mockFetchMoreMessages,
    });
  });

  it('waits for MessageThread metadata before loading native email history', () => {
    mockObjectMetadataItems = [];

    render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading conversation',
    );
    expect(mockUseEmailThread).not.toHaveBeenCalled();
  });

  it('renders the complete active history without a manual load control', () => {
    render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(mockUseEmailThread).toHaveBeenCalledWith('thread-1');
    expect(screen.getByText('Native email message message-1')).toBeVisible();
    expect(screen.getByText('Native email message message-2')).toBeVisible();
    expect(screen.getByLabelText('Thread actions')).toHaveTextContent(
      'Creator Campaign Owner State Snooze',
    );
    expect(
      screen.queryByRole('button', { name: 'Load older messages' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('region', { name: 'Reply composer' }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /send/i }),
    ).not.toBeInTheDocument();
  });

  it('loads remaining native message pages without a persistent load affordance', async () => {
    mockUseEmailThread.mockReturnValue({
      messages: [{ id: 'message-1' }],
      threadLoading: false,
      hasNextPage: true,
      isMessagesFetchComplete: false,
      historyError: null,
      refetchMessages: mockRefetchMessages,
      fetchMoreMessages: mockFetchMoreMessages,
    });

    render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(
      screen.queryByText('Loading earlier messages'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Load older messages')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reply composer')).not.toBeInTheDocument();
    await waitFor(() => expect(mockFetchMoreMessages).toHaveBeenCalledTimes(1));
  });

  it('keeps the shared composer closed when native history fails and retries explicitly', () => {
    mockUseEmailThread.mockReturnValue({
      messages: [],
      threadLoading: false,
      hasNextPage: false,
      isMessagesFetchComplete: false,
      historyError: new Error('native query failed'),
      refetchMessages: mockRefetchMessages,
      fetchMoreMessages: mockFetchMoreMessages,
    });

    render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Unable to load conversation history.',
    );
    expect(screen.queryByLabelText('Reply composer')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry conversation history' }),
    );
    expect(mockRefetchMessages).toHaveBeenCalledTimes(1);
  });
  it('leaves Creator and Campaign association to the thread actions', () => {
    render(
      <MyahInboxThreadPanel
        thread={{
          ...thread,
          campaign: { id: 'campaign-1', name: 'Spring campaign' },
        }}
        onThreadUpdated={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Open Creator' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Campaign' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Creator' }),
    ).not.toBeInTheDocument();
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
  });

  it('shows loading and empty native-history states', () => {
    mockUseEmailThread.mockReturnValue({
      messages: [],
      threadLoading: true,
      hasNextPage: false,
      isMessagesFetchComplete: false,
      historyError: null,
      refetchMessages: mockRefetchMessages,
      fetchMoreMessages: mockFetchMoreMessages,
    });
    const { rerender } = render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading conversation history',
    );

    mockUseEmailThread.mockReturnValue({
      messages: [],
      threadLoading: false,
      hasNextPage: false,
      isMessagesFetchComplete: true,
      historyError: null,
      refetchMessages: mockRefetchMessages,
      fetchMoreMessages: mockFetchMoreMessages,
    });
    rerender(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(
      screen.getByText('No visible messages in this conversation.'),
    ).toBeVisible();
  });

  it('clears header update status when selecting a different thread', () => {
    const { rerender } = render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Update conversation test double' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Conversation updated',
    );

    rerender(
      <MyahInboxThreadPanel
        thread={{ ...thread, id: 'thread-2', subject: 'Second conversation' }}
        onThreadUpdated={jest.fn()}
      />,
    );

    expect(screen.queryByText('Conversation updated')).not.toBeInTheDocument();
  });

  it('remounts the reply workspace when the selected thread changes', () => {
    const { rerender } = render(
      <MyahInboxThreadPanel thread={thread} onThreadUpdated={jest.fn()} />,
    );

    expect(
      screen.getByText('Reply workspace: Draft for thread-1'),
    ).toBeVisible();

    rerender(
      <MyahInboxThreadPanel
        thread={{ ...thread, id: 'thread-2' }}
        onThreadUpdated={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Reply workspace: Draft for thread-2'),
    ).toBeVisible();
  });

  it('forwards a successful header update exactly once', () => {
    const onThreadUpdated = jest.fn();

    render(
      <MyahInboxThreadPanel
        thread={thread}
        onThreadUpdated={onThreadUpdated}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Update conversation test double' }),
    );

    expect(onThreadUpdated).toHaveBeenCalledTimes(1);
    expect(onThreadUpdated).toHaveBeenCalledWith('Conversation updated');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Conversation updated',
    );
  });

  it('labels an unlinked Creator without unmatched terminology', () => {
    render(
      <MyahInboxThreadPanel
        thread={{ ...thread, creator: null }}
        onThreadUpdated={jest.fn()}
      />,
    );

    expect(screen.getByText('Unlinked creator')).toBeVisible();
    expect(screen.queryByText('Unmatched creator')).not.toBeInTheDocument();
  });
});
