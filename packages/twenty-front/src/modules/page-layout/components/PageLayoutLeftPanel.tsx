import { SummaryCard } from '@/object-record/record-show/components/SummaryCard';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { PageLayoutContent } from '@/page-layout/components/PageLayoutContent';
import { MyahCampaignAudienceControls } from '@/page-layout/components/MyahCampaignAudienceControls';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { PageLayoutContentProvider } from '@/page-layout/contexts/PageLayoutContentContext';
import { useCurrentPageLayout } from '@/page-layout/hooks/useCurrentPageLayout';
import { usePageLayoutTabWithVisibleWidgetsOrThrow } from '@/page-layout/hooks/usePageLayoutTabWithVisibleWidgetsOrThrow';
import { getTabLayoutMode } from '@/page-layout/utils/getTabLayoutMode';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';
import { ScrollWrapper } from '@/ui/utilities/scroll/components/ScrollWrapper';
import { styled } from '@linaria/react';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledContainer = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-bottom-left-radius: 8px;
  border-right: 1px solid ${themeCssVariables.border.color.medium};
  border-top-left-radius: 8px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  height: 100%;
`;

const MYAH_CAMPAIGN_INFORMATION_TAB_UNIVERSAL_IDENTIFIER =
  '8482a6bc-bc2a-4f2d-8296-6d951f681c4f';

type PageLayoutLeftPanelProps = {
  pinnedLeftTabId: string;
};

export const PageLayoutLeftPanel = ({
  pinnedLeftTabId,
}: PageLayoutLeftPanelProps) => {
  const { currentPageLayout } = useCurrentPageLayout();
  const targetRecordIdentifier = useTargetRecord();
  const { isInSidePanel } = useLayoutRenderingContext();
  const pinnedTab = usePageLayoutTabWithVisibleWidgetsOrThrow(pinnedLeftTabId);
  const { objectMetadataItems } = useObjectMetadataItems();
  const campaignObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) => objectMetadataItem.nameSingular === 'campaign',
  );
  const campaignPermissions = useObjectPermissionsForObject(
    campaignObjectMetadataItem?.id ?? '',
  );

  if (currentPageLayout?.type !== PageLayoutType.RECORD_PAGE) {
    return null;
  }

  const layoutMode = getTabLayoutMode({
    tab: pinnedTab,
    pageLayoutType: currentPageLayout.type,
  });
  const shouldRenderCampaignAudienceControls =
    campaignPermissions.canUpdateObjectRecords &&
    targetRecordIdentifier.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER &&
    pinnedTab.universalIdentifier ===
      MYAH_CAMPAIGN_INFORMATION_TAB_UNIVERSAL_IDENTIFIER;

  return (
    <StyledContainer>
      <SummaryCard
        objectNameSingular={targetRecordIdentifier.targetObjectNameSingular}
        objectRecordId={targetRecordIdentifier.id}
        isInSidePanel={isInSidePanel}
      />

      <PageLayoutContentProvider
        value={{
          tabId: pinnedLeftTabId,
          layoutMode,
        }}
      >
        <ScrollWrapper
          componentInstanceId={`page-layout-left-panel-${pinnedLeftTabId}`}
          defaultEnableXScroll={false}
          defaultEnableYScroll={true}
        >
          {shouldRenderCampaignAudienceControls ? (
            <MyahCampaignAudienceControls
              campaignId={targetRecordIdentifier.id}
            />
          ) : null}
          <PageLayoutContent />
        </ScrollWrapper>
      </PageLayoutContentProvider>
    </StyledContainer>
  );
};
