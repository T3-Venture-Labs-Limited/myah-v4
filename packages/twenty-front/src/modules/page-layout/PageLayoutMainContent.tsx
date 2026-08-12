import { PageLayoutContent } from '@/page-layout/components/PageLayoutContent';
import { MyahCampaignHome } from '@/page-layout/components/MyahCampaignHome';
import { MyahCreatorListMembers } from '@/page-layout/components/MyahCreatorListMembers';
import { CampaignOutreachTab } from '@/myah-outreach/components/CampaignOutreachTab';
import { MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignHomeTabUniversalIdentifier';
import { MYAH_CAMPAIGN_OUTREACH_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOutreachTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { MYAH_CREATOR_LIST_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS } from '@/page-layout/constants/MyahCreatorListPageLayoutUniversalIdentifiers';
import { PageLayoutContentProvider } from '@/page-layout/contexts/PageLayoutContentContext';
import { useCurrentPageLayoutOrThrow } from '@/page-layout/hooks/useCurrentPageLayoutOrThrow';
import { usePageLayoutTabWithVisibleWidgetsOrThrow } from '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow';
import { getTabLayoutMode } from '@/page-layout/utils/getTabLayoutMode';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';

type PageLayoutMainContentProps = {
  tabId: string;
};

export const PageLayoutMainContent = ({
  tabId,
}: PageLayoutMainContentProps) => {
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();
  const activeTab = usePageLayoutTabWithVisibleWidgetsOrThrow(tabId);

  const layoutMode = getTabLayoutMode({
    tab: activeTab,
    pageLayoutType: currentPageLayout.type,
  });
  const { targetRecordIdentifier } = useLayoutRenderingContext();
  const shouldRenderCampaignHome =
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER;
  const shouldRenderCampaignOutreach =
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_OUTREACH_TAB_UNIVERSAL_IDENTIFIER;
  const shouldRenderCreatorListMembers =
    targetRecordIdentifier?.targetObjectNameSingular === 'creatorList' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CREATOR_LIST_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.recordPageLayout &&
    activeTab.universalIdentifier ===
      MYAH_CREATOR_LIST_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.homeTab;

  return (
    <PageLayoutContentProvider
      value={{
        tabId,
        layoutMode,
      }}
    >
      {shouldRenderCampaignOutreach ? (
        <CampaignOutreachTab campaignId={targetRecordIdentifier.id} />
      ) : (
        <>
          {shouldRenderCampaignHome ? (
            <MyahCampaignHome campaignId={targetRecordIdentifier.id} />
          ) : null}
          <PageLayoutContent />
        </>
      )}
      {shouldRenderCreatorListMembers ? (
        <MyahCreatorListMembers creatorListId={targetRecordIdentifier.id} />
      ) : null}
    </PageLayoutContentProvider>
  );
};
