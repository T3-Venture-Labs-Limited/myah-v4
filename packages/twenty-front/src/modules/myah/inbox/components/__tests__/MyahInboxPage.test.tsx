import { myahInboxPendingInstagramSelectionState } from '@/myah/inbox/states/myahInboxPendingInstagramSelectionState';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ComponentType } from 'react';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxPage } from '@/myah/inbox/components/MyahInboxPage';
import {
  EMPTY_MYAH_INBOX_CONTACT_SELECTION,
  myahInboxContactSelectionState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const flush = jest.fn().mockResolvedValue(undefined);
const flushWorkspace = jest.fn().mockResolvedValue(true);
const invalidateWorkspace = jest.fn();
const ambientRefreshContacts = jest.fn();
const ambientRefreshEmail = jest.fn();
const refreshContacts = jest.fn();
const loadMoreContacts = jest.fn();
const loadMoreEmail = jest.fn();
const refreshEmail = jest.fn();
const refreshSelectedThread = jest.fn();
const mockUseMyahInboxContacts = jest.fn();
const mockUseMyahInboxContactEmailMessages = jest.fn();
const mockUseMyahInboxEmailHistory = jest.fn();
const mockUseMyahInboxSelectedEmailThread = jest.fn();
const mockContextEffect = jest.fn();
const mockOpenCreatorContext = jest.fn();
let isMobile = false;
let mockThreadUpdated: (message: string) => void;
let mockContactLinked: (id: string) => void | Promise<void>;

jest.mock('twenty-ui/theme-constants', () => ({
  ThemeContext: require('react').createContext({
    theme: { icon: { size: { md: 16 } } },
  }),
  themeCssVariables: {
    brand: { focusRing: 'blue' },
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: { color: { light: 'gray' }, radius: { md: '4px' } },
    font: {
      color: { primary: 'black', secondary: 'gray', tertiary: 'gray' },
      size: { md: '14px', sm: '12px', xs: '11px' },
      weight: { semiBold: 600 },
    },
    spacing: {
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      6: '24px',
      8: '32px',
    },
  },
}));

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => isMobile,
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxDraftAutosaveController', () => ({
  MyahInboxDraftAutosaveProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
  useMyahInboxDraftAutosaveController: () => ({
    flush,
    flushWorkspace,
    flushWorkspaceForNavigation: (workspaceId: string) =>
      flushWorkspace(workspaceId),
    invalidateWorkspace,
    getEntry: () => null,
  }),
  useMyahInboxDraftAutosaveControllerContext: () => ({
    flush,
    flushWorkspace,
    flushWorkspaceForNavigation: (workspaceId: string) =>
      flushWorkspace(workspaceId),
    invalidateWorkspace,
    getEntry: () => null,
  }),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxContacts', () => ({
  useMyahInboxContacts: (...args: unknown[]) =>
    mockUseMyahInboxContacts(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxContactEmailMessages', () => ({
  useMyahInboxContactEmailMessages: (...args: unknown[]) =>
    mockUseMyahInboxContactEmailMessages(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxEmailHistory', () => ({
  useMyahInboxEmailHistory: (...args: unknown[]) =>
    mockUseMyahInboxEmailHistory(...args),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxSelectedEmailThread', () => ({
  useMyahInboxSelectedEmailThread: (...args: unknown[]) =>
    mockUseMyahInboxSelectedEmailThread(...args),
}));

jest.mock('@/myah/inbox/components/MyahInboxContextEffect', () => ({
  MyahInboxContextEffect: (props: {
    workspaceId: string | null;
    contact: MyahInboxContact | null;
  }) => {
    mockContextEffect(props);
    return null;
  },
}));

jest.mock('@/myah/inbox/hooks/useOpenMyahInboxContextInSidePanel', () => ({
  useOpenMyahInboxContextInSidePanel: () => ({
    openMyahInboxContextInSidePanel: mockOpenCreatorContext,
  }),
}));

jest.mock('@/myah/inbox/components/MyahInboxContactList', () => ({
  MyahInboxContactList: ({
    contacts,
    selectedContactId,
    onSelectContact,
    onRefresh,
    onRetry,
  }: {
    contacts: MyahInboxContact[];
    selectedContactId: string | null;
    onSelectContact: (
      id: string,
      options?: { openConversation?: boolean },
    ) => void;
    onRefresh: () => void;
    onRetry: () => void;
  }) => (
    <div aria-label="Contact list">
      {contacts.map((contact) => (
        <button
          key={contact.id}
          role="option"
          aria-selected={contact.id === selectedContactId}
          onClick={() =>
            onSelectContact(contact.id, { openConversation: true })
          }
        >
          Select {contact.displayName}
        </button>
      ))}
      <button onClick={onRefresh}>Refresh Inbox</button>
      <button onClick={onRetry}>Retry contacts</button>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxChannelTabs', () => ({
  MYAH_INBOX_EMAIL_PANEL_ID: 'email-panel',
  MYAH_INBOX_EMAIL_TAB_ID: 'email-tab',
  MYAH_INBOX_INSTAGRAM_PANEL_ID: 'instagram-panel',
  MYAH_INBOX_INSTAGRAM_TAB_ID: 'instagram-tab',
  MyahInboxChannelTabs: ({
    onChannelChange,
  }: {
    onChannelChange: (channel: 'EMAIL' | 'INSTAGRAM') => void;
  }) => (
    <div>
      <button onClick={() => onChannelChange('EMAIL')}>Email channel</button>
      <button onClick={() => onChannelChange('INSTAGRAM')}>
        Instagram channel
      </button>
    </div>
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
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxContactEmailTimeline', () => ({
  MyahInboxContactEmailTimeline: ({
    selectedEmailThreadId,
  }: {
    selectedEmailThreadId: string | null;
  }) => <div>Email timeline {selectedEmailThreadId ?? 'none'}</div>,
}));

jest.mock(
  '@/myah/inbox/components/MyahInboxInstagramConversationPanel',
  () => ({
    MyahInboxInstagramConversationPanel: ({
      contact,
    }: {
      contact: MyahInboxContact;
    }) => <div>Instagram timeline {contact.displayName}</div>,
  }),
);

jest.mock('@/myah/inbox/components/MyahInboxThreadActions', () => ({
  MyahInboxThreadActions: ({
    thread,
    onThreadUpdated,
  }: {
    thread: { id: string };
    onThreadUpdated: (message: string) => void;
  }) => {
    mockThreadUpdated = onThreadUpdated;
    return <div>Email actions {thread.id}</div>;
  },
}));
jest.mock('@/myah/inbox/components/MyahInboxContactTriageActions', () => ({
  MyahInboxContactTriageActions: () => null,
}));

jest.mock('@/myah/inbox/components/MyahInboxReplyWorkspace', () => ({
  MyahInboxReplyWorkspace: ({
    thread,
    onSent,
    scopeGeneration,
    arrivalEpoch,
    targetAvailable,
    presentation,
    replyTargets,
    onReplyTargetChange,
  }: {
    scopeGeneration: string;
    arrivalEpoch?: number;
    targetAvailable: boolean;
    presentation?: 'default' | 'main';
    thread: { id: string };
    onSent?: () => void | Promise<void>;
    replyTargets?: Array<{
      threadId: string;
      subject: string | null;
      campaignLabel: string | null;
    }>;
    onReplyTargetChange?: (threadId: string) => void;
  }) => (
    <div
      data-testid="draft-authority"
      data-scope={scopeGeneration}
      data-arrival={String(arrivalEpoch ?? 0)}
      data-available={String(targetAvailable)}
      data-presentation={presentation}
    >
      Email composer {thread.id}
      {presentation === 'main' && replyTargets ? (
        <select
          aria-label="Reply subject"
          value={thread.id}
          onChange={(event) => onReplyTargetChange?.(event.target.value)}
        >
          {replyTargets.map((target) => (
            <option key={target.threadId} value={target.threadId}>
              {target.subject}
              {target.campaignLabel ? ` · ${target.campaignLabel}` : ''}
            </option>
          ))}
        </select>
      ) : null}
      <button onClick={() => void onSent?.()}>Simulate Email sent</button>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxContactLinkAction', () => ({
  MyahInboxContactLinkAction: ({
    onLinked,
  }: {
    onLinked: (id: string) => void;
  }) => {
    mockContactLinked = onLinked;
    return (
      <button onClick={() => onLinked('contact-linked')}>Link Creator</button>
    );
  },
}));

jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

jest.mock('@/side-panel/components/SidePanelToggleButton', () => ({
  SidePanelToggleButton: () => <button>Side panel</button>,
}));

jest.mock('twenty-ui/icon', () => ({
  IconInbox: () => null,
  IconInfoCircle: () => <svg data-testid="creator-context-icon" />,
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    ariaLabel,
    onClick,
    disabled,
  }: {
    title: string;
    ariaLabel?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
  IconButton: ({
    Icon,
    ariaLabel,
    onClick,
    disabled,
  }: {
    Icon?: ComponentType;
    ariaLabel: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {Icon && <Icon />}
    </button>
  ),
  SegmentedControl: ({
    options,
    onChange,
  }: {
    options: Array<{ label: string; value: string; disabled?: boolean }>;
    onChange: (value: 'list' | 'conversation') => void;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value as 'list' | 'conversation')}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

const contact = (
  id: string,
  latestChannel: 'EMAIL' | 'INSTAGRAM',
  linked = true,
): MyahInboxContact => ({
  id,
  identityKind: linked ? 'CREATOR' : 'EMAIL_THREAD',
  displayName: id,
  instagramUsername: linked ? `${id}.ig` : null,
  creator: linked ? { id: `creator-${id}`, name: id } : null,
  lastActivityAt: '2026-09-05T12:00:00.000Z',
  latestChannel,
  initialSelection: {
    channel: latestChannel,
    emailThreadId: latestChannel === 'EMAIL' ? 'thread-2' : null,
    instagramConversationId:
      latestChannel === 'INSTAGRAM' ? `conversation-${id}` : null,
  },
  preview: `${id} preview`,
  sender: id,
  needsAttention: true,
  triage: {
    isAvailable: true,
    inboxOwnerId: null,
    inboxState: 'NEEDS_REPLY',
    snoozedUntil: null,
    revision: 1,
    identityGeneration: '1',
  },
  email: {
    isAvailable: true,
    threadCount: 2,
    threadIds: ['thread-1', 'thread-2'],
    latestThreadId: 'thread-2',
    needsAttention: true,
  },
  instagram: {
    isAvailable: linked,
    state: linked ? 'READY' : 'UNAVAILABLE',
    needsAttention: latestChannel === 'INSTAGRAM',
    conversations: linked
      ? [
          {
            id: `conversation-${id}`,
            providerConversationId: `provider-${id}`,
            provider: 'UNIPILE',
            lifecycle: 'ACTIVE',
            recipientUsername: `${id}.ig`,
            recipientDisplayName: id,
            lastActivityAt: '2026-09-05T12:00:00.000Z',
            latestDirection: 'INBOUND',
          },
        ]
      : [],
  },
});

const contacts = [
  contact('contact-1', 'EMAIL'),
  contact('contact-2', 'INSTAGRAM'),
];

const setDefaultHooks = () => {
  mockUseMyahInboxContacts.mockReturnValue({
    contacts,
    loading: false,
    loadingMore: false,
    error: undefined,
    hasNextPage: false,
    loadMore: loadMoreContacts,
    refresh: refreshContacts,
    ambientRefresh: ambientRefreshContacts,
    isRefreshing: false,
    refreshStatus: 'idle',
    refreshError: null,
  });
  mockUseMyahInboxEmailHistory.mockImplementation(
    (_workspace: string, contactId: string | null) => ({
      segments: contactId
        ? [
            {
              id: 'segment',
              snapshot: 'snapshot',
              olderCursor: null,
              requests: [],
              pages: [
                {
                  latestThreadId: 'thread-2',
                  cards: ['thread-1', 'thread-2'].map((id, index) => ({
                    threadId: id,
                    anchorKey: `legacy:${id}`,
                    rootMessageId: `${id}-root`,
                    subject: id,
                    campaignLabel:
                      index === 0 ? 'Spring Campaign' : 'Holiday Campaign',
                    startTimestamp: `2026-09-0${index + 1}T00:00:00Z`,
                    historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
                  })),
                },
              ],
            },
          ]
        : [],
      windows: [],
      detachedCards: [],
      status: 'ready',
      loading: false,
      missingMessageIds: [],
      refresh: refreshEmail,
      ambientRefresh: ambientRefreshEmail,
      openCard: jest.fn(),
      openDetachedCard: jest.fn(),
      setReadingAnchor: jest.fn(),
    }),
  );
  mockUseMyahInboxContactEmailMessages.mockReturnValue({
    messages: [
      {
        id: 'message-1',
        messageThreadId: 'thread-1',
        subject: 'First subject',
        text: 'Body',
        receivedAt: '2026-09-05T10:00:00.000Z',
        direction: 'INCOMING',
        visibility: 'FULL',
        participants: [],
        attachmentFileIds: [],
      },
    ],
    loading: false,
    loadingMore: false,
    error: undefined,
    hasNextPage: false,
    loadMore: loadMoreEmail,
    refresh: refreshEmail,
  });
  mockUseMyahInboxSelectedEmailThread.mockImplementation(
    (_workspaceId: string | null, threadId: string | null) => ({
      thread: threadId
        ? {
            id: threadId,
            subject: 'First subject',
            creator: { id: 'creator-1', name: 'Creator One' },
            campaign: null,
            inboxOwner: null,
            state: 'NEEDS_REPLY',
            snoozedUntil: null,
            lastActivityAt: '2026-09-05T10:00:00.000Z',
            lastMessagePreview: 'Body',
            lastMessageSender: 'creator@example.com',
          }
        : null,
      loading: false,
      error: null,
      refresh: refreshSelectedThread,
    }),
  );
};

const renderPage = (store = createStore()) => {
  store.set(currentWorkspaceState.atom, { id: 'workspace-1' } as never);

  return {
    store,
    ...render(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
      {
        wrapper: ({ children }) => (
          <MemoryRouter
            initialEntries={['/myah/inbox']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            {children}
          </MemoryRouter>
        ),
      },
    ),
  };
};

describe('MyahInboxPage contact-first flow', () => {
  it('waits for the real Creator contact and exact conversation, never default-selects over the pending destination', async () => {
    const store = createStore();
    store.set(myahInboxPendingInstagramSelectionState.atom, {
      workspaceId: 'workspace-1',
      creatorRecordId: 'creator-contact-2',
      conversationRecordId: 'conversation-contact-2',
    });
    mockUseMyahInboxContacts.mockReturnValue({
      ...mockUseMyahInboxContacts(),
      contacts: [contacts[0]],
    });
    const view = renderPage(store);
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Message sent');
    setDefaultHooks();
    view.rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    await waitFor(() =>
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual({
        workspaceId: 'workspace-1',
        contactId: 'contact-2',
        channel: 'INSTAGRAM',
        emailThreadId: null,
        instagramConversationId: 'conversation-contact-2',
      }),
    );
    expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toBeNull();
    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');
  });

  it('a newer explicit contact choice cancels a delayed destination', async () => {
    const store = createStore();
    store.set(myahInboxPendingInstagramSelectionState.atom, {
      workspaceId: 'workspace-1',
      creatorRecordId: 'creator-contact-2',
      conversationRecordId: 'conversation-contact-2',
    });
    mockUseMyahInboxContacts.mockReturnValue({
      ...mockUseMyahInboxContacts(),
      contacts: [contacts[0]],
    });
    const view = renderPage(store);
    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' })),
    );
    setDefaultHooks();
    view.rerender(
      <JotaiProvider store={store}>
        <MyahInboxPage />
      </JotaiProvider>,
    );
    expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toBeNull();
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
  });

  it('honors a non-default user choice while canceling an unloaded destination', async () => {
    const store = createStore();
    store.set(myahInboxPendingInstagramSelectionState.atom, {
      workspaceId: 'workspace-1',
      creatorRecordId: 'not-loaded',
      conversationRecordId: 'not-loaded',
    });
    renderPage(store);
    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' })),
    );
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-2',
    );
  });

  it.each([
    ['creator-contact-2', 'different-conversation'],
    ['different-creator', 'conversation-contact-2'],
  ])(
    'never infers destination from only part of %s / %s',
    (creatorRecordId, conversationRecordId) => {
      const store = createStore();
      const pending = {
        workspaceId: 'workspace-1',
        creatorRecordId,
        conversationRecordId,
      };
      store.set(myahInboxPendingInstagramSelectionState.atom, pending);
      renderPage(store);
      expect(
        store.get(myahInboxContactSelectionState.atom).contactId,
      ).toBeNull();
      expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toEqual(
        pending,
      );
    },
  );

  it('waits for the existing draft flush barrier and yields to a newer click while it is pending', async () => {
    let finishFlush: (saved: boolean) => void = () => undefined;
    flushWorkspace.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishFlush = resolve;
        }),
    );
    const store = createStore();
    store.set(myahInboxContactSelectionState.atom, {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'EMAIL',
      emailThreadId: 'thread-2',
      instagramConversationId: null,
    });
    store.set(myahInboxPendingInstagramSelectionState.atom, {
      workspaceId: 'workspace-1',
      creatorRecordId: 'creator-contact-2',
      conversationRecordId: 'conversation-contact-2',
    });
    renderPage(store);
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' })),
    );
    await act(async () => finishFlush(true));
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toBeNull();
  });

  it('does not commit a flushed destination after workspace change', async () => {
    let finishFlush: (saved: boolean) => void = () => undefined;
    flushWorkspace.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishFlush = resolve;
        }),
    );
    const store = createStore();
    store.set(myahInboxPendingInstagramSelectionState.atom, {
      workspaceId: 'workspace-1',
      creatorRecordId: 'creator-contact-2',
      conversationRecordId: 'conversation-contact-2',
    });
    renderPage(store);
    act(() =>
      store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never),
    );
    await act(async () => finishFlush(true));
    expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toBeNull();
    expect(store.get(myahInboxContactSelectionState.atom).workspaceId).not.toBe(
      'workspace-1',
    );
  });

  it('matches history gutters and leaves bottom space without restoring wrapper padding', () => {
    const source = readFileSync(
      resolve(__dirname, '../MyahInboxContactConversation.tsx'),
      'utf8',
    );
    const wrapperStyles = source.match(
      /const StyledReply = styled\.section`([\s\S]*?)`;/,
    )?.[1];
    expect(wrapperStyles).toBeDefined();
    expect(wrapperStyles).not.toContain('border-top:');
    expect(wrapperStyles).not.toContain('max-height:');
    expect(wrapperStyles).not.toMatch(/padding(?:-[a-z]+)?:/);
    expect(wrapperStyles).toContain(
      'margin: 0 ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[2]};',
    );
    const historySource = readFileSync(
      resolve(__dirname, '../MyahInboxEmailOutreachHistory.tsx'),
      'utf8',
    );
    expect(historySource).toContain(
      'padding: ${themeCssVariables.spacing[2]};',
    );
    const historyStyles = historySource.match(
      /const StyledHistory = styled\.section`([\s\S]*?)`;/,
    )?.[1];
    expect(historyStyles).toContain('scrollbar-gutter: stable;');
    expect(wrapperStyles).toContain('scrollbar-gutter: stable;');
  });

  it('publishes the authorized selected contact for Email and Instagram', async () => {
    const instagramOnlyContact: MyahInboxContact = {
      ...contacts[1],
      email: {
        isAvailable: false,
        threadCount: 0,
        threadIds: [],
        latestThreadId: null,
        needsAttention: false,
      },
    };
    mockUseMyahInboxContacts.mockReturnValue({
      ...mockUseMyahInboxContacts(),
      contacts: [contacts[0], instagramOnlyContact],
    });
    const { store } = renderPage();

    await waitFor(() =>
      expect(mockContextEffect).toHaveBeenLastCalledWith({
        workspaceId: 'workspace-1',
        contact: expect.objectContaining({ id: 'contact-1' }),
      }),
    );

    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' })),
    );
    expect(mockContextEffect).toHaveBeenLastCalledWith({
      workspaceId: 'workspace-1',
      contact: expect.objectContaining({ id: 'contact-2' }),
    });
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-2',
      channel: 'INSTAGRAM',
      emailThreadId: null,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    isMobile = false;
    setDefaultHooks();
    refreshEmail.mockReset().mockResolvedValue(undefined);
    refreshContacts.mockResolvedValue({
      status: 'success',
      selectedContact: contacts[0],
    });
  });

  it('checks for changes every 30 seconds while visible and re-authorizes history only on change or every 5 minutes', async () => {
    jest.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    jest
      .spyOn(document, 'visibilityState', 'get')
      .mockImplementation(() => visibility);
    ambientRefreshContacts.mockResolvedValue({
      status: 'success',
      selectedContact: contacts[0],
    });
    ambientRefreshEmail.mockResolvedValue(undefined);
    const arrival = () =>
      screen.getByTestId('draft-authority').getAttribute('data-arrival');
    try {
      const { store } = renderPage();
      await act(async () => jest.advanceTimersByTimeAsync(0));
      await screen.findByText('Email composer thread-2');
      const selection = store.get(myahInboxContactSelectionState.atom);

      // Unchanged selected contact: only the one contact-list check runs.
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(ambientRefreshContacts).toHaveBeenCalledWith('contact-1');
      expect(ambientRefreshEmail).not.toHaveBeenCalled();
      expect(arrival()).toBe('0');

      // A new readable creator response changes the signature.
      ambientRefreshContacts.mockResolvedValueOnce({
        status: 'success',
        selectedContact: {
          ...contacts[0],
          lastActivityAt: '2026-09-06T12:00:00.000Z',
          preview: 'A new creator reply',
        },
      });
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(ambientRefreshEmail).toHaveBeenCalledTimes(1);
      expect(arrival()).toBe('1');
      expect(refreshContacts).not.toHaveBeenCalled();
      expect(refreshEmail).not.toHaveBeenCalled();
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(selection);

      // Unchanged ticks stay cheap until 5 minutes since the last full check.
      await act(async () => jest.advanceTimersByTimeAsync(270_000));
      expect(ambientRefreshEmail).toHaveBeenCalledTimes(1);
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(ambientRefreshEmail).toHaveBeenCalledTimes(2);
      expect(arrival()).toBe('2');

      const checks = ambientRefreshContacts.mock.calls.length;
      visibility = 'hidden';
      await act(async () => jest.advanceTimersByTimeAsync(600_000));
      expect(ambientRefreshContacts).toHaveBeenCalledTimes(checks);
      visibility = 'visible';
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(ambientRefreshContacts).toHaveBeenCalledTimes(checks + 1);
    } finally {
      jest.useRealTimers();
      jest.restoreAllMocks();
    }
  });

  it('ignores an old exact header mutation completion after contact/channel scope changes', async () => {
    renderPage();
    await screen.findByText('Email composer thread-2');
    const oldCompletion = mockThreadUpdated;
    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' })),
    );
    refreshEmail.mockClear();
    refreshContacts.mockClear();
    await act(async () => oldCompletion('Obsolete action completed'));
    expect(screen.queryByText('Obsolete action completed')).toBeNull();
    expect(refreshEmail).not.toHaveBeenCalled();
    expect(refreshContacts).not.toHaveBeenCalled();
  });

  it('provides an Email-only keyboard-scrollable outer fallback without changing Instagram', async () => {
    renderPage();
    const email = await screen.findByRole('region', {
      name: 'Selected contact conversation',
    });
    expect(email).toHaveAttribute('tabindex', '0');
    email.focus();
    expect(email).toHaveFocus();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );
    expect(
      screen.getByRole('region', { name: 'Selected contact conversation' }),
    ).not.toHaveAttribute('tabindex');
  });

  it('waits for all draft keys before an intentional contact transition', async () => {
    let resolve!: (saved: boolean) => void;
    flushWorkspace.mockReturnValueOnce(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    const { store } = renderPage();
    await screen.findByText('Email composer thread-2');
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' }));
    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    await act(async () => resolve(true));
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-2',
    );
  });

  it('keeps the editor reachable when any affected key fails its intentional flush', async () => {
    flushWorkspace.mockResolvedValueOnce(false);
    const { store } = renderPage();
    await screen.findByText('Email composer thread-2');
    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' })),
    );
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    expect(screen.getByText('Email composer thread-2')).toBeVisible();
    expect(
      screen.getByText(
        'Resolve pending draft changes before leaving this conversation.',
      ),
    ).toBeVisible();
  });

  it('does not resume an old transition after a forced workspace switch', async () => {
    let resolve!: (saved: boolean) => void;
    flushWorkspace.mockReturnValueOnce(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    const { store } = renderPage();
    await screen.findByText('Email composer thread-2');
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' }));
    act(() =>
      store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never),
    );
    await act(async () => resolve(true));
    expect(store.get(myahInboxContactSelectionState.atom).workspaceId).not.toBe(
      'workspace-1',
    );
    expect(invalidateWorkspace).toHaveBeenCalledWith('workspace-1');
  });

  it('revalidates draft authority after contact refresh even when native membership is unchanged', async () => {
    renderPage();
    await screen.findByText('Email composer thread-2');
    const scope = screen
      .getByTestId('draft-authority')
      .getAttribute('data-scope');
    expect(scope).not.toBeNull();
    expect(screen.getByTestId('draft-authority')).toHaveAttribute(
      'data-available',
      'true',
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' })),
    );
    expect(
      screen.getByTestId('draft-authority').getAttribute('data-scope'),
    ).not.toBe(scope);
  });

  it.each(['Refresh Inbox', 'Retry contacts'])(
    '%s explicitly refreshes same-contact Email history without changing its authorization key',
    async (button) => {
      const { store } = renderPage();
      await screen.findByText('Email composer thread-2');
      const selection = store.get(myahInboxContactSelectionState.atom);
      const historyScope = mockUseMyahInboxEmailHistory.mock.calls.at(-1);
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: button })),
      );
      expect(refreshContacts).toHaveBeenCalledWith('contact-1');
      expect(refreshEmail).toHaveBeenCalledTimes(1);
      expect(mockUseMyahInboxEmailHistory.mock.calls.at(-1)).toEqual(
        historyScope,
      );
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(selection);
      expect(flushWorkspace).not.toHaveBeenCalled();
      expect(invalidateWorkspace).not.toHaveBeenCalled();
      expect(screen.getByText('Email composer thread-2')).toBeVisible();
    },
  );

  it.each(['failed', 'ignored'])(
    'does not refresh history or revalidate draft authority when contacts refresh is %s',
    async (status) => {
      renderPage();
      await screen.findByText('Email composer thread-2');
      const scope = screen
        .getByTestId('draft-authority')
        .getAttribute('data-scope');
      refreshContacts.mockResolvedValueOnce({ status, selectedContact: null });
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' })),
      );
      expect(refreshEmail).not.toHaveBeenCalled();
      expect(screen.getByTestId('draft-authority')).toHaveAttribute(
        'data-scope',
        scope,
      );
    },
  );

  it.each(['contact', 'channel', 'workspace', 'unmount'])(
    'does not refresh an old Email history after a pending contacts refresh and %s transition',
    async (transition) => {
      let complete!: (result: {
        status: 'success';
        selectedContact: MyahInboxContact;
      }) => void;
      refreshContacts.mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      );
      const { store, unmount } = renderPage();
      await screen.findByText('Email composer thread-2');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
      await act(async () => {
        if (transition === 'contact') {
          fireEvent.click(
            screen.getByRole('option', { name: 'Select contact-2' }),
          );
        } else if (transition === 'channel') {
          fireEvent.click(
            screen.getByRole('button', { name: 'Instagram channel' }),
          );
        } else if (transition === 'workspace') {
          store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never);
        } else {
          unmount();
        }
      });
      const selection = store.get(myahInboxContactSelectionState.atom);
      await act(async () =>
        complete({ status: 'success', selectedContact: contacts[0] }),
      );
      expect(refreshEmail).not.toHaveBeenCalled();
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(selection);
    },
  );

  it('does not refresh Email history for an Instagram selection', async () => {
    renderPage();
    await screen.findByText('Email composer thread-2');
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' })),
    );
    expect(refreshEmail).not.toHaveBeenCalled();
    expect(screen.getByText('Instagram timeline contact-1')).toBeVisible();
  });

  it('does not refresh Email history without a selected contact', async () => {
    mockUseMyahInboxContacts.mockReturnValue({
      ...mockUseMyahInboxContacts(),
      contacts: [],
    });
    refreshContacts.mockResolvedValueOnce({
      status: 'success',
      selectedContact: null,
    });
    renderPage();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' })),
    );
    expect(refreshContacts).toHaveBeenCalledWith(null);
    expect(refreshEmail).not.toHaveBeenCalled();
  });

  it.each(['removed', 'regrouped', 'Email unavailable'])(
    'does not refresh the old Email history when the refreshed contact is %s',
    async (change) => {
      const nextContact =
        change === 'removed'
          ? null
          : change === 'regrouped'
            ? contact('contact-regrouped', 'EMAIL')
            : {
                ...contacts[0],
                email: { ...contacts[0].email, isAvailable: false },
              };
      renderPage();
      await screen.findByText('Email composer thread-2');
      refreshContacts.mockResolvedValueOnce({
        status: 'success',
        selectedContact: nextContact,
      });
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' })),
      );
      expect(refreshEmail).not.toHaveBeenCalled();
    },
  );

  it('refreshes Email history exactly once after a current thread update', async () => {
    renderPage();
    await screen.findByText('Email composer thread-2');
    await act(async () => mockThreadUpdated('Thread updated'));
    expect(screen.getByText('Thread updated')).toBeVisible();
    expect(refreshEmail).toHaveBeenCalledTimes(1);
    expect(refreshSelectedThread).toHaveBeenCalledTimes(1);
    expect(refreshContacts).toHaveBeenCalledTimes(1);
  });

  it('selects the exact older card in the main reply composer without an inline editor', async () => {
    const { store } = renderPage();
    const header = await screen.findByLabelText('Contact conversation header');
    expect(within(header).getByText('Email actions thread-2')).toBeVisible();

    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Reply to thread-1' }),
      ),
    );

    expect(within(header).getByText('Email actions thread-1')).toBeVisible();
    expect(screen.getAllByText('Email composer thread-1')).toHaveLength(1);
    expect(screen.queryByText('Email composer thread-2')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Inline reply' })).toBeNull();
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-1',
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Main reply' })).toHaveFocus(),
    );
  });

  it('switches the main reply composer through the subject selector', async () => {
    const { store } = renderPage();
    await screen.findByText('Email composer thread-2');
    const selector = screen.getByRole('combobox', { name: 'Reply subject' });
    expect(selector).toHaveValue('thread-2');
    expect(selector).toHaveTextContent('thread-1 · Spring Campaign');
    expect(selector).toHaveTextContent('thread-2 · Holiday Campaign');

    await act(async () =>
      fireEvent.change(selector, { target: { value: 'thread-1' } }),
    );

    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-1',
    );
    expect(screen.getAllByText('Email composer thread-1')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Inline reply' })).toBeNull();
  });

  it('does not use the contact activity target before bounded outreach history resolves', () => {
    mockUseMyahInboxEmailHistory.mockReturnValue({
      segments: [],
      windows: [],
      detachedCards: [],
      missingMessageIds: [],
      status: 'idle',
      loading: true,
    });
    renderPage();
    expect(screen.queryByText(/Email composer/)).toBeNull();
    expect(screen.queryByText(/Email actions/)).toBeNull();
  });

  it('selects the first Contact with its latest channel and exact Email target', async () => {
    const { store } = renderPage();

    await waitFor(() =>
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual({
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        channel: 'EMAIL',
        emailThreadId: 'thread-2',
        instagramConversationId: null,
      }),
    );
    expect(screen.getByRole('heading', { name: 'contact-1' })).toBeVisible();
    expect(screen.getByText('Email composer thread-2')).toBeVisible();
  });

  it('refreshes contact, Email history, and exact thread after Email send', async () => {
    renderPage();

    await screen.findByText('Email composer thread-2');
    fireEvent.click(
      screen.getByRole('button', { name: 'Simulate Email sent' }),
    );

    await waitFor(() => {
      expect(refreshSelectedThread).toHaveBeenCalledTimes(1);
      expect(refreshEmail).toHaveBeenCalledTimes(1);
      expect(refreshContacts).toHaveBeenCalledWith('contact-1');
    });
  });

  it('flushes every affected Email draft before selecting another Contact', async () => {
    const { store } = renderPage();

    await screen.findByText('Email composer thread-2');
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' }));

    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');
    await waitFor(() =>
      expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
        contactId: 'contact-2',
        channel: 'INSTAGRAM',
        emailThreadId: null,
        instagramConversationId: 'conversation-contact-2',
      }),
    );
    expect(screen.getByText('Instagram timeline contact-2')).toBeVisible();
    expect(screen.queryByText(/Email composer/)).not.toBeInTheDocument();
  });

  it('clears exact Email authority when switching to Instagram', async () => {
    const { store } = renderPage();

    await screen.findByText('Email composer thread-2');
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );

    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      channel: 'INSTAGRAM',
      emailThreadId: null,
    });
    expect(screen.queryByText(/Email actions/)).not.toBeInTheDocument();
  });

  it('reapplies the recommendation through the draft barrier on explicit same-row reopen', async () => {
    const { store } = renderPage();

    await screen.findByText('Email composer thread-2');
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );
    flushWorkspace.mockClear();

    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' })),
    );

    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-1',
      channel: 'EMAIL',
      emailThreadId: 'thread-2',
    });
  });

  it('keeps the manual channel when an explicit same-row reopen cannot flush drafts', async () => {
    const { store } = renderPage();

    await screen.findByText('Email composer thread-2');
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );
    flushWorkspace.mockResolvedValueOnce(false);

    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' })),
    );

    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-1',
      channel: 'INSTAGRAM',
      emailThreadId: null,
    });
  });

  it('retains a valid selected Contact on refresh and clears a removed one', async () => {
    const { store } = renderPage();

    await screen.findByRole('heading', { name: 'contact-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    await waitFor(() =>
      expect(refreshContacts).toHaveBeenCalledWith('contact-1'),
    );
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );

    refreshContacts.mockResolvedValueOnce({
      status: 'success',
      selectedContact: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));

    await waitFor(() =>
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(
        EMPTY_MYAH_INBOX_CONTACT_SELECTION,
      ),
    );
  });

  it('does not let an older refresh overwrite a newer Contact selection', async () => {
    type RefreshResult = {
      status: 'success';
      selectedContact: MyahInboxContact;
    };
    const deferred = (
      Promise as PromiseConstructor & {
        withResolvers<Value>(): {
          promise: Promise<Value>;
          resolve: (value: Value | PromiseLike<Value>) => void;
        };
      }
    ).withResolvers<RefreshResult>();

    refreshContacts.mockReturnValueOnce(deferred.promise);
    const { store } = renderPage();

    await screen.findByRole('heading', { name: 'contact-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Inbox' }));
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' }));
    await act(async () => {
      deferred.resolve({ status: 'success', selectedContact: contacts[0] });
    });

    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-2',
    );
  });

  it('does not let a completed old Creator link retarget the currently selected contact', async () => {
    mockUseMyahInboxContacts.mockReturnValue({
      ...mockUseMyahInboxContacts(),
      contacts: [contact('contact-unmatched', 'EMAIL', false), contacts[1]],
    });
    const { store } = renderPage();
    await screen.findByText('Email composer thread-2');
    const oldCompletion = mockContactLinked;
    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' })),
    );
    refreshContacts.mockClear();
    refreshContacts.mockResolvedValue({
      status: 'success',
      selectedContact: contact('contact-linked', 'EMAIL'),
    });
    await act(async () => oldCompletion('contact-linked'));
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-2',
      channel: 'INSTAGRAM',
    });
    expect(screen.getByText('Instagram timeline contact-2')).toBeVisible();
    expect(refreshContacts).not.toHaveBeenCalled();
  });

  it('refreshes and preserves the exact target after explicit Creator link', async () => {
    mockUseMyahInboxContacts.mockReturnValue({
      ...mockUseMyahInboxContacts(),
      contacts: [contact('contact-unmatched', 'EMAIL', false)],
    });
    refreshContacts.mockResolvedValue({
      status: 'success',
      selectedContact: contact('contact-linked', 'EMAIL'),
    });
    const { store } = renderPage();

    await screen.findByRole('heading', { name: 'contact-unmatched' });
    fireEvent.click(screen.getByRole('button', { name: 'Link Creator' }));

    await waitFor(() =>
      expect(refreshContacts).toHaveBeenCalledWith('contact-linked', {
        force: true,
      }),
    );
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-linked',
      channel: 'EMAIL',
      emailThreadId: 'thread-2',
    });
  });

  it('preserves mobile access to Contacts and Conversation panes', async () => {
    isMobile = true;
    renderPage();

    await screen.findByText('Selected: contact-1');
    const selectedContact = screen.getByRole('option', {
      name: 'Select contact-1',
    });

    fireEvent.click(selectedContact);
    expect(screen.getByRole('heading', { name: 'contact-1' })).toBeVisible();
    expect(screen.getByLabelText('Conversation pane')).toHaveFocus();

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Contacts' })),
    );
    expect(screen.getByLabelText('Contact list')).toBeVisible();
    expect(
      screen.getByRole('option', { name: 'Select contact-1' }),
    ).toHaveFocus();
  });

  it('opens the current mobile conversation when recommendation reapply is draft-blocked', async () => {
    isMobile = true;
    const { store } = renderPage();

    await screen.findByText('Selected: contact-1');
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' }));
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Contacts' })),
    );
    flushWorkspace.mockResolvedValueOnce(false);

    await act(async () =>
      fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' })),
    );

    expect(screen.getByRole('heading', { name: 'contact-1' })).toBeVisible();
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      contactId: 'contact-1',
      channel: 'INSTAGRAM',
    });
  });

  it('opens Creator context from the same mobile control in both channels', async () => {
    isMobile = true;
    renderPage();
    await screen.findByText('Selected: contact-1');

    fireEvent.click(screen.getByRole('option', { name: 'Select contact-1' }));
    const creatorContextButton = screen.getByRole('button', {
      name: 'Creator context',
    });
    expect(
      within(creatorContextButton).getByTestId('creator-context-icon'),
    ).toBeVisible();
    expect(creatorContextButton).not.toHaveTextContent(/\S/);
    fireEvent.click(creatorContextButton);
    expect(mockOpenCreatorContext).toHaveBeenCalledTimes(1);

    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Instagram channel' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Creator context' }));
    expect(mockOpenCreatorContext).toHaveBeenCalledTimes(2);
  });

  it('best-effort flushes on page hide but invalidates authority on forced unmount', async () => {
    const { unmount } = renderPage();

    await screen.findByRole('heading', { name: 'contact-1' });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');

    flushWorkspace.mockClear();
    unmount();
    expect(flushWorkspace).not.toHaveBeenCalled();
    expect(invalidateWorkspace).toHaveBeenCalledWith('workspace-1');
  });
});
