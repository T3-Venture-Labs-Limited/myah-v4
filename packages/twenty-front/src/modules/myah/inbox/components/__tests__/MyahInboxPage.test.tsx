import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxPage } from '@/myah/inbox/components/MyahInboxPage';
import {
  EMPTY_MYAH_INBOX_CONTACT_SELECTION,
  myahInboxContactSelectionState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const flush = jest.fn().mockResolvedValue(undefined);
const flushWorkspace = jest.fn();
const refreshContacts = jest.fn();
const loadMoreContacts = jest.fn();
const loadMoreEmail = jest.fn();
const refreshEmail = jest.fn();
const refreshSelectedThread = jest.fn();
const mockUseMyahInboxContacts = jest.fn();
const mockUseMyahInboxContactEmailMessages = jest.fn();
const mockUseMyahInboxSelectedEmailThread = jest.fn();
let isMobile = false;

jest.mock('twenty-ui/theme-constants', () => ({
  ThemeContext: require('react').createContext({
    theme: { icon: { size: { md: 16 } } },
  }),
  themeCssVariables: {
    brand: { focusRing: 'blue' },
    background: { primary: 'white' },
    border: { color: { light: 'gray' } },
    font: {
      color: { secondary: 'gray', tertiary: 'gray' },
      size: { sm: '12px', xs: '11px' },
    },
    spacing: {
      1: '4px',
      2: '8px',
      3: '12px',
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
  useMyahInboxDraftAutosaveController: () => ({ flush, flushWorkspace }),
  useMyahInboxDraftAutosaveControllerContext: () => ({ flush, flushWorkspace }),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxContacts', () => ({
  useMyahInboxContacts: (...args: unknown[]) =>
    mockUseMyahInboxContacts(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxContactEmailMessages', () => ({
  useMyahInboxContactEmailMessages: (...args: unknown[]) =>
    mockUseMyahInboxContactEmailMessages(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxSelectedEmailThread', () => ({
  useMyahInboxSelectedEmailThread: (...args: unknown[]) =>
    mockUseMyahInboxSelectedEmailThread(...args),
}));

jest.mock('@/myah/inbox/components/MyahInboxContactList', () => ({
  MyahInboxContactList: ({
    contacts,
    selectedContactId,
    onSelectContact,
    onRefresh,
  }: {
    contacts: MyahInboxContact[];
    selectedContactId: string | null;
    onSelectContact: (
      id: string,
      options?: { openConversation?: boolean },
    ) => void;
    onRefresh: () => void;
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
      <button onClick={onRefresh}>Refresh contacts</button>
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

jest.mock('@/myah/inbox/components/MyahInboxContactHeader', () => ({
  MyahInboxContactHeader: ({
    contact,
    onSelectEmailThread,
  }: {
    contact: MyahInboxContact;
    onSelectEmailThread: (threadId: string) => void;
  }) => (
    <div>
      Header {contact.displayName}
      <button onClick={() => onSelectEmailThread('thread-1')}>
        Select exact thread
      </button>
    </div>
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
  MyahInboxThreadActions: ({ thread }: { thread: { id: string } }) => (
    <div>Email actions {thread.id}</div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxReplyWorkspace', () => ({
  MyahInboxReplyWorkspace: ({
    thread,
    onSent,
  }: {
    thread: { id: string };
    onSent?: () => void | Promise<void>;
  }) => (
    <div>
      Email composer {thread.id}
      <button onClick={() => void onSent?.()}>Simulate Email sent</button>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxContactLinkAction', () => ({
  MyahInboxContactLinkAction: ({
    onLinked,
  }: {
    onLinked: (id: string) => void;
  }) => (
    <button onClick={() => onLinked('contact-linked')}>Link Creator</button>
  ),
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

jest.mock('twenty-ui/icon', () => ({ IconInbox: () => null }));

jest.mock('twenty-ui/input', () => ({
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
  preview: `${id} preview`,
  sender: id,
  needsAttention: true,
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
    isRefreshing: false,
    refreshStatus: 'idle',
    refreshError: null,
  });
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
    ),
  };
};

describe('MyahInboxPage contact-first flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isMobile = false;
    setDefaultHooks();
    refreshContacts.mockResolvedValue({
      status: 'success',
      selectedContact: contacts[0],
    });
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
    expect(screen.getByText('Header contact-1')).toBeVisible();
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

  it('flushes the exact Email draft before selecting another Contact', async () => {
    const { store } = renderPage();

    await screen.findByText('Email composer thread-2');
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' }));

    expect(flush).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      threadId: 'thread-2',
    });
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
    fireEvent.click(screen.getByRole('button', { name: 'Instagram channel' }));

    expect(flush).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      threadId: 'thread-2',
    });
    expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
      channel: 'INSTAGRAM',
      emailThreadId: null,
    });
    expect(screen.queryByText(/Email actions/)).not.toBeInTheDocument();
  });

  it('retains a valid selected Contact on refresh and clears a removed one', async () => {
    const { store } = renderPage();

    await screen.findByText('Header contact-1');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh contacts' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Refresh contacts' }));

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

    await screen.findByText('Header contact-1');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh contacts' }));
    fireEvent.click(screen.getByRole('option', { name: 'Select contact-2' }));
    await act(async () => {
      deferred.resolve({ status: 'success', selectedContact: contacts[0] });
    });

    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-2',
    );
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

    await screen.findByText('Header contact-unmatched');
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
    expect(screen.getByText('Header contact-1')).toBeVisible();
    expect(screen.getByLabelText('Conversation pane')).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Contacts' }));
    expect(screen.getByLabelText('Contact list')).toBeVisible();
    expect(
      screen.getByRole('option', { name: 'Select contact-1' }),
    ).toHaveFocus();
  });

  it('flushes every workspace draft on page hide and unmount', async () => {
    const { unmount } = renderPage();

    await screen.findByText('Header contact-1');
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');

    unmount();
    expect(flushWorkspace).toHaveBeenCalledWith('workspace-1');
  });
});
