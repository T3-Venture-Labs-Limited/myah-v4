import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveKey,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

const draftFamily = createAtomFamilyState<
  MyahInboxDraftAutosaveEntry | null,
  MyahInboxDraftAutosaveKey
>({
  key: 'myahInboxDraftAutosaveFamilyState',
  defaultValue: null,
});

// Object insertion order must not create a second draft for the same native key.
export const myahInboxDraftAutosaveFamilyState = {
  ...draftFamily,
  atomFamily: (key: MyahInboxDraftAutosaveKey) =>
    draftFamily.atomFamily({
      workspaceId: key.workspaceId,
      threadId: key.threadId,
    }),
};
