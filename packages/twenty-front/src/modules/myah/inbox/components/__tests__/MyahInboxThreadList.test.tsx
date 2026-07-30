/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse a typed baseline prop fixture. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type * as ReactType from 'react';
import { useState } from 'react';

import { MyahInboxThreadList } from '@/myah/inbox/components/MyahInboxThreadList';

let mockObjectMetadataItems = [{ nameSingular: 'campaign' }];
const mockOpenRecordInSidePanel = jest.fn();

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
jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: {
      primary: 'white',
      transparent: { light: 'lightgray', lighter: 'whitesmoke' },
    },
    border: { color: { light: 'lightgray', medium: 'gray' } },
    font: {
      color: {
        danger: 'darkred',
        primary: 'black',
        secondary: 'dimgray',
        tertiary: 'gray',
      },
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
  IconButton: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel} />
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
    rightAdornment,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rightAdornment?: React.ReactNode;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {rightAdornment}
    </label>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => {
  const React = jest.requireActual('react') as typeof ReactType;

  return {
    Dropdown: ({
      clickableComponent,
      dropdownComponents,
    }: {
      clickableComponent: React.ReactNode;
      dropdownComponents: React.ReactNode;
    }) => {
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <div>
          <div onClick={() => setIsOpen((current) => !current)}>
            {clickableComponent}
          </div>
          {isOpen && dropdownComponents}
        </div>
      );
    },
  };
});

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
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
    creator: null,
    campaign: { id: 'campaign-1', name: 'Spring campaign' },
    inboxOwner: null,
  },
];

const filters = {
  owner: '',
  campaignId: null,
  campaignWorkspaceId: null,
  states: [] as Array<
    'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED'
  >,
  snoozeStatus: '' as const,
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
afterEach(() => {
  jest.useRealTimers();
});

describe('MyahInboxThreadList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockObjectMetadataItems = [{ nameSingular: 'campaign' }];
  });

  it('defers the campaign picker until campaign metadata is available', () => {
    mockObjectMetadataItems = [];

    render(<MyahInboxThreadList {...defaultProps} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Filter conversations' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading campaign filter',
    );
    expect(screen.queryByLabelText('Campaign filter')).not.toBeInTheDocument();
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

  it('opens a linked Creator in the native side panel without selecting the thread', () => {
    const onSelectThread = jest.fn();

    render(
      <MyahInboxThreadList {...defaultProps} onSelectThread={onSelectThread} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ada Creator' }));

    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: 'creator-1',
      objectNameSingular: 'creator',
      resetNavigationStack: true,
    });
    expect(onSelectThread).not.toHaveBeenCalled();
  });

  it('keeps State and Campaign in a search-adjacent filter menu', () => {
    const onFiltersChange = jest.fn();

    render(
      <MyahInboxThreadList
        {...defaultProps}
        onFiltersChange={onFiltersChange}
      />,
    );

    expect(screen.queryByLabelText('Queue')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Snooze status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('State')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Campaign filter')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Filter conversations' }),
    );

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

  it('renders neutral empty-Inbox copy', () => {
    render(<MyahInboxThreadList {...defaultProps} threads={[]} />);

    expect(screen.getByText('Inbox is clear')).toBeVisible();
    expect(
      screen.getByText('New readable conversations will appear here.'),
    ).toBeVisible();
    expect(
      screen.queryByText('No unmatched conversations'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Unmatched')).not.toBeInTheDocument();
  });

  it('labels a missing sender as unlinked rather than unmatched', () => {
    render(
      <MyahInboxThreadList
        {...defaultProps}
        threads={[{ ...threads[0], creator: null, lastMessageSender: null }]}
      />,
    );

    expect(screen.getByText('Unlinked sender')).toBeVisible();
    expect(screen.queryByText('Unmatched sender')).not.toBeInTheDocument();
  });

  it('renders a Campaign pill only for threads with a named linked Campaign', () => {
    render(
      <MyahInboxThreadList
        {...defaultProps}
        threads={[
          {
            ...threads[0],
            campaign: { id: 'campaign-1', name: 'Spring campaign' },
          },
          { ...threads[1], campaign: null },
          {
            ...threads[1],
            id: 'thread-3',
            campaign: { id: 'campaign-2', name: null },
          },
        ]}
      />,
    );

    expect(screen.getByLabelText('Campaign: Spring campaign')).toBeVisible();
    expect(screen.getAllByLabelText(/Campaign:/)).toHaveLength(1);
  });

  it('surfaces an expired snooze as due while leaving future snoozes snoozed', () => {
    render(
      <MyahInboxThreadList
        {...defaultProps}
        threads={[
          {
            ...threads[0],
            state: 'SNOOZED',
            snoozedUntil: '2000-01-01T00:00:00.000Z',
          },
          {
            ...threads[1],
            state: 'SNOOZED',
            snoozedUntil: '2999-01-01T00:00:00.000Z',
          },
        ]}
      />,
    );

    const expiredRow = screen.getByRole('option', {
      name: /First conversation/,
    });
    const futureRow = screen.getByRole('option', {
      name: /Second conversation/,
    });

    expect(expiredRow).toHaveTextContent('Snooze due');
    expect(expiredRow).toHaveTextContent('Attention needed');
    expect(futureRow).toHaveTextContent('snoozed');
    expect(futureRow).not.toHaveTextContent('due');
  });
  it('changes a visible snooze to due when its deadline passes', () => {
    jest.useFakeTimers({
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
    render(
      <MyahInboxThreadList
        {...defaultProps}
        threads={[
          {
            ...threads[0],
            state: 'SNOOZED',
            snoozedUntil: '2026-07-24T12:00:01.000Z',
          },
        ]}
      />,
    );

    const row = screen.getByRole('option', {
      name: /First conversation/,
    });

    expect(row).toHaveTextContent('snoozed');
    expect(row).not.toHaveTextContent('due');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(row).toHaveTextContent('Snooze due');
    expect(row).toHaveTextContent('Attention needed');
  });

  it('keeps the load-more control focused while deferred pagination is loading', async () => {
    let resolveFetchMore: () => void = () => {};
    const fetchMorePromise = new Promise<void>((resolve) => {
      resolveFetchMore = resolve;
    });
    const fetchMore = jest.fn(() => fetchMorePromise);
    const Harness = () => {
      const [loadingMore, setLoadingMore] = useState(false);

      const handleLoadMore = async () => {
        setLoadingMore(true);
        await fetchMore();
        setLoadingMore(false);
      };

      return (
        <MyahInboxThreadList
          {...defaultProps}
          hasNextPage
          loadingMore={loadingMore}
          onLoadMore={() => void handleLoadMore()}
        />
      );
    };

    render(<Harness />);

    const loadMoreButton = screen.getByRole('button', {
      name: 'Load more conversations',
    });
    loadMoreButton.focus();
    fireEvent.click(loadMoreButton);

    expect(fetchMore).toHaveBeenCalledTimes(1);
    expect(loadMoreButton).toHaveFocus();
    expect(loadMoreButton).toBeDisabled();
    expect(loadMoreButton).toHaveTextContent('Loading more conversations');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading more conversations',
    );

    await act(async () => {
      resolveFetchMore();
      await fetchMorePromise;
    });

    expect(loadMoreButton).toHaveFocus();
    expect(loadMoreButton).toBeEnabled();
    expect(loadMoreButton).toHaveTextContent('Load more conversations');
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
