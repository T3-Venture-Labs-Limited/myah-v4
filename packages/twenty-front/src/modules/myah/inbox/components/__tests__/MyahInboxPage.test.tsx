import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { MyahInboxPage } from '@/myah/inbox/components/MyahInboxPage';
import {
  myahInboxSelectionWorkspaceIdState,
  myahInboxSelectedThreadIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white' },
    border: { color: { light: 'lightgray' } },
    font: { color: { tertiary: 'gray' }, size: { xs: '11px' } },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

jest.mock('twenty-ui/input', () => ({
  SegmentedControl: ({
    ariaLabel,
    value,
    options,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    options: Array<{ label: string; value: string; disabled?: boolean }>;
    onChange: (value: string) => void;
  }) => (
    <div role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

const mockUseMyahInboxThreads = jest.fn();
let mockIsMobile = false;
let mockCurrentWorkspaceId = 'workspace-1';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: mockCurrentWorkspaceId }),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxThreads', () => ({
  useMyahInboxThreads: (...args: unknown[]) => mockUseMyahInboxThreads(...args),
}));

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

jest.mock('@/myah/inbox/components/MyahInboxThreadList', () => ({
  MyahInboxThreadList: ({
    threads,
    selectedThreadId,
    onSelectThread,
  }: {
    threads: Array<{ id: string; subject: string | null }>;
    selectedThreadId: string | null;
    onSelectThread: (id: string) => void;
  }) => (
    <div aria-label="Thread list test double">
      <output aria-label="Selected thread">{selectedThreadId ?? 'none'}</output>
      {threads.map((thread) => (
        <button key={thread.id} onClick={() => onSelectThread(thread.id)}>
          Select {thread.subject}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxThreadPanel', () => ({
  MyahInboxThreadPanel: ({
    thread,
  }: {
    thread: { id: string; subject: string | null } | null;
  }) => <div>Conversation panel {thread?.id ?? 'none'}</div>,
}));

jest.mock('@/myah/inbox/components/MyahInboxContextPanel', () => ({
  MyahInboxContextPanel: ({
    thread,
    onTriageSaveStarted,
    onTriageSaved,
  }: {
    thread: { id: string; subject: string | null } | null;
    onTriageSaveStarted?: () => void;
    onTriageSaved?: (message: string) => void;
  }) => (
    <div>
      Context panel {thread?.id ?? 'none'}
      {thread && (
        <>
          <button
            onClick={() => {
              onTriageSaveStarted?.();
              onTriageSaved?.('Triage saved');
            }}
          >
            Save triage test double
          </button>
          <button onClick={onTriageSaveStarted}>Fail triage test double</button>
        </>
      )}
    </div>
  ),
}));

jest.mock('@/ui/layout/page/components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

jest.mock('@/ui/layout/page/components/PageBody', () => ({
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

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
    campaign: null,
    inboxOwner: null,
  },
];

const renderPage = (store = createStore()) => ({
  store,
  ...render(
    <JotaiProvider store={store}>
      <MyahInboxPage />
    </JotaiProvider>,
  ),
});

describe('MyahInboxPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMobile = false;
    mockCurrentWorkspaceId = 'workspace-1';
    mockUseMyahInboxThreads.mockReturnValue({
      threads,
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
  });

  it('selects the first loaded row without reading or changing the URL', async () => {
    const originalLocation = window.location.href;

    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    expect(screen.getByText('Conversation panel thread-1')).toBeVisible();
    expect(screen.getByText('Context panel thread-1')).toBeVisible();
    expect(window.location.href).toBe(originalLocation);
  });

  it('keeps an explicit selection stable while refreshed rows still contain it', async () => {
    const store = createStore();
    const { rerender } = render(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Second conversation' }),
    );
    expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
      'thread-2',
    );

    mockUseMyahInboxThreads.mockReturnValue({
      threads: [threads[1], threads[0]],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });

    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
      'thread-2',
    );
  });

  it('scopes the sidebar thread bridge to selection, page, and workspace', async () => {
    const store = createStore();
    const { rerender, unmount } = renderPage(store);

    await waitFor(() =>
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBe('thread-1'),
    );
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBe(
      'workspace-1',
    );

    mockCurrentWorkspaceId = 'workspace-2';
    mockUseMyahInboxThreads.mockReturnValue({
      threads: [],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull(),
    );
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();

    mockUseMyahInboxThreads.mockReturnValue({
      threads,
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBe('thread-1'),
    );
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBe(
      'workspace-2',
    );

    unmount();

    expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull();
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
  });

  it('keeps triage success announced after refetch removes the selected row', async () => {
    const store = createStore();
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save triage test double' }),
      ).toBeVisible(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save triage test double' }),
    );

    mockUseMyahInboxThreads.mockReturnValue({
      threads: [],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('Context panel none')).toBeVisible(),
    );
    expect(screen.getByText('Triage saved')).toHaveAttribute('role', 'status');
  });
  it('clears a previous triage success when the next save starts', async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save triage test double' }),
      ).toBeVisible(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save triage test double' }),
    );
    expect(screen.getByText('Triage saved')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Fail triage test double' }),
    );

    expect(screen.queryByText('Triage saved')).not.toBeInTheDocument();
  });

  it('provides narrow-screen access to list, conversation, and context panels', async () => {
    mockIsMobile = true;
    renderPage();

    expect(screen.getByRole('button', { name: 'Threads' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conversation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Context' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Threads' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Conversation' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Context' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select First conversation' }),
    );
    expect(screen.getByText('Conversation panel thread-1')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Conversation' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Selected: First conversation',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Context' }));
    expect(screen.getByText('Context panel thread-1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Context' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));
    expect(screen.getByLabelText('Thread list test double')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Threads' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
