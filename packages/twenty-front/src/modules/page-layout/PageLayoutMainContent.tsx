import { CampaignInfluencerIndex } from '@/myah/creator-crm/components/CampaignInfluencerIndex';
import { PageLayoutContent } from '@/page-layout/components/PageLayoutContent';
import { MyahCampaignHome } from '@/page-layout/components/MyahCampaignHome';
import { MyahCampaignAgent } from '@/page-layout/components/MyahCampaignAgent';
import { MyahCampaignOperations } from '@/page-layout/components/MyahCampaignOperations';
import { MyahCreatorListMembers } from '@/page-layout/components/MyahCreatorListMembers';
import { CampaignOutreachTab } from '@/myah-outreach/components/CampaignOutreachTab';
import { MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignHomeTabUniversalIdentifier';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_OUTREACH_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOutreachTabUniversalIdentifier';
import { MYAH_CAMPAIGN_OPERATIONS_FIELDS_VIEW_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOperationsFieldsViewUniversalIdentifier';
import { MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOperationsTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { MYAH_CREATOR_LIST_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS } from '@/page-layout/constants/MyahCreatorListPageLayoutUniversalIdentifiers';
import { PageLayoutContentProvider } from '@/page-layout/contexts/PageLayoutContentContext';
import { useCurrentPageLayoutOrThrow } from '@/page-layout/hooks/useCurrentPageLayoutOrThrow';
import { usePageLayoutTabWithVisibleWidgetsOrThrow } from '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow';
import { getTabLayoutMode } from '@/page-layout/utils/getTabLayoutMode';
import { getWidgetConfigurationViewId } from '@/page-layout/utils/getWidgetConfigurationViewId';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { ViewType, WidgetType } from '~/generated-metadata/graphql';

const MYAH_CAMPAIGN_INFLUENCERS_TAB_UNIVERSAL_IDENTIFIER =
  '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596';

type PageLayoutMainContentProps = {
  tabId: string;
};

export const PageLayoutMainContent = ({
  tabId,
}: PageLayoutMainContentProps) => {
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();
  const activeTab = usePageLayoutTabWithVisibleWidgetsOrThrow(tabId);
  const views = useAtomStateValue(viewsSelector);

  const layoutMode = getTabLayoutMode({
    tab: activeTab,
    pageLayoutType: currentPageLayout.type,
  });
  const { isInSidePanel, targetRecordIdentifier } = useLayoutRenderingContext();
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
  const shouldRenderCampaignAgent =
    !isInSidePanel &&
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER;
  const campaignAgentWidget =
    activeTab.widgets?.length === 1 ? activeTab.widgets[0] : undefined;
  const campaignAgentTitle = campaignAgentWidget?.title ?? activeTab.title;

  const campaignOperationsWidget =
    activeTab.widgets?.length === 1 &&
    activeTab.widgets[0].type === WidgetType.FIELDS
      ? activeTab.widgets[0]
      : undefined;
  const campaignOperationsViewId = campaignOperationsWidget
    ? getWidgetConfigurationViewId(campaignOperationsWidget.configuration)
    : null;
  const campaignOperationsRuntimeView = views.find(
    (view) =>
      view.id === campaignOperationsViewId &&
      view.universalIdentifier ===
        MYAH_CAMPAIGN_OPERATIONS_FIELDS_VIEW_UNIVERSAL_IDENTIFIER &&
      view.type === ViewType.FIELDS_WIDGET &&
      view.isActive,
  );
  const shouldRenderCampaignOperations =
    !isInSidePanel &&
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER &&
    campaignOperationsWidget !== undefined &&
    campaignOperationsRuntimeView !== undefined;
  const campaignOperationsTitle =
    campaignOperationsWidget?.title ?? activeTab.title;
  const shouldRenderCreatorListMembers =
    targetRecordIdentifier?.targetObjectNameSingular === 'creatorList' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CREATOR_LIST_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.recordPageLayout &&
    activeTab.universalIdentifier ===
      MYAH_CREATOR_LIST_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.homeTab;
  const shouldRenderCampaignInfluencers =
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_INFLUENCERS_TAB_UNIVERSAL_IDENTIFIER;
  const campaignInfluencersWidget =
    activeTab.widgets?.length === 1 ? activeTab.widgets[0] : undefined;
  const campaignInfluencersViewId = campaignInfluencersWidget
    ? getWidgetConfigurationViewId(campaignInfluencersWidget.configuration)
    : null;

  return (
    <PageLayoutContentProvider
      value={{
        tabId,
        layoutMode,
      }}
    >
      {shouldRenderCampaignInfluencers ? (
        <CampaignInfluencerIndex
          campaignId={targetRecordIdentifier.id}
          viewId={campaignInfluencersViewId}
        />
      ) : shouldRenderCampaignOutreach ? (
        <CampaignOutreachTab campaignId={targetRecordIdentifier.id} />
      ) : shouldRenderCampaignAgent ? (
        <MyahCampaignAgent
          campaignId={targetRecordIdentifier.id}
          title={campaignAgentTitle}
        />
      ) : shouldRenderCampaignOperations &&
        campaignOperationsWidget !== undefined ? (
        <MyahCampaignOperations
          campaignId={targetRecordIdentifier.id}
          title={campaignOperationsTitle}
          fieldsWidget={campaignOperationsWidget}
        />
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
