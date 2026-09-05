import { useMutation } from '@apollo/client/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GET_INSTAGRAM_MESSAGE_DRAFT,
  SAVE_INSTAGRAM_MESSAGE_DRAFT,
} from '@/myah/inbox/graphql/operations';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

const AUTOSAVE_DELAY_MS = 750;
const draftIdsByScope = new Map<string, string>();
type InstagramDraftSnapshot = {
  body: string;
  revision: number;
  dirty: boolean;
};

const draftSnapshotsByScope = new Map<string, InstagramDraftSnapshot>();

export type MyahInboxInstagramDraftKind = 'FIRST_MESSAGE' | 'REPLY';
export type MyahInboxInstagramDraftStatus =
  | 'saved'
  | 'loading'
  | 'saving'
  | 'conflict'
  | 'error';

export type MyahInboxInstagramDraftConflict = {
  revision: number;
  body: string;
};

export type MyahInboxInstagramDraftFlushResult = {
  status: 'saved' | 'empty' | 'conflict' | 'error';
  revision: number;
};

export type MyahInboxInstagramDraft = {
  draftId: string | null;
  body: string;
  revision: number;
  status: MyahInboxInstagramDraftStatus;
  conflict: MyahInboxInstagramDraftConflict | null;
  error: string | null;
  executionLocked: boolean;
  setBody: (body: string) => void;
  flush: () => Promise<MyahInboxInstagramDraftFlushResult>;
  reloadConflict: () => void;
  resetAfterSend: () => void;
};

type UseMyahInboxInstagramDraftParams = {
  workspaceId: string | null;
  contactId: string | null;
  kind: MyahInboxInstagramDraftKind;
  creatorRecordId: string | null;
  conversationRecordId: string | null;
};

type SaveDraftResponse = {
  status: 'SAVED' | 'CONFLICT';
  draftId: string;
  revision: number;
  body: string;
  executionLocked?: boolean | null;
};

type SaveDraftMutationData = {
  saveInstagramMessageDraft: SaveDraftResponse;
};

type SaveDraftMutationVariables = {
  input: {
    draftId: string;
    expectedRevision: number;
    kind: MyahInboxInstagramDraftKind;
    body: string;
    creatorRecordId: string | null;
    conversationRecordId: string | null;
  };
};

type GetDraftQueryData = {
  instagramMessageDraft: SaveDraftResponse | null;
};

type GetDraftQueryVariables = {
  input: {
    kind: MyahInboxInstagramDraftKind;
    creatorRecordId: string | null;
    conversationRecordId: string | null;
  };
};

const getDraftId = (scope: string) => {
  const existing = draftIdsByScope.get(scope);
  if (existing) {
    return existing;
  }

  const draftId = crypto.randomUUID();
  draftIdsByScope.set(scope, draftId);

  return draftId;
};

export const useMyahInboxInstagramDraft = ({
  workspaceId,
  contactId,
  kind,
  creatorRecordId,
  conversationRecordId,
}: UseMyahInboxInstagramDraftParams): MyahInboxInstagramDraft => {
  const apolloCoreClient = useApolloCoreClient();
  const [saveDraftMutation] = useMutation<
    SaveDraftMutationData,
    SaveDraftMutationVariables
  >(SAVE_INSTAGRAM_MESSAGE_DRAFT, {
    client: apolloCoreClient,
  });
  const targetId =
    kind === 'FIRST_MESSAGE' ? creatorRecordId : conversationRecordId;
  const scope =
    workspaceId && contactId && targetId
      ? `${workspaceId}:${contactId}:${targetId}:${kind}`
      : null;
  const initialSnapshot = scope ? draftSnapshotsByScope.get(scope) : undefined;
  const [draftId, setDraftId] = useState<string | null>(() =>
    scope ? getDraftId(scope) : null,
  );
  const [body, setBodyState] = useState(initialSnapshot?.body ?? '');
  const [revision, setRevision] = useState(initialSnapshot?.revision ?? 0);
  const [status, setStatus] = useState<MyahInboxInstagramDraftStatus>(
    scope ? 'loading' : 'saved',
  );
  const [conflict, setConflict] =
    useState<MyahInboxInstagramDraftConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionLocked, setExecutionLocked] = useState(false);
  const [dirty, setDirty] = useState(initialSnapshot?.dirty ?? false);
  // oxlint-disable-next-line twenty/no-state-useref
  const bodyRef = useRef(body);
  // oxlint-disable-next-line twenty/no-state-useref
  const revisionRef = useRef(revision);
  const savePromiseRef =
    // oxlint-disable-next-line twenty/no-state-useref
    useRef<Promise<MyahInboxInstagramDraftFlushResult> | null>(null);

  useEffect(() => {
    const snapshot = scope ? draftSnapshotsByScope.get(scope) : undefined;
    const nextBody = snapshot?.body ?? '';
    const nextRevision = snapshot?.revision ?? 0;
    const abortController = new AbortController();

    setDraftId(scope ? getDraftId(scope) : null);
    bodyRef.current = nextBody;
    revisionRef.current = nextRevision;
    setBodyState(nextBody);
    setRevision(nextRevision);
    setStatus(scope ? 'loading' : 'saved');
    setConflict(null);
    setError(null);
    setDirty(snapshot?.dirty ?? false);
    setExecutionLocked(false);

    if (!scope || !targetId) {
      return () => abortController.abort();
    }

    void apolloCoreClient
      .query<GetDraftQueryData, GetDraftQueryVariables>({
        query: GET_INSTAGRAM_MESSAGE_DRAFT,
        variables: {
          input: {
            kind,
            creatorRecordId: kind === 'FIRST_MESSAGE' ? creatorRecordId : null,
            conversationRecordId:
              kind === 'REPLY' ? conversationRecordId : null,
          },
        },
        fetchPolicy: 'no-cache',
        context: { fetchOptions: { signal: abortController.signal } },
      })
      .then(({ data }) => {
        if (abortController.signal.aborted) {
          return;
        }

        const serverDraft = data?.instagramMessageDraft;

        if (serverDraft) {
          setExecutionLocked(serverDraft.executionLocked === true);
          if (!snapshot?.dirty) {
            draftIdsByScope.set(scope, serverDraft.draftId);
            draftSnapshotsByScope.set(scope, {
              body: serverDraft.body,
              revision: serverDraft.revision,
              dirty: false,
            });
            setDraftId(serverDraft.draftId);
            bodyRef.current = serverDraft.body;
            revisionRef.current = serverDraft.revision;
            setBodyState(serverDraft.body);
            setRevision(serverDraft.revision);
            setDirty(false);
          }
        }
        setStatus('saved');
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setStatus('error');
          setError('Could not load the saved Instagram draft.');
        }
      });

    return () => abortController.abort();
  }, [
    apolloCoreClient,
    conversationRecordId,
    creatorRecordId,
    kind,
    scope,
    targetId,
  ]);

  const setBody = useCallback(
    (nextBody: string) => {
      bodyRef.current = nextBody;
      setBodyState(nextBody);
      setStatus('saved');
      setConflict(null);
      setError(null);
      setDirty(true);
      if (scope) {
        draftSnapshotsByScope.set(scope, {
          body: nextBody,
          revision: revisionRef.current,
          dirty: true,
        });
      }
    },
    [scope],
  );

  const save =
    useCallback(async (): Promise<MyahInboxInstagramDraftFlushResult> => {
      if (!draftId || !targetId) {
        setError('Instagram message target is unavailable.');
        setStatus('error');
        return { status: 'error', revision: revisionRef.current };
      }

      const draftBody = bodyRef.current;
      if (!draftBody.trim()) {
        return { status: 'empty', revision: revisionRef.current };
      }

      if (!dirty) {
        return { status: 'saved', revision: revisionRef.current };
      }

      if (savePromiseRef.current) {
        return savePromiseRef.current;
      }

      const expectedRevision = revisionRef.current;
      const saving = (async () => {
        setStatus('saving');
        setError(null);

        try {
          const response = await saveDraftMutation({
            variables: {
              input: {
                draftId,
                expectedRevision,
                kind,
                body: draftBody,
                creatorRecordId:
                  kind === 'FIRST_MESSAGE' ? creatorRecordId : null,
                conversationRecordId:
                  kind === 'REPLY' ? conversationRecordId : null,
              },
            },
          });
          const result = response.data?.saveInstagramMessageDraft;

          if (!result) {
            throw new Error('Instagram draft save returned no result.');
          }

          if (result.status === 'CONFLICT') {
            setConflict({ revision: result.revision, body: result.body });
            setStatus('conflict');
            if (scope) {
              draftSnapshotsByScope.set(scope, {
                body: bodyRef.current,
                revision: revisionRef.current,
                dirty: true,
              });
            }
            return { status: 'conflict' as const, revision: result.revision };
          }

          revisionRef.current = result.revision;
          setRevision(result.revision);
          setStatus('saved');
          setConflict(null);
          const stillDirty = bodyRef.current !== draftBody;
          setDirty(stillDirty);
          if (scope) {
            draftSnapshotsByScope.set(scope, {
              body: bodyRef.current,
              revision: result.revision,
              dirty: stillDirty,
            });
          }

          return { status: 'saved' as const, revision: result.revision };
        } catch {
          setError(
            'Could not save the Instagram draft. Your changes are still here.',
          );
          setStatus('error');
          return { status: 'error' as const, revision: revisionRef.current };
        } finally {
          savePromiseRef.current = null;
        }
      })();

      savePromiseRef.current = saving;
      return saving;
    }, [
      conversationRecordId,
      creatorRecordId,
      dirty,
      draftId,
      kind,
      saveDraftMutation,
      targetId,
      scope,
    ]);

  useEffect(() => {
    if (!dirty || status !== 'saved' || !body.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [body, dirty, save, status]);

  const reloadConflict = useCallback(() => {
    if (!conflict) {
      return;
    }

    bodyRef.current = conflict.body;
    revisionRef.current = conflict.revision;
    setBodyState(conflict.body);
    setRevision(conflict.revision);
    setConflict(null);
    setStatus('saved');
    setError(null);
    setDirty(false);
    if (scope) {
      draftSnapshotsByScope.set(scope, {
        body: conflict.body,
        revision: conflict.revision,
        dirty: false,
      });
    }
  }, [conflict, scope]);

  const resetAfterSend = useCallback(() => {
    if (scope) {
      draftIdsByScope.delete(scope);
      draftSnapshotsByScope.delete(scope);
    }
    bodyRef.current = '';
    revisionRef.current = 0;
    setBodyState('');
    setRevision(0);
    setStatus('saved');
    setConflict(null);
    setError(null);
    setDirty(false);
    setDraftId(scope ? getDraftId(scope) : null);
    setExecutionLocked(false);
  }, [scope]);

  return {
    draftId,
    body,
    revision,
    status,
    conflict,
    error,
    executionLocked,
    setBody,
    flush: save,
    reloadConflict,
    resetAfterSend,
  };
};
