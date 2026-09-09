import { ThemeProvider } from 'twenty-ui/theme-constants';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider, useAtomValue, useStore } from 'jotai';
import {
  StrictMode,
  useEffect,
  createElement,
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { MainAppLayoutWithSidePanel } from '@/ui/layout/page/components/MainAppLayoutWithSidePanel';
import { useSidePanelCloseAnimationCompleteCleanup } from '@/side-panel/hooks/useSidePanelCloseAnimationCompleteCleanup';
import {
  MemoryRouter,
  Route,
  Routes,
  Link,
  useLocation,
} from 'react-router-dom';
import { myahInboxContextState } from '@/myah/inbox/states/myahInboxContextState';
import { MyahInboxContextEffect } from '@/myah/inbox/components/MyahInboxContextEffect';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useOpenMyahInboxContextInSidePanel } from '@/myah/inbox/hooks/useOpenMyahInboxContextInSidePanel';
import { useMyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { isSidePanelClosingState } from '@/side-panel/states/isSidePanelClosingState';
import { sidePanelPageState } from '@/side-panel/states/sidePanelPageState';
import { sidePanelPageInfoState } from '@/side-panel/states/sidePanelPageInfoState';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { SidePanelPages } from 'twenty-shared/types';
import { IconInfoCircle } from 'twenty-ui/icon';

let mockWide = true;
let mockMobile = false;
const mockPush = jest.fn();
const mockRemove = jest.fn();
const mockDropdown = jest.fn();
const mockReset = jest.fn();
const mockCloseDropdown = jest.fn();
const mockResetSelectedItem = jest.fn();
const mockSaveDraft = jest.fn();
const mockMount = jest.fn();
const mockRouteCloseSnapshot = jest.fn();
jest.mock('react-responsive', () => ({
  useMediaQuery: ({ query }: { query: string }) =>
    query === '(min-width: 1200px)' ? mockWide : mockMobile,
}));
// Keep the actual shell selection, desktop transition callback, mobile
// animation container, navigation, close and completion hooks. Only styling
// and unrelated record/keyboard/resize dependencies are replaced.
jest.mock('@linaria/react', () => {
  const styledComponent = (component: ElementType) => () =>
    forwardRef<
      HTMLElement,
      HTMLAttributes<HTMLElement> & {
        isOpen?: boolean;
        isResizing?: boolean;
      }
    >(({ isOpen: _isOpen, isResizing: _isResizing, ...props }, ref) =>
      createElement(component, { ...props, ref }),
    );
  return {
    styled: new Proxy(styledComponent, {
      get: (_, tag: string) => styledComponent(tag as ElementType),
    }),
  };
});
jest.mock('@/command-menu/hooks/useCommandMenuHotKeys', () => ({
  useCommandMenuHotKeys: () => {},
}));
jest.mock('@/ui/layout/resizable-panel/components/ResizablePanelGap', () => ({
  ResizablePanelGap: () => null,
}));
jest.mock('@/ui/utilities/pointer-event/hooks/useListenClickOutside', () => ({
  useListenClickOutside: () => {},
}));
// Keep the real router, its instance provider, sub-page router and strict
// component-state hooks: mobile presence retains them during close animation.
jest.mock('@/side-panel/components/SidePanelContainer', () => ({
  SidePanelContainer: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/side-panel/components/SidePanelTopBar', () => ({
  SidePanelTopBar: () => null,
}));
jest.mock('@/command-menu-item/contexts/CommandMenuContextProvider', () => ({
  CommandMenuContextProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/side-panel/constants/SidePanelPagesConfig', () => {
  const { SidePanelPages: pages } = jest.requireActual<{
    SidePanelPages: typeof SidePanelPages;
  }>('twenty-shared/types');
  return {
    SIDE_PANEL_PAGES_CONFIG: new Map(
      Object.values(pages).map((page) => [
        page,
        <div data-testid="native-shell-page" />,
      ]),
    ),
  };
});
jest.mock('@/side-panel/constants/SidePanelSubPagesConfig', () => ({
  SIDE_PANEL_SUB_PAGES_CONFIG: new Map(),
}));
jest.mock(
  '@/side-panel/pages/common/components/SidePanelSubPageNavigationHeader',
  () => ({
    SidePanelSubPageNavigationHeader: () => null,
  }),
);
jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({ pushFocusItemToFocusStack: mockPush }),
}));
jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: mockRemove,
    }),
  }),
);
jest.mock('@/ui/layout/dropdown/hooks/useCloseAnyOpenDropdown', () => ({
  useCloseAnyOpenDropdown: () => ({ closeAnyOpenDropdown: mockDropdown }),
}));
jest.mock(
  '@/object-record/record-index/hooks/useResetRecordIndexSelection',
  () => ({
    useResetRecordIndexSelection: () => ({
      resetRecordIndexSelection: mockReset,
    }),
  }),
);
jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: mockCloseDropdown }),
}));
jest.mock('@/ui/layout/selectable-list/hooks/useSelectableList', () => ({
  useSelectableList: () => ({ resetSelectedItem: mockResetSelectedItem }),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: () => ({ saveDraft: mockSaveDraft }),
}));

const key = { workspaceId: 'workspace-1', threadId: 'thread-1' };
const first: MyahInboxThread = {
  id: key.threadId,
  lastActivityAt: '2026-09-08T00:00:00Z',
  subject: 'First',
  lastMessagePreview: null,
  lastMessageSender: null,
  state: 'NEEDS_REPLY',
  snoozedUntil: null,
  inboxOwner: null,
  creator: { id: 'creator-1', name: 'First Creator' },
  campaign: null,
};
const second: MyahInboxThread = { ...first, id: 'thread-2' };
const drain = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
// Mirror only PageChangeEffect's route-close predicate, not its unrelated
// record-index/auth effects. The close and completion hooks below are real.
const NativeRouteEntryCloseEffect = () => {
  const store = useStore();
  const { pathname } = useLocation();
  const { closeSidePanelMenu } = useSidePanelMenu();
  useEffect(() => {
    const page = store.get(sidePanelPageState.atom);
    if (
      page === SidePanelPages.AskAI ||
      page === SidePanelPages.NavigationMenuItemEdit
    )
      return;
    mockRouteCloseSnapshot({
      pathname,
      context: store.get(myahInboxContextState.atom),
      opened: store.get(isSidePanelOpenedState.atom),
    });
    void closeSidePanelMenu();
  }, [closeSidePanelMenu, pathname, store]);
  return null;
};
const ReopenSameInboxInstance = () => {
  const store = useStore();
  const { navigateSidePanelMenu } = useSidePanelMenu();
  return (
    <button
      onClick={() =>
        navigateSidePanelMenu({
          page: SidePanelPages.MyahInboxContext,
          pageTitle: 'Conversation details',
          pageIcon: IconInfoCircle,
          pageId: store.get(sidePanelPageInfoState.atom).instanceId,
          resetNavigationStack: true,
        })
      }
    >
      Reopen same Inbox instance
    </button>
  );
};
const CompleteNativeClose = () => {
  const { sidePanelCloseAnimationCompleteCleanup } =
    useSidePanelCloseAnimationCompleteCleanup();
  return (
    <button onClick={() => sidePanelCloseAnimationCompleteCleanup()}>
      Complete native close animation
    </button>
  );
};
const OpenCompetingPanel = () => {
  const { navigateSidePanelMenu } = useSidePanelMenu();
  return (
    <button
      onClick={() =>
        navigateSidePanelMenu({
          page: SidePanelPages.AskAI,
          pageTitle: 'Agent',
          pageIcon: IconInfoCircle,
          resetNavigationStack: true,
        })
      }
    >
      Open competing panel
    </button>
  );
};
const Harness = ({ thread }: { thread: MyahInboxThread }) => {
  const { reconcile, updateDraft } = useMyahInboxDraftAutosaveController();
  const entry = useAtomValue(myahInboxDraftAutosaveFamilyState.atomFamily(key));
  const { closeSidePanelMenu } = useSidePanelMenu();
  const { openMyahInboxContextInSidePanel } =
    useOpenMyahInboxContextInSidePanel();
  useEffect(() => {
    mockMount();
  }, []);
  useEffect(() => {
    reconcile({
      key,
      revision: 2,
      body: { markdown: '', blocknote: null },
    });
  }, [reconcile]);
  return (
    <>
      <MyahInboxContextEffect workspaceId={key.workspaceId} thread={thread} />
      <input
        aria-label="Real autosave probe"
        value={entry?.localBody.markdown ?? ''}
        onChange={(event) =>
          updateDraft({
            key,
            body: { markdown: event.target.value, blocknote: null },
          })
        }
      />
      <button
        onClick={() => {
          void closeSidePanelMenu();
        }}
      >
        Close context
      </button>
      <button onClick={openMyahInboxContextInSidePanel}>
        Conversation details
      </button>
      <OpenCompetingPanel />
      <CompleteNativeClose />
      <ReopenSameInboxInstance />
    </>
  );
};

beforeEach(() => {
  // Native ThemeProvider normally resolves these from theme-light.css. Without
  // it, motion receives CSS variable strings as seconds and duration becomes NaN.
  for (const [name, value] of Object.entries({
    '--t-animation-duration-instant': '0.075',
    '--t-animation-duration-fast': '0.15',
    '--t-animation-duration-normal': '0.3',
    '--t-animation-duration-slow': '1.5',
    '--t-side-panel-width': '500px',
  }))
    document.documentElement.style.setProperty(name, value);
  window.matchMedia = jest.fn((query: string) => ({
    get matches() {
      return query.includes('max-width') && mockMobile;
    },
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  jest.clearAllMocks();
  mockWide = true;
  mockMobile = false;
  mockSaveDraft.mockResolvedValue({
    status: 'SAVED',
    revision: 3,
    body: { markdown: 'Keep this draft', blocknote: null },
  });
});

it.each([true, false])(
  'opens once only after real entry-close completion (first=%s)',
  async (routeCloseFirst) => {
    const store = createStore();
    store.set(sidePanelPageState.atom, SidePanelPages.ViewRecord);
    store.set(isSidePanelOpenedState.atom, true);
    render(
      <Provider store={store}>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={['/myah/inbox']}
        >
          <StrictMode>
            {routeCloseFirst && <NativeRouteEntryCloseEffect />}
            <Harness thread={first} />
            {!routeCloseFirst && <NativeRouteEntryCloseEffect />}
          </StrictMode>
        </MemoryRouter>
      </Provider>,
    );
    await drain();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
    expect(store.get(isSidePanelClosingState.atom)).toBe(true);
    expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.ViewRecord);
    expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
    await drain();
    expect(mockPush).not.toHaveBeenCalled();

    // Drive the real cleanup: resets page/info/stack, emits the close event,
    // then clears closing. No timer advance or direct atom reset substitutes it.
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete native close animation' }),
    );
    expect(store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.CommandMenuDisplay,
    );
    expect(store.get(isSidePanelClosingState.atom)).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
    await drain();
    expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
    expect(store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.MyahInboxContext,
    );
    expect(store.get(sidePanelPageInfoState.atom).title).toBe('Inbox context');
    expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
    await drain();
    expect(mockPush).toHaveBeenCalledTimes(1);
  },
);

it('preserves the AskAI route-close exception and suppression after native close', async () => {
  const store = createStore();
  store.set(sidePanelPageState.atom, SidePanelPages.AskAI);
  store.set(isSidePanelOpenedState.atom, true);
  render(
    <Provider store={store}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/myah/inbox']}
      >
        <NativeRouteEntryCloseEffect />
        <Harness thread={first} />
      </MemoryRouter>
    </Provider>,
  );
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
  await drain();
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Complete native close animation' }),
  );
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(mockPush).not.toHaveBeenCalled();
});

it('uses real native navigation once and preserves stack/focus on context synchronization', async () => {
  const store = createStore();
  const tree = (thread: MyahInboxThread) => (
    <Provider store={store}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/myah/inbox']}
      >
        <Harness thread={thread} />
      </MemoryRouter>
    </Provider>
  );
  const view = render(tree(first));
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(
    SidePanelPages.MyahInboxContext,
  );
  expect(store.get(sidePanelPageInfoState.atom).title).toBe('Inbox context');
  const stack = store.get(sidePanelNavigationStackState.atom);
  expect(stack).toHaveLength(1);
  expect(mockPush).toHaveBeenCalledTimes(1);
  view.rerender(tree(second));
  await drain();
  expect(store.get(sidePanelNavigationStackState.atom)).toBe(stack);
  expect(mockPush).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(mockRemove).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Complete native close animation' }),
  );
  view.rerender(tree(first));
  await drain();
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
});

it('does not remount or prematurely save the real draft on close/reopen and resize', async () => {
  const store = createStore();
  const tree = () => (
    <Provider store={store}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/myah/inbox']}
      >
        <Harness thread={first} />
      </MemoryRouter>
    </Provider>
  );
  const view = render(tree());
  await drain();
  const input = screen.getByRole('textbox', { name: 'Real autosave probe' });
  input.focus();
  fireEvent.change(input, { target: { value: 'Keep this draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
  await drain();
  fireEvent.click(
    screen.getByRole('button', { name: 'Complete native close animation' }),
  );
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  mockWide = false;
  view.rerender(tree());
  await drain();
  fireEvent.click(
    screen.getByRole('button', { name: 'Complete native close animation' }),
  );
  await drain();
  mockWide = true;
  view.rerender(tree());
  await drain();
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox', { name: 'Real autosave probe' })).toBe(
    input,
  );
  expect(input).toHaveValue('Keep this draft');
  expect(mockSaveDraft).not.toHaveBeenCalled();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 750));
  });
  expect(mockSaveDraft).toHaveBeenCalledTimes(1);
  expect(mockSaveDraft).toHaveBeenCalledWith({
    threadId: key.threadId,
    expectedRevision: 2,
    body: { markdown: 'Keep this draft', blocknote: null },
  });
  expect(
    store.get(myahInboxDraftAutosaveFamilyState.atomFamily(key))?.confirmedBody
      ?.markdown,
  ).toBe('Keep this draft');
});

const setupNativeShell = (
  store = createStore(),
  exitPath = '/myah/creators',
) => {
  const tree = () => (
    <StrictMode>
      <Provider store={store}>
        <ThemeProvider colorScheme="light">
          <MemoryRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            initialEntries={['/myah/inbox']}
          >
            <Link to={exitPath}>Leave Inbox</Link>
            <Link to="/myah/inbox">Return to Inbox</Link>
            <Routes>
              <Route element={<MainAppLayoutWithSidePanel />}>
                <Route
                  path="/myah/inbox"
                  element={<Harness thread={first} />}
                />
                <Route
                  path="/myah/creators"
                  element={
                    <>
                      <div>Creators</div>
                      <OpenCompetingPanel />
                    </>
                  }
                />
                <Route path="/settings/profile" element={<div>Settings</div>} />
              </Route>
            </Routes>
            <NativeRouteEntryCloseEffect />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    </StrictMode>
  );
  const view = render(tree());
  return { store, unmount: view.unmount, update: () => view.rerender(tree()) };
};

it.each([false, true])(
  'restores one Inbox entry after the real desktop shell disappears (mid-transition=%s)',
  async (crossDuringClose) => {
    const view = setupNativeShell();
    const { store } = view;
    await drain();
    expect(document.querySelector('[data-side-panel]')).toBeInTheDocument();
    expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
    expect(mockPush).toHaveBeenCalledTimes(1);

    if (crossDuringClose) {
      // 1440 -> 1024: the desktop width transition is still in progress.
      mockWide = false;
      view.update();
      await drain();
      expect(document.querySelector('[data-side-panel]')).toBeInTheDocument();
      expect(store.get(isSidePanelClosingState.atom)).toBe(true);
      expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
      expect(mockCloseDropdown).not.toHaveBeenCalled();
    }

    // Either 1440 -> 390 directly or 1024 -> 390 before transitionend.
    mockWide = false;
    mockMobile = true;
    view.update();
    await drain();
    expect(document.querySelector('[data-side-panel]')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(store.get(isSidePanelClosingState.atom)).toBe(false),
    );
    expect(screen.queryByTestId('native-shell-page')).not.toBeInTheDocument();
    expect(store.get(isSidePanelOpenedState.atom)).toBe(false);

    mockWide = true;
    mockMobile = false;
    view.update();
    await drain();
    // No manual cleanup hook, transitionend, or closing atom reset: the old
    // desktop completion owner was unmounted and cannot emit an event.
    expect(store.get(isSidePanelClosingState.atom)).toBe(false);
    expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
    expect(store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.MyahInboxContext,
    );
    expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
    expect(screen.getAllByTestId('native-shell-page')).toHaveLength(1);
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
    await drain();
    expect(mockPush).toHaveBeenCalledTimes(2);
  },
);

it('keeps mobile dismissal for this visit but opens on a fresh desktop visit', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  expect(screen.getByTestId('command-menu')).toBeInTheDocument();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  await waitFor(() =>
    expect(screen.getByTestId('command-menu')).toHaveStyle({
      transform: 'none',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
  await drain();
  await waitFor(() =>
    expect(store.get(isSidePanelClosingState.atom)).toBe(false),
  );
  mockMobile = false;
  mockWide = true;
  view.update();
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(mockPush).toHaveBeenCalledTimes(1);

  // Same application store, no reset or completion event between visits.
  view.unmount();
  setupNativeShell(store);
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(store.get(sidePanelPageState.atom)).toBe(
    SidePanelPages.MyahInboxContext,
  );
  expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
  expect(screen.getAllByTestId('native-shell-page')).toHaveLength(1);
  expect(mockPush).toHaveBeenCalledTimes(2);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
});

it('does not complete or replace an unrelated mobile page close', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Open competing panel' }));
  await drain();
  expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
  await drain();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  expect(store.get(sidePanelPageInfoState.atom).title).toBe('Agent');
  expect(mockCloseDropdown).not.toHaveBeenCalled();
  mockMobile = false;
  mockWide = true;
  view.update();
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockCloseDropdown).not.toHaveBeenCalled();
});

it('restores a fresh desktop visit after native mobile route-exit closure', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(screen.getByTestId('command-menu')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Leave Inbox' }));
  await drain();
  expect(screen.getByText('Creators')).toBeInTheDocument();
  expect(mockRouteCloseSnapshot).toHaveBeenLastCalledWith({
    pathname: '/myah/creators',
    context: null,
    opened: true,
  });
  expect(store.get(myahInboxContextState.atom)).toBeNull();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  await waitFor(() =>
    expect(store.get(isSidePanelClosingState.atom)).toBe(false),
  );

  mockMobile = false;
  mockWide = true;
  view.update();
  await drain();
  expect(document.querySelector('[data-side-panel]')).toBeInTheDocument();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(
    screen.queryByRole('textbox', { name: 'Real autosave probe' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Return to Inbox' }));
  await drain();
  // No direct completion callback, transitionend or atom reset; the native
  // pathname close ran only after the Inbox publisher had been disposed.
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(store.get(sidePanelPageState.atom)).toBe(
    SidePanelPages.MyahInboxContext,
  );
  expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
  expect(screen.getAllByTestId('native-shell-page')).toHaveLength(1);
  expect(mockPush).toHaveBeenCalledTimes(2);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
  await drain();
  expect(mockPush).toHaveBeenCalledTimes(2);
});

it('leaves a simultaneous desktop route-exit close to the native transition owner', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();

  // The exiting sidecar captured mobile, but this commit mounts the desktop
  // shell open before the native pathname effect starts its close transition.
  mockMobile = false;
  mockWide = true;
  act(() => {
    view.update();
    fireEvent.click(screen.getByRole('link', { name: 'Leave Inbox' }));
  });
  await drain();
  expect(store.get(myahInboxContextState.atom)).toBeNull();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  expect(mockCloseDropdown).not.toHaveBeenCalled();
  const desktopPanel = document.querySelector('[data-side-panel]');
  expect(desktopPanel).toBeInTheDocument();
  if (!(desktopPanel instanceof HTMLElement)) {
    throw new Error('Expected native desktop panel');
  }
  fireEvent.transitionEnd(desktopPanel);
  await drain();
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
});

it('does not let mobile route disposal replace an agent page', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Open competing panel' }));
  await drain();
  const agentPageInfo = store.get(sidePanelPageInfoState.atom);
  const agentStack = store.get(sidePanelNavigationStackState.atom);
  fireEvent.click(screen.getByRole('link', { name: 'Leave Inbox' }));
  await drain();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  mockMobile = false;
  mockWide = true;
  view.update();
  fireEvent.click(screen.getByRole('link', { name: 'Return to Inbox' }));
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  expect(store.get(sidePanelPageInfoState.atom)).toBe(agentPageInfo);
  expect(store.get(sidePanelNavigationStackState.atom)).toBe(agentStack);
  expect(mockCloseDropdown).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledTimes(2);
});

it('keeps the router instance until native mobile exit completes on settings departure', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell(createStore(), '/settings/profile');
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  fireEvent.click(screen.getByRole('link', { name: 'Leave Inbox' }));
  await drain();
  expect(mockRouteCloseSnapshot).toHaveBeenLastCalledWith({
    pathname: '/settings/profile',
    context: null,
    opened: true,
  });
  expect(store.get(myahInboxContextState.atom)).toBeNull();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(false);
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  expect(store.get(sidePanelPageInfoState.atom).instanceId).not.toBe('');
  expect(mockCloseDropdown).not.toHaveBeenCalled();
  await waitFor(
    () => expect(store.get(isSidePanelClosingState.atom)).toBe(false),
    { timeout: 5000 },
  );
  expect(store.get(sidePanelPageState.atom)).toBe(
    SidePanelPages.CommandMenuDisplay,
  );
  expect(screen.queryByTestId('native-shell-page')).not.toBeInTheDocument();
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'Real autosave probe' }),
    ).not.toBeInTheDocument(),
  );
  mockMobile = false;
  mockWide = true;
  view.update();
  fireEvent.click(screen.getByRole('link', { name: 'Return to Inbox' }));
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(
    SidePanelPages.MyahInboxContext,
  );
  expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
  expect(mockPush).toHaveBeenCalledTimes(2);
});

it('cancels queued route-exit cleanup when native navigation replaces the page', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  const exitingPageInstanceId = store.get(
    sidePanelPageInfoState.atom,
  ).instanceId;
  fireEvent.click(screen.getByRole('link', { name: 'Leave Inbox' }));
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  mockWide = true;
  mockMobile = false;
  view.update();
  // Before the queued container-disposal callback, a deliberate native open completes
  // the old close and creates another page. The old callback must do nothing.
  fireEvent.click(screen.getByRole('button', { name: 'Open competing panel' }));
  const agentPageInfo = store.get(sidePanelPageInfoState.atom);
  const agentStack = store.get(sidePanelNavigationStackState.atom);
  expect(agentPageInfo.instanceId).not.toBe(exitingPageInstanceId);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
  await drain();
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageState.atom)).toBe(SidePanelPages.AskAI);
  expect(store.get(sidePanelPageInfoState.atom)).toBe(agentPageInfo);
  expect(store.get(sidePanelNavigationStackState.atom)).toBe(agentStack);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(2);
});

// These use the actual CommandMenuForMobile presence boundary, strict router
// instance provider/history and native navigation. No completion button/reset.
it('completes a mobile exit interrupted by a grow back to desktop exactly once', async () => {
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  const pageInfo = store.get(sidePanelPageInfoState.atom);
  mockWide = false;
  mockMobile = true;
  view.update();
  await drain();
  const retainedRouter = screen.getByTestId('native-shell-page');
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  expect(store.get(sidePanelPageInfoState.atom)).toBe(pageInfo);
  expect(mockCloseDropdown).not.toHaveBeenCalled();
  mockMobile = false;
  mockWide = true;
  view.update();
  expect(retainedRouter.isConnected).toBe(false);
  await drain();
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
  expect(store.get(sidePanelPageInfoState.atom).instanceId).not.toBe(
    pageInfo.instanceId,
  );
  expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
  expect(screen.getAllByTestId('native-shell-page')).toHaveLength(1);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(2);
});

it('leaves a new desktop close alone when the disposed mobile owner was still open', async () => {
  mockWide = false;
  mockMobile = true;
  const view = setupNativeShell();
  const { store } = view;
  await drain();
  fireEvent.click(screen.getByRole('button', { name: 'Conversation details' }));
  await drain();
  const pageInfo = store.get(sidePanelPageInfoState.atom);
  mockMobile = false;
  mockWide = true;
  view.update();
  // The mobile disposal callback is pending when a new desktop close starts.
  fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
  await drain();
  expect(store.get(isSidePanelClosingState.atom)).toBe(true);
  expect(store.get(sidePanelPageInfoState.atom)).toBe(pageInfo);
  expect(mockCloseDropdown).not.toHaveBeenCalled();
  const desktopPanel = document.querySelector('[data-side-panel]');
  expect(desktopPanel).toBeInTheDocument();
  fireEvent.transitionEnd(desktopPanel!);
  await drain();
  expect(store.get(isSidePanelClosingState.atom)).toBe(false);
  expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
});

it.each([
  { action: 'Conversation details', disposeMobile: true },
  { action: 'Reopen same Inbox instance', disposeMobile: true },
  { action: 'Conversation details', disposeMobile: false },
  { action: 'Reopen same Inbox instance', disposeMobile: false },
])(
  'preserves native reopen via $action (dispose-mobile=$disposeMobile)',
  async ({ action, disposeMobile }) => {
    mockWide = false;
    mockMobile = true;
    const view = setupNativeShell();
    const { store } = view;
    await drain();
    fireEvent.click(
      screen.getByRole('button', { name: 'Conversation details' }),
    );
    await drain();
    const previousInfo = store.get(sidePanelPageInfoState.atom);
    fireEvent.click(screen.getByRole('button', { name: 'Close context' }));
    const retainedRouter = screen.getByTestId('native-shell-page');
    expect(store.get(isSidePanelClosingState.atom)).toBe(true);
    expect(store.get(sidePanelPageInfoState.atom)).toBe(previousInfo);
    if (disposeMobile) {
      mockWide = true;
      mockMobile = false;
      view.update();
      expect(retainedRouter.isConnected).toBe(false);
    }
    // Native explicit navigation, not a manually forced cleanup or state reset.
    fireEvent.click(screen.getByRole('button', { name: action }));
    const reopenedInfo = store.get(sidePanelPageInfoState.atom);
    if (action === 'Reopen same Inbox instance') {
      expect(reopenedInfo.instanceId).toBe(previousInfo.instanceId);
    } else {
      expect(reopenedInfo.instanceId).not.toBe(previousInfo.instanceId);
    }
    await drain();
    if (!disposeMobile) {
      await waitFor(() =>
        expect(screen.getByTestId('command-menu')).toHaveStyle({
          transform: 'none',
        }),
      );
    }
    expect(store.get(sidePanelPageInfoState.atom)).toBe(reopenedInfo);
    expect(store.get(sidePanelPageState.atom)).toBe(
      SidePanelPages.MyahInboxContext,
    );
    expect(store.get(isSidePanelOpenedState.atom)).toBe(true);
    expect(store.get(isSidePanelClosingState.atom)).toBe(false);
    expect(store.get(sidePanelNavigationStackState.atom)).toHaveLength(1);
    expect(screen.getAllByTestId('native-shell-page')).toHaveLength(1);
    expect(mockCloseDropdown).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(2);
  },
);
