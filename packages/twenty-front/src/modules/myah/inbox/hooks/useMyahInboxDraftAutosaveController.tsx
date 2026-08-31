import { useStore } from 'jotai';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveKey,
  type MyahInboxDraftAutosaveThread,
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

const keyId = (key: MyahInboxDraftAutosaveKey) => JSON.stringify(key);

type UpdateDraftParams = {
  key: MyahInboxDraftAutosaveKey;
  body: MyahInboxRichText;
};

type ProcessDraft = (key: MyahInboxDraftAutosaveKey) => Promise<void>;

export type MyahInboxDraftAutosaveController = {
  reconcile: (thread: MyahInboxDraftAutosaveThread) => void;
  updateDraft: (params: UpdateDraftParams) => void;
  flush: (
    key: MyahInboxDraftAutosaveKey,
  ) => Promise<MyahInboxDraftAutosaveEntry>;
  retry: (key: MyahInboxDraftAutosaveKey) => Promise<void>;
  reloadConflict: (key: MyahInboxDraftAutosaveKey) => void;
  applyProposal: (params: UpdateDraftParams) => Promise<boolean>;
  flushWorkspace: (workspaceId: string) => void;
};

export const useMyahInboxDraftAutosaveController =
  (): MyahInboxDraftAutosaveController => {
    const store = useStore();
    const { saveDraft } = useMyahInboxThreadMutations();
    // Autosave retains callback and scheduler handles outside render state.
    // oxlint-disable-next-line twenty/no-state-useref
    const saveDraftRef = useRef(saveDraft);
    // oxlint-disable-next-line twenty/no-state-useref
    const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    // oxlint-disable-next-line twenty/no-state-useref
    const runsRef = useRef(new Map<string, Promise<void>>());
    // oxlint-disable-next-line twenty/no-state-useref
    const keysRef = useRef(new Map<string, MyahInboxDraftAutosaveKey>());
    // oxlint-disable-next-line twenty/no-state-useref
    const processRef = useRef<ProcessDraft>(undefined);

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

        const entry = store.get(atom);

        if (!entry) {
          throw new Error('Expected autosave draft entry after flush');
        }

        return entry;
      },
      [cancelTimer, clearPendingDebounce, start, store],
    );

    const reconcile = useCallback(
      (thread: MyahInboxDraftAutosaveThread) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(thread.key);
        const entry = store.get(atom);
        keysRef.current.set(keyId(thread.key), thread.key);

        if (!entry) {
          store.set(atom, {
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

    const updateDraft = useCallback(
      ({ key, body }: UpdateDraftParams) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (!entry) {
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
            void flush(key);
          }, DEBOUNCE_MS),
        );
      },
      [cancelTimer, flush, store],
    );

    const retry = useCallback(
      async (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (!entry || entry.status !== 'error') {
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
      [flush, store],
    );

    const reloadConflict = useCallback(
      (key: MyahInboxDraftAutosaveKey) => {
        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (!entry || entry.status !== 'conflict' || !entry.conflict) {
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
      [cancelTimer, store],
    );

    const applyProposal = useCallback(
      async ({ key, body }: UpdateDraftParams) => {
        await flush(key);

        const atom = myahInboxDraftAutosaveFamilyState.atomFamily(key);
        const entry = store.get(atom);

        if (!entry || entry.status === 'error' || entry.status === 'conflict') {
          return false;
        }

        store.set(atom, {
          ...entry,
          localBody: body,
          dirty: true,
          status: 'idle',
          error: null,
          conflict: null,
          editorVersion: areRichTextEqual(entry.localBody, body)
            ? entry.editorVersion
            : entry.editorVersion + 1,
        });
        await flush(key);

        return store.get(atom)?.status === 'saved';
      },
      [flush, store],
    );

    const flushWorkspace = useCallback(
      (workspaceId: string) => {
        keysRef.current.forEach((key) => {
          if (key.workspaceId === workspaceId) {
            cancelTimer(key);
            void flush(key);
          }
        });
      },
      [cancelTimer, flush],
    );

    useEffect(() => {
      const timers = timersRef.current;
      const runs = runsRef.current;
      const keys = keysRef.current;

      return () => {
        timers.forEach(clearTimeout);
        timers.clear();
        runs.clear();
        keys.clear();
      };
    }, []);

    return {
      reconcile,
      updateDraft,
      flush,
      retry,
      reloadConflict,
      applyProposal,
      flushWorkspace,
    };
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
