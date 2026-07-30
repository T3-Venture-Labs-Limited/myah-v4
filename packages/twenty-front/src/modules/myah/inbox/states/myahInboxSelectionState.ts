import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

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

export const myahInboxSelectedThreadIdState = createAtomState<string | null>({
  key: 'myahInboxSelectedThreadIdState',
  defaultValue: null,
});
export const myahInboxSelectionWorkspaceIdState = createAtomState<
  string | null
>({
  key: 'myahInboxSelectionWorkspaceIdState',
  defaultValue: null,
});

export const myahInboxFiltersState = createAtomState<MyahInboxFilters>({
  key: 'myahInboxFiltersState',
  defaultValue: DEFAULT_MYAH_INBOX_FILTERS,
});
