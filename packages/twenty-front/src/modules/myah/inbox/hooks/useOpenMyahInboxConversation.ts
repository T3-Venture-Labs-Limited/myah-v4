import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { type CampaignMessageOverviewReturnTarget } from '@/myah/campaign-messages/types/CampaignMessageOverviewReturnTarget';
import {
  isCampaignCreatorInboxReturnTarget,
  type CampaignCreatorInboxReturnTarget,
} from '@/myah/inbox/types/CampaignCreatorInboxReturnTarget';
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
      // INSTAGRAM: threadId is the Instagram conversation (MYAH-445).
      channel?: 'EMAIL' | 'INSTAGRAM';
      returnTarget?: CampaignMessageOverviewReturnTarget;
      creatorReturnTarget?: CampaignCreatorInboxReturnTarget;
    }) => {
      if (
        !currentWorkspace ||
        target.workspaceId !== currentWorkspace.id ||
        (target.creatorReturnTarget &&
          !isCampaignCreatorInboxReturnTarget(
            target.creatorReturnTarget,
            currentWorkspace.id,
          ))
      )
        return false;

      store.set(myahInboxContactSelectionState.atom, {
        workspaceId: target.workspaceId,
        contactId: target.contactId,
        channel: target.channel ?? 'EMAIL',
        emailThreadId: target.channel === 'INSTAGRAM' ? null : target.threadId,
        instagramConversationId:
          target.channel === 'INSTAGRAM' ? target.threadId : null,
      });
      store.set(myahInboxPreserveSelectionOnUnmountState.atom, true);
      navigate('/myah/inbox', {
        state: target.creatorReturnTarget
          ? { campaignCreatorInboxReturnTarget: target.creatorReturnTarget }
          : target.returnTarget
            ? { campaignMessageOverviewReturnTarget: target.returnTarget }
            : null,
      });
      return true;
    },
    [currentWorkspace, navigate, store],
  );

  return { openMyahInboxConversation };
};
