import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

import { type MyahInboxDraftAutosaveKey } from '@/myah/inbox/types/MyahInboxDraftAutosave';

const draftEditorModeFamily = createAtomFamilyState<
  boolean,
  MyahInboxDraftAutosaveKey
>({
  key: 'myahInboxDraftEditorModeFamilyState',
  defaultValue: false,
});

export const myahInboxDraftEditorModeFamilyState = {
  ...draftEditorModeFamily,
  atomFamily: (key: MyahInboxDraftAutosaveKey) =>
    draftEditorModeFamily.atomFamily({
      workspaceId: key.workspaceId,
      threadId: key.threadId,
    }),
};
