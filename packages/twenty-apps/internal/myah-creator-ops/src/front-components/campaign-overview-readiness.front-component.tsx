import { defineFrontComponent } from 'twenty-sdk/define';

import { CAMPAIGN_WORKSPACE_CONFIG } from 'src/constants/campaign-workspace-config';
import { CampaignOverviewReadiness } from 'src/front-components/components/campaign-overview-readiness';

export default defineFrontComponent({
  universalIdentifier:
    CAMPAIGN_WORKSPACE_CONFIG.overview.frontComponentUniversalIdentifier,
  name: 'campaign-overview-readiness',
  description: 'Shows Campaign setup readiness and lifecycle actions.',
  component: CampaignOverviewReadiness,
});
