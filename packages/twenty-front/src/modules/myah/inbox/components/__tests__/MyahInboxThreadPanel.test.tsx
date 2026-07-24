import { fireEvent, render, screen } from '@testing-library/react';

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
  Button: ({
    title,
    onClick,
    disabled,
  }: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

const mockUseEmailThread = jest.fn();
const mockFetchMoreMessages = jest.fn();

jest.mock('@/activities/emails/hooks/useEmailThread', () => ({
  useEmailThread: (...args: unknown[]) => mockUseEmailThread(...args),
}));

jest.mock('@/activities/emails/components/EmailThreadMessage', () => ({
  EmailThreadMessage: ({ message }: { message: { id: string } }) => (
    <article>Native email message {message.id}</article>
  ),
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
    mockUseEmailThread.mockReturnValue({
      messages: [{ id: 'message-1' }, { id: 'message-2' }],
      threadLoading: false,
      fetchMoreMessages: mockFetchMoreMessages,
    });
  });

  it('renders active history through the native useEmailThread and EmailThreadMessage path', () => {
    render(<MyahInboxThreadPanel thread={thread} />);

    expect(mockUseEmailThread).toHaveBeenCalledWith('thread-1');
    expect(screen.getByText('Native email message message-1')).toBeVisible();
    expect(screen.getByText('Native email message message-2')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older messages' }),
    );
    expect(mockFetchMoreMessages).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /send/i }),
    ).not.toBeInTheDocument();
  });

  it('shows loading and empty native-history states', () => {
    mockUseEmailThread.mockReturnValue({
      messages: [],
      threadLoading: true,
      fetchMoreMessages: mockFetchMoreMessages,
    });
    const { rerender } = render(<MyahInboxThreadPanel thread={thread} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading conversation history',
    );

    mockUseEmailThread.mockReturnValue({
      messages: [],
      threadLoading: false,
      fetchMoreMessages: mockFetchMoreMessages,
    });
    rerender(<MyahInboxThreadPanel thread={thread} />);

    expect(
      screen.getByText('No visible messages in this conversation.'),
    ).toBeVisible();
  });
});
