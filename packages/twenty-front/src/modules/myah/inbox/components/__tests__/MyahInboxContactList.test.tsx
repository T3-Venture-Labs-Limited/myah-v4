/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse a typed baseline prop fixture. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type KeyboardEvent } from 'react';

import { MyahInboxContactHeader } from '@/myah/inbox/components/MyahInboxContactHeader';
import { MyahInboxContactList } from '@/myah/inbox/components/MyahInboxContactList';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: {
      primary: 'white',
      transparent: { lighter: 'whitesmoke' },
    },
    border: { color: { light: 'lightgray', medium: 'gray' } },
    font: {
      color: { primary: 'black', secondary: 'dimgray', tertiary: 'gray' },
      family: 'sans-serif',
      size: { md: '15px', sm: '13px', xs: '11px' },
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

jest.mock('@/myah/inbox/components/MyahInboxThreadFilters', () => ({
  MyahInboxThreadFilters: ({
    filters,
    onFiltersChange,
    onRefresh,
  }: {
    filters: { search: string };
    onFiltersChange: (filters: { search: string }) => void;
    onRefresh: () => void;
  }) => (
    <div>
      <label>
        Search contacts
        <input
          aria-label="Search contacts"
          value={filters.search}
          onChange={(event) =>
            onFiltersChange({ ...filters, search: event.target.value })
          }
        />
      </label>
      <button onClick={onRefresh}>Refresh contacts</button>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxContactRow', () => ({
  MyahInboxContactRow: ({
    contact,
    isSelected,
    tabIndex,
    rowRef,
    onSelect,
    onKeyDown,
  }: {
    contact: MyahInboxContact;
    isSelected: boolean;
    tabIndex: number;
    rowRef: (element: HTMLButtonElement | null) => void;
    onSelect: (contactId: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  }) => (
    <button
      ref={rowRef}
      role="option"
      aria-selected={isSelected}
      tabIndex={tabIndex}
      onClick={() => onSelect(contact.id)}
      onKeyDown={onKeyDown}
    >
      {contact.displayName}
    </button>
  ),
}));

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

const contacts: MyahInboxContact[] = [
  {
    id: 'contact-1',
    identityKind: 'CREATOR',
    displayName: 'Ada Creator',
    instagramUsername: 'ada',
    creator: { id: 'creator-1', name: 'Ada Creator' },
    lastActivityAt: '2026-07-24T12:00:00.000Z',
    latestChannel: 'EMAIL',
    preview: 'First preview',
    sender: 'ada@example.com',
    needsAttention: true,
    email: {
      isAvailable: true,
      threadCount: 2,
      threadIds: ['thread-1', 'thread-2'],
      latestThreadId: 'thread-2',
      needsAttention: true,
    },
    instagram: {
      isAvailable: true,
      state: 'READY',
      needsAttention: false,
      conversations: [],
    },
  },
  {
    id: 'contact-2',
    identityKind: 'EMAIL_THREAD',
    displayName: 'Grace Hopper',
    instagramUsername: null,
    creator: null,
    lastActivityAt: '2026-07-24T11:00:00.000Z',
    latestChannel: 'EMAIL',
    preview: 'Second preview',
    sender: 'grace@example.com',
    needsAttention: false,
    email: {
      isAvailable: true,
      threadCount: 1,
      threadIds: ['thread-3'],
      latestThreadId: 'thread-3',
      needsAttention: false,
    },
    instagram: {
      isAvailable: false,
      state: 'UNAVAILABLE',
      needsAttention: false,
      conversations: [],
    },
  },
];

const filters = {
  owner: '',
  campaignId: null,
  campaignWorkspaceId: null,
  states: [],
  snoozeStatus: '' as const,
  search: '',
};

const defaultProps = {
  contacts,
  filters,
  selectedContactId: 'contact-1',
  loading: false,
  loadingMore: false,
  isRefreshing: false,
  refreshStatus: 'idle' as const,
  refreshError: null,
  error: undefined,
  hasNextPage: false,
  onSelectContact: jest.fn(),
  onFiltersChange: jest.fn(),
  onLoadMore: jest.fn(),
  onRefresh: jest.fn(),
  onRetry: jest.fn(),
};

describe('MyahInboxContactList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves selection and DOM focus with Arrow, Home, and End keys', () => {
    const onSelectContact = jest.fn();

    render(
      <MyahInboxContactList
        {...defaultProps}
        onSelectContact={onSelectContact}
      />,
    );

    const firstRow = screen.getByRole('option', { name: 'Ada Creator' });
    const secondRow = screen.getByRole('option', { name: 'Grace Hopper' });

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    expect(onSelectContact).toHaveBeenLastCalledWith('contact-2', {
      openConversation: false,
    });
    expect(secondRow).toHaveFocus();

    fireEvent.keyDown(secondRow, { key: 'ArrowUp' });
    expect(onSelectContact).toHaveBeenLastCalledWith('contact-1', {
      openConversation: false,
    });
    expect(firstRow).toHaveFocus();

    fireEvent.keyDown(firstRow, { key: 'End' });
    expect(onSelectContact).toHaveBeenLastCalledWith('contact-2', {
      openConversation: false,
    });
    expect(secondRow).toHaveFocus();

    fireEvent.keyDown(secondRow, { key: 'Home' });
    expect(onSelectContact).toHaveBeenLastCalledWith('contact-1', {
      openConversation: false,
    });
    expect(firstRow).toHaveFocus();
  });

  it('keeps one visible contact in the tab order without selecting it', () => {
    render(<MyahInboxContactList {...defaultProps} selectedContactId={null} />);

    expect(screen.getByRole('option', { name: 'Ada Creator' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(
      screen.getByRole('option', { name: 'Grace Hopper' }),
    ).toHaveAttribute('tabindex', '-1');
  });

  it('passes search filters and refresh through the established Inbox controls', () => {
    const onFiltersChange = jest.fn();
    const onRefresh = jest.fn();

    render(
      <MyahInboxContactList
        {...defaultProps}
        onFiltersChange={onFiltersChange}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.change(screen.getByLabelText('Search contacts'), {
      target: { value: '@ada' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      search: '@ada',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh contacts' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows loading, empty, and retryable error states without stale rows', () => {
    const { rerender } = render(
      <MyahInboxContactList {...defaultProps} contacts={[]} loading />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading contacts');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    rerender(<MyahInboxContactList {...defaultProps} contacts={[]} />);
    expect(screen.getByText('Inbox is clear')).toBeVisible();
    expect(
      screen.getByText('New readable contacts will appear here.'),
    ).toBeVisible();

    rerender(
      <MyahInboxContactList
        {...defaultProps}
        contacts={[]}
        filters={{ ...filters, search: 'missing creator' }}
      />,
    );
    expect(screen.getByText('No contacts match these filters')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
      owner: '',
      campaignId: null,
      campaignWorkspaceId: null,
      states: [],
      snoozeStatus: '',
      search: '',
    });

    rerender(
      <MyahInboxContactList
        {...defaultProps}
        contacts={[]}
        error={new Error('network unavailable')}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load Inbox contacts',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps pagination visible and focused while loading the next page', () => {
    const { rerender } = render(
      <MyahInboxContactList {...defaultProps} hasNextPage />,
    );

    const loadMoreButton = screen.getByRole('button', {
      name: 'Load more contacts',
    });
    expect(
      within(
        screen.getByRole('listbox', { name: 'Inbox contacts' }),
      ).queryByRole('button', { name: 'Load more contacts' }),
    ).not.toBeInTheDocument();
    loadMoreButton.focus();
    fireEvent.click(loadMoreButton);
    expect(defaultProps.onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <MyahInboxContactList {...defaultProps} hasNextPage loadingMore />,
    );

    expect(loadMoreButton).toHaveFocus();
    expect(loadMoreButton).toBeDisabled();
    expect(loadMoreButton).toHaveTextContent('Loading more contacts');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading more contacts',
    );
  });
});

describe('MyahInboxContactHeader', () => {
  it('shows the selected contact and changes the exact Email thread target', () => {
    const onSelectEmailThread = jest.fn();

    render(
      <MyahInboxContactHeader
        contact={contacts[0]}
        channel="EMAIL"
        selectedEmailThreadId="thread-2"
        emailThreadOptions={[
          {
            id: 'thread-1',
            subject: 'Spring launch follow-up',
            detail: 'Ada · Sep 4, 2026',
          },
          {
            id: 'thread-2',
            subject: 'Spring launch follow-up',
            detail: 'Brand · Sep 5, 2026',
          },
        ]}
        onSelectEmailThread={onSelectEmailThread}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ada Creator' })).toBeVisible();
    const target = screen.getByLabelText('Email thread');
    expect(target).toHaveValue('thread-2');
    expect(target).toHaveDisplayValue(
      'Spring launch follow-up · Brand · Sep 5, 2026',
    );

    fireEvent.change(target, { target: { value: 'thread-1' } });
    expect(onSelectEmailThread).toHaveBeenCalledWith('thread-1');
  });

  it('does not show an Email subject target for Instagram', () => {
    render(
      <MyahInboxContactHeader
        contact={contacts[0]}
        channel="INSTAGRAM"
        selectedEmailThreadId="thread-2"
        emailThreadOptions={[
          {
            id: 'thread-2',
            subject: 'Spring launch follow-up',
            detail: 'Brand · Sep 5, 2026',
          },
        ]}
        onSelectEmailThread={jest.fn()}
      />,
    );

    expect(screen.getByText('Instagram')).toBeVisible();
    expect(screen.queryByLabelText('Email thread')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Spring launch follow-up'),
    ).not.toBeInTheDocument();
  });
});
