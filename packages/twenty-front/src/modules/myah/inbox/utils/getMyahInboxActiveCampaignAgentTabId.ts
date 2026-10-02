import { isDefined } from 'twenty-shared/utils';

import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { type PageLayout } from '@/page-layout/types/PageLayout';

// Shared by Email and Instagram guidance navigation so both channels resolve
// the active Campaign Agent tab identically.
export const getMyahInboxActiveCampaignAgentTabId = (
  pageLayouts: PageLayout[],
) => {
  const campaignLayout = pageLayouts.find(
    ({ deletedAt, universalIdentifier }) =>
      !isDefined(deletedAt) &&
      universalIdentifier ===
        MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  );

  return campaignLayout?.tabs.find(
    ({ isActive, universalIdentifier }) =>
      isActive &&
      universalIdentifier === MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
  )?.id;
};
