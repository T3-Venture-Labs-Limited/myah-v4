import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxThreadList } from '@/myah/inbox/components/MyahInboxThreadList';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: {
      primary: 'white',
      transparent: { light: 'lightgray', lighter: 'whitesmoke' },
    },
    border: { color: { light: 'lightgray', medium: 'gray' } },
    font: {
      color: { primary: 'black', secondary: 'dimgray', tertiary: 'gray' },
      family: 'sans-serif',
      size: { sm: '13px', xs: '11px' },
      weight: { medium: 500 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px', 6: '24px' },
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

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    options,
    emptyOption,
    onChange,
  }: {
    label: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    emptyOption?: { label: string; value: string };
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {emptyOption && (
          <option value={emptyOption.value}>{emptyOption.label}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

jest.mock('@/ui/input/components/TextInput', () => ({
  TextInput: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({
    FormSingleRecordPicker: ({
      label,
      defaultValue,
      onChange,
    }: {
      label: string;
      defaultValue: string | null;
      onChange: (value: string | null) => void;
    }) => (
      <label>
        {label}
        <select
          aria-label={label}
          value={defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">All campaigns</option>
          <option value="campaign-1">Spring campaign</option>
        </select>
      </label>
    ),
  }),
);

const threads = [
  {
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
  },
  {
    id: 'thread-2',
    lastActivityAt: '2026-07-24T11:00:00.000Z',
    subject: 'Second conversation',
    lastMessagePreview: 'Second preview',
    lastMessageSender: 'Grace',
    state: 'WAITING_ON_CREATOR' as const,
    snoozedUntil: null,
    creator: { id: 'creator-2', name: 'Grace Creator' },
    campaign: { id: 'campaign-1', name: 'Spring campaign' },
    inboxOwner: null,
  },
];

const filters = {
  queue: 'CREATOR_LINKED' as const,
  owner: '',
  campaignId: null,
  states: [] as Array<
    'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED'
  >,
  search: '',
};

const defaultProps = {
  threads,
  filters,
  selectedThreadId: 'thread-1',
  loading: false,
  loadingMore: false,
  error: undefined,
  hasNextPage: false,
  onSelectThread: jest.fn(),
  onFiltersChange: jest.fn(),
  onLoadMore: jest.fn(),
  onRetry: jest.fn(),
};

describe('MyahInboxThreadList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves selection and DOM focus explicitly with arrow, Home, and End keys', () => {
    const onSelectThread = jest.fn();

    render(
      <MyahInboxThreadList {...defaultProps} onSelectThread={onSelectThread} />,
    );

    const firstRow = screen.getByRole('option', {
      name: /First conversation/,
    });
    const secondRow = screen.getByRole('option', {
      name: /Second conversation/,
    });

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    expect(onSelectThread).toHaveBeenLastCalledWith('thread-2');
    expect(secondRow).toHaveFocus();

    fireEvent.keyDown(secondRow, { key: 'Home' });
    expect(onSelectThread).toHaveBeenLastCalledWith('thread-1');
    expect(firstRow).toHaveFocus();

    fireEvent.keyDown(firstRow, { key: 'End' });
    expect(onSelectThread).toHaveBeenLastCalledWith('thread-2');
    expect(secondRow).toHaveFocus();
  });

  it('renders labelled queue, owner, state, campaign, and search filters', () => {
    const onFiltersChange = jest.fn();

    render(
      <MyahInboxThreadList
        {...defaultProps}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Queue'), {
      target: { value: 'UNMATCHED' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      queue: 'UNMATCHED',
    });

    fireEvent.change(screen.getByLabelText('Owner'), {
      target: { value: 'ME' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, owner: 'ME' });

    fireEvent.change(screen.getByLabelText('State'), {
      target: { value: 'CLOSED' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      states: ['CLOSED'],
    });

    fireEvent.change(screen.getByLabelText('Campaign filter'), {
      target: { value: 'campaign-1' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      campaignId: 'campaign-1',
    });

    fireEvent.change(screen.getByLabelText('Search conversations'), {
      target: { value: 'Ada' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, search: 'Ada' });
  });

  it('distinguishes an empty Inbox from an empty Unmatched queue', () => {
    const { rerender } = render(
      <MyahInboxThreadList {...defaultProps} threads={[]} />,
    );

    expect(screen.getByText('Inbox is clear')).toBeVisible();
    expect(
      screen.getByText('New creator conversations will appear here.'),
    ).toBeVisible();

    rerender(
      <MyahInboxThreadList
        {...defaultProps}
        threads={[]}
        filters={{ ...filters, queue: 'UNMATCHED' }}
      />,
    );

    expect(screen.getByText('No unmatched conversations')).toBeVisible();
    expect(
      screen.getByText('Threads without a creator match will appear here.'),
    ).toBeVisible();
  });

  it('keeps rows and focus mounted while the next page is loading', () => {
    render(<MyahInboxThreadList {...defaultProps} loadingMore />);

    const firstRow = screen.getByRole('option', {
      name: /First conversation/,
    });
    firstRow.focus();

    expect(firstRow).toBeVisible();
    expect(firstRow).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading more conversations',
    );
  });

  it('shows loading and retryable error states without presenting stale rows', () => {
    const { rerender } = render(
      <MyahInboxThreadList {...defaultProps} threads={[]} loading />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading conversations',
    );

    rerender(
      <MyahInboxThreadList
        {...defaultProps}
        threads={[]}
        error={new Error('network unavailable')}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the Inbox',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
  });
});
