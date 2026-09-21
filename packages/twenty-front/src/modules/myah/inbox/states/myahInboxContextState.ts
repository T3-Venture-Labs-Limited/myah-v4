import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type MyahInboxContext = {
  ownerId: string;
  workspaceId: string | null;
  contact: MyahInboxContact | null;
  isWide: boolean;
};

export const myahInboxContextState = createAtomState<MyahInboxContext | null>({
  key: 'myah-inbox/context',
  defaultValue: null,
});
