import { render, screen } from '@testing-library/react';

import { PageLayoutTabsRenderer } from '@/page-layout/components/PageLayoutTabsRenderer';

jest.mock('@/page-layout/components/PageLayoutLeftPanel', () => ({
  PageLayoutLeftPanel: () => <div>Native left panel</div>,
}));

jest.mock('@/page-layout/components/PageLayoutTabList', () => ({
  PageLayoutTabList: () => <div data-testid="native-tab-list" />,
}));

jest.mock('@/page-layout/components/PageLayoutTabListEffect', () => ({
  PageLayoutTabListEffect: () => <div data-testid="native-tab-list-effect" />,
}));

jest.mock('@/page-layout/PageLayoutMainContent', () => ({
  PageLayoutMainContent: ({ tabId }: { tabId: string }) => (
    <div>{`native-content:${tabId}`}</div>
  ),
}));

jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({
    currentPageLayout: {
      id: 'layout-1',
      type: 'RECORD_PAGE',
      defaultTabToFocusOnMobileAndSidePanelId: 'home-tab',
      tabs: [
        { id: 'home-tab', title: 'Home', position: 0 },
        { id: 'timeline-tab', title: 'Timeline', position: 1 },
      ],
    },
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
  getTabsByDisplayMode: ({ tabs }: { tabs: Array<unknown> }) => ({
    tabsToRenderInTabList: tabs,
    pinnedLeftTab: undefined,
  }),
}));

jest.mock('@/page-layout/utils/getTabsWithVisibleWidgets', () => ({
  getTabsWithVisibleWidgets: ({ tabs }: { tabs: Array<unknown> }) => tabs,
}));

jest.mock('@/page-layout/utils/shouldEnableTabEditingFeatures', () => ({
  shouldEnableTabEditingFeatures: () => false,
}));

jest.mock('@/page-layout/utils/sortTabsByPosition', () => ({
  sortTabsByPosition: <Tab extends unknown>(tabs: Tab[]) => tabs,
}));

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({
    isInSidePanel: true,
    layoutType: 'RECORD_PAGE',
    targetRecordIdentifier: {
      id: 'creator-1',
      targetObjectNameSingular: 'creator',
    },
  }),
}));

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => 'timeline-tab',
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue', () => ({
  useAtomFamilyStateValue: () => ({
    current: [{ nameSingular: 'creator', isSystem: false }],
  }),
}));

jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('PageLayoutTabsRenderer', () => {
  it('renders the native side-panel default tab without its nested tab list', () => {
    render(<PageLayoutTabsRenderer renderMode="default-tab-only" />);

    expect(screen.queryByTestId('native-tab-list')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('native-tab-list-effect'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('native-content:home-tab')).toBeVisible();
  });
});
