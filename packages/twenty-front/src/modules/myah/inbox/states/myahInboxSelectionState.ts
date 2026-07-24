import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type MyahInboxQueueFilter = 'CREATOR_LINKED' | 'UNMATCHED';
export type MyahInboxStateFilter =
  | 'NEEDS_REPLY'
  | 'WAITING_ON_CREATOR'
  | 'SNOOZED'
  | 'CLOSED';

export type MyahInboxFilters = {
  queue: MyahInboxQueueFilter;
  owner: string;
  campaignId: string | null;
  campaignWorkspaceId: string | null;
  states: MyahInboxStateFilter[];
  search: string;
};

export const DEFAULT_MYAH_INBOX_FILTERS: MyahInboxFilters = {
  queue: 'CREATOR_LINKED',
  owner: '',
  campaignId: null,
  campaignWorkspaceId: null,
  states: [],
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
