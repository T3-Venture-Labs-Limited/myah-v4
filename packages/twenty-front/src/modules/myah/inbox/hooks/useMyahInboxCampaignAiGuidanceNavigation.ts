import { useStore } from 'jotai';
import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

// Shared with Email's guidance navigation so both channels resolve the
// active Campaign Agent tab identically.
import { getMyahInboxActiveCampaignAgentTabId } from '@/myah/inbox/utils/getMyahInboxActiveCampaignAgentTabId';
import { myahInboxPreserveSelectionOnUnmountState } from '@/myah/inbox/states/myahInboxSelectionState';
import { pageLayoutsWithRelationsSelector } from '@/page-layout/states/pageLayoutsWithRelationsSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export type MyahInboxCampaignAiGuidanceNavigation = {
  runtimeAgentTabId: string | undefined;
  openGuidance: (params: {
    campaignId: string | null;
    // Flushes the exact mounted draft; resolves true only for a clean save.
    flush: () => Promise<boolean>;
    // Re-checked after flush to catch target/selection drift during the await.
    isStillCurrent: () => boolean;
  }) => Promise<void>;
};

// Shared guarded Campaign guidance navigation: resolves the active Campaign
// Agent tab, flushes the exact mounted draft, re-checks the target/selection
// and Agent tab after the flush, marks the Inbox selection for return, and
// navigates only when every precondition still holds.
export const useMyahInboxCampaignAiGuidanceNavigation =
  (): MyahInboxCampaignAiGuidanceNavigation => {
    const navigate = useNavigate();
    const store = useStore();
    const pageLayoutsWithRelations = useAtomStateValue(
      pageLayoutsWithRelationsSelector,
    );
    const runtimeAgentTabId = getMyahInboxActiveCampaignAgentTabId(
      pageLayoutsWithRelations,
    );
    // Guards repeated activations before React commits any disabled state.
    // oxlint-disable-next-line twenty/no-state-useref
    const isOpeningRef = useRef(false);

    const openGuidance = useCallback(
      async ({
        campaignId,
        flush,
        isStillCurrent,
      }: {
        campaignId: string | null;
        flush: () => Promise<boolean>;
        isStillCurrent: () => boolean;
      }) => {
        if (isOpeningRef.current || !campaignId || !runtimeAgentTabId) {
          return;
        }

        isOpeningRef.current = true;
        let markedForPreservation = false;
        try {
          const flushedCleanly = await flush();
          const currentRuntimeAgentTabId = getMyahInboxActiveCampaignAgentTabId(
            store.get(pageLayoutsWithRelationsSelector.atom),
          );
          if (
            !flushedCleanly ||
            !isStillCurrent() ||
            currentRuntimeAgentTabId !== runtimeAgentTabId
          ) {
            return;
          }

          store.set(myahInboxPreserveSelectionOnUnmountState.atom, true);
          markedForPreservation = true;
          navigate(
            `${getAppPath(AppPath.RecordShowPage, {
              objectNameSingular: 'campaign',
              objectRecordId: campaignId,
            })}#${runtimeAgentTabId}`,
            {
              state: { myahCampaignAgentGuidanceFocusCampaignId: campaignId },
            },
          );
        } catch {
          if (markedForPreservation) {
            store.set(myahInboxPreserveSelectionOnUnmountState.atom, false);
          }
        } finally {
          isOpeningRef.current = false;
        }
      },
      [navigate, runtimeAgentTabId, store],
    );

    return { runtimeAgentTabId, openGuidance };
  };
