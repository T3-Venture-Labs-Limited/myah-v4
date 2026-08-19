import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveKey,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

export const myahInboxDraftAutosaveFamilyState = createAtomFamilyState<
  MyahInboxDraftAutosaveEntry | null,
  MyahInboxDraftAutosaveKey
>({
  key: 'myahInboxDraftAutosaveFamilyState',
  defaultValue: null,
});
