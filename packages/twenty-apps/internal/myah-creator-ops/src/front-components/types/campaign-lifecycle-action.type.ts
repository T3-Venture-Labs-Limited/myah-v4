import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';

export type CampaignLifecycleAction = {
  label: string;
  targetStatus: CampaignStatus;
};
