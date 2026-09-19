import {
  type MyahInboxReplyDraftInput,
  type SaveMyahInboxDraftMutation,
} from '~/generated/graphql';

export type MyahInboxRichText = {
  markdown: string;
  blocknote: string | null;
};

export type MyahInboxDraftAutosaveKey = {
  workspaceId: string;
  contactAnchorKind: string;
  contactAnchorId: string;
  channel: 'EMAIL' | 'INSTAGRAM';
  deliveryTargetId: string;
  contextKind: 'CAMPAIGN' | 'GENERAL';
  campaignId: string | null;
};

export const myahInboxDraftKeyId = (key: MyahInboxDraftAutosaveKey) =>
  JSON.stringify([
    key.workspaceId,
    key.contactAnchorKind,
    key.contactAnchorId,
    key.channel,
    key.deliveryTargetId,
    key.contextKind,
    key.campaignId,
  ]);

export type MyahInboxDraftExecutionState =
  | 'READY'
  | 'NEEDS_REVIEW'
  | 'OUTCOME_PENDING'
  | 'OUTCOME_UNKNOWN'
  | 'CONTEXT_UNAVAILABLE';

export type MyahInboxDraftAutosaveThread = {
  input?: MyahInboxReplyDraftInput;
  contextFingerprint?: string | null;
  executionState?: MyahInboxDraftExecutionState;
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

export type MyahInboxDraftOperationKind =
  | 'reviewing'
  | 'generating'
  | 'applying'
  | 'sending'
  | 'pending'
  | 'unknown';

export type MyahInboxDraftOperationCapture = {
  key: MyahInboxDraftAutosaveKey;
  token: symbol;
  targetToken: symbol;
  editorOwner: symbol | null;
  confirmedRevision: number;
  contextFingerprint: string | null;
  debounceVersion: number;
  editorVersion: number;
};

export type MyahInboxDraftAutosaveEntry = {
  input?: MyahInboxReplyDraftInput;
  contextFingerprint?: string | null;
  executionState?: MyahInboxDraftExecutionState;
  proposalContextFingerprint?: string | null;
  operation: { token: symbol; kind: MyahInboxDraftOperationKind } | null;
  editorOwner: symbol | null;
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
