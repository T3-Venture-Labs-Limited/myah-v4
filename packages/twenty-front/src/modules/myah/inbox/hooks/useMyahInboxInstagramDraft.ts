import { useMutation } from '@apollo/client/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';

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
  baselineKnown: boolean;
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

type InstagramDraftSaveOperation = {
  body: string;
  promise?: Promise<MyahInboxInstagramDraftFlushResult>;
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

  const draftId = v4();
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
  // Each mounted target lifetime owns its saves, including a return to the same scope.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeLifetimeRef = useRef({
    scope,
    active: true,
    hydrated: false,
    loadFailed: false,
    baselineKnown: initialSnapshot?.baselineKnown ?? false,
    executionLocked: false,
  });
  // oxlint-disable-next-line twenty/no-state-useref
  const saveOperationRef = useRef<InstagramDraftSaveOperation | null>(null);

  useEffect(() => {
    const snapshot = scope ? draftSnapshotsByScope.get(scope) : undefined;
    const nextBody = snapshot?.body ?? '';
    const nextRevision = snapshot?.revision ?? 0;
    let isActive = true;
    const lifetime = {
      scope,
      active: true,
      hydrated: false,
      loadFailed: false,
      baselineKnown: snapshot?.baselineKnown ?? false,
      executionLocked: false,
    };
    scopeLifetimeRef.current = lifetime;
    saveOperationRef.current = null;

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
      return () => {
        isActive = false;
        lifetime.active = false;
      };
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
      })
      .then(({ data }) => {
        if (!isActive) {
          return;
        }

        const serverDraft = data?.instagramMessageDraft;
        const currentSnapshot = draftSnapshotsByScope.get(scope);
        const hasLocalEdits = currentSnapshot?.dirty === true;

        lifetime.executionLocked = serverDraft?.executionLocked === true;
        setExecutionLocked(lifetime.executionLocked);
        // Only the first hydration can establish a dirty draft's CAS baseline.
        if (serverDraft && (!hasLocalEdits || !lifetime.baselineKnown)) {
          draftIdsByScope.set(scope, serverDraft.draftId);
          setDraftId(serverDraft.draftId);
          revisionRef.current = serverDraft.revision;
          setRevision(serverDraft.revision);
          if (!hasLocalEdits) {
            bodyRef.current = serverDraft.body;
            setBodyState(serverDraft.body);
          }
        }
        lifetime.hydrated = true;
        lifetime.baselineKnown = true;
        draftSnapshotsByScope.set(scope, {
          body: bodyRef.current,
          revision: revisionRef.current,
          dirty: hasLocalEdits,
          baselineKnown: true,
        });
        setDirty(hasLocalEdits);
        setStatus('saved');
      })
      .catch(() => {
        if (isActive) {
          lifetime.loadFailed = true;
          setStatus('error');
          setError('Could not load the saved Instagram draft.');
        }
      });

    return () => {
      isActive = false;
      lifetime.active = false;
    };
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
      const lifetime = scopeLifetimeRef.current;
      setStatus(
        lifetime.hydrated ? 'saved' : lifetime.loadFailed ? 'error' : 'loading',
      );
      setConflict(null);
      if (!lifetime.loadFailed) setError(null);
      setDirty(true);
      if (scope) {
        draftSnapshotsByScope.set(scope, {
          body: nextBody,
          revision: revisionRef.current,
          dirty: true,
          baselineKnown: lifetime.baselineKnown,
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

      const lifetime = scopeLifetimeRef.current;
      const expectedRevision = revisionRef.current;
      const isCurrent = () =>
        lifetime.active && scopeLifetimeRef.current === lifetime;
      const staleResult = (): MyahInboxInstagramDraftFlushResult => ({
        status: 'error',
        revision: expectedRevision,
      });

      if (
        lifetime.scope !== scope ||
        !lifetime.hydrated ||
        lifetime.executionLocked ||
        (scope && draftIdsByScope.get(scope) !== draftId)
      ) {
        return staleResult();
      }

      const activeOperation = saveOperationRef.current;
      if (activeOperation?.promise) {
        const result = await activeOperation.promise;
        if (!isCurrent()) return staleResult();
        if (result.status === 'error' || result.status === 'conflict') {
          return result;
        }
        // Flush a newer edit/clear only after the previous CAS has settled.
        return activeOperation.body !== bodyRef.current ? save() : result;
      }

      const draftBody = bodyRef.current;
      if (!draftBody.trim() && expectedRevision === 0) {
        return { status: 'empty', revision: expectedRevision };
      }

      if (!dirty) {
        return {
          status: draftBody.trim() ? 'saved' : 'empty',
          revision: expectedRevision,
        };
      }

      const operation: InstagramDraftSaveOperation = { body: draftBody };
      saveOperationRef.current = operation;
      const saving = (async () => {
        // An unload flush may still persist its captured target, but cannot publish.
        if (isCurrent()) {
          setStatus('saving');
          setError(null);
        }

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
          if (!isCurrent()) return staleResult();
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
                baselineKnown: true,
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
              baselineKnown: true,
            });
          }

          return {
            status:
              draftBody.trim() && bodyRef.current.trim()
                ? ('saved' as const)
                : ('empty' as const),
            revision: result.revision,
          };
        } catch {
          if (!isCurrent()) return staleResult();
          setError(
            'Could not save the Instagram draft. Your changes are still here.',
          );
          setStatus('error');
          return { status: 'error' as const, revision: revisionRef.current };
        } finally {
          if (saveOperationRef.current === operation) {
            saveOperationRef.current = null;
          }
        }
      })();

      operation.promise = saving;
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
    if (
      !dirty ||
      status !== 'saved' ||
      executionLocked ||
      (!body.trim() && revision === 0)
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [body, dirty, executionLocked, revision, save, status]);

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
        baselineKnown: true,
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
    scopeLifetimeRef.current.executionLocked = false;
    scopeLifetimeRef.current.baselineKnown = true;
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
