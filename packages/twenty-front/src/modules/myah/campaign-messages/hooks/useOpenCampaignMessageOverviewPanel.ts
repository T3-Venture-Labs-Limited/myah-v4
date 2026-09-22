import { useCallback } from 'react';
import { useStore } from 'jotai';
import { SidePanelPages } from 'twenty-shared/types';
import { IconMail } from 'twenty-ui/icon';
import { v4 } from 'uuid';

import { campaignMessageOverviewSelectionState } from '@/myah/campaign-messages/states/campaignMessageOverviewSelectionState';
import { type CampaignMessageOverviewRow } from '@/myah/campaign-messages/types/CampaignMessageOverviewRow';
import { type CampaignMessageOverviewReturnTarget } from '@/myah/campaign-messages/types/CampaignMessageOverviewReturnTarget';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';

export const useOpenCampaignMessageOverviewPanel = () => {
  const store = useStore();
  const { navigateSidePanelMenu } = useSidePanelMenu();

  const openCampaignMessageOverviewPanel = useCallback(
    (input: {
      row: CampaignMessageOverviewRow;
      workspaceId: string;
      returnTarget: CampaignMessageOverviewReturnTarget;
    }) => {
      store.set(campaignMessageOverviewSelectionState.atom, input);
      navigateSidePanelMenu({
        page: SidePanelPages.CampaignMessageOverview,
        pageTitle: input.row.sentAt ? 'Message details' : 'Message preview',
        pageIcon: IconMail,
        pageId: v4(),
      });
    },
    [navigateSidePanelMenu, store],
  );

  return { openCampaignMessageOverviewPanel };
};
