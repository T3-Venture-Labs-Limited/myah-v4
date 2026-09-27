import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { type CampaignMessageOverviewReturnTarget } from '@/myah/campaign-messages/types/CampaignMessageOverviewReturnTarget';
import {
  myahInboxContactSelectionState,
  myahInboxPreserveSelectionOnUnmountState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export const useOpenMyahInboxConversation = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const store = useStore();
  const navigate = useNavigate();

  const openMyahInboxConversation = useCallback(
    (target: {
      workspaceId: string;
      contactId: string;
      threadId: string;
      returnTarget?: CampaignMessageOverviewReturnTarget;
    }) => {
      if (!currentWorkspace || target.workspaceId !== currentWorkspace.id)
        return false;

      store.set(myahInboxContactSelectionState.atom, {
        workspaceId: target.workspaceId,
        contactId: target.contactId,
        channel: 'EMAIL',
        emailThreadId: target.threadId,
        instagramConversationId: null,
      });
      store.set(myahInboxPreserveSelectionOnUnmountState.atom, true);
      navigate('/myah/inbox', {
        state: target.returnTarget
          ? { campaignMessageOverviewReturnTarget: target.returnTarget }
          : null,
      });
      return true;
    },
    [currentWorkspace, navigate, store],
  );

  return { openMyahInboxConversation };
};
