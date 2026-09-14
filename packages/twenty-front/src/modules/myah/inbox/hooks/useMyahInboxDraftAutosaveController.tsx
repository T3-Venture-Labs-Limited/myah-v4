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
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
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

const keyId = (key: MyahInboxDraftAutosaveKey) =>
  JSON.stringify([key.workspaceId, key.threadId]);

type UpdateDraftParams = {
  key: MyahInboxDraftAutosaveKey;
  body: MyahInboxRichText;
  editorOwner?: symbol;
};

export type MyahInboxDraftTargetCapture = {
  key: MyahInboxDraftAutosaveKey;
  token: symbol;
  isContextCurrent: () => boolean;
};

// Runtime handles share the same lifetime as the Jotai draft store, not a Page mount.
const runtimes = new WeakMap<
  ReturnType<typeof useStore>,
  {
    timers: Map<string, ReturnType<typeof setTimeout>>;
    runs: Map<string, Promise<void>>;
    keys: Map<string, MyahInboxDraftAutosaveKey>;
    forcedRecoveryKeys: Set<string>;
    targets: Map<
      string,
      { capture: MyahInboxDraftTargetCapture; authorized: boolean }
    >;
  }
>();

const getRuntime = (store: ReturnType<typeof useStore>) => {
  let runtime = runtimes.get(store);
  if (!runtime) {
    runtime = {
      timers: new Map(),
      runs: new Map(),
      keys: new Map(),
      forcedRecoveryKeys: new Set(),
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
    kind: 'generating' | 'sending',
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
  reloadConflict: (key: MyahInboxDraftAutosaveKey) => void;
  applyProposal: (params: UpdateDraftParams) => Promise<boolean>;
  beginTargetRead: (
    key: MyahInboxDraftAutosaveKey,
    isContextCurrent: () => boolean,
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
          entry.operation?.kind === 'pending' ||
          entry.operation?.kind === 'unknown' ||
          entry.operation?.kind === 'generating' ||
          entry.status === 'error' ||
          entry.status === 'conflict' ||
          entry.status === 'saving' ||
          entry.pendingDebounceVersion !== null
        ) {
          return;
        }

        cancelTimer(key);
        const submittedBody = entry.localBody;
        const expectedRevision = entry.confirmedRevision;
        store.set(atom, {
          ...entry,
          dirty: false,
          status: 'saving',
          error: null,
          conflict: null,
        });

        try {
          const result = await saveDraftRef.current({
            expectedWorkspaceId: key.workspaceId,
            threadId: key.threadId,
            expectedRevision,
            body: submittedBody,
          });

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
          const hasNewerLocalBody = !areRichTextEqual(
            currentEntry.localBody,
            submittedBody,
          );
          store.set(atom, {
            ...currentEntry,
            confirmedRevision: result.revision,
            confirmedBody: savedBody,
            dirty: hasNewerLocalBody,
            status: hasNewerLocalBody ? 'idle' : 'saved',
            error: null,
            conflict: null,
          });
          if (!hasNewerLocalBody) {
            clearPendingDebounce(key);
            cancelTimer(key);

            return;
          }
        } catch {
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
            current.status === 'error' ||
            current.status === 'conflict' ||
            ['generating', 'pending', 'unknown'].includes(
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

    const reconcile = useCallback(
      (thread: MyahInboxDraftAutosaveThread) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(thread.key);
        const entry = store.get(atom);
        keysRef.current.set(keyId(thread.key), thread.key);

        if (!entry) {
          store.set(atom, {
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
      [store],
    );

    const beginTargetRead = useCallback(
      (key: MyahInboxDraftAutosaveKey, isContextCurrent: () => boolean) => {
        cancelTimer(key);
        const capture = {
          key,
          token: Symbol('draft authorization'),
          isContextCurrent,
        };
        targetsRef.current.set(keyId(key), { capture, authorized: false });
        ownedTargetsRef.current.add(capture);
        keysRef.current.set(keyId(key), key);
        return capture;
      },
      [cancelTimer],
    );

    const invalidateTarget = useCallback(
      (capture: MyahInboxDraftTargetCapture) => {
        ownedTargetsRef.current.delete(capture);
        if (
          targetsRef.current.get(keyId(capture.key))?.capture.token !==
          capture.token
        )
          return;
        targetsRef.current.delete(keyId(capture.key));
        cancelTimer(capture.key);
      },
      [cancelTimer],
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
        reconcile(thread);
        const entry = store.get(
          myahInboxDraftAutosaveFamilyState.atomFamily(capture.key),
        );
        if (
          entry?.dirty &&
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
      (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (
          !entry ||
          !isTargetAuthorized(key) ||
          entry.operation ||
          entry.status !== 'conflict' ||
          !entry.conflict
        ) {
          return;
        }

        cancelTimer(key);
        store.set(atom, {
          ...entry,
          localBody: entry.conflict.body ?? EMPTY_DRAFT,
          confirmedBody: entry.conflict.body,
          confirmedRevision: entry.conflict.revision,
          dirty: false,
          status: 'saved',
          error: null,
          conflict: null,
          editorVersion: entry.editorVersion + 1,
        });
      },
      [cancelTimer, isTargetAuthorized, store],
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
        kind: 'generating' | 'sending',
        editorOwner?: symbol,
      ) => {
        const entry = getEntry(key);
        const target = targetsRef.current.get(keyId(key));
        if (
          !entry ||
          !target ||
          !isTargetAuthorized(key) ||
          (entry.editorOwner && entry.editorOwner !== editorOwner) ||
          entry.operation ||
          entry.status === 'error' ||
          entry.status === 'conflict' ||
          (kind === 'generating' && (entry.dirty || entry.status === 'saving'))
        )
          return null;
        const capture = {
          key,
          token: Symbol('draft operation'),
          targetToken: target.capture.token,
          editorOwner: entry.editorOwner,
          confirmedRevision: entry.confirmedRevision,
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
          operation: { token: capture.token, kind },
        });
      },
      [getEntry, store],
    );

    const setReadinessLock = useCallback(
      (key: MyahInboxDraftAutosaveKey, kind: 'pending' | 'unknown') => {
        const entry = getEntry(key);
        if (!entry || entry.operation || !isTargetAuthorized(key)) return;
        cancelTimer(key);
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(key), {
          ...entry,
          operation: { token: Symbol('server send outcome'), kind },
        });
      },
      [cancelTimer, getEntry, isTargetAuthorized, store],
    );

    const reconcileOperation = useCallback(
      (
        capture: MyahInboxDraftOperationCapture,
        thread: MyahInboxDraftAutosaveThread,
      ) => {
        if (
          keyId(thread.key) !== keyId(capture.key) ||
          getEntry(capture.key)?.operation?.token !== capture.token
        )
          return;
        // A receipt may update only its old key after navigation; it is not a new edit capability.
        reconcile(thread);
      },
      [getEntry, reconcile],
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
        while (true) {
          const results = await Promise.allSettled(
            uniqueKeys.map(async (key) => {
              const entry = getEntry(key);
              if (!entry) return;
              if (
                entry.operation ||
                entry.status === 'error' ||
                entry.status === 'conflict'
              )
                return;
              // A closed, clean editor has no work and needs no read capability.
              if (entry.dirty || entry.status === 'saving') await flush(key);
            }),
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
                    !isTargetAuthorized(key))),
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
              activeThreadIds.includes(key.threadId) ||
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
