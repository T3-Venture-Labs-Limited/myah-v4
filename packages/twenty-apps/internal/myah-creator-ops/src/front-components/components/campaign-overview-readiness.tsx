import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import { CampaignOverviewReadinessContent } from 'src/front-components/components/campaign-overview-readiness-content';
import { CampaignOverviewReadinessView } from 'src/front-components/components/campaign-overview-readiness-view';
import { getSelectedCampaignId } from 'src/front-components/utils/get-selected-campaign-id.util';

export const CampaignOverviewReadiness = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const campaignId = getSelectedCampaignId(selectedRecordIds);

  if (campaignId === null) {
    return <CampaignOverviewReadinessView loadState={{ kind: 'no-context' }} />;
  }

  return (
    <CampaignOverviewReadinessContent
      key={campaignId}
      campaignId={campaignId}
    />
  );
};
