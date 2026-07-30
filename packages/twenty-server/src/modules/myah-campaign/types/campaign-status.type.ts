import type { CAMPAIGN_STATUSES } from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
