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
  // Keyed by the full anchored draft identity so the edit mode follows the
  // exact contact/channel/target/context rather than a bare thread.
  atomFamily: (key: MyahInboxDraftAutosaveKey) =>
    draftEditorModeFamily.atomFamily(key),
};
