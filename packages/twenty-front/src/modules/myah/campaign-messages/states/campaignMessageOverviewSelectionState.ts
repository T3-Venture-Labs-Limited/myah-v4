import { type CampaignMessageOverviewRow } from '@/myah/campaign-messages/types/CampaignMessageOverviewRow';
import { type CampaignMessageOverviewReturnTarget } from '@/myah/campaign-messages/types/CampaignMessageOverviewReturnTarget';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const campaignMessageOverviewSelectionState = createAtomState<{
  row: CampaignMessageOverviewRow;
  workspaceId: string;
  returnTarget: CampaignMessageOverviewReturnTarget;
} | null>({
  key: 'myah/campaign-message-overview-selection',
  defaultValue: null,
});
