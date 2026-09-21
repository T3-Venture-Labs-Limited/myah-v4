import { useInstagramMessageComposer } from '@/side-panel/pages/instagram-message/hooks/useInstagramMessageComposer';
import { instagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { myahInboxPendingInstagramSelectionState } from '@/myah/inbox/states/myahInboxPendingInstagramSelectionState';
import { draftKeyFixture } from '@/myah/inbox/hooks/__tests__/fixtures/myahInboxDraftAutosaveTestFixture';
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { Store } from 'jotai/vanilla/store';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { MyahInboxPage } from '@/myah/inbox/components/MyahInboxPage';
import {
  EMPTY_MYAH_INBOX_CONTACT_SELECTION,
  type MyahInboxContactSelection,
  myahInboxContactSelectionState,
  myahInboxPreserveSelectionOnUnmountState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import { type MyahInboxDraftAutosaveEntry } from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';

const mockInstagramNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    // Recording spy that still delegates to the real navigate function.
    // A pure no-op mock here breaks the Campaign-guidance tests further down
    // this shared file (MYAH-338/MYAH-354), which depend on real MemoryRouter
    // navigation to reach the Campaign route and back; those tests predate
    // the Instagram composer tests added alongside this mock and were never
    // meant to have real navigation disabled file-wide.
    useNavigate: () => {
      const realNavigate = actual.useNavigate();

      return (...args: Parameters<typeof realNavigate>) => {
        mockInstagramNavigate(...args);

        return realNavigate(...args);
      };
    },
  };
});
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));
let mockClient: ApolloClient;
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: jest.fn(),
    enqueueWarningSnackBar: jest.fn(),
    enqueueInfoSnackBar: jest.fn(),
    enqueueErrorSnackBar: jest.fn(),
  }),
}));
jest.mock('twenty-ui/input', () => ({
  SegmentedControl: () => null,
  IconButton: ({
    ariaLabel,
    disabled,
    onClick,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => <button aria-label={ariaLabel} disabled={disabled} onClick={onClick} />,
  Button: ({
    title,
    ariaLabel,
    disabled,
    onClick,
  }: {
    title: string;
    ariaLabel?: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));
jest.mock('twenty-ui/layout', () => ({
  ...jest.requireActual('twenty-ui/layout'),
  AnimatedCircleLoading: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/myah/inbox/components/MyahInboxDraftEditor', () => ({
  MyahInboxDraftEditor: ({
    entry,
    disabled,
    onDraftChange,
    actions,
    onRetry,
    initialIsEditing,
    onEditingChange,
    onOpenAiGuidance,
    guidanceUnavailableReason,
  }: {
    entry: MyahInboxDraftAutosaveEntry;
    disabled: boolean;
    onDraftChange: (body: { markdown: string; blocknote: null }) => void;
    actions: ReactNode;
    onRetry: () => void;
    initialIsEditing?: boolean;
    onEditingChange?: (isEditing: boolean) => void;
    onOpenAiGuidance?: () => void;
    guidanceUnavailableReason?: string;
  }) => (
    <div
      data-initial-is-editing={initialIsEditing}
      data-testid="page-draft-editor"
    >
      <input
        aria-label="Real shared draft"
        value={entry.localBody.markdown}
        disabled={disabled}
        onChange={(event) =>
          onDraftChange({ markdown: event.target.value, blocknote: null })
        }
      />
      {entry.status === 'error' && (
        <button onClick={onRetry}>Retry draft save</button>
      )}
      <button onClick={() => onEditingChange?.(true)}>
        Mock start editing
      </button>
      <button
        aria-label="Open AI guidance"
        disabled={!onOpenAiGuidance}
        onClick={onOpenAiGuidance}
        title={guidanceUnavailableReason}
      >
        Open AI guidance
      </button>
      {actions}
    </div>
  ),
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
  }) => (
    <div>
      Email actions {thread.id}
      <button onClick={() => onThreadUpdated('Thread updated')}>
        Simulate thread update
      </button>
    </div>
  ),
}));
jest.mock('@/myah/inbox/components/MyahInboxContactTriageActions', () => ({
  MyahInboxContactTriageActions: () => null,
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

jest.mock('twenty-ui/icon', () => ({
  IconInbox: () => null,
  IconInfoCircle: () => null,
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

const contacts = ['contact-1', 'contact-2'].map((id, index) => ({
  ...contact(id, 'EMAIL', false),
  email: {
    ...contact(id, 'EMAIL', false).email,
    threadIds: [`thread-${index + 1}`],
    latestThreadId: `thread-${index + 1}`,
    threadCount: 1,
  },
}));
let mockContacts: MyahInboxContact[] = contacts;
let mockRealHistory = false;
let mockContactRefreshStatus = 'idle';
const threads = Object.fromEntries(
  ['thread-1', 'thread-2', 'thread-3'].map((id) => [
    id,
    { id, subject: id, state: 'NEEDS_REPLY' },
  ]),
);
const refresh = jest.fn();
const refreshContacts = jest.fn();
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxContacts', () => ({
  useMyahInboxContacts: () => ({
    contacts: mockContacts,
    loading: false,
    refreshStatus: mockContactRefreshStatus,
    refresh: refreshContacts,
  }),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxEmailHistory', () => ({
  useMyahInboxEmailHistory: (_workspace: string, contactId: string | null) => {
    if (mockRealHistory)
      return jest
        .requireActual('@/myah/inbox/hooks/useMyahInboxEmailHistory')
        .useMyahInboxEmailHistory(_workspace, contactId, 'member-1');
    const contact = mockContacts.find((contact) => contact.id === contactId);
    return {
      segments: contact
        ? [
            {
              id: 'segment',
              snapshot: 'snapshot',
              olderCursor: null,
              requests: [],
              pages: [
                {
                  latestThreadId: contact.email.latestThreadId,
                  cards: contact.email.threadIds.map((id, index) => ({
                    threadId: id,
                    rootMessageId: `${id}-root`,
                    subject: id,
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
      missingMessageIds: [],
      status: 'ready',
      loading: false,
      openCard: jest.fn(),
      openDetachedCard: jest.fn(),
      refresh,
      setReadingAnchor: jest.fn(),
    };
  },
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxContactEmailMessages', () => ({
  useMyahInboxContactEmailMessages: () => ({
    messages: [],
    loading: false,
    refresh,
  }),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxSelectedEmailThread', () => ({
  useMyahInboxSelectedEmailThread: (_workspaceId: string, threadId: string) =>
    mockRealHistory
      ? jest
          .requireActual('@/myah/inbox/hooks/useMyahInboxSelectedEmailThread')
          .useMyahInboxSelectedEmailThread(_workspaceId, threadId)
      : { thread: threads[threadId] ?? null, loading: false, refresh },
}));

const key = draftKeyFixture('workspace-1', 'thread-1');
const body = { markdown: 'server draft', blocknote: null };
const setCampaignAgentMetadata = (store: Store) => {
  store.set(metadataStoreState.atomFamily('pageLayouts'), {
    current: [
      {
        id: 'campaign-layout-1',
        deletedAt: null,
        universalIdentifier:
          MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
      },
    ],
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('pageLayoutTabs'), {
    current: [
      {
        id: 'runtime-agent-tab-1',
        isActive: true,
        pageLayoutId: 'campaign-layout-1',
        universalIdentifier: MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
      },
    ],
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('pageLayoutWidgets'), {
    current: [],
    draft: [],
    status: 'up-to-date',
  });
};
const CampaignRoute = () => {
  const navigate = useNavigate();

  // oxlint-disable-next-line twenty/no-navigate-prefer-link
  return <button onClick={() => navigate(-1)}>Back to Inbox</button>;
};
const contextOptionsPayload = {
  myahInboxReplyContextOptions: {
    edges: [
      {
        cursor: 'cursor-1',
        node: { id: 'campaign-1', name: 'Spring Campaign' },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
    generalAvailable: false,
    defaultContext: {
      kind: 'CAMPAIGN',
      campaignId: 'campaign-1',
      campaignName: 'Spring Campaign',
    },
  },
};
const resolvedContextFor = (threadId: string) => ({
  kind: 'CAMPAIGN',
  campaignId: 'campaign-1',
  contextFingerprint: 'fingerprint-1',
  target: {
    channel: 'EMAIL',
    deliveryTargetId: threadId,
    contactAnchorKind: 'CREATOR',
    contactAnchorId: 'creator-1',
  },
});
const resolveContextOptions = async () => {
  const options = requests.find(
    (request) => request.name === 'MyahInboxReplyContextOptions',
  );
  if (!options) return;
  requests.splice(requests.indexOf(options), 1);
  await act(async () => options.resolve(contextOptionsPayload));
};
type Request = {
  name: string;
  variables: Record<string, unknown>;
  resolve: (data: Record<string, unknown>) => void;
  reject: () => void;
};
let requests: Request[];
const take = (name: string) => {
  const index = requests.findIndex((request) => request.name === name);
  if (index < 0)
    throw new Error(`Missing ${name}; got ${requests.map(({ name }) => name)}`);
  return requests.splice(index, 1)[0];
};
const completeRead = async (
  threadId = key.deliveryTargetId,
  readinessStatus = 'READY',
  draftBody = body,
  revision = 2,
) => {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pendingSummary = requests.find(
      (request) =>
        request.name === 'MyahInboxThreads' &&
        request.variables.threadId === threadId,
    );
    if (pendingSummary) {
      requests.splice(requests.indexOf(pendingSummary), 1);
      await act(async () =>
        pendingSummary.resolve({
          myahInboxThreads: { edges: [{ node: threads[threadId] }] },
        }),
      );
      continue;
    }

    await resolveContextOptions();

    const pendingRead = requests.find(
      (request) =>
        request.name === 'MyahInboxReplyDraft' &&
        (request.variables.input as { target?: { threadId?: string } })?.target
          ?.threadId === threadId,
    );
    const resolvedDraft = Boolean(pendingRead);
    if (pendingRead) {
      requests.splice(requests.indexOf(pendingRead), 1);
      expect(pendingRead.variables).toMatchObject({
        input: {
          expectedWorkspaceId: key.workspaceId,
          target: { channel: 'EMAIL', threadId },
          replyContext: { kind: 'CAMPAIGN', campaignId: 'campaign-1' },
        },
      });
      await act(async () =>
        pendingRead.resolve({
          myahInboxReplyDraft: {
            revision,
            executionState: 'READY',
            body: draftBody,
            resolvedContext: resolvedContextFor(threadId),
          },
        }),
      );
    }

    const readiness = requests.find(
      (request) => request.name === 'MyahInboxReplySendReadiness',
    );
    if (readiness) {
      requests.splice(requests.indexOf(readiness), 1);
      await act(async () =>
        readiness.resolve({
          myahInboxReplySendReadiness: {
            status: readinessStatus,
            reason: null,
          },
        }),
      );
      return;
    }

    // An empty main draft renders the Generate action instead of Send, so no
    // readiness query follows; resolving the draft read is the completion signal.
    if (resolvedDraft) return;

    await act(async () => jest.runAllTicks());
  }

  throw new Error(
    `Draft ${threadId} did not become ready; got ${requests.map(({ name }) => name)}`,
  );
};
const advance = async () => act(async () => jest.advanceTimersByTimeAsync(750));
const select = async (id: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('option', { name: `Select ${id}` }));
  });
const draftInput = () => screen.getAllByLabelText('Real shared draft')[0];
const selectThread = async (threadId: string) =>
  act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: `Reply to ${threadId}` }),
    );
  });
const selectChannel = async (channel: 'Email' | 'Instagram') =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `${channel} channel` }));
  });
const configureTwoThreadContact = () => {
  mockContacts = [
    contact('contact-1', 'EMAIL'),
    {
      ...contacts[1],
      email: {
        ...contacts[1].email,
        threadIds: ['thread-3'],
        latestThreadId: 'thread-3',
      },
    },
  ];
};
const InstagramComposerProbe = () => {
  const composer = useInstagramMessageComposer();
  return (
    <button
      disabled={!composer.canSend}
      data-status={composer.composer?.attempt?.result?.status}
      onClick={() => void composer.send()}
    >
      Send Instagram test
    </button>
  );
};
const setup = (options?: {
  includeComposer?: boolean;
  withCampaignRoute?: boolean;
  initialSelection?: MyahInboxContactSelection;
  initialDraftBody?: { markdown: string; blocknote: null };
}) => {
  const {
    includeComposer = false,
    withCampaignRoute = false,
    initialSelection,
    initialDraftBody,
  } = options ?? {};
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never);
  store.set(currentWorkspaceMemberState.atom, { id: 'member-1' } as never);
  if (includeComposer)
    store.set(
      instagramMessageComposerState.atomFamily({ instanceId: 'composer' }),
      {
        recipient: { rawHandle: 'recipient' },
        body: 'Hello',
        draftId: 'composer-attempt',
      },
    );
  if (initialSelection) {
    store.set(myahInboxContactSelectionState.atom, initialSelection);
    if (initialSelection.emailThreadId && initialDraftBody)
      store.set(
        myahInboxDraftAutosaveFamilyState.atomFamily(
          draftKeyFixture(key.workspaceId, initialSelection.emailThreadId),
        ),
        {
          operation: null,
          editorOwner: null,
          localBody: initialDraftBody,
          confirmedBody: initialDraftBody,
          confirmedRevision: 2,
          dirty: false,
          status: 'saved',
          error: null,
          conflict: null,
          editorVersion: 0,
          debounceVersion: 0,
          pendingDebounceVersion: null,
        },
      );
  }
  if (withCampaignRoute) setCampaignAgentMetadata(store);
  const mount = () =>
    render(
      <MemoryRouter initialEntries={['/myah/inbox']}>
        <Provider store={store}>
          {withCampaignRoute ? (
            <Routes>
              <Route
                path="/myah/inbox"
                element={
                  <>
                    <MyahInboxPage />
                    {includeComposer ? (
                      <SidePanelPageComponentInstanceContext.Provider
                        value={{ instanceId: 'composer' }}
                      >
                        <InstagramComposerProbe />
                      </SidePanelPageComponentInstanceContext.Provider>
                    ) : null}
                  </>
                }
              />
              <Route path="*" element={<CampaignRoute />} />
            </Routes>
          ) : (
            <>
              <MyahInboxPage />
              {includeComposer ? (
                <SidePanelPageComponentInstanceContext.Provider
                  value={{ instanceId: 'composer' }}
                >
                  <InstagramComposerProbe />
                </SidePanelPageComponentInstanceContext.Provider>
              ) : null}
            </>
          )}
        </Provider>
      </MemoryRouter>,
    );
  return {
    store,
    mount,
    view: mount(),
    entry: () => store.get(myahInboxDraftAutosaveFamilyState.atomFamily(key)),
  };
};

describe('MyahInboxPage retained recovery navigation with real draft controller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInstagramNavigate.mockClear();
    mockContacts = contacts;
    mockRealHistory = false;
    mockContactRefreshStatus = 'idle';
    refreshContacts.mockReset().mockImplementation(async (contactId) => ({
      status: 'success',
      selectedContact:
        mockContacts.find((contact) => contact.id === contactId) ?? null,
    }));
    requests = [];
    mockClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        (operation) =>
          new Observable((observer) => {
            requests.push({
              name: operation.operationName ?? '',
              variables: operation.variables,
              resolve: (data) => {
                observer.next({ data });
                observer.complete();
              },
              reject: () => observer.error(new Error('Save unavailable')),
            });
          }),
      ),
    });
  });
  afterEach(() => {
    cleanup();
    mockClient.stop();
    jest.useRealTimers();
  });

  it.each([
    ['same-contact', 'thread-2'],
    ['reply-card', 'thread-1'],
  ] as const)(
    'a newer %s intent cancels in-flight composer navigation while keeping that Email target active',
    async (intent, expectedThreadId) => {
      mockContacts = [contact('contact-1', 'EMAIL')];
      const { store } = setup({ includeComposer: true });
      await completeRead('thread-2');
      const selection = store.get(myahInboxContactSelectionState.atom);
      await act(async () =>
        take('InstagramMessageComposerAccount').resolve({
          instagramMessageComposerAccount: {
            status: 'READY',
            code: null,
            sender: { accountRecordId: 'account', label: '@sender' },
          },
        }),
      );
      await advance();
      await act(async () =>
        take('PrepareInstagramMessageComposer').resolve({
          prepareInstagramMessageComposer: {
            status: 'READY',
            code: null,
            normalizedHandle: 'recipient',
            creatorRecordId: 'recipient-creator',
            actionKind: 'START_CHAT',
            preparationFingerprint: 'fingerprint',
            sender: { accountRecordId: 'account', label: '@sender' },
          },
        }),
      );
      const sendButton = screen.getByRole('button', {
        name: 'Send Instagram test',
      });
      expect(sendButton).toBeEnabled();
      await act(async () => fireEvent.click(sendButton));
      const sendRequest = take('SendInstagramMessageComposer');
      if (intent === 'same-contact') await select('contact-1');
      else await selectThread('thread-1');
      const expectedSelection = {
        ...selection,
        emailThreadId: expectedThreadId,
      };
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(
        expectedSelection,
      );
      expect(store.get(myahInboxContactSelectionState.atom)).not.toBe(
        selection,
      );
      expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
        false,
      );
      if (intent === 'same-contact')
        expect(
          requests.some(({ name }) => name === 'MyahInboxReplyDraft'),
        ).toBe(false);
      else await completeRead('thread-1');
      expect(
        within(
          screen.getByRole('region', { name: 'Main reply' }),
        ).getByLabelText('Real shared draft'),
      ).toHaveValue('server draft');
      await act(async () =>
        sendRequest.resolve({
          sendInstagramMessageComposer: {
            status: 'SENT',
            receiptId: 'receipt',
            code: null,
            nextEligibleAt: null,
          },
        }),
      );
      await act(async () => jest.advanceTimersByTimeAsync(1_000));
      await act(async () =>
        take('InstagramMessageSendStatus').resolve({
          instagramMessageSendStatus: {
            receiptId: 'receipt',
            state: 'SENT',
            providerCode: null,
            outcome: null,
            creatorRecordId: 'recipient-creator',
            conversationRecordId: 'conversation',
          },
        }),
      );
      expect(sendButton).toHaveAttribute('data-status', 'SENT');
      expect(mockInstagramNavigate).not.toHaveBeenCalled();
      expect(
        store.get(myahInboxPendingInstagramSelectionState.atom),
      ).toBeNull();
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(
        expectedSelection,
      );
    },
  );

  it('cancels a pending destination before a failed real Email flush while retaining anchored draft bytes', async () => {
    mockContacts = [contact('contact-1', 'EMAIL')];
    const { store } = setup();
    await completeRead('thread-2');
    const selection = store.get(myahInboxContactSelectionState.atom);
    fireEvent.change(draftInput(), {
      target: { value: 'Keep anchored Email text' },
    });
    act(() =>
      store.set(myahInboxPendingInstagramSelectionState.atom, {
        workspaceId: key.workspaceId,
        creatorRecordId: 'not-loaded',
        conversationRecordId: 'not-loaded',
      }),
    );
    await selectThread('thread-1');
    expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toBeNull();
    const save = take('SaveMyahInboxDraft');
    await act(async () => save.reject());
    expect(store.get(myahInboxContactSelectionState.atom)).toEqual(selection);
    expect(draftInput()).toHaveValue('Keep anchored Email text');
    expect(screen.queryByRole('region', { name: 'Inline reply' })).toBeNull();
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
  });

  it('integrates the real bounded history and exact summary/draft reads without an exhaustive legacy read', async () => {
    mockRealHistory = true;
    mockContacts = [contact('contact-1', 'EMAIL')];
    setup();
    expect(screen.queryByLabelText('Real shared draft')).toBeNull();
    expect(requests.map((request) => request.name)).toEqual([
      'MyahInboxContactEmailCards',
    ]);
    const cards = ['thread-2', 'thread-1'].map((threadId, index) => ({
      threadId,
      rootMessageId: `${threadId}-root`,
      startTimestamp: `2026-09-0${index + 1}T00:00:00Z`,
      subject: threadId,
      campaignLabel: 'Same campaign',
      historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
    }));
    await act(async () =>
      take('MyahInboxContactEmailCards').resolve({
        myahInboxContactEmailCards: {
          cards,
          snapshot: 'snapshot',
          olderCursor: 'older',
          latestThreadId: 'thread-1',
        },
      }),
    );
    const summary = take('MyahInboxThreads');
    expect(summary.variables).toMatchObject({
      threadId: 'thread-1',
      first: 1,
      expectedWorkspaceId: key.workspaceId,
    });
    await act(async () =>
      summary.resolve({
        myahInboxThreads: { edges: [{ node: threads['thread-1'] }] },
      }),
    );
    await completeRead();
    for (const card of cards) {
      const request = take('MyahInboxContactEmailCardMessages');
      expect(request.variables).toMatchObject({
        threadId: card.threadId,
        snapshot: 'snapshot',
      });
      const root = {
        id: card.rootMessageId,
        messageThreadId: card.threadId,
        receivedAt: card.startTimestamp,
        subject: card.subject,
        text: `Real body ${card.threadId}`,
        direction: 'INCOMING',
        visibility: 'FULL',
        participants: [],
        attachmentFileIds: [],
      };
      await act(async () =>
        request.resolve({
          myahInboxContactEmailCardMessages: {
            threadId: card.threadId,
            root,
            messages: [],
            olderCursor: null,
            newerCursor: null,
          },
        }),
      );
    }
    expect(screen.getByText('Email actions thread-1')).toBeVisible();
    expect(screen.getByText('Real body thread-2')).toBeVisible();
    expect(screen.queryByLabelText('Email thread')).toBeNull();
    expect(requests).toHaveLength(0);
    await selectThread('thread-2');
    const olderSummary = take('MyahInboxThreads');
    expect(olderSummary.variables.threadId).toBe('thread-2');
    await act(async () =>
      olderSummary.resolve({
        myahInboxThreads: { edges: [{ node: threads['thread-2'] }] },
      }),
    );
    await completeRead('thread-2');
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    expect(screen.getByText('Email actions thread-2')).toBeVisible();
  });

  it('revalidates the selected exact summary on thread activity but not ordinary message pagination', async () => {
    mockRealHistory = true;
    mockContacts = [contact('contact-1', 'EMAIL')];
    const { store } = setup();
    const historyNames = new Set([
      'MyahInboxContactEmailCards',
      'MyahInboxContactEmailCard',
      'MyahInboxContactEmailCardMessages',
    ]);
    const projection = (id: string, restricted: boolean) => ({
      threadId: id,
      rootMessageId: `${id}-root`,
      startTimestamp: `2026-09-0${id === 'thread-1' ? 1 : 2}T12:00:00Z`,
      subject: restricted ? null : id,
      campaignLabel: null,
      historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
    });
    const answerHistory = async (request: Request, restricted: boolean) => {
      const id = String(request.variables.threadId ?? 'thread-1');
      const card = projection(id, restricted);
      const root = {
        id: card.rootMessageId,
        messageThreadId: id,
        receivedAt: card.startTimestamp,
        subject: card.subject,
        text: restricted ? null : 'Readable message body',
        direction: 'INCOMING',
        visibility: restricted ? 'METADATA' : 'FULL',
        participants: [],
        attachmentFileIds: [],
      };
      const data =
        request.name === 'MyahInboxContactEmailCards'
          ? {
              myahInboxContactEmailCards: {
                cards: ['thread-1', 'thread-2'].map((id) =>
                  projection(id, restricted),
                ),
                snapshot:
                  request.variables.snapshot ??
                  (restricted ? 'fresh-restricted' : 'snapshot'),
                olderCursor: null,
                latestThreadId: 'thread-2',
              },
            }
          : request.name === 'MyahInboxContactEmailCard'
            ? { myahInboxContactEmailCard: { snapshot: 'current', card } }
            : {
                myahInboxContactEmailCardMessages: {
                  threadId: id,
                  root,
                  messages: [
                    {
                      ...root,
                      id: `${id}-${request.variables.cursor ? 'older' : 'tail'}`,
                      receivedAt: card.startTimestamp.replace(
                        '12:00',
                        request.variables.cursor ? '13:00' : '14:00',
                      ),
                    },
                  ],
                  olderCursor:
                    id === 'thread-1' && !request.variables.cursor
                      ? 'older-replies'
                      : null,
                  newerCursor: null,
                },
              };
      await act(async () => request.resolve(data));
    };
    const drainHistory = async (restricted: boolean) => {
      for (let count = 0; count < 20; count++) {
        const request = requests.find((request) =>
          historyNames.has(request.name),
        );
        if (!request) return;
        await answerHistory(take(request.name), restricted);
      }
      throw Error('Unexpected unbounded history reads');
    };
    await answerHistory(take('MyahInboxContactEmailCards'), false);
    await act(async () =>
      take('MyahInboxThreads').resolve({
        myahInboxThreads: {
          edges: [
            {
              node: {
                ...threads['thread-2'],
                subject: 'Confidential main subject',
              },
            },
          ],
        },
      }),
    );
    await completeRead('thread-2');
    await drainHistory(false);
    await selectThread('thread-1');
    await act(async () =>
      take('MyahInboxThreads').resolve({
        myahInboxThreads: {
          edges: [
            {
              node: {
                ...threads['thread-1'],
                subject: 'Confidential selected subject',
              },
            },
          ],
        },
      }),
    );
    await completeRead();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Show replies for thread-1' }),
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Load older replies for thread-1' }),
      ),
    );
    await drainHistory(false);
    expect(
      requests.some((request) => request.name === 'MyahInboxThreads'),
    ).toBe(false);
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-1',
    );
    expect(screen.getByText('Email actions thread-1')).toBeVisible();
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Simulate thread update' }),
      ),
    );
    await drainHistory(true);
    expect(screen.queryAllByText(/Confidential main subject/)).toHaveLength(0);
    expect(screen.queryAllByText(/Confidential selected subject/)).toHaveLength(
      0,
    );
    const summaries = requests.filter(
      (request) => request.name === 'MyahInboxThreads',
    );
    expect(summaries.map((request) => request.variables.threadId)).toEqual([
      'thread-1',
      'thread-1',
    ]);
    for (const request of summaries) {
      take('MyahInboxThreads');
      await act(async () =>
        request.resolve({
          myahInboxThreads: {
            edges: [
              {
                node: {
                  ...threads[String(request.variables.threadId)],
                  subject: null,
                },
              },
            ],
          },
        }),
      );
    }
    expect(screen.getByText('Email actions thread-1')).toBeVisible();
    await completeRead('thread-1');
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    expect(
      screen.queryAllByText(/Confidential (main|selected) subject/),
    ).toHaveLength(0);
  });

  it.each([
    'main-card loss',
    'clean main-card loss',
    'history failure',
    'contact refresh failure',
  ])(
    'masks the selected main draft under %s without retargeting it',
    async (loss) => {
      mockRealHistory = true;
      mockContacts = [contact('contact-1', 'EMAIL')];
      const { store } = setup();
      const mainKey = { ...key, deliveryTargetId: 'thread-2' };
      const mainEntry = () =>
        store.get(myahInboxDraftAutosaveFamilyState.atomFamily(mainKey));
      const historyNames = new Set([
        'MyahInboxContactEmailCards',
        'MyahInboxContactEmailCard',
        'MyahInboxContactEmailCardMessages',
      ]);
      const cleanMainCardLoss = loss === 'clean main-card loss';
      let mainRemoved = false;
      const card = (threadId: string) => ({
        threadId,
        rootMessageId: `${threadId}-root`,
        startTimestamp: `2026-09-0${threadId === 'thread-1' ? 1 : 2}T12:00:00Z`,
        subject: threadId,
        campaignLabel: null,
        historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
      });
      const drainHistory = async () => {
        for (let count = 0; count < 20; count++) {
          const request = requests.find(({ name }) => historyNames.has(name));
          if (!request) return;
          take(request.name);
          const id = String(request.variables.threadId ?? 'thread-1');
          const projection = card(id);
          await act(async () =>
            request.resolve(
              request.name === 'MyahInboxContactEmailCards'
                ? {
                    myahInboxContactEmailCards: {
                      cards: (mainRemoved
                        ? ['thread-1']
                        : ['thread-1', 'thread-2']
                      ).map(card),
                      snapshot: request.variables.snapshot ?? 'snapshot',
                      olderCursor: null,
                      latestThreadId: mainRemoved ? 'thread-1' : 'thread-2',
                    },
                  }
                : request.name === 'MyahInboxContactEmailCard'
                  ? {
                      myahInboxContactEmailCard:
                        mainRemoved && id === 'thread-2'
                          ? null
                          : { snapshot: 'current', card: projection },
                    }
                  : {
                      myahInboxContactEmailCardMessages: {
                        threadId: id,
                        root: {
                          id: projection.rootMessageId,
                          messageThreadId: id,
                          receivedAt: projection.startTimestamp,
                          subject: id,
                          text: `Readable ${id}`,
                          direction: 'INCOMING',
                          visibility: 'FULL',
                          participants: [],
                          attachmentFileIds: [],
                        },
                        messages: [],
                        olderCursor: null,
                        newerCursor: null,
                      },
                    },
            ),
          );
        }
        throw Error('Unexpected unbounded history reads');
      };
      const answerSummary = async (threadId: string) => {
        const request = take('MyahInboxThreads');
        expect(request.variables).toMatchObject({
          threadId,
          expectedWorkspaceId: key.workspaceId,
        });
        await act(async () =>
          request.resolve({
            myahInboxThreads: { edges: [{ node: threads[threadId] }] },
          }),
        );
      };
      const answerDraft = async (threadId: string) => {
        await resolveContextOptions();
        const request = take('MyahInboxReplyDraft');
        expect(request.variables).toMatchObject({
          input: { target: { threadId } },
        });
        await act(async () =>
          request.resolve({
            myahInboxReplyDraft: {
              revision: 2,
              executionState: 'READY',
              body: {
                markdown:
                  cleanMainCardLoss && threadId === 'thread-2'
                    ? ''
                    : `Saved ${threadId} bytes`,
                blocknote: null,
              },
              resolvedContext: resolvedContextFor(threadId),
            },
          }),
        );
        // An empty main draft renders the Generate action instead of Send, so
        // the readiness query is only issued when a send action is present.
        if (
          requests.some(({ name }) => name === 'MyahInboxReplySendReadiness')
        ) {
          await act(async () =>
            take('MyahInboxReplySendReadiness').resolve({
              myahInboxReplySendReadiness: { status: 'READY', reason: null },
            }),
          );
        }
      };
      await drainHistory();
      await answerSummary('thread-2');
      await answerDraft('thread-2');
      expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
      expect(mainEntry()).toMatchObject({ dirty: false, confirmedRevision: 2 });
      expect(screen.getByText('Email actions thread-2')).toBeVisible();
      mainRemoved =
        loss === 'main-card loss' || loss === 'clean main-card loss';
      if (loss === 'contact refresh failure')
        mockContactRefreshStatus = 'failed';
      await act(async () =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Simulate thread update' }),
        ),
      );
      expect(screen.queryAllByLabelText('Real shared draft')).toHaveLength(0);
      expect(screen.queryByText('Email actions thread-2')).toBeNull();
      if (loss === 'history failure') {
        await act(async () => take('MyahInboxContactEmailCard').reject());
      } else {
        await drainHistory();
        // E's exact summary remains readable: membership must still guard its actions.
        const summaries = requests.filter(
          ({ name }) => name === 'MyahInboxThreads',
        );
        expect(summaries.map(({ variables }) => variables.threadId)).toEqual([
          'thread-2',
          'thread-2',
        ]);
        for (const request of summaries)
          await answerSummary(String(request.variables.threadId));
      }
      expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
        'thread-2',
      );
      expect(mainEntry()?.localBody.markdown).toBe(
        cleanMainCardLoss ? '' : 'Saved thread-2 bytes',
      );
      expect(screen.queryByText('Email actions thread-2')).toBeNull();
      expect(screen.queryByText('Email actions thread-1')).toBeNull();
      // The main composer keeps its surface without a draft, so when it renders
      // it must be disabled and never carry the masked bytes. A failed history
      // load replaces the whole surface instead.
      const mainReplyRegion = within(
        screen.getByRole('region', { name: 'Main reply' }),
      );
      const maskedMainDraft =
        mainReplyRegion.queryByLabelText('Real shared draft');

      if (maskedMainDraft) {
        expect(maskedMainDraft).toBeDisabled();
        expect(maskedMainDraft).toHaveValue('');
      } else {
        expect(
          mainReplyRegion.getByText(
            'Latest Email conversation is unavailable.',
          ),
        ).toBeVisible();
      }
      expect(requests.some(({ name }) => name === 'MyahInboxReplyDraft')).toBe(
        false,
      );
      expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
        false,
      );
    },
  );

  it('awaits the selected draft save before switching the main composer to another card', async () => {
    mockContacts = [contact('contact-1', 'EMAIL')];
    const { store } = setup();
    await completeRead('thread-2');
    fireEvent.change(draftInput(), { target: { value: 'same shared bytes' } });

    await selectThread('thread-1');
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-2',
    );
    const save = take('SaveMyahInboxDraft');
    expect(save.variables).toMatchObject({
      input: {
        target: { threadId: 'thread-2' },
        body: { markdown: 'same shared bytes' },
      },
    });
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'same shared bytes', blocknote: null },
        },
      }),
    );

    // The committed save refreshes its own execution metadata before the flush resolves.
    await completeRead(
      'thread-2',
      'READY',
      {
        markdown: 'same shared bytes',
        blocknote: null,
      },
      3,
    );

    await completeRead('thread-1', 'READY', {
      markdown: 'Saved thread-1 bytes',
      blocknote: null,
    });

    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-1',
    );
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    expect(draftInput()).toHaveValue('Saved thread-1 bytes');
    expect(
      store.get(
        myahInboxDraftAutosaveFamilyState.atomFamily({
          ...key,
          deliveryTargetId: 'thread-2',
        }),
      )?.localBody.markdown,
    ).toBe('same shared bytes');
    expect(screen.queryByRole('region', { name: 'Inline reply' })).toBeNull();
  });

  it('follows a verified later card when the current main draft is pristine', async () => {
    mockContacts = [contact('contact-1', 'EMAIL')];
    const { view, store } = setup();
    await completeRead('thread-2', 'READY', { markdown: '', blocknote: null });
    mockContacts = [
      {
        ...mockContacts[0],
        email: {
          ...mockContacts[0].email,
          threadIds: ['thread-1', 'thread-2', 'thread-3'],
          latestThreadId: 'thread-3',
        },
      },
    ];
    view.rerender(
      <MemoryRouter initialEntries={['/myah/inbox']}>
        <Provider store={store}>
          <MyahInboxPage />
        </Provider>
      </MemoryRouter>,
    );
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-3',
    );
    await completeRead('thread-3');
    expect(screen.getByText('Email actions thread-3')).toBeVisible();
  });

  it('keeps a nonempty main draft pinned when a newer conversation appears and switches only explicitly', async () => {
    mockContacts = [contact('contact-1', 'EMAIL')];
    const { view, store } = setup();
    await completeRead('thread-2');
    mockContacts = [
      {
        ...mockContacts[0],
        email: {
          ...mockContacts[0].email,
          threadIds: ['thread-1', 'thread-2', 'thread-3'],
          latestThreadId: 'thread-3',
        },
      },
    ];
    view.rerender(
      <MemoryRouter initialEntries={['/myah/inbox']}>
        <Provider store={store}>
          <MyahInboxPage />
        </Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Email actions thread-2')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Switch to latest conversation' }),
    ).toBeVisible();
    expect(
      requests.some((request) => request.name === 'MyahInboxReplyDraft'),
    ).toBe(false);
    const beforeSwitch = store.get(myahInboxContactSelectionState.atom);
    act(() =>
      store.set(myahInboxPendingInstagramSelectionState.atom, {
        workspaceId: key.workspaceId,
        creatorRecordId: 'not-loaded',
        conversationRecordId: 'not-loaded',
      }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch to latest conversation' }),
      ),
    );
    expect(store.get(myahInboxPendingInstagramSelectionState.atom)).toBeNull();
    expect(store.get(myahInboxContactSelectionState.atom)).toEqual({
      ...beforeSwitch,
      emailThreadId: 'thread-3',
    });
    await completeRead('thread-3');
    expect(screen.getByText('Email actions thread-3')).toBeVisible();
    await selectThread('thread-2');
    await completeRead('thread-2');
    expect(screen.getAllByLabelText('Real shared draft')).toHaveLength(1);
    expect(screen.getByText('Email actions thread-2')).toBeVisible();
  });

  it.each([
    ['non-empty', { markdown: 'saved non-latest draft', blocknote: null }],
    ['empty', { markdown: '', blocknote: null }],
  ] as const)(
    'restores the exact Inbox selection and editor mode after Campaign guidance and browser Back with a %s draft',
    async (_label, retainedBody) => {
      mockContacts = [
        contacts[0],
        {
          ...contact('contact-2', 'EMAIL'),
          email: {
            ...contact('contact-2', 'EMAIL').email,
            threadIds: ['thread-3', 'thread-4'],
            latestThreadId: 'thread-4',
            threadCount: 2,
          },
        },
      ];
      const initialBody = retainedBody.markdown
        ? retainedBody
        : { markdown: 'draft before Campaign navigation', blocknote: null };
      const { store, view } = setup({
        withCampaignRoute: true,
        initialSelection: {
          workspaceId: key.workspaceId,
          contactId: 'contact-2',
          channel: 'EMAIL',
          emailThreadId: 'thread-3',
          instagramConversationId: null,
        },
        initialDraftBody: initialBody,
      });
      await completeRead('thread-3', 'READY', initialBody);
      const targetDraftEditor = screen
        .getAllByTestId('page-draft-editor')
        .find((editor) =>
          editor.closest('#myah-inbox-reply-workspace-thread-3'),
        );
      expect(targetDraftEditor).toBeDefined();
      fireEvent.click(
        within(targetDraftEditor as HTMLElement).getByText(
          'Mock start editing',
        ),
      );
      expect(targetDraftEditor).toHaveAttribute(
        'data-initial-is-editing',
        'true',
      );

      await act(async () =>
        fireEvent.click(
          within(targetDraftEditor as HTMLElement).getByRole('button', {
            name: 'Open AI guidance',
          }),
        ),
      );
      expect(
        screen.getByRole('button', { name: 'Back to Inbox' }),
      ).toBeVisible();
      expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
        contactId: 'contact-2',
        channel: 'EMAIL',
        emailThreadId: 'thread-3',
      });
      if (!retainedBody.markdown) {
        const draftAtom = myahInboxDraftAutosaveFamilyState.atomFamily(
          draftKeyFixture(key.workspaceId, 'thread-3'),
        );
        const draftEntry = store.get(draftAtom);
        if (!draftEntry) throw new Error('Expected retained thread-3 draft');
        store.set(draftAtom, {
          ...draftEntry,
          localBody: retainedBody,
          confirmedBody: retainedBody,
        });
      }

      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Back to Inbox' })),
      );
      await completeRead('thread-3', 'READY', retainedBody);

      expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
        contactId: 'contact-2',
        channel: 'EMAIL',
        emailThreadId: 'thread-3',
      });
      expect(store.get(myahInboxPreserveSelectionOnUnmountState.atom)).toBe(
        false,
      );
      expect(
        screen.getByRole('option', { name: 'Select contact-2' }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Email actions thread-3')).toBeVisible();
      const restoredDraft = screen
        .getAllByTestId('page-draft-editor')
        .find((editor) =>
          editor.closest('#myah-inbox-reply-workspace-thread-3'),
        );
      expect(restoredDraft).toBeDefined();
      expect(restoredDraft).toHaveAttribute('data-initial-is-editing', 'true');

      view.unmount();
      await act(async () => jest.runAllTicks());
      expect(store.get(myahInboxContactSelectionState.atom)).toEqual(
        EMPTY_MYAH_INBOX_CONTACT_SELECTION,
      );
    },
  );
  it('reopens a non-latest same-contact recovery after remount and awaits the actual outgoing target save', async () => {
    mockContacts = [contact('contact-1', 'EMAIL')];
    const { store, view, mount, entry } = setup();
    await completeRead('thread-2');
    await selectThread('thread-1');
    await completeRead();
    fireEvent.change(draftInput(), {
      target: { value: 'non-latest recovery' },
    });
    view.unmount();
    await act(async () => jest.runAllTicks());
    mount();
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-2',
    );
    await completeRead('thread-2');
    fireEvent.change(draftInput(), {
      target: { value: 'actual outgoing edit' },
    });
    await selectThread('thread-1');
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-2',
    );
    const outgoingSave = take('SaveMyahInboxDraft');
    expect(outgoingSave.variables).toMatchObject({
      input: {
        expectedWorkspaceId: key.workspaceId,
        target: { threadId: 'thread-2' },
        expectedRevision: 2,
        body: { markdown: 'actual outgoing edit', blocknote: null },
      },
    });
    await act(async () =>
      outgoingSave.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'actual outgoing edit', blocknote: null },
        },
      }),
    );
    // The flush only resolves once the committed save refreshes its metadata.
    await completeRead(
      'thread-2',
      'READY',
      { markdown: 'actual outgoing edit', blocknote: null },
      3,
    );
    expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
      'thread-1',
    );
    await advance();
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
    expect(entry()?.localBody.markdown).toBe('non-latest recovery');
    await completeRead();
    expect(draftInput()).toHaveValue('non-latest recovery');
    await advance();
    const recoverySave = take('SaveMyahInboxDraft');
    expect(recoverySave.variables).toMatchObject({
      input: {
        expectedWorkspaceId: key.workspaceId,
        target: { threadId: 'thread-1' },
        expectedRevision: 2,
        body: { markdown: 'non-latest recovery', blocknote: null },
      },
    });
    await act(async () =>
      recoverySave.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'non-latest recovery', blocknote: null },
        },
      }),
    );
    expect(entry()).toMatchObject({ dirty: false, status: 'saved' });
  });

  it.each(['dirty', 'error'] as const)(
    'leaves a dormant non-latest %s buffer reachable across contact/channel navigation after a forced switch',
    async (status) => {
      configureTwoThreadContact();
      const { store, entry } = setup();
      await completeRead('thread-2');
      await selectThread('thread-1');
      await completeRead();
      fireEvent.change(draftInput(), {
        target: { value: 'non-latest retained bytes' },
      });
      if (status === 'error') {
        await advance();
        await act(async () => take('SaveMyahInboxDraft').reject());
        expect(entry()?.status).toBe('error');
      }
      act(() =>
        store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never),
      );
      act(() =>
        store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never),
      );
      requests = []; // Only obsolete workspace-2 read handles exist here.
      await select('contact-1');
      expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
        'thread-2',
      );
      await completeRead('thread-2');
      await selectChannel('Instagram');
      expect(
        screen.getByText('Instagram timeline contact-1'),
      ).toBeInTheDocument();
      await selectChannel('Email');
      await completeRead('thread-2');
      await select('contact-2');
      expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
        'contact-2',
      );
      await completeRead('thread-3');
      await select('contact-1');
      await completeRead('thread-2');
      await selectThread('thread-1');
      expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
        'thread-1',
      );
      await advance();
      expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
        false,
      );
      expect(entry()?.localBody.markdown).toBe('non-latest retained bytes');
      await completeRead();
      expect(draftInput()).toHaveValue('non-latest retained bytes');
      await advance();
      if (status === 'error') {
        expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
          false,
        );
        expect(entry()?.status).toBe('error');
        // Once mounted again, the same buffer blocks every outgoing transition.
        await selectThread('thread-2');
        await selectChannel('Instagram');
        await select('contact-2');
        expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
          contactId: 'contact-1',
          channel: 'EMAIL',
          emailThreadId: 'thread-1',
        });
        await act(async () => {
          fireEvent.click(
            screen.getByRole('button', { name: 'Retry draft save' }),
          );
        });
      }
      const save = take('SaveMyahInboxDraft');
      expect(save.variables).toMatchObject({
        input: {
          expectedWorkspaceId: key.workspaceId,
          target: { threadId: 'thread-1' },
          expectedRevision: 2,
          body: { markdown: 'non-latest retained bytes', blocknote: null },
        },
      });
      await act(async () =>
        save.resolve({
          saveMyahInboxDraft: {
            status: 'SAVED',
            revision: 3,
            body: { markdown: 'non-latest retained bytes', blocknote: null },
          },
        }),
      );
      expect(entry()).toMatchObject({ dirty: false, status: 'saved' });
      await selectThread('thread-2');
      expect(store.get(myahInboxContactSelectionState.atom).emailThreadId).toBe(
        'thread-2',
      );
    },
  );

  it.each([
    ['OUTCOME_PENDING', 'pending'],
    ['OUTCOME_UNKNOWN', 'unknown'],
  ])(
    'protects outgoing latest-thread %s work while non-latest recovery is dormant',
    async (readiness, operationKind) => {
      configureTwoThreadContact();
      const { store, view, mount, entry } = setup();
      await completeRead('thread-2');
      await selectThread('thread-1');
      await completeRead();
      fireEvent.change(draftInput(), {
        target: { value: 'paused non-latest edit' },
      });
      view.unmount();
      await act(async () => jest.runAllTicks());
      mount();
      await completeRead('thread-2', readiness);
      expect(
        store.get(
          myahInboxDraftAutosaveFamilyState.atomFamily(
            draftKeyFixture(key.workspaceId, 'thread-2'),
          ),
        )?.operation?.kind,
      ).toBe(operationKind);
      await selectThread('thread-1');
      await selectChannel('Instagram');
      await select('contact-2');
      expect(store.get(myahInboxContactSelectionState.atom)).toMatchObject({
        contactId: 'contact-1',
        channel: 'EMAIL',
        emailThreadId: 'thread-2',
      });
      await advance();
      expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
        false,
      );
      expect(entry()?.localBody.markdown).toBe('paused non-latest edit');
      expect(draftInput()).toBeDisabled();
    },
  );

  it('reopens a forced-workspace recovery and resumes only after its exact read, without another edit', async () => {
    const { store, entry } = setup();
    await completeRead();
    fireEvent.change(draftInput(), {
      target: { value: 'retained edit' },
    });
    act(() =>
      store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never),
    );
    await advance();
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
    act(() =>
      store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never),
    );
    requests = []; // Discard only obsolete workspace-2 read transport handles.
    await select('contact-1');
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    await advance();
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
    expect(entry()?.localBody.markdown).toBe('retained edit');
    await completeRead();
    expect(draftInput()).toHaveValue('retained edit');
    await advance();
    const save = take('SaveMyahInboxDraft');
    expect(save.variables).toMatchObject({
      input: {
        expectedWorkspaceId: key.workspaceId,
        target: { threadId: key.deliveryTargetId },
        expectedRevision: 2,
        body: { markdown: 'retained edit', blocknote: null },
      },
    });
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'retained edit', blocknote: null },
        },
      }),
    );
    expect(entry()).toMatchObject({ dirty: false, status: 'saved' });
  });
  it('reopens an error buffer after a forced switch, keeps it paused and retries only on explicit action', async () => {
    const { store, entry } = setup();
    await completeRead();
    fireEvent.change(draftInput(), {
      target: { value: 'failed edit' },
    });
    await advance();
    await act(async () => take('SaveMyahInboxDraft').reject());
    expect(entry()?.status).toBe('error');
    act(() =>
      store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never),
    );
    act(() =>
      store.set(currentWorkspaceState.atom, { id: key.workspaceId } as never),
    );
    requests = [];
    await select('contact-1');
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    await completeRead();
    await advance();
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
    expect(draftInput()).toHaveValue('failed edit');
    expect(entry()?.status).toBe('error');
    // Once reopened, the error is outgoing active work and must block navigation.
    await select('contact-2');
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
    });
    const save = take('SaveMyahInboxDraft');
    expect(save.variables).toMatchObject({
      input: {
        expectedWorkspaceId: key.workspaceId,
        target: { threadId: key.deliveryTargetId },
        expectedRevision: 2,
        body: { markdown: 'failed edit', blocknote: null },
      },
    });
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'failed edit', blocknote: null },
        },
      }),
    );
    expect(entry()).toMatchObject({ dirty: false, status: 'saved' });
    await select('contact-2');
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-2',
    );
  });

  it('can restore another contact after Page remount, but first saves the newly active outgoing draft', async () => {
    const { store, view, mount } = setup();
    await completeRead();
    await select('contact-2');
    await completeRead('thread-2');
    fireEvent.change(draftInput(), {
      target: { value: 'second contact recovery' },
    });
    view.unmount();
    await act(async () => jest.runAllTicks());
    mount();
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    await completeRead();
    fireEvent.change(draftInput(), {
      target: { value: 'outgoing edit' },
    });
    await select('contact-2');
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-1',
    );
    const save = take('SaveMyahInboxDraft');
    expect(save.variables).toMatchObject({
      input: {
        expectedWorkspaceId: key.workspaceId,
        target: { threadId: key.deliveryTargetId },
        expectedRevision: 2,
        body: { markdown: 'outgoing edit', blocknote: null },
      },
    });
    await act(async () =>
      save.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'outgoing edit', blocknote: null },
        },
      }),
    );
    // The flush only resolves once the committed save refreshes its metadata.
    await completeRead(
      key.deliveryTargetId,
      'READY',
      { markdown: 'outgoing edit', blocknote: null },
      3,
    );
    expect(store.get(myahInboxContactSelectionState.atom).contactId).toBe(
      'contact-2',
    );
    await advance();
    expect(requests.some(({ name }) => name === 'SaveMyahInboxDraft')).toBe(
      false,
    );
    await completeRead('thread-2');
    expect(draftInput()).toHaveValue('second contact recovery');
    await advance();
    const recoverySave = take('SaveMyahInboxDraft');
    expect(recoverySave.variables).toMatchObject({
      input: {
        expectedWorkspaceId: key.workspaceId,
        target: { threadId: 'thread-2' },
        expectedRevision: 2,
        body: { markdown: 'second contact recovery', blocknote: null },
      },
    });
    await act(async () =>
      recoverySave.resolve({
        saveMyahInboxDraft: {
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'second contact recovery', blocknote: null },
        },
      }),
    );
  });
});
