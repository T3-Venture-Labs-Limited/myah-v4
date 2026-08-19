import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { PageLayoutLeftPanel } from '@/page-layout/components/PageLayoutLeftPanel';

let currentPageLayout:
  | { type: string; universalIdentifier: string }
  | undefined;
let targetRecordIdentifier: { id: string; targetObjectNameSingular: string };
let pinnedTab: { universalIdentifier: string };
let campaignPermissions = { canUpdateObjectRecords: true };
let objectMetadataItems = [
  { id: 'campaign-metadata-id', nameSingular: 'campaign' },
];

jest.mock('@/object-record/record-show/components/SummaryCard', () => ({
  SummaryCard: () => <div>Campaign summary</div>,
}));
jest.mock('@/page-layout/components/PageLayoutContent', () => ({
  PageLayoutContent: () => <div>Campaign information</div>,
}));
jest.mock('@/page-layout/components/MyahCampaignAudienceControls', () => ({
  MyahCampaignAudienceControls: ({ campaignId }: { campaignId: string }) => (
    <div>{`Campaign audience controls:${campaignId}`}</div>
  ),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => {
    const objectMetadataItem = objectMetadataItems.find(
      (item) => item.nameSingular === 'campaign',
    );

    if (!objectMetadataItem) {
      throw new Error('Campaign metadata is unavailable');
    }

    return { objectMetadataItem };
  },
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => campaignPermissions,
}));
jest.mock('@/page-layout/contexts/PageLayoutContentContext', () => ({
  PageLayoutContentProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/page-layout/hooks/useCurrentPageLayout', () => ({
  useCurrentPageLayout: () => ({ currentPageLayout }),
}));
jest.mock(
  '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow',
  () => ({
    usePageLayoutTabWithVisibleWidgetsOrThrow: () => pinnedTab,
  }),
);
jest.mock('@/page-layout/utils/getTabLayoutMode', () => ({
  getTabLayoutMode: () => 'VERTICAL_LIST',
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({ isInSidePanel: false }),
}));
jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => targetRecordIdentifier,
}));
jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('PageLayoutLeftPanel', () => {
  beforeEach(() => {
    currentPageLayout = {
      type: 'RECORD_PAGE',
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
    };
    targetRecordIdentifier = {
      id: 'campaign-1',
      targetObjectNameSingular: 'campaign',
    };
    pinnedTab = {
      universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
    };
    campaignPermissions = { canUpdateObjectRecords: true };
    objectMetadataItems = [
      { id: 'campaign-metadata-id', nameSingular: 'campaign' },
    ];
  });

  it('mounts Creator List controls only in persistent Campaign information', () => {
    render(<PageLayoutLeftPanel pinnedLeftTabId="campaign-information" />);

    expect(
      screen.getByText('Campaign audience controls:campaign-1'),
    ).toBeVisible();
  });

  it('does not mount Creator List controls when Campaign updates are denied', () => {
    campaignPermissions = { canUpdateObjectRecords: false };

    render(<PageLayoutLeftPanel pinnedLeftTabId="campaign-information" />);

    expect(
      screen.queryByText(/Campaign audience controls:/),
    ).not.toBeInTheDocument();
  });

  it('does not mount Creator List controls for another pinned record tab', () => {
    pinnedTab = { universalIdentifier: 'another-information-tab' };

    render(<PageLayoutLeftPanel pinnedLeftTabId="other-information" />);

    expect(
      screen.queryByText(/Campaign audience controls:/),
    ).not.toBeInTheDocument();
  });

  it('renders another record layout when Campaign metadata is unavailable', () => {
    objectMetadataItems = [];
    targetRecordIdentifier = {
      id: 'person-1',
      targetObjectNameSingular: 'person',
    };

    render(<PageLayoutLeftPanel pinnedLeftTabId="other-information" />);

    expect(screen.getByText('Campaign information')).toBeVisible();
  });
});
