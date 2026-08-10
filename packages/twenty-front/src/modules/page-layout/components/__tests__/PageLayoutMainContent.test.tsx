import { render, screen } from '@testing-library/react';

import { PageLayoutMainContent } from '@/page-layout/PageLayoutMainContent';
let currentPageLayout: {
  type: string;
  universalIdentifier: string;
};
let activeTab: {
  layout: string;
  title: string;
  universalIdentifier: string;
};
let targetRecordIdentifier:
  | { id: string; targetObjectNameSingular: string }
  | undefined;

jest.mock('@/page-layout/components/PageLayoutContent', () => ({
  PageLayoutContent: () => <div>Native page layout content</div>,
}));

jest.mock('@/page-layout/components/MyahCampaignOperations', () => ({
  MyahCampaignOperations: ({ campaignId }: { campaignId: string }) => (
    <div>{`Campaign operations integration:${campaignId}`}</div>
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

describe('PageLayoutMainContent', () => {
  beforeEach(() => {
    currentPageLayout = {
      type: 'RECORD_PAGE',
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
    };
    activeTab = {
      layout: 'VERTICAL_LIST',
      title: 'Operations',
      universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
    };
    targetRecordIdentifier = {
      id: 'campaign-1',
      targetObjectNameSingular: 'campaign',
    };
  });

  it('mounts the first-party Campaign operations integration with Campaign Operations content', () => {
    render(<PageLayoutMainContent tabId="operations-tab-id" />);

    expect(screen.getByText('Native page layout content')).toBeVisible();
    expect(
      screen.getByText('Campaign operations integration:campaign-1'),
    ).toBeVisible();
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

  it.each([
    {
      description: 'the Campaign information tab',
      setup: () => {
        activeTab = {
          ...activeTab,
          title: 'Information',
          universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
        };
      },
    },
    {
      description: 'a different Campaign tab also titled Operations',
      setup: () => {
        activeTab = {
          ...activeTab,
          universalIdentifier: 'not-the-operations-tab',
        };
      },
    },
    {
      description: 'a non-Campaign record in the Campaign layout',
      setup: () => {
        targetRecordIdentifier = {
          id: 'campaign-1',
          targetObjectNameSingular: 'person',
        };
      },
    },
    {
      description: 'a different record page layout',
      setup: () => {
        currentPageLayout = {
          ...currentPageLayout,
          universalIdentifier: 'different-layout',
        };
      },
    },
  ])('does not mount operations in $description', ({ setup }) => {
    setup();

    render(<PageLayoutMainContent tabId="other-tab-id" />);

    expect(
      screen.queryByText(/Campaign operations integration:/),
    ).not.toBeInTheDocument();
  });
});
