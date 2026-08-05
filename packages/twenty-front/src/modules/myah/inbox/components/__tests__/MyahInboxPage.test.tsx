import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import type * as React from 'react';
import { createRoot } from 'react-dom/client';

import { MyahInboxPage } from '@/myah/inbox/components/MyahInboxPage';
import {
  myahInboxFiltersState,
  myahInboxSelectionWorkspaceIdState,
  myahInboxSelectedThreadIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';

jest.mock('twenty-ui/theme-constants', () => {
  const { createContext } = jest.requireActual<typeof React>('react');

  return {
    ThemeContext: createContext({
      theme: { icon: { size: { md: 16 } } },
    }),
    themeCssVariables: {
      background: { primary: 'white' },
      border: { color: { light: 'lightgray' } },
      font: { color: { tertiary: 'gray' }, size: { xs: '11px' } },
      spacing: { 1: '4px', 2: '8px', 3: '12px' },
    },
  };
});

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
const mockRefresh = jest.fn();
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
    onRefresh,
    isRefreshing,
    refreshStatus,
    refreshError,
  }: {
    threads: Array<{ id: string; subject: string | null }>;
    selectedThreadId: string | null;
    onSelectThread: (id: string) => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    refreshStatus?: 'idle' | 'refreshing' | 'succeeded' | 'failed';
    refreshError?: string | null;
  }) => (
    <div aria-label="Thread list test double">
      <output aria-label="Selected thread">{selectedThreadId ?? 'none'}</output>
      {threads.some((thread) => thread.id === selectedThreadId) && (
        <output aria-label="Selected list row">{selectedThreadId}</output>
      )}
      <output aria-label="Refresh status">{refreshStatus ?? 'missing'}</output>
      <button
        aria-label="Refresh Inbox"
        disabled={isRefreshing}
        onClick={() => onRefresh?.()}
      >
        Refresh Inbox
      </button>
      {refreshError && <div role="alert">{refreshError}</div>}
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
    onThreadUpdated,
  }: {
    thread: { id: string; subject: string | null } | null;
    onThreadUpdated?: (message: string) => void;
  }) => (
    <div>
      Conversation panel {thread?.id ?? 'none'}
      <button onClick={() => onThreadUpdated?.('Conversation updated')}>
        Update conversation test double
      </button>
    </div>
  ),
}));

jest.mock('@/ui/layout/page/components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({
    title,
    actionButton,
  }: {
    title: string;
    actionButton: React.ReactNode;
  }) => (
    <header data-testid="inbox-page-header">
      {title}
      {actionButton}
    </header>
  ),
}));

jest.mock('@/side-panel/components/SidePanelToggleButton', () => ({
  SidePanelToggleButton: () => (
    <button data-testid="page-header-side-panel-button">Open side panel</button>
  ),
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

jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({
    header,
    children,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="inbox-page-card-layout">
      {header}
      <main>{children}</main>
    </div>
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

type RefreshResult = {
  status: 'success' | 'failed' | 'ignored';
  selectedThread: (typeof threads)[number] | null;
};

const createDeferred = <Value,>() => {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
};

const createInboxState = (overrides: Record<string, unknown> = {}) => ({
  threads,
  loading: false,
  loadingMore: false,
  error: undefined,
  hasNextPage: false,
  loadMore: jest.fn(),
  refresh: mockRefresh,
  isRefreshing: false,
  refreshStatus: 'idle' as const,
  refreshError: null,
  ...overrides,
});

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
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue({
      status: 'success',
      selectedThread: threads[0],
    });
    mockIsMobile = false;
    mockCurrentWorkspaceId = 'workspace-1';
    mockUseMyahInboxThreads.mockReturnValue(createInboxState());
  });

  it('uses the exact native page-card shell, header, and side-panel control', () => {
    renderPage();

    const pageCardLayout = screen.getByTestId('inbox-page-card-layout');
    const pageHeader = screen.getByTestId('inbox-page-header');

    expect(pageCardLayout).toContainElement(pageHeader);
    expect(pageHeader).toHaveTextContent('Inbox');
    expect(screen.getByTestId('page-header-side-panel-button')).toBeVisible();
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
    expect(window.location.href).toBe(originalLocation);
  });

  it('keeps the first loaded row selected through development StrictMode replay', async () => {
    const store = createStore();

    render(
      <StrictMode>
        <JotaiProvider store={store}>
          <MyahInboxPage />
        </JotaiProvider>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
  });

  it('renders desktop list and conversation panes without a permanent context column', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );

    const list = screen.getByLabelText('Thread list test double');
    const conversation = screen.getByText('Conversation panel thread-1');
    expect(
      list.compareDocumentPosition(conversation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Context panel/)).not.toBeInTheDocument();
  });
  it('does not replace the initial selection after a refresh removes it', async () => {
    const store = createStore();
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );

    mockUseMyahInboxThreads.mockReturnValue({
      threads: [threads[1]],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refresh: mockRefresh,
    });

    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'none',
      ),
    );
  });
  it('does not automatically select again after switching A to B to A', async () => {
    const store = createStore();
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );

    mockCurrentWorkspaceId = 'workspace-2';
    mockUseMyahInboxThreads.mockReturnValue({
      threads: [threads[1]],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refresh: mockRefresh,
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-2',
      ),
    );

    mockCurrentWorkspaceId = 'workspace-1';
    mockUseMyahInboxThreads.mockReturnValue({
      threads: [threads[0]],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refresh: mockRefresh,
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'none',
      ),
    );
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
      refresh: jest.fn(),
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

  it('announces a successful header update, refreshes, and keeps an eligible selection', async () => {
    mockRefresh.mockResolvedValue({
      status: 'success',
      selectedThread: threads[1],
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Second conversation' }),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Update conversation test double',
        }),
      );
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Conversation updated')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
      'thread-2',
    );
  });
  it('clears an update announcement when the workspace changes', async () => {
    const store = createStore();
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Update conversation test double' }),
    );
    expect(screen.getByText('Conversation updated')).toHaveAttribute(
      'role',
      'status',
    );

    mockCurrentWorkspaceId = 'workspace-2';
    mockUseMyahInboxThreads.mockReturnValue({
      threads: [threads[1]],
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refresh: mockRefresh,
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Conversation updated'),
      ).not.toBeInTheDocument(),
    );
  });
  it("does not render A's update announcement in B before effects run", async () => {
    const store = createStore();
    const container = document.createElement('div');
    document.body.append(container);

    const root = createRoot(container);
    const reactActEnvironment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousReactActEnvironment =
      reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;

    try {
      flushSync(() => {
        root.render(
          <JotaiProvider store={store}>
            <MyahInboxPage />
          </JotaiProvider>,
        );
      });

      await waitFor(() =>
        expect(
          container.querySelector('[aria-label="Selected thread"]'),
        ).toHaveTextContent('thread-1'),
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Update conversation test double',
        }),
      );

      mockCurrentWorkspaceId = 'workspace-2';
      mockUseMyahInboxThreads.mockReturnValue({
        threads: [threads[1]],
        loading: false,
        error: undefined,
        hasNextPage: false,
        loadMore: jest.fn(),
        refresh: mockRefresh,
      });
      flushSync(() => {
        root.render(
          <JotaiProvider store={store}>
            <MyahInboxPage />
          </JotaiProvider>,
        );
      });

      expect(container).not.toHaveTextContent('Conversation updated');
    } finally {
      root.unmount();
      container.remove();
      reactActEnvironment.IS_REACT_ACT_ENVIRONMENT =
        previousReactActEnvironment;
    }
  });

  it('does not auto-select after a workspace starts with an initialized empty Inbox', async () => {
    const store = createStore();
    store.set(myahInboxFiltersState.atom, {
      owner: 'ME',
      campaignId: 'campaign-1',
      campaignWorkspaceId: 'workspace-1',
      states: ['CLOSED'],
      search: 'Ada',
    } as never);
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
      refresh: jest.fn(),
    });
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    expect(mockUseMyahInboxThreads.mock.lastCall).toEqual([
      {
        owner: 'ME',
        campaignId: null,
        campaignWorkspaceId: null,
        states: ['CLOSED'],
        search: 'Ada',
      },
      'workspace-2',
    ]);

    await waitFor(() =>
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull(),
    );
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
    expect(store.get(myahInboxFiltersState.atom)).toEqual({
      owner: 'ME',
      campaignId: null,
      campaignWorkspaceId: null,
      states: ['CLOSED'],
      search: 'Ada',
    });

    mockUseMyahInboxThreads.mockReturnValue({
      threads,
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refresh: jest.fn(),
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

    unmount();

    await waitFor(() => {
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull();
      expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
    });
  });

  it('keeps a selected first-page thread when refresh adds a newer row', async () => {
    const refreshDeferred = createDeferred<RefreshResult>();
    const refresh = jest.fn(() => refreshDeferred.promise);
    const newerThread = {
      ...threads[0],
      id: 'thread-newer',
      subject: 'Newer conversation',
    };
    const store = createStore();
    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({ refresh, refreshStatus: 'refreshing' }),
    );
    const { rerender } = renderPage(store);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    expect(refresh).toHaveBeenCalledWith('thread-1');

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({
        threads: [newerThread, ...threads],
        refresh,
        refreshStatus: 'succeeded',
      }),
    );
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await act(async () => {
      refreshDeferred.resolve({
        status: 'success',
        selectedThread: threads[0],
      });
      await refreshDeferred.promise;
    });

    expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
      'thread-1',
    );
    expect(store.get(myahInboxSelectedThreadIdState.atom)).toBe('thread-1');
    expect(screen.getByLabelText('Refresh status')).toHaveTextContent(
      'succeeded',
    );
  });

  it('retains a validated page-two selection after refresh removes it from the list', async () => {
    const pageTwoThread = {
      ...threads[1],
      id: 'thread-page-two',
      subject: 'Page two conversation',
    };
    const refreshDeferred = createDeferred<RefreshResult>();
    const refresh = jest.fn(() => refreshDeferred.promise);
    const store = createStore();
    const { rerender } = renderPage(store);

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({ threads: [threads[0], pageTwoThread], refresh }),
    );
    rerender(
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
      screen.getByRole('button', { name: 'Select Page two conversation' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    expect(refresh).toHaveBeenCalledWith('thread-page-two');

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({
        threads,
        refresh,
        isRefreshing: true,
        refreshStatus: 'refreshing',
      }),
    );
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await act(async () => {
      refreshDeferred.resolve({
        status: 'success',
        selectedThread: pageTwoThread,
      });
      await refreshDeferred.promise;
    });

    expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
      'thread-page-two',
    );
    expect(
      screen.queryByLabelText('Selected list row'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Conversation panel thread-page-two'),
    ).toBeVisible();
    expect(store.get(myahInboxSelectedThreadIdState.atom)).toBe(
      'thread-page-two',
    );
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBe(
      'workspace-1',
    );
  });

  it('clears a page-two selection without choosing a replacement when validation returns no thread', async () => {
    const pageTwoThread = {
      ...threads[1],
      id: 'thread-page-two',
      subject: 'Page two conversation',
    };
    const refreshDeferred = createDeferred<RefreshResult>();
    const refresh = jest.fn(() => refreshDeferred.promise);
    const store = createStore();
    const { rerender } = renderPage(store);

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({ threads: [threads[0], pageTwoThread], refresh }),
    );
    rerender(
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
      screen.getByRole('button', { name: 'Select Page two conversation' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    expect(refresh).toHaveBeenCalledWith('thread-page-two');

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({
        threads,
        refresh,
        isRefreshing: true,
        refreshStatus: 'refreshing',
      }),
    );
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await act(async () => {
      refreshDeferred.resolve({ status: 'success', selectedThread: null });
      await refreshDeferred.promise;
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'none',
      ),
    );
    expect(screen.getByText('Conversation panel none')).toBeVisible();
    expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull();
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
    expect(
      screen.queryByLabelText('Selected list row'),
    ).not.toBeInTheDocument();
  });

  it('preserves the selected panel while exposing a refresh-only failure', async () => {
    const refreshDeferred = createDeferred<RefreshResult>();
    const refresh = jest.fn(() => refreshDeferred.promise);
    const store = createStore();
    const { rerender } = renderPage(store);

    mockUseMyahInboxThreads.mockReturnValue(createInboxState({ refresh }));
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    expect(refresh).toHaveBeenCalledWith('thread-1');

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({
        refresh,
        refreshStatus: 'failed',
        refreshError: new Error('Could not refresh Inbox.'),
      }),
    );
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await act(async () => {
      refreshDeferred.resolve({ status: 'failed', selectedThread: null });
      await refreshDeferred.promise;
    });

    expect(screen.getByText('Conversation panel thread-1')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not refresh Inbox.',
    );
    expect(store.get(myahInboxSelectedThreadIdState.atom)).toBe('thread-1');
  });

  it('does not auto-select a first thread that arrives after an initialized empty scope', async () => {
    const store = createStore();
    mockUseMyahInboxThreads.mockReturnValue(createInboxState({ threads: [] }));
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull(),
    );
    mockUseMyahInboxThreads.mockReturnValue(createInboxState());
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );

    expect(screen.getByLabelText('Selected thread')).toHaveTextContent('none');
    expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
  });

  it.each(['workspace', 'state', 'campaign', 'owner', 'snooze', 'search'])(
    'ignores a stale refresh validation after the %s scope changes',
    async (scope) => {
      const refreshDeferred = createDeferred<RefreshResult>();
      const refresh = jest.fn(() => refreshDeferred.promise);
      const store = createStore();
      mockUseMyahInboxThreads.mockReturnValue(createInboxState({ refresh }));
      const { rerender } = renderPage(store);

      await waitFor(() =>
        expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
          'thread-1',
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
      expect(refresh).toHaveBeenCalledWith('thread-1');

      mockUseMyahInboxThreads.mockReturnValue(
        createInboxState({ threads: [] }),
      );
      if (scope === 'workspace') {
        mockCurrentWorkspaceId = 'workspace-2';
      } else {
        await act(async () => {
          const currentFilters = store.get(myahInboxFiltersState.atom);
          store.set(myahInboxFiltersState.atom, {
            ...currentFilters,
            ...(scope === 'state' ? { states: ['CLOSED'] } : {}),
            ...(scope === 'campaign'
              ? {
                  campaignId: 'campaign-1',
                  campaignWorkspaceId: 'workspace-1',
                }
              : {}),
            ...(scope === 'owner' ? { owner: 'ME' } : {}),
            ...(scope === 'snooze' ? { snoozeStatus: 'ACTIVE' } : {}),
            ...(scope === 'search' ? { search: 'Ada' } : {}),
          });
        });
      }
      rerender(
        <JotaiProvider store={store}>
          <MyahInboxPage />
        </JotaiProvider>,
      );

      await act(async () => {
        refreshDeferred.resolve({
          status: 'success',
          selectedThread: threads[0],
        });
        await refreshDeferred.promise;
      });

      await waitFor(() =>
        expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull(),
      );
      expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
      expect(screen.getByText('Conversation panel none')).toBeVisible();
      expect(screen.getByLabelText('Refresh status')).toHaveTextContent('idle');
    },
  );

  it('does one same-scope refresh and clears the original selection once when validation returns null', async () => {
    const refreshDeferred = createDeferred<RefreshResult>();
    const refresh = jest.fn(() => refreshDeferred.promise);
    const store = createStore();
    mockUseMyahInboxThreads.mockReturnValue(createInboxState({ refresh }));
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('thread-1');

    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({ threads: [], refresh, refreshStatus: 'succeeded' }),
    );
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await act(async () => {
      refreshDeferred.resolve({ status: 'success', selectedThread: null });
      await refreshDeferred.promise;
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'none',
      ),
    );
    expect(screen.getByText('Conversation panel none')).toBeVisible();
  });

  it('does not let an older refresh clear a thread selected during its validation', async () => {
    const refreshDeferred = createDeferred<RefreshResult>();
    const refresh = jest.fn(() => refreshDeferred.promise);
    const store = createStore();
    mockUseMyahInboxThreads.mockReturnValue(createInboxState({ refresh }));
    const { rerender } = renderPage(store);

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    expect(refresh).toHaveBeenCalledWith('thread-1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Second conversation' }),
    );
    mockUseMyahInboxThreads.mockReturnValue(
      createInboxState({ refresh, refreshStatus: 'succeeded' }),
    );
    rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await act(async () => {
      refreshDeferred.resolve({ status: 'success', selectedThread: null });
      await refreshDeferred.promise;
    });

    expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
      'thread-2',
    );
    expect(screen.getByText('Conversation panel thread-2')).toBeVisible();
    expect(store.get(myahInboxSelectedThreadIdState.atom)).toBe('thread-2');
  });

  it('provides narrow-screen access to list and conversation panes', async () => {
    mockIsMobile = true;
    renderPage();

    expect(screen.getByRole('button', { name: 'Threads' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conversation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Threads' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Conversation' }),
    ).toHaveAttribute('aria-pressed', 'false');

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

    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));
    expect(screen.getByLabelText('Thread list test double')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Threads' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
