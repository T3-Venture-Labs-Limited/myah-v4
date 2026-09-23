import { type CampaignMessageOverviewReturnTarget } from '@/myah/campaign-messages/types/CampaignMessageOverviewReturnTarget';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const campaignMessageOverviewSelectionState = createAtomState<{
  occurrenceId: string;
  workspaceId: string;
  returnTarget: CampaignMessageOverviewReturnTarget;
} | null>({
  key: 'myah/campaign-message-overview-selection',
  defaultValue: null,
});
