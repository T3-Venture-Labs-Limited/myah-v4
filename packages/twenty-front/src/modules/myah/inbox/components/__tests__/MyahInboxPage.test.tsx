import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const mockRefetch = jest.fn();
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
    mockRefetch.mockReset();
    mockIsMobile = false;
    mockCurrentWorkspaceId = 'workspace-1';
    mockUseMyahInboxThreads.mockReturnValue({
      threads,
      loading: false,
      error: undefined,
      hasNextPage: false,
      loadMore: jest.fn(),
      refetch: mockRefetch,
    });
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
      refetch: mockRefetch,
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
      refetch: mockRefetch,
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
      refetch: mockRefetch,
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

  it('announces a successful header update, refetches, and keeps an eligible selection', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText('Selected thread')).toHaveTextContent(
        'thread-1',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Second conversation' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Update conversation test double' }),
    );

    expect(mockRefetch).toHaveBeenCalledTimes(1);
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
      refetch: mockRefetch,
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
        refetch: mockRefetch,
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

  it('scopes the sidebar thread bridge to selection, page, and workspace', async () => {
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
      refetch: jest.fn(),
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

    await waitFor(() => {
      expect(store.get(myahInboxSelectedThreadIdState.atom)).toBeNull();
      expect(store.get(myahInboxSelectionWorkspaceIdState.atom)).toBeNull();
    });
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
