import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';

export type CampaignOverviewSnapshot = {
  id: string;
  name: string | null;
  objective: string | null;
  lifecycleStatus: CampaignStatus;
  effectiveAudienceCount: number;
};
