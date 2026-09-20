import { useStore } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import {
  myahInboxDraftAutosaveFamilyState,
  myahInboxDraftAutosaveKeysState,
} from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
  myahInboxDraftKeyId as keyId,
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftOperationCapture,
  type MyahInboxDraftAutosaveKey,
  type MyahInboxDraftAutosaveThread,
  type MyahInboxRichText,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { MyahInboxDraftSaveStatus } from '~/generated/graphql';

const DEBOUNCE_MS = 750;
const EMPTY_DRAFT: MyahInboxRichText = { markdown: '', blocknote: null };
const DRAFT_SAVE_ERROR =
  'Could not save the draft. Your changes are still here.';

const areRichTextEqual = (
  first: MyahInboxRichText,
  second: MyahInboxRichText,
) => first.markdown === second.markdown && first.blocknote === second.blocknote;

const toRichText = (
  body: { markdown: string; blocknote?: string | null } | null | undefined,
): MyahInboxRichText | null =>
  body ? { markdown: body.markdown, blocknote: body.blocknote ?? null } : null;

type UpdateDraftParams = {
  key: MyahInboxDraftAutosaveKey;
  body: MyahInboxRichText;
  editorOwner?: symbol;
};

export type MyahInboxDraftTargetCapture = {
  key: MyahInboxDraftAutosaveKey;
  token: symbol;
  isContextCurrent: () => boolean;
  refreshAfterSave?: (
    revision: number,
  ) => Promise<MyahInboxDraftAutosaveThread | null>;
};

// Runtime handles share the same lifetime as the Jotai draft store, not a Page mount.
const runtimes = new WeakMap<
  ReturnType<typeof useStore>,
  {
    timers: Map<string, ReturnType<typeof setTimeout>>;
    runs: Map<string, Promise<void>>;
    saves: Map<string, { targetToken: symbol; refreshing: boolean }>;
    keys: Map<string, MyahInboxDraftAutosaveKey>;
    forcedRecoveryKeys: Set<string>;
    outcomeBodies: Map<
      string,
      {
        targetToken: symbol;
        revision: number;
        localBody: MyahInboxRichText;
        dirty: boolean;
      }
    >;
    targets: Map<
      string,
      {
        capture: MyahInboxDraftTargetCapture;
        authorized: boolean;
        refreshing?: boolean;
      }
    >;
  }
>();

const getRuntime = (store: ReturnType<typeof useStore>) => {
  let runtime = runtimes.get(store);
  if (!runtime) {
    runtime = {
      timers: new Map(),
      runs: new Map(),
      saves: new Map(),
      keys: new Map(),
      forcedRecoveryKeys: new Set(),
      outcomeBodies: new Map(),
      targets: new Map(),
    };
    runtimes.set(store, runtime);
  }
  return runtime;
};

type ProcessDraft = (key: MyahInboxDraftAutosaveKey) => Promise<void>;

export type MyahInboxDraftAutosaveController = {
  getEntry: (
    key: MyahInboxDraftAutosaveKey,
  ) => MyahInboxDraftAutosaveEntry | null;
  claimEditor: (key: MyahInboxDraftAutosaveKey, owner: symbol) => boolean;
  releaseEditor: (key: MyahInboxDraftAutosaveKey, owner: symbol) => boolean;
  acquire: (
    key: MyahInboxDraftAutosaveKey,
    kind: 'generating' | 'sending' | 'reviewing',
    editorOwner?: symbol,
  ) => MyahInboxDraftOperationCapture | null;
  isOperationCurrent: (capture: MyahInboxDraftOperationCapture) => boolean;
  release: (capture: MyahInboxDraftOperationCapture) => void;
  setReadinessLock: (
    key: MyahInboxDraftAutosaveKey,
    kind: 'pending' | 'unknown',
  ) => void;
  setOutcomeLock: (
    capture: MyahInboxDraftOperationCapture,
    kind: 'pending' | 'unknown',
  ) => void;
  applyProposalIfCurrent: (
    capture: MyahInboxDraftOperationCapture,
    body: MyahInboxRichText,
  ) => Promise<boolean>;
  reconcileOperation: (
    capture: MyahInboxDraftOperationCapture,
    thread: MyahInboxDraftAutosaveThread,
  ) => void;
  reconcile: (thread: MyahInboxDraftAutosaveThread) => void;
  updateDraft: (params: UpdateDraftParams) => void;
  flush: (
    key: MyahInboxDraftAutosaveKey,
  ) => Promise<MyahInboxDraftAutosaveEntry>;
  retry: (key: MyahInboxDraftAutosaveKey) => Promise<void>;
  reloadConflict: (key: MyahInboxDraftAutosaveKey) => Promise<void>;
  applyProposal: (params: UpdateDraftParams) => Promise<boolean>;
  beginTargetRead: (
    key: MyahInboxDraftAutosaveKey,
    isContextCurrent: () => boolean,
    refreshAfterSave?: MyahInboxDraftTargetCapture['refreshAfterSave'],
  ) => MyahInboxDraftTargetCapture;
  authorizeTarget: (
    capture: MyahInboxDraftTargetCapture,
    thread: MyahInboxDraftAutosaveThread,
  ) => boolean;
  invalidateTarget: (capture: MyahInboxDraftTargetCapture) => void;
  invalidateWorkspace: (workspaceId: string) => void;
  isTargetAuthorized: (key: MyahInboxDraftAutosaveKey) => boolean;
  flushKeys: (keys: MyahInboxDraftAutosaveKey[]) => Promise<boolean>;
  flushWorkspace: (workspaceId: string) => Promise<boolean>;
  flushWorkspaceForNavigation: (
    workspaceId: string,
    activeThreadIds: string[],
  ) => Promise<boolean>;
};

export const useMyahInboxDraftAutosaveController =
  (): MyahInboxDraftAutosaveController => {
    const store = useStore();
    const runtime = getRuntime(store);
    const { saveDraft } = useMyahInboxThreadMutations();
    // Autosave retains callback and scheduler handles outside render state.
    // oxlint-disable-next-line twenty/no-state-useref
    const saveDraftRef = useRef(saveDraft);
    // oxlint-disable-next-line twenty/no-state-useref
    const timersRef = useRef(runtime.timers);
    // oxlint-disable-next-line twenty/no-state-useref
    const runsRef = useRef(runtime.runs);
    // oxlint-disable-next-line twenty/no-state-useref
    const keysRef = useRef(runtime.keys);
    // oxlint-disable-next-line twenty/no-state-useref
    const processRef = useRef<ProcessDraft>(undefined);
    // Read capabilities are ephemeral; cached draft bytes never authorize edits.
    // oxlint-disable-next-line twenty/no-state-useref
    const targetsRef = useRef(runtime.targets);
    // oxlint-disable-next-line twenty/no-state-useref
    const ownedTargetsRef = useRef(new Set<MyahInboxDraftTargetCapture>());
    const isTargetAuthorized = useCallback(
      (key: MyahInboxDraftAutosaveKey) => {
        const target = targetsRef.current.get(keyId(key));
        return (
          store.get(currentWorkspaceState.atom)?.id === key.workspaceId &&
          Boolean(target?.authorized && target.capture.isContextCurrent())
        );
      },
      [store],
    );

    useEffect(() => {
      saveDraftRef.current = saveDraft;
    }, [saveDraft]);

    const cancelTimer = useCallback((key: MyahInboxDraftAutosaveKey) => {
      const id = keyId(key);
      const timer = timersRef.current.get(id);

      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }, []);

    const clearPendingDebounce = useCallback(
      (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (!entry || entry.pendingDebounceVersion === null) {
          return;
        }

        store.set(atom, { ...entry, pendingDebounceVersion: null });
      },
      [store],
    );

    const start = useCallback((key: MyahInboxDraftAutosaveKey) => {
      const id = keyId(key);
      const existingRun = runsRef.current.get(id);

      if (existingRun) {
        return existingRun;
      }

      const process = processRef.current;

      if (!process) {
        throw new Error('Autosave processor is unavailable');
      }

      const run = process(key).finally(() => {
        if (runsRef.current.get(id) === run) {
          runsRef.current.delete(id);
        }
      });

      runsRef.current.set(id, run);

      return run;
    }, []);

    processRef.current = async (key) => {
      const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);

      while (true) {
        const entry = store.get(atom);

        if (
          !entry ||
          !entry.dirty ||
          !isTargetAuthorized(key) ||
          (entry.executionState != null && entry.executionState !== 'READY') ||
          entry.operation?.kind === 'pending' ||
          entry.operation?.kind === 'unknown' ||
          entry.operation?.kind === 'generating' ||
          entry.operation?.kind === 'reviewing' ||
          entry.status === 'error' ||
          entry.status === 'conflict' ||
          entry.status === 'saving' ||
          entry.pendingDebounceVersion !== null
        ) {
          return;
        }

        cancelTimer(key);
        const target = targetsRef.current.get(keyId(key));
        if (!target) return;
        const submittedBody = entry.localBody;
        const expectedRevision = entry.confirmedRevision;
        const save = { targetToken: target.capture.token, refreshing: false };
        const getSaveTarget = () => {
          const currentTarget = targetsRef.current.get(keyId(key));
          return currentTarget?.capture.token === save.targetToken
            ? currentTarget
            : undefined;
        };
        runtime.saves.set(keyId(key), save);
        const ownsSave = () => {
          const current = store.get(atom);
          const currentTarget = targetsRef.current.get(keyId(key));
          return (
            runtime.saves.get(keyId(key)) === save &&
            current?.confirmedRevision === expectedRevision &&
            current.status === 'saving' &&
            (!currentTarget ||
              currentTarget.capture.token === save.targetToken) &&
            (current.executionState === 'READY' ||
              current.executionState === 'NEEDS_REVIEW')
          );
        };
        store.set(atom, {
          ...entry,
          dirty: false,
          status: 'saving',
          error: null,
          conflict: null,
        });

        try {
          if (!entry.input) throw new Error('Draft read identity is required');
          const result = await saveDraftRef.current({
            ...entry.input,
            ...(entry.proposalContextFingerprint
              ? { proposalContextFingerprint: entry.proposalContextFingerprint }
              : {}),
            expectedRevision,
            body: submittedBody,
          });

          // Validate before *any* completion write, including conflicts/errors.
          // A detached save may retain ownership only until an authoritative
          // read supersedes it (or explicitly hands off the same base revision).
          // Recheck queued work: its expired timer may have joined this old run.
          if (!ownsSave()) continue;
          if (result.status === MyahInboxDraftSaveStatus.CONFLICT) {
            const currentEntry = store.get(atom);

            if (currentEntry) {
              store.set(atom, {
                ...currentEntry,
                dirty: false,
                status: 'conflict',
                error: null,
                conflict: {
                  revision: result.revision,
                  body: toRichText(result.body),
                },
              });
            }
            clearPendingDebounce(key);
            cancelTimer(key);

            return;
          }

          const currentEntry = store.get(atom);

          if (!currentEntry) {
            return;
          }

          const savedBody = toRichText(result.body);
          const snapshot = runtime.outcomeBodies.get(keyId(key));
          if (snapshot && snapshot.revision !== result.revision)
            runtime.outcomeBodies.delete(keyId(key));
          const outcomeLocked =
            currentEntry.operation?.kind === 'pending' ||
            currentEntry.operation?.kind === 'unknown' ||
            currentEntry.executionState === 'OUTCOME_PENDING' ||
            currentEntry.executionState === 'OUTCOME_UNKNOWN';
          const hasNewerLocalBody = outcomeLocked
            ? currentEntry.dirty
            : !areRichTextEqual(currentEntry.localBody, submittedBody);
          save.refreshing = true;
          const saveTarget = getSaveTarget();
          if (saveTarget) saveTarget.refreshing = true;
          store.set(atom, {
            ...currentEntry,
            confirmedRevision: result.revision,
            confirmedBody: outcomeLocked ? null : savedBody,
            dirty: hasNewerLocalBody,
            status: hasNewerLocalBody ? 'idle' : 'saved',
            error: null,
            conflict: null,
          });
          // A committed save is never retried because its metadata read failed.
          // Keep flush/operation acquisition gated while the exact capability
          // refreshes, without preventing newer local edits or retaining "saving".
          let refreshed: MyahInboxDraftAutosaveThread | null = null;
          while (
            runtime.saves.get(keyId(key)) === save &&
            store.get(atom)?.confirmedRevision === result.revision
          ) {
            const refreshTarget = getSaveTarget();
            if (
              !refreshTarget?.capture.refreshAfterSave ||
              !isTargetAuthorized(key)
            )
              break;
            refreshTarget.refreshing = true;
            try {
              refreshed = await refreshTarget.capture.refreshAfterSave(
                result.revision,
              );
            } catch {
              refreshed = null;
            }
            // A same-base remount can transfer ownership even during this read.
            // Discard the old capability's response and reread through its successor.
            if (getSaveTarget() !== refreshTarget) {
              refreshed = null;
              continue;
            }
            if (
              runtime.saves.get(keyId(key)) === save &&
              store.get(atom)?.confirmedRevision === result.revision &&
              (!refreshed ||
                keyId(refreshed.key) !== keyId(key) ||
                refreshed.revision !== result.revision)
            ) {
              invalidateTarget(refreshTarget.capture);
            }
            break;
          }
          save.refreshing = false;
          const currentTarget = getSaveTarget();
          if (currentTarget) currentTarget.refreshing = false;
          const latest = store.get(atom);
          if (
            !latest ||
            runtime.saves.get(keyId(key)) !== save ||
            latest.confirmedRevision !== result.revision ||
            (targetsRef.current.has(keyId(key)) && !currentTarget)
          )
            continue;
          if (
            refreshed &&
            latest.operation?.kind !== 'pending' &&
            latest.operation?.kind !== 'unknown' &&
            latest.executionState !== 'OUTCOME_PENDING' &&
            latest.executionState !== 'OUTCOME_UNKNOWN' &&
            latest.executionState !== 'CONTEXT_UNAVAILABLE' &&
            isTargetAuthorized(key)
          ) {
            reconcile(refreshed);
          }
          if (!latest.dirty) {
            clearPendingDebounce(key);
            cancelTimer(key);
            return;
          }
        } catch {
          if (!ownsSave()) continue;
          const currentEntry = store.get(atom);

          if (currentEntry) {
            store.set(atom, {
              ...currentEntry,
              dirty: false,
              status: 'error',
              error: DRAFT_SAVE_ERROR,
            });
          }
          cancelTimer(key);
          clearPendingDebounce(key);

          return;
        } finally {
          if (runtime.saves.get(keyId(key)) === save)
            runtime.saves.delete(keyId(key));
        }
      }
    };

    const flush = useCallback(
      async (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        cancelTimer(key);
        clearPendingDebounce(key);
        await start(key);
        while (isTargetAuthorized(key)) {
          const current = store.get(atom);
          if (
            !current?.dirty ||
            (current.executionState != null &&
              current.executionState !== 'READY') ||
            current.status === 'error' ||
            current.status === 'conflict' ||
            ['generating', 'reviewing', 'pending', 'unknown'].includes(
              current.operation?.kind ?? '',
            )
          )
            break;
          cancelTimer(key);
          clearPendingDebounce(key);
          await start(key);
        }

        const entry = store.get(atom);

        if (!entry) {
          throw new Error('Expected autosave draft entry after flush');
        }

        return entry;
      },
      [cancelTimer, clearPendingDebounce, isTargetAuthorized, start, store],
    );

    const maskOutcomeBody = useCallback(
      (key: MyahInboxDraftAutosaveKey, entry: MyahInboxDraftAutosaveEntry) => {
        const target = targetsRef.current.get(keyId(key));
        if (
          target &&
          isTargetAuthorized(key) &&
          (entry.executionState === 'READY' ||
            entry.executionState === 'NEEDS_REVIEW')
        ) {
          runtime.outcomeBodies.set(keyId(key), {
            targetToken: target.capture.token,
            revision: entry.confirmedRevision,
            localBody: entry.localBody,
            dirty:
              entry.dirty ||
              (entry.status === 'saving' &&
                !areRichTextEqual(
                  entry.localBody,
                  entry.confirmedBody ?? EMPTY_DRAFT,
                )),
          });
        }
        runtime.saves.delete(keyId(key));
        if (target) target.refreshing = false;
        cancelTimer(key);
        const hasExposedBody =
          !areRichTextEqual(entry.localBody, EMPTY_DRAFT) ||
          entry.confirmedBody !== null ||
          entry.conflict?.body != null;
        return {
          localBody: EMPTY_DRAFT,
          confirmedBody: null,
          conflict: null,
          error: null,
          status: 'idle' as const,
          // BlockNote retains its initial document until the keyed instance changes.
          editorVersion: entry.editorVersion + (hasExposedBody ? 1 : 0),
        };
      },
      [cancelTimer, isTargetAuthorized, runtime],
    );

    const reconcile = useCallback(
      (thread: MyahInboxDraftAutosaveThread) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(thread.key);
        const entry = store.get(atom);
        const executionState =
          thread.executionState ?? entry?.executionState ?? 'READY';
        const canReadBody =
          executionState === 'READY' || executionState === 'NEEDS_REVIEW';
        const unavailable = executionState === 'CONTEXT_UNAVAILABLE';
        const maskedBody =
          !canReadBody && entry ? maskOutcomeBody(thread.key, entry) : {};
        if (!canReadBody) runtime.saves.delete(keyId(thread.key));
        const snapshot = runtime.outcomeBodies.get(keyId(thread.key));
        if (
          snapshot &&
          (snapshot.revision !== thread.revision ||
            executionState === 'CONTEXT_UNAVAILABLE')
        )
          runtime.outcomeBodies.delete(keyId(thread.key));
        thread = { ...thread, body: canReadBody ? thread.body : null };
        keysRef.current.set(keyId(thread.key), thread.key);
        const registeredKeys = store.get(myahInboxDraftAutosaveKeysState);
        if (!registeredKeys.some((key) => keyId(key) === keyId(thread.key)))
          store.set(myahInboxDraftAutosaveKeysState, [
            ...registeredKeys,
            thread.key,
          ]);

        if (!entry) {
          store.set(atom, {
            executionState,
            input: thread.input,
            contextFingerprint: thread.contextFingerprint ?? null,
            operation: null,
            editorOwner: null,
            localBody: thread.body ?? EMPTY_DRAFT,
            confirmedBody: thread.body,
            confirmedRevision: thread.revision,
            dirty: false,
            status: 'idle',
            error: null,
            conflict: null,
            editorVersion: 0,
            debounceVersion: 0,
            pendingDebounceVersion: null,
          });

          return;
        }

        store.set(atom, {
          ...entry,
          executionState,
          input: thread.input ?? entry.input,
          contextFingerprint:
            thread.contextFingerprint ?? entry.contextFingerprint,
          ...maskedBody,
          ...(unavailable
            ? {
                dirty: false,
                pendingDebounceVersion: null,
                proposalContextFingerprint: null,
                status: 'idle' as const,
                error: null,
                conflict: null,
              }
            : {}),
        });
        if (!canReadBody) return;
        if (
          entry.dirty ||
          entry.status === 'saving' ||
          entry.status === 'error' ||
          entry.status === 'conflict' ||
          thread.revision < entry.confirmedRevision
        ) {
          return;
        }

        const nextLocalBody = thread.body ?? EMPTY_DRAFT;
        const editorVersion = areRichTextEqual(entry.localBody, nextLocalBody)
          ? entry.editorVersion
          : entry.editorVersion + 1;
        const confirmedBodyChanged =
          entry.confirmedBody === null
            ? thread.body !== null
            : thread.body === null ||
              !areRichTextEqual(entry.confirmedBody, thread.body);

        store.set(atom, {
          ...entry,
          executionState,
          input: thread.input ?? entry.input,
          contextFingerprint:
            thread.contextFingerprint ?? entry.contextFingerprint,
          localBody: nextLocalBody,
          confirmedBody: thread.body,
          confirmedRevision: thread.revision,
          editorVersion,
          status:
            entry.status === 'saved' &&
            entry.confirmedRevision === thread.revision &&
            !confirmedBodyChanged
              ? 'saved'
              : 'idle',
        });
      },
      [maskOutcomeBody, runtime, store],
    );

    const beginTargetRead = useCallback(
      (
        key: MyahInboxDraftAutosaveKey,
        isContextCurrent: () => boolean,
        refreshAfterSave?: MyahInboxDraftTargetCapture['refreshAfterSave'],
      ) => {
        cancelTimer(key);
        runtime.outcomeBodies.delete(keyId(key));
        const capture = {
          key,
          token: Symbol('draft authorization'),
          isContextCurrent,
          refreshAfterSave,
        };
        targetsRef.current.set(keyId(key), { capture, authorized: false });
        ownedTargetsRef.current.add(capture);
        keysRef.current.set(keyId(key), key);
        return capture;
      },
      [cancelTimer, runtime],
    );

    const invalidateTarget = useCallback(
      (capture: MyahInboxDraftTargetCapture) => {
        ownedTargetsRef.current.delete(capture);
        if (
          targetsRef.current.get(keyId(capture.key))?.capture.token !==
          capture.token
        )
          return;
        runtime.outcomeBodies.delete(keyId(capture.key));
        targetsRef.current.delete(keyId(capture.key));
        cancelTimer(capture.key);
      },
      [cancelTimer, runtime],
    );

    const invalidateWorkspace = useCallback(
      (workspaceId: string) => {
        keysRef.current.forEach((key, id) => {
          if (key.workspaceId === workspaceId)
            runtime.forcedRecoveryKeys.add(id);
        });
        targetsRef.current.forEach(({ capture }) => {
          if (capture.key.workspaceId === workspaceId)
            invalidateTarget(capture);
        });
      },
      [invalidateTarget, runtime],
    );

    const authorizeTarget = useCallback(
      (
        capture: MyahInboxDraftTargetCapture,
        thread: MyahInboxDraftAutosaveThread,
      ) => {
        const target = targetsRef.current.get(keyId(capture.key));
        if (
          target?.capture.token !== capture.token ||
          keyId(thread.key) !== keyId(capture.key) ||
          store.get(currentWorkspaceState.atom)?.id !==
            capture.key.workspaceId ||
          !capture.isContextCurrent()
        )
          return false;
        target.authorized = true;
        runtime.forcedRecoveryKeys.delete(keyId(capture.key));
        const snapshot = runtime.outcomeBodies.get(keyId(capture.key));
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(capture.key);
        const currentEntry = store.get(atom);
        const executionState =
          thread.executionState ?? currentEntry?.executionState ?? 'READY';
        const readable =
          executionState === 'READY' || executionState === 'NEEDS_REVIEW';
        const outcomeLocked =
          currentEntry?.operation?.kind === 'pending' ||
          currentEntry?.operation?.kind === 'unknown';
        const recoveringOutcome =
          outcomeLocked ||
          currentEntry?.executionState === 'OUTCOME_PENDING' ||
          currentEntry?.executionState === 'OUTCOME_UNKNOWN' ||
          currentEntry?.executionState === 'CONTEXT_UNAVAILABLE';
        const save = runtime.saves.get(keyId(capture.key));
        // A fresh authorized NEEDS_REVIEW read is authoritative: it supersedes
        // any local dirty/saving/error/conflict state, which otherwise deadlocks
        // Review (rejected) against Retry/Reload conflict (rejected while not
        // READY). A same-base in-flight save is retired by the same rule.
        const authoritativeReview = executionState === 'NEEDS_REVIEW';
        const sameSaveBase =
          readable &&
          !recoveringOutcome &&
          !authoritativeReview &&
          currentEntry?.confirmedRevision === thread.revision &&
          (currentEntry.contextFingerprint ?? null) ===
            (thread.contextFingerprint ?? null) &&
          areRichTextEqual(
            currentEntry.confirmedBody ?? EMPTY_DRAFT,
            thread.body ?? EMPTY_DRAFT,
          );
        if (save) {
          // A remount can inherit a detached save only on the unchanged server
          // base. A recovery/new revision must retire it before reconciliation.
          if (sameSaveBase) {
            save.targetToken = capture.token;
            target.refreshing = save.refreshing;
          } else runtime.saves.delete(keyId(capture.key));
        }
        const supersededSave =
          currentEntry?.status === 'saving' && !sameSaveBase;
        if (
          readable &&
          currentEntry &&
          (recoveringOutcome || supersededSave || authoritativeReview)
        ) {
          // Only this current authorized recovery read supersedes an outcome lock.
          // Post-save metadata reads use reconcile and cannot unlock a newer send.
          // A valid same-capability snapshot still restores the user's unsaved
          // bytes; only stale local status bookkeeping is discarded here.
          const restoreLocalBody =
            snapshot?.dirty === true &&
            snapshot.targetToken === capture.token &&
            snapshot.revision === thread.revision &&
            currentEntry.confirmedRevision === thread.revision;
          const localBody = restoreLocalBody
            ? snapshot.localBody
            : (thread.body ?? EMPTY_DRAFT);
          cancelTimer(capture.key);
          store.set(atom, {
            ...currentEntry,
            localBody,
            confirmedBody: thread.body,
            confirmedRevision: thread.revision,
            operation: outcomeLocked ? null : currentEntry.operation,
            dirty: restoreLocalBody,
            pendingDebounceVersion: restoreLocalBody
              ? currentEntry.pendingDebounceVersion
              : null,
            proposalContextFingerprint: restoreLocalBody
              ? currentEntry.proposalContextFingerprint
              : null,
            status: 'idle',
            error: null,
            conflict: null,
            editorVersion: areRichTextEqual(currentEntry.localBody, localBody)
              ? currentEntry.editorVersion
              : currentEntry.editorVersion + 1,
          });
        }
        if (
          snapshot &&
          (readable ||
            thread.executionState === 'CONTEXT_UNAVAILABLE' ||
            snapshot.targetToken !== capture.token ||
            snapshot.revision !== thread.revision)
        )
          runtime.outcomeBodies.delete(keyId(capture.key));
        reconcile(thread);
        const entry = store.get(
          myahInboxDraftAutosaveFamilyState.atomFamily(capture.key),
        );
        if (
          (entry?.executionState === 'READY' ||
            entry?.executionState === 'NEEDS_REVIEW') &&
          entry.dirty &&
          entry.status !== 'error' &&
          entry.status !== 'conflict'
        ) {
          // Re-arm the interrupted trailing debounce; no new keystroke is needed.
          cancelTimer(capture.key);
          timersRef.current.set(
            keyId(capture.key),
            setTimeout(() => {
              clearPendingDebounce(capture.key);
              void start(capture.key);
            }, DEBOUNCE_MS),
          );
        }
        return true;
      },
      [cancelTimer, clearPendingDebounce, reconcile, runtime, start, store],
    );

    const updateDraft = useCallback(
      ({ key, body, editorOwner }: UpdateDraftParams) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (
          !entry ||
          !isTargetAuthorized(key) ||
          (entry.executionState != null && entry.executionState !== 'READY') ||
          entry.operation ||
          (entry.editorOwner && entry.editorOwner !== editorOwner)
        ) {
          return;
        }

        cancelTimer(key);

        if (entry.status === 'conflict') {
          store.set(atom, { ...entry, localBody: body });

          return;
        }

        const isSaving = entry.status === 'saving';
        const pendingDebounceVersion = entry.debounceVersion + 1;

        store.set(atom, {
          ...entry,
          localBody: body,
          proposalContextFingerprint: null,
          dirty: true,
          status: isSaving ? 'saving' : 'idle',
          error: null,
          conflict: null,
          debounceVersion: pendingDebounceVersion,
          pendingDebounceVersion,
        });
        const id = keyId(key);
        timersRef.current.set(
          id,
          setTimeout(() => {
            timersRef.current.delete(id);
            const currentEntry = store.get(atom);

            if (
              !currentEntry ||
              currentEntry.pendingDebounceVersion !== pendingDebounceVersion
            ) {
              return;
            }

            store.set(atom, {
              ...currentEntry,
              pendingDebounceVersion: null,
            });
            void start(key);
          }, DEBOUNCE_MS),
        );
      },
      [cancelTimer, start, isTargetAuthorized, store],
    );

    const retry = useCallback(
      async (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (
          !entry ||
          !isTargetAuthorized(key) ||
          (entry.executionState != null && entry.executionState !== 'READY') ||
          entry.operation ||
          entry.status !== 'error'
        ) {
          return;
        }

        store.set(atom, {
          ...entry,
          dirty: true,
          status: 'idle',
          error: null,
        });

        await flush(key);
      },
      [flush, isTargetAuthorized, store],
    );

    const reloadConflict = useCallback(
      async (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (
          !entry ||
          !isTargetAuthorized(key) ||
          (entry.executionState != null && entry.executionState !== 'READY') ||
          entry.operation ||
          entry.status !== 'conflict' ||
          !entry.conflict
        ) {
          return;
        }

        const target = targetsRef.current.get(keyId(key));
        const capture = target?.capture;
        const reread = capture?.refreshAfterSave;
        const conflict = entry.conflict;
        if (!target || !capture || !reread) {
          // A conflict result carries no execution metadata, so its bytes alone
          // cannot prove the review state. Without an exact current-capability
          // reread the entry stays conflicted instead of becoming actionable.
          return;
        }

        // Gate every action and local edit until the exact reread lands.
        const token = Symbol('conflict metadata reread');
        store.set(atom, { ...entry, operation: { token, kind: 'reviewing' } });
        target.refreshing = true;
        try {
          const thread = await reread(conflict.revision);
          const current = store.get(atom);
          const stillOwned =
            targetsRef.current.get(keyId(key))?.capture.token === capture.token;
          if (
            !thread ||
            !current ||
            keyId(thread.key) !== keyId(key) ||
            thread.revision !== conflict.revision
          ) {
            // A superseded capability already reauthorized this key: leave that
            // newer scope alone instead of invalidating it.
            if (stillOwned) invalidateTarget(capture);
            return;
          }
          cancelTimer(key);
          store.set(atom, {
            ...current,
            operation: null,
            conflict: null,
            error: null,
            dirty: false,
            pendingDebounceVersion: null,
            proposalContextFingerprint: null,
            status: 'idle',
          });
          reconcile(thread);
        } finally {
          target.refreshing = false;
          const current = store.get(atom);
          if (current?.operation?.token === token)
            store.set(atom, { ...current, operation: null });
        }
      },
      [cancelTimer, invalidateTarget, isTargetAuthorized, reconcile, store],
    );

    const getEntry = useCallback(
      (key: MyahInboxDraftAutosaveKey) =>
        store.get(myahInboxDraftAutosaveFamilyState.atomFamily(key)),
      [store],
    );

    const claimEditor = useCallback(
      (key: MyahInboxDraftAutosaveKey, owner: symbol) => {
        if (store.get(currentWorkspaceState.atom)?.id !== key.workspaceId)
          return false;
        if (!getEntry(key)) reconcile({ key, revision: 0, body: null });
        const entry = getEntry(key);
        if (!entry || (entry.editorOwner && entry.editorOwner !== owner))
          return false;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(key), {
          ...entry,
          editorOwner: owner,
        });
        return true;
      },
      [getEntry, reconcile, store],
    );

    const releaseEditor = useCallback(
      (key: MyahInboxDraftAutosaveKey, owner: symbol) => {
        const entry = getEntry(key);
        if (!entry || entry.editorOwner !== owner) return false;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(key), {
          ...entry,
          editorOwner: null,
        });
        return true;
      },
      [getEntry, store],
    );

    const acquire = useCallback(
      (
        key: MyahInboxDraftAutosaveKey,
        kind: 'generating' | 'sending' | 'reviewing',
        editorOwner?: symbol,
      ) => {
        const entry = getEntry(key);
        const target = targetsRef.current.get(keyId(key));
        if (
          !entry ||
          !target ||
          target.refreshing === true ||
          !isTargetAuthorized(key) ||
          (kind === 'reviewing'
            ? entry.executionState !== 'NEEDS_REVIEW'
            : entry.executionState != null &&
              entry.executionState !== 'READY') ||
          (entry.editorOwner && entry.editorOwner !== editorOwner) ||
          entry.operation ||
          entry.status === 'error' ||
          entry.status === 'conflict' ||
          (kind !== 'sending' && entry.status === 'saving') ||
          (kind === 'generating' && entry.dirty)
        )
          return null;
        const capture = {
          key,
          token: Symbol('draft operation'),
          targetToken: target.capture.token,
          editorOwner: entry.editorOwner,
          confirmedRevision: entry.confirmedRevision,
          contextFingerprint: entry.contextFingerprint ?? null,
          debounceVersion: entry.debounceVersion,
          editorVersion: entry.editorVersion,
        };
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(key), {
          ...entry,
          operation: { token: capture.token, kind },
        });
        return capture;
      },
      [getEntry, isTargetAuthorized, store],
    );

    const isOperationCurrent = useCallback(
      (capture: MyahInboxDraftOperationCapture) =>
        getEntry(capture.key)?.operation?.token === capture.token &&
        getEntry(capture.key)?.editorOwner === capture.editorOwner &&
        isTargetAuthorized(capture.key) &&
        targetsRef.current.get(keyId(capture.key))?.capture.token ===
          capture.targetToken,
      [getEntry, isTargetAuthorized],
    );

    const release = useCallback(
      (capture: MyahInboxDraftOperationCapture) => {
        const entry = getEntry(capture.key);
        if (
          entry?.operation?.token !== capture.token ||
          entry.operation.kind === 'pending' ||
          entry.operation.kind === 'unknown'
        )
          return;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(capture.key), {
          ...entry,
          operation: null,
        });
      },
      [getEntry, store],
    );

    const setOutcomeLock = useCallback(
      (
        capture: MyahInboxDraftOperationCapture,
        kind: 'pending' | 'unknown',
      ) => {
        const entry = getEntry(capture.key);
        if (entry?.operation?.token !== capture.token) return;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(capture.key), {
          ...entry,
          ...maskOutcomeBody(capture.key, entry),
          executionState:
            kind === 'pending' ? 'OUTCOME_PENDING' : 'OUTCOME_UNKNOWN',
          operation: { token: capture.token, kind },
        });
      },
      [getEntry, maskOutcomeBody, store],
    );

    const setReadinessLock = useCallback(
      (key: MyahInboxDraftAutosaveKey, kind: 'pending' | 'unknown') => {
        const entry = getEntry(key);
        if (!entry || entry.operation || !isTargetAuthorized(key)) return;
        cancelTimer(key);
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(key), {
          ...entry,
          ...maskOutcomeBody(key, entry),
          executionState:
            kind === 'pending' ? 'OUTCOME_PENDING' : 'OUTCOME_UNKNOWN',
          operation: { token: Symbol('server send outcome'), kind },
        });
      },
      [cancelTimer, getEntry, isTargetAuthorized, maskOutcomeBody, store],
    );

    const reconcileOperation = useCallback(
      (
        capture: MyahInboxDraftOperationCapture,
        thread: MyahInboxDraftAutosaveThread,
      ) => {
        if (
          keyId(thread.key) !== keyId(capture.key) ||
          !isOperationCurrent(capture)
        )
          return;
        reconcile(thread);
      },
      [isOperationCurrent, reconcile],
    );

    const applyProposalIfCurrent = useCallback(
      async (
        capture: MyahInboxDraftOperationCapture,
        body: MyahInboxRichText,
      ) => {
        const entry = getEntry(capture.key);
        if (
          !entry ||
          !isOperationCurrent(capture) ||
          entry.operation?.kind !== 'generating' ||
          entry.dirty ||
          entry.status === 'saving' ||
          entry.status === 'error' ||
          entry.status === 'conflict' ||
          entry.confirmedRevision !== capture.confirmedRevision ||
          entry.debounceVersion !== capture.debounceVersion ||
          entry.editorVersion !== capture.editorVersion
        )
          return false;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(capture.key), {
          ...entry,
          operation: { token: capture.token, kind: 'applying' },
          localBody: body,
          proposalContextFingerprint: capture.contextFingerprint,
          dirty: true,
          status: 'idle',
          editorVersion: entry.editorVersion + 1,
        });
        const saved = await flush(capture.key);
        return (
          isOperationCurrent(capture) &&
          saved.status === 'saved' &&
          !saved.dirty
        );
      },
      [flush, getEntry, isOperationCurrent, store],
    );

    const applyProposal = useCallback(
      async ({ key, body, editorOwner }: UpdateDraftParams) => {
        await flush(key);

        const capture = acquire(key, 'generating', editorOwner);
        if (!capture) return false;
        try {
          return await applyProposalIfCurrent(capture, body);
        } finally {
          release(capture);
        }
      },
      [acquire, applyProposalIfCurrent, flush, release],
    );

    const flushKeys = useCallback(
      async (keys: MyahInboxDraftAutosaveKey[]) => {
        const uniqueKeys = [
          ...new Map(keys.map((key) => [keyId(key), key])).values(),
        ];
        const flushIfDirty = async (key: MyahInboxDraftAutosaveKey) => {
          const entry = getEntry(key);
          if (
            !entry ||
            entry.operation ||
            entry.status === 'error' ||
            entry.status === 'conflict'
          )
            return;
          // A closed, clean editor has no work and needs no read capability.
          if (entry.dirty || entry.status === 'saving') await flush(key);
        };
        while (true) {
          const results = await Promise.allSettled(
            uniqueKeys.map((key) => flushIfDirty(key)),
          );
          if (results.some((result) => result.status === 'rejected'))
            return false;
          const entries = uniqueKeys.map((key) => ({
            key,
            entry: getEntry(key),
          }));
          if (
            entries.some(
              ({ key, entry }) =>
                entry !== null &&
                (entry.operation !== null ||
                  entry.status === 'error' ||
                  entry.status === 'conflict' ||
                  ((entry.dirty || entry.status === 'saving') &&
                    (!isTargetAuthorized(key) ||
                      (entry.executionState != null &&
                        entry.executionState !== 'READY')))),
            )
          )
            return false;
          if (
            entries.every(
              ({ entry }) =>
                !entry || (!entry.dirty && entry.status !== 'saving'),
            )
          )
            return true;
          // Another key may have changed while the slowest save was in flight.
        }
      },
      [flush, getEntry, isTargetAuthorized],
    );

    const flushWorkspace = useCallback(
      (workspaceId: string) =>
        flushKeys(
          [...keysRef.current.values()].filter(
            (key) => key.workspaceId === workspaceId,
          ),
        ),
      [flushKeys],
    );

    const flushWorkspaceForNavigation = useCallback(
      (workspaceId: string, activeThreadIds: string[]) =>
        flushKeys(
          [...keysRef.current.values()].filter((key) => {
            if (key.workspaceId !== workspaceId) return false;
            const entry = getEntry(key);
            // Forced recovery stays paused and intact until its editor can reopen.
            // Never exempt outgoing targets, live editors, saves or operations.
            return (
              !runtime.forcedRecoveryKeys.has(keyId(key)) ||
              activeThreadIds.includes(key.deliveryTargetId) ||
              Boolean(entry?.editorOwner || entry?.operation) ||
              entry?.status === 'saving' ||
              isTargetAuthorized(key)
            );
          }),
        ),
      [flushKeys, getEntry, isTargetAuthorized, runtime],
    );

    useEffect(() => {
      const ownedTargets = ownedTargetsRef.current;
      return () => {
        ownedTargets.forEach(invalidateTarget);
        ownedTargets.clear();
      };
    }, [invalidateTarget]);

    return useMemo(
      () => ({
        reconcile,
        getEntry,
        claimEditor,
        releaseEditor,
        acquire,
        release,
        isOperationCurrent,
        setOutcomeLock,
        setReadinessLock,
        reconcileOperation,
        applyProposalIfCurrent,
        updateDraft,
        flush,
        retry,
        reloadConflict,
        applyProposal,
        flushWorkspace,
        flushWorkspaceForNavigation,
        flushKeys,
        beginTargetRead,
        authorizeTarget,
        invalidateTarget,
        invalidateWorkspace,
        isTargetAuthorized,
      }),
      [
        reconcile,
        getEntry,
        claimEditor,
        releaseEditor,
        acquire,
        release,
        isOperationCurrent,
        setOutcomeLock,
        setReadinessLock,
        reconcileOperation,
        applyProposalIfCurrent,
        updateDraft,
        flush,
        retry,
        reloadConflict,
        applyProposal,
        flushWorkspace,
        flushWorkspaceForNavigation,
        flushKeys,
        beginTargetRead,
        authorizeTarget,
        invalidateTarget,
        invalidateWorkspace,
        isTargetAuthorized,
      ],
    );
  };

const MyahInboxDraftAutosaveContext =
  createContext<MyahInboxDraftAutosaveController | null>(null);

export const MyahInboxDraftAutosaveProvider = ({
  children,
  controller,
}: {
  children: ReactNode;
  controller: MyahInboxDraftAutosaveController;
}) => (
  <MyahInboxDraftAutosaveContext.Provider value={controller}>
    {children}
  </MyahInboxDraftAutosaveContext.Provider>
);

export const useMyahInboxDraftAutosaveControllerContext = () => {
  const controller = useContext(MyahInboxDraftAutosaveContext);

  if (!controller) {
    throw new Error('Myah Inbox draft autosave provider is required');
  }

  return controller;
};
