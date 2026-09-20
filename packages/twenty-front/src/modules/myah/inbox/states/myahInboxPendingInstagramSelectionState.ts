import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const myahInboxPendingInstagramSelectionState = createAtomState<{
  workspaceId: string;
  creatorRecordId: string;
  conversationRecordId: string;
} | null>({
  key: 'myahInboxPendingInstagramSelectionState',
  defaultValue: null,
});
