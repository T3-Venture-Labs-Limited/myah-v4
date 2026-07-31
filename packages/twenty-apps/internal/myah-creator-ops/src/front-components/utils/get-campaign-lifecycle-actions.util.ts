import { type CampaignLifecycleAction } from 'src/front-components/types/campaign-lifecycle-action.type';
import { type CampaignStatus } from 'src/front-components/types/campaign-status.type';

export const getCampaignLifecycleActions = (
  status: CampaignStatus,
): CampaignLifecycleAction[] => {
  switch (status) {
    case 'DRAFT':
      return [{ label: 'Activate', targetStatus: 'ACTIVE' }];
    case 'ACTIVE':
      return [
        { label: 'Pause', targetStatus: 'PAUSED' },
        { label: 'Complete', targetStatus: 'COMPLETED' },
      ];
    case 'PAUSED':
      return [
        { label: 'Resume', targetStatus: 'ACTIVE' },
        { label: 'Complete', targetStatus: 'COMPLETED' },
      ];
    case 'COMPLETED':
      return [];
  }
};
