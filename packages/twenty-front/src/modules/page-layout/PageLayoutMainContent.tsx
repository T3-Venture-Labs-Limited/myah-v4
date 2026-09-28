import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { CampaignInfluencerIndex } from '@/myah/creator-crm/components/CampaignInfluencerIndex';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { useWidgetPermissions } from '@/page-layout/widgets/hooks/useWidgetPermissions';
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
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { usePageLayoutTabWithVisibleWidgetsOrThrow } from '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow';
import { getTabLayoutMode } from '@/page-layout/utils/getTabLayoutMode';
import { getWidgetConfigurationViewId } from '@/page-layout/utils/getWidgetConfigurationViewId';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { ViewType, WidgetType } from '~/generated-metadata/graphql';

const MYAH_CAMPAIGN_INFLUENCERS_TAB_UNIVERSAL_IDENTIFIER =
  '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596';
const MYAH_CAMPAIGN_TASKS_TAB_UNIVERSAL_IDENTIFIER =
  '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0';

const StyledCampaignTasksNote = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  margin: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

type PageLayoutMainContentProps = {
  tabId: string;
  activityTabId?: string;
  onOpenCampaignCreatorContext?: (request: RecordIndexOpenRequest) => void;
};

export const PageLayoutMainContent = ({
  tabId,
  activityTabId,
  onOpenCampaignCreatorContext,
}: PageLayoutMainContentProps) => {
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();
  const activeTab = usePageLayoutTabWithVisibleWidgetsOrThrow(tabId);
  const views = useAtomStateValue(viewsSelector);
  const isEditMode = useIsPageLayoutInEditMode();
  const { objectMetadataItems } = useObjectMetadataItems();
  const campaignMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'campaign',
  );
  const campaignPermissions = useObjectPermissionsForObject(
    campaignMetadata?.id ?? '',
  );

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
  const shouldExplainCampaignTasks =
    !isEditMode &&
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_TASKS_TAB_UNIVERSAL_IDENTIFIER &&
    activeTab.widgets?.some((widget) => widget.type === WidgetType.TASKS);
  const campaignAgentWidget =
    activeTab.widgets?.length === 1 &&
    activeTab.widgets[0].type === WidgetType.FIELDS
      ? activeTab.widgets[0]
      : undefined;
  const { hasAccess: hasAgentWidgetAccess } = useWidgetPermissions(
    campaignAgentWidget ??
      ({ objectMetadataId: undefined } as PageLayoutWidget),
  );
  const campaignAgentViewId = campaignAgentWidget
    ? getWidgetConfigurationViewId(campaignAgentWidget.configuration)
    : null;
  const hasAgentView =
    views.filter((view) => view.id === campaignAgentViewId).length === 1 &&
    views.some(
      (view) =>
        view.id === campaignAgentViewId &&
        view.universalIdentifier === 'eb4da94a-d3da-4354-bb39-7478ac12bd35' &&
        view.type === ViewType.FIELDS_WIDGET &&
        view.isActive,
    );
  const guidanceFields = [
    'communicationGuidelines',
    'replyRules',
    'escalationBoundaries',
  ];
  const hasGuidanceWriteAccess =
    !!campaignMetadata &&
    campaignPermissions.canReadObjectRecords &&
    campaignPermissions.canUpdateObjectRecords &&
    guidanceFields.every((name) => {
      const fieldId = campaignMetadata.fields.find(
        (field) => field.name === name,
      )?.id;
      return (
        fieldId !== undefined &&
        campaignPermissions.restrictedFields[fieldId]?.canRead !== false &&
        campaignPermissions.restrictedFields[fieldId]?.canUpdate !== false
      );
    });
  const shouldRenderCampaignAgent =
    !isEditMode &&
    !isInSidePanel &&
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    activeTab.universalIdentifier ===
      MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER &&
    activeTab.isActive &&
    campaignAgentWidget !== undefined &&
    hasAgentWidgetAccess &&
    hasAgentView &&
    hasGuidanceWriteAccess;
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
          activityTabId={activityTabId}
          onOpenCreatorContext={onOpenCampaignCreatorContext}
        />
      ) : shouldRenderCampaignOutreach ? (
        <CampaignOutreachTab
          campaignId={targetRecordIdentifier.id}
          isInSidePanel={isInSidePanel}
        />
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
          {shouldExplainCampaignTasks ? (
            <StyledCampaignTasksNote>
              {t`This tab shows existing tasks linked to this Campaign only. Task status is not evidence of fulfillment or commercial completion.`}
            </StyledCampaignTasksNote>
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
