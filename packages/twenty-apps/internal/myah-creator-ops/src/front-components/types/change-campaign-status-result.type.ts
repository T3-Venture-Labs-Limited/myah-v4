import { type CampaignOverviewSnapshot } from 'src/front-components/types/campaign-overview-snapshot.type';
import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';

export type ChangeCampaignStatusResult =
  | {
      kind: 'updated';
      campaign: { id: string; lifecycleStatus: CampaignStatus };
    }
  | {
      kind: 'conflict';
      campaign: CampaignOverviewSnapshot | null;
    };
