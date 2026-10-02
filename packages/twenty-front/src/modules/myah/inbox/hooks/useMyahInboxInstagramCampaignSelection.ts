import { useAtom } from 'jotai';
import { useEffect, useMemo, useRef } from 'react';

import { useMyahInboxInstagramCampaignOptions } from '@/myah/inbox/hooks/useMyahInboxInstagramCampaignOptions';
import { myahInboxInstagramCampaignSelectionFamilyState } from '@/myah/inbox/states/myahInboxInstagramCampaignSelectionFamilyState';

export type { MyahInboxInstagramCampaignOption } from '@/myah/inbox/hooks/useMyahInboxInstagramCampaignOptions';

export type MyahInboxInstagramCampaignSelection = {
  status: 'loading' | 'unavailable' | 'ready';
  options: { value: string; label: string }[];
  selectedCampaignId: string | null;
  onSelectCampaign: (campaignId: string) => void;
  unavailableReason: string | null;
};

type UseMyahInboxInstagramCampaignSelectionParams = {
  workspaceId: string | null;
  contactId: string | null;
  conversationId: string | null;
  creatorId: string | null;
};

// Owns the Campaign guidance-destination selection: readable membership
// options plus a session-local, exact workspace/contact/conversation-scoped
// selection that a single readable Campaign may fill automatically, several
// Campaigns require the operator to choose explicitly, and a Campaign that
// disappears from refreshed options clears without substituting another.
export const useMyahInboxInstagramCampaignSelection = ({
  workspaceId,
  contactId,
  conversationId,
  creatorId,
}: UseMyahInboxInstagramCampaignSelectionParams): MyahInboxInstagramCampaignSelection => {
  const optionsResult = useMyahInboxInstagramCampaignOptions(creatorId);
  const selectionKey = useMemo(
    () => ({
      workspaceId: workspaceId ?? '',
      contactId: contactId ?? '',
      conversationId: conversationId ?? '',
    }),
    [workspaceId, contactId, conversationId],
  );
  const [selectedCampaignId, setSelectedCampaignId] = useAtom(
    myahInboxInstagramCampaignSelectionFamilyState.atomFamily(selectionKey),
  );
  const selectionKeyId = `${selectionKey.workspaceId}:${selectionKey.contactId}:${selectionKey.conversationId}`;
  // Single-option auto-selection is a one-time convenience for this exact
  // scope's first resolved options list. It must not re-fire after a stale
  // selected Campaign is cleared and narrows the remaining options to one.
  // oxlint-disable-next-line twenty/no-state-useref
  const hasResolvedInitialOptionsRef = useRef(false);

  useEffect(() => {
    hasResolvedInitialOptionsRef.current = false;
  }, [selectionKeyId]);

  useEffect(() => {
    if (optionsResult.status !== 'ready') {
      return;
    }

    const optionIds = new Set(
      optionsResult.options.map((option) => option.value),
    );
    if (selectedCampaignId && !optionIds.has(selectedCampaignId)) {
      setSelectedCampaignId(null);
      hasResolvedInitialOptionsRef.current = true;
      return;
    }
    if (hasResolvedInitialOptionsRef.current) {
      return;
    }
    hasResolvedInitialOptionsRef.current = true;
    if (!selectedCampaignId && optionsResult.options.length === 1) {
      setSelectedCampaignId(optionsResult.options[0].value);
    }
  }, [optionsResult, selectedCampaignId, setSelectedCampaignId]);

  if (optionsResult.status !== 'ready') {
    return {
      status: optionsResult.status,
      options: [],
      selectedCampaignId: null,
      onSelectCampaign: setSelectedCampaignId,
      unavailableReason: optionsResult.reason,
    };
  }

  const isSelectionReadable = optionsResult.options.some(
    (option) => option.value === selectedCampaignId,
  );

  return {
    status: 'ready',
    options: optionsResult.options,
    selectedCampaignId: isSelectionReadable ? selectedCampaignId : null,
    onSelectCampaign: setSelectedCampaignId,
    unavailableReason: null,
  };
};
