import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { PageLayoutTabsRenderer } from '@/page-layout/components/PageLayoutTabsRenderer';
import { scrollWrapperScrollTopComponentState } from '@/ui/utilities/scroll/states/scrollWrapperScrollTopComponentState';
import { useState } from 'react';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

let mockLayout: any;
let mockContext: any;
let mockMobile = false;
let mockInvokerVisible = true;
let mockNeighborVisible = true;
let mockReturnedRowVisible = false;
let mockActiveTabId: string | null = 'timeline-tab';
let mockTabListProps: any;
let mockWorkspaceId = 'workspace-a';
let mockScrollTop = 0;
const mockScrollToPosition = jest.fn();
let mockScrollElement: HTMLElement | null = null;
const mockNavigate = jest.fn();
let mockLocation: any = {
  key: 'initial',
  pathname: '/',
  search: '',
  hash: '',
  state: null,
};
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

jest.mock('@/page-layout/components/MyahCampaignWorkspaceHeader', () => ({
  MyahCampaignWorkspaceHeader: ({ campaignId }: { campaignId: string }) => (
    <header>Campaign identity: {campaignId}</header>
  ),
}));

jest.mock('@/page-layout/components/PageLayoutLeftPanel', () => ({
  PageLayoutLeftPanel: () => <div>Native left panel</div>,
}));

jest.mock('@/page-layout/components/PageLayoutTabList', () => ({
  PageLayoutTabList: (props: any) => {
    mockTabListProps = props;
    return <div data-testid="native-tab-list" />;
  },
}));

jest.mock('@/page-layout/components/PageLayoutTabListEffect', () => ({
  PageLayoutTabListEffect: () => <div data-testid="native-tab-list-effect" />,
}));

const MockMembershipTable = () => {
  const [loadedPage, setLoadedPage] = useState(1);
  return (
    <>
      <output data-testid="loaded-membership-page">{loadedPage}</output>
      <button onClick={() => setLoadedPage(2)}>
        Load next membership page
      </button>
    </>
  );
};

jest.mock('@/page-layout/PageLayoutMainContent', () => ({
  PageLayoutMainContent: ({
    tabId,
    onOpenCampaignCreatorContext,
    activityTabId,
  }: {
    tabId: string;
    activityTabId?: string;
    onOpenCampaignCreatorContext?: (request: {
      recordId: string;
      source: 'table-identifier-action';
      activationElement?: HTMLElement;
    }) => void;
  }) => {
    return (
      <div>
        {`native-content:${tabId}`}
        <output data-testid={`activity-destination-${tabId}`}>
          {activityTabId ?? 'unavailable'}
        </output>
        <button>Search influencers</button>
        {tabId === 'influencers-tab' ? <MockMembershipTable /> : null}
        {mockInvokerVisible ? (
          <div data-selectable-id="membership-a">
            <button
              onClick={(event) =>
                onOpenCampaignCreatorContext?.({
                  recordId: 'membership-a',
                  source: 'table-identifier-action',
                  activationElement: event.currentTarget,
                })
              }
            >
              Inspect membership
            </button>
          </div>
        ) : null}
        {mockNeighborVisible ? (
          <div data-selectable-id="membership-neighbor">
            <button>Inspect neighboring membership</button>
          </div>
        ) : null}
        {mockReturnedRowVisible ? (
          <div data-selectable-id="membership-a">
            <button>Inspect restored membership</button>
          </div>
        ) : null}
        <button
          onClick={() =>
            onOpenCampaignCreatorContext?.({
              recordId: 'membership-b',
              source: 'table-identifier-action',
            })
          }
        >
          Inspect without opener
        </button>
      </div>
    );
  },
}));
jest.mock('@/page-layout/components/MyahCampaignCreatorContextPanel', () => ({
  MyahCampaignCreatorContextPanel: ({
    campaignId,
    membershipId,
    onClose,
    initialTab,
    returnTarget,
  }: {
    campaignId: string;
    membershipId: string;
    onClose: () => void;
    initialTab?: string;
    returnTarget: { scrollTop?: number };
  }) => (
    <aside aria-label="Campaign creator context">
      {campaignId}/{membershipId}
      <span>Initial tab: {initialTab ?? 'profile'}</span>
      <span>Saved scroll: {returnTarget.scrollTop}</span>
      <button onClick={onClose}>Close creator context</button>
      <button role="tab">Messages</button>
      <div role="tabpanel" tabIndex={0}>
        Creator content
      </div>
    </aside>
  ),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: mockWorkspaceId }),
}));

jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({
    currentPageLayout: mockLayout,
  }),
}));

jest.mock('@/page-layout/hooks/useIsPageLayoutInEditMode', () => ({
  useIsPageLayoutInEditMode: () => false,
}));

jest.mock('@/page-layout/hooks/usePageLayoutAddTabStrategy', () => ({
  usePageLayoutAddTabStrategy: () => undefined,
}));

jest.mock('@/page-layout/hooks/usePageLayoutHiddenWidgetTypes', () => ({
  usePageLayoutHiddenWidgetTypes: () => [],
}));

jest.mock('@/page-layout/hooks/useReorderRecordPageLayoutTabs', () => ({
  useReorderRecordPageLayoutTabs: () => ({
    reorderRecordPageTabs: jest.fn(),
  }),
}));

jest.mock(
  '@/page-layout/utils/getScrollWrapperInstanceIdFromPageLayoutId',
  () => ({
    getScrollWrapperInstanceIdFromPageLayoutId: () => 'scroll-wrapper-1',
  }),
);

jest.mock(
  '@/page-layout/utils/getTabListInstanceIdFromPageLayoutAndRecord',
  () => ({
    getTabListInstanceIdFromPageLayoutAndRecord: () => 'tab-list-1',
  }),
);

jest.mock('@/page-layout/utils/getTabsByDisplayMode', () => ({
  getTabsByDisplayMode: ({ tabs, isMobile, isInSidePanel }: any) =>
    isMobile || isInSidePanel
      ? { tabsToRenderInTabList: tabs, pinnedLeftTab: undefined }
      : { tabsToRenderInTabList: tabs.slice(1), pinnedLeftTab: tabs[0] },
}));

jest.mock('@/page-layout/utils/getTabsWithVisibleWidgets', () => ({
  getTabsWithVisibleWidgets: ({
    tabs,
  }: {
    tabs: Array<{ hiddenFromTest?: boolean }>;
  }) => tabs.filter((tab) => !tab.hiddenFromTest),
}));

jest.mock('@/page-layout/utils/shouldEnableTabEditingFeatures', () => ({
  shouldEnableTabEditingFeatures: () => false,
}));

jest.mock('@/page-layout/utils/sortTabsByPosition', () => ({
  sortTabsByPosition: <Tab extends { position: number }>(tabs: Tab[]) =>
    [...tabs].sort((a, b) => a.position - b.position),
}));

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => mockContext,
}));

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockMobile,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (atom: unknown) =>
      atom === scrollWrapperScrollTopComponentState
        ? mockScrollTop
        : mockActiveTabId,
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue', () => ({
  useAtomFamilyStateValue: () => ({
    current: [
      { id: 'campaign-meta', nameSingular: 'campaign', isSystem: false },
      { nameSingular: 'creator', isSystem: false },
    ],
  }),
}));

jest.mock('@/ui/utilities/scroll/hooks/useScrollWrapperHTMLElement', () => ({
  useScrollWrapperHTMLElement: () => ({
    scrollWrapperHTMLElement: mockScrollElement,
  }),
}));
jest.mock('@/ui/utilities/scroll/hooks/useScrollToPosition', () => ({
  useScrollToPosition: () => ({ scrollToPosition: mockScrollToPosition }),
}));
jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({
    children,
    componentInstanceId,
  }: {
    children: React.ReactNode;
    componentInstanceId: string;
  }) => <div data-testid={`scroll-${componentInstanceId}`}>{children}</div>,
}));

describe('PageLayoutTabsRenderer', () => {
  beforeEach(() => {
    mockMobile = false;
    mockInvokerVisible = true;
    mockNeighborVisible = true;
    mockReturnedRowVisible = false;
    mockActiveTabId = 'timeline-tab';
    mockTabListProps = undefined;
    mockWorkspaceId = 'workspace-a';
    mockScrollTop = 0;
    mockScrollElement = null;
    mockScrollToPosition.mockClear();
    mockNavigate.mockClear();
    mockLocation = {
      key: 'initial',
      pathname: '/',
      search: '',
      hash: '',
      state: null,
    };
    mockLayout = {
      id: 'layout-1',
      type: 'RECORD_PAGE',
      defaultTabToFocusOnMobileAndSidePanelId: 'home-tab',
      tabs: [
        { id: 'home-tab', title: 'Home', position: 0 },
        { id: 'timeline-tab', title: 'Timeline', position: 1 },
      ],
    };
    mockContext = {
      isInSidePanel: true,
      layoutType: 'RECORD_PAGE',
      targetRecordIdentifier: {
        id: 'creator-1',
        targetObjectNameSingular: 'creator',
      },
    };
  });
  it('renders the native side-panel default tab without its nested tab list', () => {
    render(<PageLayoutTabsRenderer renderMode="default-tab-only" />);

    expect(screen.queryByTestId('native-tab-list')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('native-tab-list-effect'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('native-content:home-tab')).toBeVisible();
  });
  it('keeps standard Campaign selectable and starts at Influencers, including narrow and side panel', () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'home-tab',
        universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
        title: 'Campaign',
        position: 10,
      },
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 20,
      },
      {
        id: 'outreach-tab',
        universalIdentifier: '8d749a63-24d8-481b-9a10-d98d9b959db1',
        title: 'Outreach',
        position: 30,
      },
      {
        id: 'agent-tab',
        universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
        title: 'Agent',
        position: 40,
      },
      {
        id: 'settings-tab',
        universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        title: 'Settings',
        position: 50,
      },
      {
        id: 'tasks-tab',
        universalIdentifier: '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0',
        title: 'Tasks',
        position: 60,
      },
      {
        id: 'notes-tab',
        universalIdentifier: 'cd78ad8c-883a-4ce1-9b74-526adadb751d',
        title: 'Notes',
        position: 70,
      },
    ];
    mockContext = {
      ...mockContext,
      isInSidePanel: false,
      targetRecordIdentifier: {
        id: 'campaign-1',
        targetObjectNameSingular: 'campaign',
      },
    };
    mockActiveTabId = null;
    const view = render(
      <PageLayoutTabsRenderer renderMode="default-tab-only" />,
    );
    expect(screen.getByText('native-content:influencers-tab')).toBeVisible();
    expect(screen.queryByText('Native left panel')).not.toBeInTheDocument();
    view.rerender(<PageLayoutTabsRenderer />);
    expect(mockTabListProps.tabs.map((tab: any) => tab.id)).toEqual([
      'influencers-tab',
      'outreach-tab',
      'home-tab',
      'agent-tab',
      'tasks-tab',
      'settings-tab',
      'notes-tab',
    ]);
    expect(screen.getByText('Campaign identity: campaign-1')).toBeVisible();
    mockActiveTabId = 'home-tab';
    view.rerender(<PageLayoutTabsRenderer />);
    expect(screen.getByText('native-content:home-tab')).toBeVisible();
    for (const context of [
      { isInSidePanel: true, mobile: false },
      { isInSidePanel: false, mobile: true },
    ]) {
      mockContext.isInSidePanel = context.isInSidePanel;
      mockMobile = context.mobile;
      view.rerender(<PageLayoutTabsRenderer renderMode="default-tab-only" />);
      expect(screen.getByText('native-content:influencers-tab')).toBeVisible();
    }
  });

  it('keeps a later loaded membership page mounted across Creator activity and back', () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
      {
        id: 'home-tab',
        universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
        title: 'Campaign',
        position: 2,
      },
    ];
    mockContext.targetRecordIdentifier = {
      id: 'campaign-a',
      targetObjectNameSingular: 'campaign',
    };
    mockActiveTabId = 'influencers-tab';
    const view = render(<PageLayoutTabsRenderer />);
    expect(
      screen.getByTestId('activity-destination-influencers-tab'),
    ).toHaveTextContent('home-tab');
    fireEvent.click(
      screen.getByRole('button', { name: 'Load next membership page' }),
    );
    expect(screen.getByTestId('loaded-membership-page')).toHaveTextContent('2');
    const influencerScroll = screen.getByTestId(
      'scroll-scroll-wrapper-1-influencers-campaign-a',
    );
    influencerScroll.scrollTop = 240;
    mockActiveTabId = 'home-tab';
    view.rerender(<PageLayoutTabsRenderer />);
    expect(screen.getByText('native-content:home-tab')).toBeVisible();
    mockActiveTabId = 'influencers-tab';
    view.rerender(<PageLayoutTabsRenderer />);
    expect(screen.getByTestId('loaded-membership-page')).toHaveTextContent('2');
    expect(
      screen.getByTestId('scroll-scroll-wrapper-1-influencers-campaign-a'),
    ).toBe(influencerScroll);
    expect(influencerScroll.scrollTop).toBe(240);
  });

  it('does not link to a Home tab filtered out from selectable tabs', () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
      {
        id: 'home-tab',
        universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
        title: 'Campaign',
        position: 2,
        hiddenFromTest: true,
      },
    ];
    mockContext.targetRecordIdentifier = {
      id: 'campaign-a',
      targetObjectNameSingular: 'campaign',
    };
    mockActiveTabId = 'influencers-tab';
    render(<PageLayoutTabsRenderer />);
    expect(
      screen.getByTestId('activity-destination-influencers-tab'),
    ).toHaveTextContent('unavailable');
  });

  it('restores only a workspace/campaign/tab-matched creator return once, its scroll and selected-row focus', async () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
    ];
    mockContext = {
      ...mockContext,
      isInSidePanel: false,
      targetRecordIdentifier: {
        id: 'campaign-a',
        targetObjectNameSingular: 'campaign',
      },
    };
    mockActiveTabId = 'influencers-tab';
    const pathname = getAppPath(AppPath.RecordShowPage, {
      objectNameSingular: 'campaign',
      objectRecordId: 'campaign-a',
    });
    mockScrollTop = 320;
    mockInvokerVisible = false;
    mockReturnedRowVisible = true;
    mockScrollElement = document.createElement('div');
    Object.defineProperty(mockScrollElement, 'scrollHeight', {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(mockScrollElement, 'clientHeight', {
      configurable: true,
      value: 100,
    });
    mockLocation = {
      key: 'returned',
      pathname,
      search: '?view=one',
      hash: '#influencers-tab',
      state: {
        campaignCreatorInboxReturnTarget: {
          workspaceId: 'workspace-a',
          campaignId: 'campaign-a',
          membershipId: 'membership-a',
          influencerTabId: 'influencers-tab',
          pathname,
          search: '?view=one',
          scrollTop: 320,
        },
      },
    };
    const view = render(<PageLayoutTabsRenderer />);
    expect(
      screen.getByRole('complementary', { name: 'Campaign creator context' }),
    ).toHaveTextContent('campaign-a/membership-a');
    expect(screen.getByRole('complementary')).toHaveTextContent(
      'Initial tab: messages',
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname, search: '?view=one', hash: '#influencers-tab' },
      expect.objectContaining({ replace: true, state: null }),
    );
    expect(mockScrollToPosition).not.toHaveBeenCalled();
    Object.defineProperty(mockScrollElement, 'scrollHeight', { value: 800 });
    // The narrow list is hidden behind the returned panel until it closes.
    expect(mockScrollToPosition).not.toHaveBeenCalled();
    // Simulate the router's replacement and a later Back/remount: the one-shot
    // target must not survive in that history entry.
    mockLocation = { ...mockLocation, key: 'consumed', state: null };
    fireEvent.click(
      screen.getByRole('button', { name: 'Close creator context' }),
    );
    expect(mockScrollToPosition).toHaveBeenCalledWith(320);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Inspect restored membership' }),
      ).toHaveFocus(),
    );
    view.unmount();
    const returnedView = render(<PageLayoutTabsRenderer />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    mockWorkspaceId = 'workspace-b';
    mockLocation = { ...mockLocation, key: 'other' };
    returnedView.rerender(<PageLayoutTabsRenderer />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('contains the Creator panel in its campaign region and restores focus with a disconnected opener fallback', async () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
    ];
    mockContext = {
      ...mockContext,
      isInSidePanel: true,
      targetRecordIdentifier: {
        id: 'campaign-a',
        targetObjectNameSingular: 'campaign',
      },
    };
    mockActiveTabId = 'influencers-tab';
    const view = render(<PageLayoutTabsRenderer />);
    const invoker = screen.getByRole('button', { name: 'Inspect membership' });
    mockScrollTop = 275;
    fireEvent.click(invoker);
    const panel = screen.getByRole('complementary', {
      name: 'Campaign creator context',
    });
    const region = panel.parentElement!;
    expect(panel).toHaveTextContent('campaign-a/membership-a');
    expect(panel).toHaveTextContent('Initial tab: messages');
    expect(panel).toHaveTextContent('Saved scroll: 275');
    expect(region).toContainElement(invoker);
    fireEvent.keyDown(invoker, { key: 'Escape' });
    await waitFor(() => expect(invoker).toHaveFocus());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(invoker);
    mockInvokerVisible = false;
    view.rerender(<PageLayoutTabsRenderer />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Close creator context' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Inspect neighboring membership' }),
      ).toHaveFocus(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect without opener' }),
    );
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    dialog.remove();
    mockWorkspaceId = 'workspace-b';
    // Re-render on a workspace switch must discard the previous workspace panel.
    view.rerender(<PageLayoutTabsRenderer />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('returns focus to a surviving list control when filtering removes all rows while the panel is open', async () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
    ];
    mockContext = {
      ...mockContext,
      isInSidePanel: true,
      targetRecordIdentifier: {
        id: 'campaign-a',
        targetObjectNameSingular: 'campaign',
      },
    };
    mockActiveTabId = 'influencers-tab';
    const view = render(<PageLayoutTabsRenderer />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect membership' }));
    mockInvokerVisible = false;
    mockNeighborVisible = false;
    view.rerender(<PageLayoutTabsRenderer />);
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Close creator context' }),
      {
        key: 'Escape',
      },
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Search influencers' }),
      ).toHaveFocus(),
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('closes from the panel before an upstream bubble listener consumes Escape, without stealing a dialog Escape', async () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
    ];
    mockContext = {
      ...mockContext,
      isInSidePanel: false,
      targetRecordIdentifier: {
        id: 'campaign-a',
        targetObjectNameSingular: 'campaign',
      },
    };
    mockActiveTabId = 'influencers-tab';
    render(<PageLayoutTabsRenderer />);
    const invoker = screen.getByRole('button', { name: 'Inspect membership' });
    const consumeBeforeDocument = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.stopPropagation();
    };
    document.body.addEventListener('keydown', consumeBeforeDocument);
    try {
      for (const name of [
        'Close creator context',
        'Messages',
        'Creator content',
      ]) {
        fireEvent.click(invoker);
        const panel = screen.getByRole('complementary', {
          name: 'Campaign creator context',
        });
        const target =
          name === 'Creator content'
            ? screen.getByRole('tabpanel')
            : screen.getByRole(name === 'Messages' ? 'tab' : 'button', {
                name,
              });
        target.focus();
        expect(target).toHaveFocus();
        fireEvent.keyDown(target, { key: 'Escape' });
        await waitFor(() => expect(panel).not.toBeInTheDocument());
        await waitFor(() => expect(invoker).toHaveFocus());
      }
      fireEvent.click(invoker);
      const panel = screen.getByRole('complementary', {
        name: 'Campaign creator context',
      });
      const close = screen.getByRole('button', {
        name: 'Close creator context',
      });
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      panel.append(dialog);
      try {
        fireEvent.keyDown(close, { key: 'Escape' });
        expect(panel).toBeInTheDocument();
      } finally {
        dialog.remove();
      }
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(panel).toBeInTheDocument();
    } finally {
      document.body.removeEventListener('keydown', consumeBeforeDocument);
    }
  });

  it('makes a narrow open panel the only keyboard-reachable campaign region while keeping the list mounted', async () => {
    mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
    mockLayout.tabs = [
      {
        id: 'influencers-tab',
        universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
        title: 'Influencers',
        position: 1,
      },
    ];
    mockContext = {
      ...mockContext,
      isInSidePanel: true,
      targetRecordIdentifier: {
        id: 'campaign-a',
        targetObjectNameSingular: 'campaign',
      },
    };
    mockActiveTabId = 'influencers-tab';
    render(<PageLayoutTabsRenderer />);
    const invoker = screen.getByRole('button', { name: 'Inspect membership' });
    fireEvent.click(invoker);
    const panel = screen.getByRole('complementary', {
      name: 'Campaign creator context',
    });
    const background = invoker.closest('[data-testid="campaign-main-region"]');
    expect(background).toBeInTheDocument();
    expect(background).toHaveAttribute('inert');
    expect(panel).not.toHaveAttribute('inert');
    expect(background).toContainElement(invoker);
    fireEvent.click(
      screen.getByRole('button', { name: 'Close creator context' }),
    );
    await waitFor(() => expect(invoker).toHaveFocus());
    expect(background).not.toHaveAttribute('inert');
  });

  it('inerts the preserved list when a desktop campaign container becomes narrow', () => {
    let onResize: ResizeObserverCallback = () => {};
    const originalObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        onResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      mockLayout.universalIdentifier = 'ad261155-3c89-436d-8898-3e52d8b37632';
      mockLayout.tabs = [
        {
          id: 'influencers-tab',
          universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
          title: 'Influencers',
          position: 1,
        },
      ];
      mockContext = {
        ...mockContext,
        isInSidePanel: false,
        targetRecordIdentifier: {
          id: 'campaign-a',
          targetObjectNameSingular: 'campaign',
        },
      };
      mockActiveTabId = 'influencers-tab';
      render(<PageLayoutTabsRenderer />);
      const invoker = screen.getByRole('button', {
        name: 'Inspect membership',
      });
      fireEvent.click(invoker);
      const background = invoker.closest(
        '[data-testid="campaign-main-region"]',
      );
      expect(background).not.toHaveAttribute('inert');
      act(() =>
        onResize(
          [{ contentRect: { width: 800 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        ),
      );
      expect(background).toHaveAttribute('inert');
      expect(background).toContainElement(invoker);
      act(() =>
        onResize(
          [{ contentRect: { width: 1000 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        ),
      );
      expect(background).not.toHaveAttribute('inert');
    } finally {
      global.ResizeObserver = originalObserver;
    }
  });

  it('retains the native pinned panel for other objects and custom campaign layouts', () => {
    mockContext.isInSidePanel = false;
    const view = render(<PageLayoutTabsRenderer />);
    expect(screen.getByText('Native left panel')).toBeVisible();
    mockContext.targetRecordIdentifier = {
      id: 'campaign-1',
      targetObjectNameSingular: 'campaign',
    };
    view.rerender(<PageLayoutTabsRenderer />);
    expect(screen.getByText('Native left panel')).toBeVisible();
    expect(screen.queryByText(/Campaign identity:/)).not.toBeInTheDocument();
  });
});
