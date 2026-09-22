import { type currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { StrictMode, useEffect, type useState as ReactUseState } from 'react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { MyahInboxContextEffect } from '@/myah/inbox/components/MyahInboxContextEffect';
import { useOpenMyahInboxContextInSidePanel } from '@/myah/inbox/hooks/useOpenMyahInboxContextInSidePanel';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';
import { myahInboxContextState } from '@/myah/inbox/states/myahInboxContextState';
import {
  EMPTY_MYAH_INBOX_CONTACT_SELECTION,
  myahInboxContactSelectionState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { SidePanelMyahInboxContextPage } from '@/side-panel/pages/myah-inbox-context/components/SidePanelMyahInboxContextPage';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { isSidePanelClosingState } from '@/side-panel/states/isSidePanelClosingState';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { sidePanelPageInfoState } from '@/side-panel/states/sidePanelPageInfoState';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { SidePanelPages } from 'twenty-shared/types';
import { type IconInfoCircle } from 'twenty-ui/icon';

let mockWide = true;
let mockWorkspaceId: string | null = 'workspace-1';
const mockNavigate = jest.fn();
const mockClose = jest.fn();

jest.mock('react-responsive', () => ({
  useMediaQuery: (settings: { query: string }) => {
    expect(settings.query).toBe('(min-width: 1200px)');
    return mockWide;
  },
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({
    navigateSidePanelMenu: mockNavigate,
    closeSidePanelMenu: mockClose,
  }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => {
  const actual = jest.requireActual<{
    useAtomStateValue: typeof useAtomStateValue;
  }>('@/ui/utilities/state/jotai/hooks/useAtomStateValue');
  const { currentWorkspaceState: workspaceState } = jest.requireActual<{
    currentWorkspaceState: typeof currentWorkspaceState;
  }>('@/auth/states/currentWorkspaceState');
  return {
    useAtomStateValue: (state: typeof workspaceState) => {
      const value = actual.useAtomStateValue(state);
      return state === workspaceState
        ? mockWorkspaceId
          ? { id: mockWorkspaceId }
          : null
        : value;
    },
  };
});
jest.mock('@/myah/inbox/components/MyahInboxContextPanel', () => ({
  MyahInboxContextPanel: ({
    creator,
  }: {
    creator: MyahInboxContact['creator'];
  }) => {
    const { useState } = jest.requireActual<{ useState: typeof ReactUseState }>(
      'react',
    );
    const [tab, setTab] = useState('Creator');
    return (
      <>
        <button onClick={() => setTab('Notes')}>Context Notes probe</button>
        <output aria-label="Context tab">{tab}</output>
        <output aria-label="Live context">{creator?.id ?? 'unlinked'}</output>
      </>
    );
  },
}));

const contact = (
  id: string,
  creator: MyahInboxContact['creator'],
): MyahInboxContact => ({
  id,
  identityKind: creator ? 'CREATOR' : 'EMAIL_THREAD',
  displayName: creator?.name ?? 'Unlinked contact',
  instagramUsername: creator ? `${id}.ig` : null,
  creator,
  lastActivityAt: '2026-09-08T00:00:00Z',
  latestChannel: 'EMAIL',
  initialSelection: {
    channel: 'EMAIL',
    emailThreadId: 'thread-2',
    instagramConversationId: null,
  },
  preview: null,
  sender: null,
  needsAttention: false,
  triage: {
    isAvailable: true,
    inboxOwnerId: null,
    inboxState: null,
    snoozedUntil: null,
    revision: 1,
    identityGeneration: '1',
  },
  email: {
    isAvailable: true,
    threadCount: 2,
    threadIds: ['thread-1', 'thread-2'],
    latestThreadId: 'thread-2',
    needsAttention: false,
  },
  instagram: {
    isAvailable: true,
    state: 'READY',
    needsAttention: false,
    conversations: [
      {
        id: `conversation-${id}`,
        providerConversationId: `provider-${id}`,
        recipientUsername: `${id}.ig`,
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
        recipientDisplayName: creator?.name ?? null,
        lastActivityAt: '2026-09-08T00:00:00Z',
        latestDirection: 'INBOUND',
      },
    ],
  },
});

const first = contact('contact-1', {
  id: 'creator-1',
  name: 'First Creator',
});
const second = contact('contact-2', {
  id: 'creator-2',
  name: 'Second Creator',
});
const drain = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
const Details = () => {
  const { openMyahInboxContextInSidePanel } =
    useOpenMyahInboxContextInSidePanel();
  return (
    <button onClick={openMyahInboxContextInSidePanel}>
      Conversation details
    </button>
  );
};
const Drawer = () => {
  const isSidePanelOpened = useAtomStateValue(isSidePanelOpenedState);
  const sidePanelPage = useAtomStateValue(sidePanelPageState);
  return isSidePanelOpened &&
    sidePanelPage === SidePanelPages.MyahInboxContext ? (
    <SidePanelMyahInboxContextPage />
  ) : null;
};
const RouteCloseEffect = () => {
  useEffect(() => {
    void mockClose();
  }, []);
  return null;
};
type Selection = {
  channel?: 'EMAIL' | 'INSTAGRAM';
  emailThreadId?: string | null;
};

const setup = ({
  store = createStore(),
  selectedContact = first as MyahInboxContact | null,
  selection = {},
  initialPage,
  routeClose = false,
  routeCloseFirst = false,
  strict = false,
}: {
  store?: ReturnType<typeof createStore>;
  selectedContact?: MyahInboxContact | null;
  selection?: Selection;
  initialPage?: SidePanelPages;
  routeClose?: boolean;
  routeCloseFirst?: boolean;
  strict?: boolean;
} = {}) => {
  const select = (value: MyahInboxContact | null, next: Selection = {}) => {
    const channel = value ? (next.channel ?? 'EMAIL') : null;
    store.set(myahInboxContactSelectionState.atom, {
      ...EMPTY_MYAH_INBOX_CONTACT_SELECTION,
      workspaceId: mockWorkspaceId,
      contactId: value?.id ?? null,
      channel,
      emailThreadId:
        channel === 'EMAIL' ? (next.emailThreadId ?? 'thread-1') : null,
      instagramConversationId:
        channel === 'INSTAGRAM'
          ? (value?.instagram.conversations[0]?.id ?? null)
          : null,
    });
  };
  select(selectedContact, selection);
  mockNavigate.mockImplementation(
    (params: {
      page: SidePanelPages;
      pageTitle: string;
      pageId: string;
      pageIcon: typeof IconInfoCircle;
      resetNavigationStack: boolean;
    }) => {
      store.set(isSidePanelClosingState.atom, false);
      store.set(isSidePanelOpenedState.atom, true);
      store.set(sidePanelPageState.atom, params.page);
      store.set(sidePanelPageInfoState.atom, {
        title: params.pageTitle,
        Icon: params.pageIcon,
        instanceId: params.pageId,
      });
      store.set(sidePanelNavigationStackState.atom, [{ ...params }]);
    },
  );
  mockClose.mockImplementation(async () => {
    if (!store.get(isSidePanelOpenedState.atom)) return;
    store.set(sidePanelNavigationStackState.atom, []);
    store.set(isSidePanelOpenedState.atom, false);
    store.set(isSidePanelClosingState.atom, true);
  });
  if (initialPage) {
    store.set(sidePanelPageState.atom, initialPage);
    store.set(isSidePanelOpenedState.atom, true);
  }
  const tree = (value: MyahInboxContact | null) => {
    const content = (
      <>
        {routeClose && routeCloseFirst && <RouteCloseEffect />}
        <input aria-label="Composer probe" defaultValue="Unsaved text" />
        <MyahInboxContextEffect workspaceId={mockWorkspaceId} contact={value} />
        <Details />
        <Drawer />
        {routeClose && !routeCloseFirst && <RouteCloseEffect />}
      </>
    );
    return (
      <Provider store={store}>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/myah/inbox']}
        >
          {strict ? <StrictMode>{content}</StrictMode> : content}
        </MemoryRouter>
      </Provider>
    );
  };
  const view = render(tree(selectedContact));
  return {
    store,
    ...view,
    update: (value: MyahInboxContact | null, next: Selection = {}) => {
      act(() => {
        select(value, next);
        view.rerender(tree(value));
      });
    },
    finishClose: () =>
      act(() => {
        store.set(sidePanelPageState.atom, SidePanelPages.CommandMenuDisplay);
        store.set(isSidePanelClosingState.atom, false);
      }),
    close: () =>
      act(() => {
        void mockClose();
      }),
    openOther: () =>
      act(() => {
        store.set(isSidePanelOpenedState.atom, true);
        store.set(sidePanelPageState.atom, SidePanelPages.AskAI);
      }),
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockWide = true;
  mockWorkspaceId = 'workspace-1';
});

it('publishes current contact context and clears its owned context on unmount', async () => {
  mockWide = false;
  const view = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  expect(screen.getByLabelText('Live context')).toHaveTextContent('creator-1');
  view.update(second);
  expect(screen.getByLabelText('Live context')).toHaveTextContent('creator-2');
  view.update(contact('contact-2', null));
  expect(screen.getByLabelText('Live context')).toHaveTextContent('unlinked');
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  view.unmount();
  await drain();
  expect(view.store.get(myahInboxContextState.atom)).toBeNull();
});

it('publishes the same Creator context for Instagram without an Email thread', () => {
  mockWide = false;
  setup({ selection: { channel: 'INSTAGRAM' } });

  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));

  expect(screen.getByLabelText('Live context')).toHaveTextContent('creator-1');
});

it('auto-opens wide Creator context for an unlinked Instagram contact', async () => {
  setup({
    selectedContact: contact('instagram-only', null),
    selection: { channel: 'INSTAGRAM' },
  });

  await drain();

  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Live context')).toHaveTextContent('unlinked');
});

it('masks mismatched selection/workspace before publication updates', async () => {
  mockWide = false;
  const view = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  act(() => {
    view.store.set(myahInboxContactSelectionState.atom, {
      ...view.store.get(myahInboxContactSelectionState.atom),
      contactId: second.id,
    });
  });
  expect(screen.queryByLabelText('Live context')).not.toBeInTheDocument();
  view.update(first);
  mockWorkspaceId = 'workspace-2';
  act(() => {
    view.store.set(myahInboxContactSelectionState.atom, {
      ...view.store.get(myahInboxContactSelectionState.atom),
      workspaceId: 'workspace-2',
    });
  });
  expect(screen.queryByLabelText('Live context')).not.toBeInTheDocument();
  view.update({ ...first, creator: { id: 'workspace-2-creator', name: null } });
  expect(screen.getByLabelText('Live context')).toHaveTextContent(
    'workspace-2-creator',
  );
  view.update(null);
  expect(
    screen.getByText('Select a contact to view Creator context.'),
  ).toBeVisible();
});

it('opens once after delayed selection and never navigates on contact updates', async () => {
  const view = setup({ selectedContact: null });
  await drain();
  expect(mockNavigate).not.toHaveBeenCalled();
  view.update(first);
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(view.store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
  const info = view.store.get(sidePanelPageInfoState.atom);
  screen.getByRole('textbox', { name: 'Composer probe' }).focus();
  view.update(second);
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(view.store.get(sidePanelPageInfoState.atom)).toBe(info);
  expect(screen.getByRole('textbox', { name: 'Composer probe' })).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Composer probe' })).toHaveValue(
    'Unsaved text',
  );
});

it.each([true, false])(
  'does not race route cleanup (first=%s) or duplicate opening in StrictMode',
  async (routeCloseFirst) => {
    const view = setup({ routeClose: true, routeCloseFirst, strict: true });
    await drain();
    expect(view.store.get(isSidePanelOpenedState.atom)).toBe(true);
    expect(view.store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.MyahInboxContext,
    );
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

it.each([true, false])(
  'waits for an existing ordinary drawer close to finish (first=%s)',
  async (routeCloseFirst) => {
    const view = setup({
      initialPage: SidePanelPages.ViewRecord,
      routeClose: true,
      routeCloseFirst,
      strict: true,
    });
    await drain();
    expect(mockClose).toHaveBeenCalled();
    expect(view.store.get(isSidePanelOpenedState.atom)).toBe(false);
    expect(view.store.get(isSidePanelClosingState.atom)).toBe(true);
    expect(view.store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.ViewRecord,
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    view.update(second);
    await drain();
    expect(mockNavigate).not.toHaveBeenCalled();

    view.finishClose();
    expect(view.store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.CommandMenuDisplay,
    );
    expect(view.store.get(isSidePanelClosingState.atom)).toBe(false);
    await drain();
    expect(view.store.get(isSidePanelOpenedState.atom)).toBe(true);
    expect(view.store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.MyahInboxContext,
    );
    expect(view.store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    await drain();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  },
);

it('keeps dismissal through selection, workspace and resize; explicit reopening works', async () => {
  const view = setup();
  await drain();
  view.close();
  view.finishClose();
  view.update(second);
  await drain();
  mockWide = false;
  view.update(second);
  await drain();
  mockWide = true;
  view.update(second);
  await drain();
  mockWorkspaceId = 'workspace-2';
  view.update(first);
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(view.store.get(isSidePanelOpenedState.atom)).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(2);
  mockWide = false;
  view.update(first);
  await drain();
  view.finishClose();
  mockWide = true;
  view.update(first);
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

it('defaults again on a fresh visit within the same application store', async () => {
  const store = createStore();
  const view = setup({ store });
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  view.close();
  view.finishClose();
  view.update(second);
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  view.unmount();
  await drain();
  expect(store.get(myahInboxContextState.atom)).toBeNull();

  // Preserve the application store and all its atoms, including any faulty
  // global dismissal preference; only the Inbox visit is newly mounted.
  const freshVisit = setup({ store, selectedContact: second });
  await drain();
  expect(freshVisit.store).toBe(store);
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(
    SidePanelPages.MyahInboxContext,
  );
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

it('uses the 1199/1200 contract and closes only on downward crossing', async () => {
  mockWide = false;
  const view = setup();
  await drain();
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  view.update(second);
  await drain();
  expect(view.store.get(isSidePanelOpenedState.atom)).toBe(true);
  mockWide = true;
  view.update(second);
  await drain();
  mockWide = false;
  view.update(second);
  await drain();
  expect(view.store.get(isSidePanelOpenedState.atom)).toBe(false);
  view.finishClose();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  view.update(first);
  await drain();
  expect(view.store.get(isSidePanelOpenedState.atom)).toBe(true);
});

it('restores responsive closure, but not intentional dismissal or competing choice', async () => {
  const view = setup();
  await drain();
  mockWide = false;
  view.update(first);
  await drain();
  view.finishClose();
  mockWide = true;
  view.update(first);
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(2);
  view.openOther();
  await drain();
  mockWide = false;
  view.update(first);
  await drain();
  expect(view.store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(view.store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  view.close();
  view.finishClose();
  mockWide = true;
  view.update(second);
  await drain();
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

it('preserves existing AskAI and does not open when it closes', async () => {
  const view = setup({ initialPage: SidePanelPages.AskAI });
  await drain();
  expect(mockNavigate).not.toHaveBeenCalled();
  view.close();
  view.finishClose();
  view.update(second);
  await drain();
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('cancels queued work on immediate unmount and coalesces rapid resize', async () => {
  const firstView = setup();
  firstView.unmount();
  await drain();
  expect(mockNavigate).not.toHaveBeenCalled();
  const view = setup();
  await drain();
  mockWide = false;
  view.update(first);
  mockWide = true;
  view.update(second);
  await drain();
  expect(view.store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it.each([
  SidePanelPages.AskAI,
  SidePanelPages.ViewRecord,
  SidePanelPages.CommandMenuDisplay,
])(
  'does not replace existing %s or reopen after it closes',
  async (initialPage) => {
    const view = setup({ initialPage });
    await drain();
    expect(mockNavigate).not.toHaveBeenCalled();
    view.close();
    view.finishClose();
    view.update(second);
    await drain();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalledTimes(1);
  },
);

it('keys tab lifetime to workspace and contact rather than channel or Email thread', async () => {
  const view = setup();
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Context Notes probe' }));

  view.update(
    { ...first, creator: { ...first.creator!, name: 'Updated Creator' } },
    { channel: 'INSTAGRAM' },
  );
  expect(screen.getByLabelText('Context tab')).toHaveTextContent('Notes');

  view.update(first, { channel: 'EMAIL', emailThreadId: 'thread-2' });
  expect(screen.getByLabelText('Context tab')).toHaveTextContent('Notes');

  view.update(null);
  expect(
    screen.getByText('Select a contact to view Creator context.'),
  ).toBeVisible();
  view.update(first, { channel: 'INSTAGRAM' });
  expect(screen.getByLabelText('Context tab')).toHaveTextContent('Creator');

  fireEvent.click(screen.getByRole('button', { name: 'Context Notes probe' }));
  view.update(second, { channel: 'INSTAGRAM' });
  expect(screen.getByLabelText('Context tab')).toHaveTextContent('Creator');
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

const LeaveInbox = () => <Link to="/myah/creators">Leave Inbox</Link>;

it('does not retain context across a route exit even with drawer reader retained', async () => {
  const view = setup();
  await drain();
  view.unmount();
  mockWide = false;
  const store = view.store;
  store.set(isSidePanelOpenedState.atom, true);
  store.set(sidePanelPageState.atom, SidePanelPages.MyahInboxContext);
  render(
    <Provider store={store}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/myah/inbox']}
      >
        <LeaveInbox />
        <Routes>
          <Route
            path="/myah/inbox"
            element={
              <MyahInboxContextEffect
                workspaceId="workspace-1"
                contact={first}
              />
            }
          />
          <Route path="/myah/creators" element={<div>Creators</div>} />
        </Routes>
        <SidePanelMyahInboxContextPage />
      </MemoryRouter>
    </Provider>,
  );
  expect(screen.getByLabelText('Live context')).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Leave Inbox' }));
  expect(screen.queryByLabelText('Live context')).not.toBeInTheDocument();
  expect(store.get(myahInboxContextState.atom)).toBeNull();
});
