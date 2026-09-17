import { atom } from 'jotai';
import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

import {
  myahInboxDraftKeyId,
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveKey,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

const draftFamily = createAtomFamilyState<
  MyahInboxDraftAutosaveEntry | null,
  string
>({
  key: 'myahInboxDraftAutosaveFamilyState',
  defaultValue: null,
});

// Object insertion order must not create a second draft for the same native key.
export const myahInboxDraftAutosaveFamilyState = {
  ...draftFamily,
  atomFamily: (key: MyahInboxDraftAutosaveKey) =>
    draftFamily.atomFamily(myahInboxDraftKeyId(key)),
};

export const myahInboxDraftAutosaveKeysState = atom<
  MyahInboxDraftAutosaveKey[]
>([]);
