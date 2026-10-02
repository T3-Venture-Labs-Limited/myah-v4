import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

export type MyahInboxInstagramCampaignSelectionKey = {
  workspaceId: string;
  contactId: string;
  conversationId: string;
};

// Session-local guidance-destination selection, module-scoped so it survives
// a guidance round trip and outlives the remounting conversation panel. It
// is not the Instagram draft/send authority; see MYAH-413 for that scope.
export const myahInboxInstagramCampaignSelectionFamilyState =
  createAtomFamilyState<string | null, MyahInboxInstagramCampaignSelectionKey>({
    key: 'myahInboxInstagramCampaignSelectionFamilyState',
    defaultValue: null,
  });
