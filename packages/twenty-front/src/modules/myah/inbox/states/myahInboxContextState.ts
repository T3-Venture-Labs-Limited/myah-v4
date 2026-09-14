import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type MyahInboxContext = {
  ownerId: string;
  workspaceId: string | null;
  thread: MyahInboxThread | null;
  isWide: boolean;
};

export const myahInboxContextState = createAtomState<MyahInboxContext | null>({
  key: 'myah-inbox/context',
  defaultValue: null,
});
