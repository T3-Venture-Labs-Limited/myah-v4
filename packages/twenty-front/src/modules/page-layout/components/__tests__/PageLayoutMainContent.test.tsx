import { render, screen } from '@testing-library/react';

import { PageLayoutMainContent } from '@/page-layout/PageLayoutMainContent';

let currentPageLayout: { type: string; universalIdentifier: string };
let activeTab: {
  layout: string;
  universalIdentifier: string;
  widgets?: Array<{ configuration?: { viewId?: string } }>;
};
let isInSidePanel = false;
const mockGetWidgetConfigurationViewId = jest.fn();
let targetRecordIdentifier:
  | { id: string; targetObjectNameSingular: string }
  | undefined;
const mockNativeContent = jest.fn();

jest.mock('@/myah/creator-crm/components/CampaignInfluencerIndex', () => ({
  CampaignInfluencerIndex: ({
    campaignId,
    viewId,
  }: {
    campaignId: string;
    viewId: string | null;
  }) => (
    <div>{`Campaign influencers:${campaignId}:${viewId ?? 'default'}`}</div>
  ),
}));
jest.mock('@/myah-outreach/components/CampaignOutreachTab', () => ({
  CampaignOutreachTab: ({
    campaignId,
    isInSidePanel,
  }: {
    campaignId: string;
    isInSidePanel: boolean;
  }) => <div>{`Campaign outreach:${campaignId}:${isInSidePanel}`}</div>,
}));
jest.mock('@/page-layout/components/MyahCampaignHome', () => ({
  MyahCampaignHome: ({ campaignId }: { campaignId: string }) => (
    <div>{`Campaign home:${campaignId}`}</div>
  ),
}));
jest.mock('@/page-layout/utils/getWidgetConfigurationViewId', () => ({
  getWidgetConfigurationViewId: (...args: unknown[]) =>
    mockGetWidgetConfigurationViewId(...args),
}));

jest.mock('@/page-layout/components/PageLayoutContent', () => ({
  PageLayoutContent: () => {
    mockNativeContent();
    return <div>Native page layout content</div>;
  },
}));
jest.mock('@/page-layout/components/MyahCreatorListMembers', () => ({
  MyahCreatorListMembers: ({ creatorListId }: { creatorListId: string }) => (
    <div>{`Creator List members integration:${creatorListId}`}</div>
  ),
}));
jest.mock('@/page-layout/contexts/PageLayoutContentContext', () => ({
  PageLayoutContentProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({ currentPageLayout }),
}));
jest.mock(
  '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow',
  () => ({
    usePageLayoutTabWithVisibleWidgetsOrThrow: () => activeTab,
  }),
);
jest.mock('@/page-layout/utils/getTabLayoutMode', () => ({
  getTabLayoutMode: () => 'VERTICAL_LIST',
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({ isInSidePanel, targetRecordIdentifier }),
}));

const renderTab = (tabUniversalIdentifier: string) => {
  activeTab = { ...activeTab, universalIdentifier: tabUniversalIdentifier };
  render(<PageLayoutMainContent tabId="selected-tab" />);
};

beforeEach(() => {
  mockNativeContent.mockClear();
  mockGetWidgetConfigurationViewId.mockReset();
  mockGetWidgetConfigurationViewId.mockImplementation(
    (configuration: { viewId?: string }) => configuration.viewId ?? null,
  );
  isInSidePanel = false;
  currentPageLayout = {
    type: 'RECORD_PAGE',
    universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
  };
  activeTab = {
    layout: 'VERTICAL_LIST',
    universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
  };
  targetRecordIdentifier = {
    id: 'campaign-1',
    targetObjectNameSingular: 'campaign',
  };
});

it.each([
  ['Home', '8482a6bc-bc2a-4f2d-8296-6d951f681c4f'],
  ['Influencers', '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596'],
  ['Outreach', '8d749a63-24d8-481b-9a10-d98d9b959db1'],
  ['Agent', '0d213a1a-e001-496c-970e-e692968cf17c'],
  ['Operations', 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba'],
])(
  'leaves legacy Campaign %s layout to native rendering without dispatch',
  (_name, tab) => {
    renderTab(tab);
    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(mockNativeContent).toHaveBeenCalledTimes(1);
  },
);

it('retains Creator List membership on its record Home tab', () => {
  currentPageLayout.universalIdentifier =
    'c8952254-5bf9-43a5-baab-98666f9b444d';
  targetRecordIdentifier = {
    id: 'creator-list-1',
    targetObjectNameSingular: 'creatorList',
  };
  renderTab('5dbb537f-2d8b-49ec-91bb-f74b0ab072d2');
  expect(screen.getByText('Native page layout content')).toBeVisible();
  expect(
    screen.getByText('Creator List members integration:creator-list-1'),
  ).toBeVisible();
});

it('does not mount Creator List membership for other tabs or objects', () => {
  currentPageLayout.universalIdentifier =
    'c8952254-5bf9-43a5-baab-98666f9b444d';
  targetRecordIdentifier = {
    id: 'creator-list-1',
    targetObjectNameSingular: 'creatorList',
  };
  renderTab('another-tab');
  expect(screen.getByText('Native page layout content')).toBeVisible();
  expect(screen.queryByText(/Creator List members integration:/)).toBeNull();
});

it('renders Campaign Home readiness/activity alongside native content in a side panel', () => {
  isInSidePanel = true;
  renderTab('8482a6bc-bc2a-4f2d-8296-6d951f681c4f');
  expect(screen.getByText('Campaign home:campaign-1')).toBeVisible();
  expect(screen.getByText('Native page layout content')).toBeVisible();
});

it('renders the specialized Campaign Outreach tab only in a canonical Campaign side panel', () => {
  isInSidePanel = true;
  renderTab('8d749a63-24d8-481b-9a10-d98d9b959db1');
  expect(screen.getByText('Campaign outreach:campaign-1:true')).toBeVisible();
  expect(screen.queryByText('Native page layout content')).toBeNull();
});

it.each([
  [{ configuration: { viewId: 'audience-view' } }, 'audience-view'],
  [{ configuration: {} }, 'default'],
  [undefined, 'default'],
])(
  'passes the canonical Influencers widget view or null in a side panel',
  (widget, expectedView) => {
    isInSidePanel = true;
    activeTab.widgets = widget ? [widget] : [];
    renderTab('04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596');
    expect(
      screen.getByText(`Campaign influencers:campaign-1:${expectedView}`),
    ).toBeVisible();
    expect(screen.queryByText('Native page layout content')).toBeNull();
    expect(mockGetWidgetConfigurationViewId).toHaveBeenCalledTimes(
      widget ? 1 : 0,
    );
  },
);

it('does not pick an arbitrary Influencers view from multiple widgets', () => {
  isInSidePanel = true;
  activeTab.widgets = [
    { configuration: { viewId: 'first' } },
    { configuration: { viewId: 'second' } },
  ];
  renderTab('04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596');
  expect(
    screen.getByText('Campaign influencers:campaign-1:default'),
  ).toBeVisible();
  expect(mockGetWidgetConfigurationViewId).not.toHaveBeenCalled();
});

it.each([
  ['different layout', 'another-layout', 'campaign'],
  ['different object', 'ad261155-3c89-436d-8898-3e52d8b37632', 'creator'],
])(
  'does not dispatch side-panel Campaign sections for a %s',
  (_label, layoutId, objectName) => {
    isInSidePanel = true;
    currentPageLayout.universalIdentifier = layoutId;
    targetRecordIdentifier = {
      id: 'record-1',
      targetObjectNameSingular: objectName,
    };
    renderTab('8d749a63-24d8-481b-9a10-d98d9b959db1');
    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(screen.queryByText(/Campaign outreach:/)).toBeNull();
  },
);

it('keeps Creator record layouts on native content', () => {
  currentPageLayout = {
    type: 'RECORD_PAGE',
    universalIdentifier: 'creator-layout',
  };
  targetRecordIdentifier = {
    id: 'creator-1',
    targetObjectNameSingular: 'creator',
  };
  render(<PageLayoutMainContent tabId="creator-tab" />);
  expect(screen.getByText('Native page layout content')).toBeVisible();
  expect(mockNativeContent).toHaveBeenCalledTimes(1);
});
