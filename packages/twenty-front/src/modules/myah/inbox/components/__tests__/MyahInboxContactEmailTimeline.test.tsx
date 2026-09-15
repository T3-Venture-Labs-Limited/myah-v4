/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse typed message fixtures. */
import { fireEvent, render, screen, within } from '@testing-library/react';

import { MyahInboxContactEmailTimeline } from '@/myah/inbox/components/MyahInboxContactEmailTimeline';
import { type MyahInboxContactEmailMessage } from '@/myah/inbox/types/MyahInboxContact';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

jest.mock('@/activities/emails/components/EmailThreadMessageBody', () => ({
  EmailThreadMessageBody: ({ body }: { body: string }) => (
    <div data-testid="native-email-message-body">{body}</div>
  ),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    disabled,
    onClick,
  }: {
    title: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { sm: '4px' },
    },
    font: {
      color: {
        danger: 'darkred',
        primary: 'black',
        secondary: 'dimgray',
        tertiary: 'gray',
      },
      family: 'sans-serif',
      size: { sm: '13px', xs: '11px' },
      weight: { medium: 500, semiBold: 600 },
    },
    lastLayerZIndex: 1000,
    spacing: { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px' },
  },
}));

const message = (
  overrides: Partial<MyahInboxContactEmailMessage>,
): MyahInboxContactEmailMessage => ({
  id: 'message-1',
  messageThreadId: 'thread-a',
  subject: 'Launch details',
  text: 'First body',
  receivedAt: '2026-08-20T10:00:00.000Z',
  direction: 'INCOMING',
  visibility: 'FULL',
  participants: [
    { role: 'FROM', handle: 'ada@example.com', displayName: 'Ada' },
  ],
  attachmentFileIds: [],
  ...overrides,
});

const defaultProps = {
  messages: [message({})],
  selectedEmailThreadId: 'thread-a',
  loading: false,
  loadingMore: false,
  error: undefined,
  hasNextPage: false,
  onSelectEmailThread: jest.fn(),
  onLoadMore: jest.fn(),
  onRetry: jest.fn(),
};

describe('MyahInboxContactEmailTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves equal-time interleaved chronology and repeats subject/thread boundaries', () => {
    const onSelectEmailThread = jest.fn();
    const messages = [
      message({
        id: 'message-a-1',
        messageThreadId: 'thread-a',
        subject: 'Launch details',
        text: 'A first',
      }),
      message({
        id: 'message-b-1',
        messageThreadId: 'thread-b',
        subject: 'Rates',
        text: 'B first',
      }),
      message({
        id: 'message-a-2',
        messageThreadId: 'thread-a',
        subject: 'Launch details',
        text: 'A second',
      }),
      message({
        id: 'message-a-3',
        messageThreadId: 'thread-a',
        subject: 'Updated launch details',
        text: 'A third',
      }),
    ];

    render(
      <MyahInboxContactEmailTimeline
        {...defaultProps}
        messages={messages}
        onSelectEmailThread={onSelectEmailThread}
      />,
    );

    expect(
      screen
        .getAllByTestId('myah-inbox-email-message')
        .map((element) => element.getAttribute('data-message-id')),
    ).toEqual(['message-a-1', 'message-b-1', 'message-a-2', 'message-a-3']);
    expect(
      screen
        .getAllByRole('separator')
        .map((element) => element.getAttribute('aria-label')?.split(',')[0]),
    ).toEqual([
      'Email thread: Launch details',
      'Email thread: Rates',
      'Email thread: Launch details',
      'Email thread: Updated launch details',
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: /Select email thread Rates,/ }),
    );
    expect(onSelectEmailThread).toHaveBeenCalledWith('thread-b');
  });

  it('omits the duplicate reply target strip while preserving the selected thread separator', () => {
    render(<MyahInboxContactEmailTimeline {...defaultProps} />);

    expect(
      screen.queryByLabelText('Selected email thread'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Reply target')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Selected email thread Launch details,/,
      }),
    ).toBeVisible();
    expect(screen.getByTestId('native-email-message-body')).toHaveTextContent(
      'First body',
    );
  });

  it('uses the native body primitive for readable text and safely replaces restricted content', () => {
    render(
      <MyahInboxContactEmailTimeline
        {...defaultProps}
        messages={[
          message({ id: 'full-message', text: 'Readable email body' }),
          message({
            id: 'restricted-message',
            messageThreadId: 'thread-restricted',
            subject: 'Private metadata subject',
            text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
            visibility: 'METADATA',
            attachmentFileIds: ['attachment-that-must-not-render'],
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('native-email-message-body')).toHaveTextContent(
      'Readable email body',
    );
    expect(screen.getByText('Restricted subject')).toBeInTheDocument();
    expect(
      screen.getByText('Message content is restricted.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Private metadata subject'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('attachment-that-must-not-render'),
    ).not.toBeInTheDocument();
  });

  it('shows loading and retryable error states without a duplicate target strip', () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <MyahInboxContactEmailTimeline {...defaultProps} loading messages={[]} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading email messages',
    );
    expect(
      screen.queryByLabelText('Selected email thread'),
    ).not.toBeInTheDocument();

    rerender(
      <MyahInboxContactEmailTimeline
        {...defaultProps}
        messages={[]}
        error={{ message: 'Email history is unavailable' }}
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load email history');
    expect(alert).toHaveTextContent('Email history is unavailable');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('loads another page and reports pagination progress', () => {
    const onLoadMore = jest.fn();
    const { rerender } = render(
      <MyahInboxContactEmailTimeline
        {...defaultProps}
        hasNextPage
        onLoadMore={onLoadMore}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Load more email messages' }),
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <MyahInboxContactEmailTimeline
        {...defaultProps}
        hasNextPage
        loadingMore
        onLoadMore={onLoadMore}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Loading more email messages' }),
    ).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading more email messages',
    );
  });
});
