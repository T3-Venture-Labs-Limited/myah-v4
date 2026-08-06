import { type SaveMyahInboxDraftMutation } from '~/generated/graphql';

export type MyahInboxRichText = {
  markdown: string;
  blocknote: string | null;
};

export type MyahInboxDraftAutosaveKey = {
  threadId: string;
  workspaceId: string;
};

export type MyahInboxDraftAutosaveThread = {
  key: MyahInboxDraftAutosaveKey;
  revision: number;
  body: MyahInboxRichText | null;
};

export type MyahInboxDraftAutosaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';

export type MyahInboxDraftAutosaveConflict = {
  revision: number;
  body: MyahInboxRichText | null;
};

export type MyahInboxDraftAutosaveEntry = {
  localBody: MyahInboxRichText;
  confirmedBody: MyahInboxRichText | null;
  confirmedRevision: number;
  dirty: boolean;
  status: MyahInboxDraftAutosaveStatus;
  error: string | null;
  conflict: MyahInboxDraftAutosaveConflict | null;
  debounceVersion: number;
  pendingDebounceVersion: number | null;
  editorVersion: number;
};

export type MyahInboxDraftAutosaveSaveResult =
  SaveMyahInboxDraftMutation['saveMyahInboxDraft'];
