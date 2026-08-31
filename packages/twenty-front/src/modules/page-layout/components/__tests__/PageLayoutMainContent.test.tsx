import { render, screen } from '@testing-library/react';

import { PageLayoutMainContent } from '@/page-layout/PageLayoutMainContent';

const mockGetWidgetConfigurationViewId = jest.fn();

jest.mock('@/myah/creator-crm/components/CampaignInfluencerIndex', () => ({
  CampaignInfluencerIndex: ({
    campaignId,
    viewId,
  }: {
    campaignId: string;
    viewId: string | null;
  }) => (
    <div>{`Campaign Influencers integration:${campaignId}:${viewId ?? 'default'}`}</div>
  ),
}));
let currentPageLayout: {
  type: string;
  universalIdentifier: string;
};
let activeTab: {
  layout: string;
  title: string;
  universalIdentifier: string;
  widgets?: Array<{ title?: string }>;
};
let targetRecordIdentifier:
  | { id: string; targetObjectNameSingular: string }
  | undefined;

jest.mock('@/page-layout/components/PageLayoutContent', () => ({
  PageLayoutContent: () => <div>Native page layout content</div>,
}));

jest.mock('@/page-layout/components/MyahCampaignHome', () => ({
  MyahCampaignHome: ({ campaignId }: { campaignId: string }) => (
    <div>{`Campaign home integration:${campaignId}`}</div>
  ),
}));

jest.mock('@/page-layout/components/MyahCampaignAgent', () => ({
  MyahCampaignAgent: ({
    campaignId,
    title,
  }: {
    campaignId: string;
    title: string;
  }) => <div>{`Campaign agent integration:${campaignId}:${title}`}</div>,
}));

jest.mock('@/myah-outreach/components/CampaignOutreachTab', () => ({
  CampaignOutreachTab: ({ campaignId }: { campaignId: string }) => (
    <div data-testid="campaign-outreach-tab">{campaignId}</div>
  ),
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
  useLayoutRenderingContext: () => ({ targetRecordIdentifier }),
}));
jest.mock('@/page-layout/utils/getWidgetConfigurationViewId', () => ({
  getWidgetConfigurationViewId: (...args: unknown[]) =>
    mockGetWidgetConfigurationViewId(...args),
}));

describe('PageLayoutMainContent', () => {
  beforeEach(() => {
    currentPageLayout = {
      type: 'RECORD_PAGE',
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
    };
    activeTab = {
      layout: 'VERTICAL_LIST',
      title: 'Home',
      universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
    };
    targetRecordIdentifier = {
      id: 'campaign-1',
      targetObjectNameSingular: 'campaign',
    };
    mockGetWidgetConfigurationViewId.mockReturnValue(
      'campaign-influencers-view',
    );
    mockGetWidgetConfigurationViewId.mockClear();
  });

  it('mounts Campaign Home with native page layout content', () => {
    render(<PageLayoutMainContent tabId="home-tab-id" />);

    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(
      screen.getByText('Campaign home integration:campaign-1'),
    ).toBeVisible();
  });

  it('mounts the native Campaign Influencers index only on its tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };

    render(<PageLayoutMainContent tabId="influencers-tab-id" />);

    expect(
      screen.getByText(
        'Campaign Influencers integration:campaign-1:campaign-influencers-view',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('does not fall through to generic content when Influencers has no view ID', () => {
    mockGetWidgetConfigurationViewId.mockReturnValueOnce(null);
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };

    render(<PageLayoutMainContent tabId="influencers-tab-id" />);

    expect(
      screen.getByText('Campaign Influencers integration:campaign-1:default'),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('does not select an arbitrary Influencers widget view', () => {
    activeTab = {
      ...activeTab,
      title: 'Influencers',
      widgets: [{}, {}],
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
    };

    render(<PageLayoutMainContent tabId="influencers-tab-id" />);

    expect(
      screen.getByText('Campaign Influencers integration:campaign-1:default'),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('mounts Creator List membership controls on the Creator List Home tab', () => {
    currentPageLayout = {
      type: 'RECORD_PAGE',
      universalIdentifier: 'c8952254-5bf9-43a5-baab-98666f9b444d',
    };
    activeTab = {
      layout: 'VERTICAL_LIST',
      title: 'Home',
      universalIdentifier: '5dbb537f-2d8b-49ec-91bb-f74b0ab072d2',
    };
    targetRecordIdentifier = {
      id: 'creator-list-1',
      targetObjectNameSingular: 'creatorList',
    };

    render(<PageLayoutMainContent tabId="creator-list-home-tab-id" />);

    expect(
      screen.getByText('Creator List members integration:creator-list-1'),
    ).toBeVisible();
  });

  it('renders Campaign Outreach only for the Campaign Outreach tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Outreach',
      universalIdentifier: '8d749a63-24d8-481b-9a10-d98d9b959db1',
    };

    render(<PageLayoutMainContent tabId="outreach-tab-id" />);

    expect(screen.getByTestId('campaign-outreach-tab')).toHaveTextContent(
      'campaign-1',
    );
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it('mounts the guided editor only on the canonical Campaign Agent tab', () => {
    activeTab = {
      ...activeTab,
      title: 'Agent',
      universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
      widgets: [{ title: 'Campaign agent' }],
    };

    render(<PageLayoutMainContent tabId="agent-tab-id" />);

    expect(
      screen.getByText('Campaign agent integration:campaign-1:Campaign agent'),
    ).toBeVisible();
    expect(
      screen.queryByText('Native page layout content'),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['a different layout', 'different-layout', 'campaign'],
    ['a non-Campaign record', 'ad261155-3c89-436d-8898-3e52d8b37632', 'person'],
  ])(
    'keeps native content for the Agent identifier on %s',
    (_description, layoutUniversalIdentifier, objectNameSingular) => {
      currentPageLayout = {
        ...currentPageLayout,
        universalIdentifier: layoutUniversalIdentifier,
      };
      targetRecordIdentifier = {
        id: 'record-1',
        targetObjectNameSingular: objectNameSingular,
      };
      activeTab = {
        ...activeTab,
        title: 'Agent',
        universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
        widgets: [{ title: 'Campaign agent' }],
      };

      render(<PageLayoutMainContent tabId="agent-tab-id" />);

      expect(screen.getByText('Native page layout content')).toBeVisible();
      expect(
        screen.queryByText(/Campaign agent integration:/),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    {
      description: 'the Campaign Tasks tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Tasks',
          universalIdentifier: 'a2ad78b4-249f-45d4-85b5-ee9ea3c30fda',
        };
      },
    },
    {
      description: 'the Campaign Notes tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Notes',
          universalIdentifier: 'cbea3c1e-e0c2-43d9-a44a-f65f295d0a54',
        };
      },
    },
    {
      description: 'the Campaign Agent tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Agent',
          universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
        };
      },
    },
    {
      description: 'the Campaign Operations tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Operations',
          universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        };
      },
    },
    {
      description: 'a different layout',
      setup: () => {
        currentPageLayout = {
          ...currentPageLayout,
          universalIdentifier: 'different-layout',
        };
      },
    },
    {
      description: 'a non-Campaign record',
      setup: () => {
        targetRecordIdentifier = {
          id: 'campaign-1',
          targetObjectNameSingular: 'person',
        };
      },
    },
  ])('does not mount Campaign Home on $description', ({ setup }) => {
    setup();

    render(<PageLayoutMainContent tabId="other-tab-id" />);

    expect(
      screen.queryByText(/Campaign home integration:/),
    ).not.toBeInTheDocument();
  });
});
