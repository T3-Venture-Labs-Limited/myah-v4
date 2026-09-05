import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

import { type MyahInboxChannel } from '@/myah/inbox/types/MyahInboxContact';

export type MyahInboxStateFilter =
  | 'NEEDS_REPLY'
  | 'WAITING_ON_CREATOR'
  | 'SNOOZED'
  | 'CLOSED';

export type MyahInboxSnoozeStatusFilter = '' | 'ACTIVE' | 'DUE';

export type MyahInboxFilters = {
  owner: string;
  campaignId: string | null;
  campaignWorkspaceId: string | null;
  states: MyahInboxStateFilter[];
  snoozeStatus: MyahInboxSnoozeStatusFilter;
  search: string;
};

export const DEFAULT_MYAH_INBOX_FILTERS: MyahInboxFilters = {
  owner: '',
  campaignId: null,
  campaignWorkspaceId: null,
  states: [],
  snoozeStatus: '',
  search: '',
};

export type MyahInboxContactSelection = {
  workspaceId: string | null;
  contactId: string | null;
  channel: MyahInboxChannel | null;
  emailThreadId: string | null;
  instagramConversationId: string | null;
};

export const EMPTY_MYAH_INBOX_CONTACT_SELECTION: MyahInboxContactSelection = {
  workspaceId: null,
  contactId: null,
  channel: null,
  emailThreadId: null,
  instagramConversationId: null,
};

export const myahInboxContactSelectionState =
  createAtomState<MyahInboxContactSelection>({
    key: 'myahInboxContactSelectionState',
    defaultValue: EMPTY_MYAH_INBOX_CONTACT_SELECTION,
  });

export const myahInboxFiltersState = createAtomState<MyahInboxFilters>({
  key: 'myahInboxFiltersState',
  defaultValue: DEFAULT_MYAH_INBOX_FILTERS,
});
