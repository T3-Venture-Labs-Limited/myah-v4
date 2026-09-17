import {
  draftKeyFixture,
  draftInputFixture,
} from '@/myah/inbox/hooks/__tests__/fixtures/myahInboxDraftAutosaveTestFixture';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { StrictMode, useEffect, type PropsWithChildren } from 'react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  type MyahInboxDraftAutosaveController,
  type MyahInboxDraftTargetCapture,
  useMyahInboxDraftAutosaveController,
} from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
  type MyahInboxDraftAutosaveKey,
  type MyahInboxDraftAutosaveThread,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: jest.fn(),
}));

const mockUseMyahInboxThreadMutations = jest.mocked(
  useMyahInboxThreadMutations,
);

const threadKey = draftKeyFixture('workspace-1', 'thread-1');

type DraftSaveResult = {
  status: 'SAVED';
  revision: number;
  body: { markdown: string; blocknote: null };
};

const createDeferred = <Value,>() => {
  let resolve: (value: Value) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve: resolve! };
};

const reconcileThread = (): MyahInboxDraftAutosaveThread => ({
  key: threadKey,
  input: draftInputFixture(threadKey),
  revision: 2,
  body: { markdown: '', blocknote: null },
});

const renderAutosaveController = () => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: threadKey.workspaceId } as never);

  return {
    ...renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    }),
    store,
  };
};

const authorize = (
  controller: MyahInboxDraftAutosaveController,
  thread = reconcileThread(),
  refreshAfterSave?: MyahInboxDraftTargetCapture['refreshAfterSave'],
) => {
  const capture = controller.beginTargetRead(
    thread.key,
    () => true,
    refreshAfterSave,
  );
  controller.authorizeTarget(capture, {
    ...thread,
    input: draftInputFixture(thread.key),
  });
  return capture;
};

const readEntry = (
  store: ReturnType<typeof createStore>,
  key: MyahInboxDraftAutosaveKey,
) => store.get(myahInboxDraftAutosaveFamilyState.atomFamily(key));

describe('useMyahInboxDraftAutosaveController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(['SAVED', 'CONFLICT', 'rejection'] as const)(
    'revoked %s completion with a newer edit',
    (completion) => {
      it.each(['timer', 'flush'] as const)(
        'continues the authorized READY edit after its %s expires before settlement',
        async (trigger) => {
          const deferred = createDeferred<{
            status: string;
            revision: number;
            body: null;
          }>();
          const saveDraft = jest
            .fn()
            .mockReturnValueOnce(
              deferred.promise.then((value) => {
                if (completion === 'rejection')
                  throw new Error('revoked failure');
                return value;
              }),
            )
            .mockResolvedValueOnce({
              status: 'SAVED',
              revision: 8,
              body: { markdown: 'new edit', blocknote: null },
            });
          mockUseMyahInboxThreadMutations.mockReturnValue({
            saveDraft,
          } as never);
          const { result } = renderAutosaveController();
          const controller = result.current;
          authorize(controller);
          controller.updateDraft({
            key: threadKey,
            body: { markdown: 'old edit', blocknote: null },
          });
          // Start via debounce, not flush: no outstanding flush loop can rescue the timer.
          await act(async () => jest.advanceTimersByTimeAsync(750));
          authorize(controller, {
            ...reconcileThread(),
            revision: 7,
            executionState: 'READY',
          });
          controller.updateDraft({
            key: threadKey,
            body: { markdown: 'new edit', blocknote: null },
          });
          let flushing: Promise<unknown> | undefined;
          if (trigger === 'flush') flushing = controller.flush(threadKey);
          else await act(async () => jest.advanceTimersByTimeAsync(750));
          expect(saveDraft).toHaveBeenCalledTimes(1);
          await act(async () => {
            deferred.resolve({ status: completion, revision: 3, body: null });
            await deferred.promise;
            await flushing;
          });
          expect(saveDraft).toHaveBeenCalledTimes(2);
          expect(saveDraft).toHaveBeenLastCalledWith(
            expect.objectContaining({
              expectedRevision: 7,
              body: { markdown: 'new edit', blocknote: null },
            }),
          );
          expect(controller.getEntry(threadKey)).toMatchObject({
            confirmedRevision: 8,
            dirty: false,
            status: 'saved',
            error: null,
            conflict: null,
          });
          await act(async () => jest.advanceTimersByTimeAsync(1500));
          expect(saveDraft).toHaveBeenCalledTimes(2);
        },
      );
    },
  );

  it.each(['timer', 'flush'] as const)(
    'serializes a same-base handoff newer edit after %s without another keystroke',
    async (trigger) => {
      const deferred = createDeferred<DraftSaveResult>();
      const saveDraft = jest
        .fn()
        .mockReturnValueOnce(deferred.promise)
        .mockResolvedValueOnce({
          status: 'SAVED',
          revision: 4,
          body: { markdown: 'new edit', blocknote: null },
        });
      mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
      const { result } = renderAutosaveController();
      const controller = result.current;
      const oldTarget = authorize(controller);
      controller.updateDraft({
        key: threadKey,
        body: { markdown: 'first edit', blocknote: null },
      });
      await act(async () => jest.advanceTimersByTimeAsync(750));
      controller.invalidateTarget(oldTarget);
      authorize(controller);
      controller.updateDraft({
        key: threadKey,
        body: { markdown: 'new edit', blocknote: null },
      });
      let flushing: Promise<unknown> | undefined;
      if (trigger === 'flush') flushing = controller.flush(threadKey);
      else await act(async () => jest.advanceTimersByTimeAsync(750));
      expect(saveDraft).toHaveBeenCalledTimes(1);
      await act(async () => {
        deferred.resolve({
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'first edit', blocknote: null },
        });
        await deferred.promise;
        await flushing;
      });
      expect(saveDraft).toHaveBeenCalledTimes(2);
      expect(saveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          expectedRevision: 3,
          body: { markdown: 'new edit', blocknote: null },
        }),
      );
      expect(controller.getEntry(threadKey)).toMatchObject({
        confirmedRevision: 4,
        dirty: false,
        status: 'saved',
      });
    },
  );

  it('transfers a pending metadata refresh lock and rereads through the current same-base owner', async () => {
    const firstRead = createDeferred<MyahInboxDraftAutosaveThread>();
    const secondRead = createDeferred<MyahInboxDraftAutosaveThread>();
    const oldRefresh = jest.fn(() => firstRead.promise);
    const newRefresh = jest.fn(() => secondRead.promise);
    const body = { markdown: 'manual', blocknote: null };
    const saveDraft = jest
      .fn()
      .mockResolvedValue({ status: 'SAVED', revision: 3, body });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result } = renderAutosaveController();
    const controller = result.current;
    const firstTarget = controller.beginTargetRead(
      threadKey,
      () => true,
      oldRefresh,
    );
    controller.authorizeTarget(firstTarget, reconcileThread());
    controller.updateDraft({ key: threadKey, body });
    let saving!: Promise<unknown>;
    await act(async () => {
      saving = controller.flush(threadKey);
    });
    expect(oldRefresh).toHaveBeenCalledTimes(1);
    controller.invalidateTarget(firstTarget);
    const secondTarget = controller.beginTargetRead(
      threadKey,
      () => true,
      newRefresh,
    );
    const committed = { ...reconcileThread(), revision: 3, body };
    controller.authorizeTarget(secondTarget, committed);
    expect(controller.acquire(threadKey, 'sending')).toBeNull();
    await act(async () => {
      firstRead.resolve({ ...committed, executionState: 'READY' });
    });
    expect(newRefresh).toHaveBeenCalledWith(3);
    expect(controller.acquire(threadKey, 'sending')).toBeNull();
    await act(async () => {
      secondRead.resolve({ ...committed, executionState: 'NEEDS_REVIEW' });
      await saving;
    });
    expect(controller.getEntry(threadKey)?.executionState).toBe('NEEDS_REVIEW');
    expect(controller.acquire(threadKey, 'sending')).toBeNull();
    expect(controller.acquire(threadKey, 'generating')).toBeNull();
    expect(controller.acquire(threadKey, 'reviewing')).not.toBeNull();
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  describe.each([
    'readiness-pending',
    'readiness-unknown',
    'outcome-pending',
    'outcome-unknown',
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
    'CONTEXT_UNAVAILABLE',
  ] as const)('%s body-mask transition', (transition) => {
    it.each(['idle', 'error', 'conflict', 'saving'] as const)(
      'clears exposed %s state and invalidates the mounted editor',
      (status) => {
        mockUseMyahInboxThreadMutations.mockReturnValue({
          saveDraft: jest.fn(),
        } as never);
        const { result, store } = renderAutosaveController();
        const controller = result.current;
        authorize(controller, {
          ...reconcileThread(),
          body: { markdown: 'private local', blocknote: null },
        });
        const operation = transition.startsWith('outcome-')
          ? controller.acquire(threadKey, 'sending')!
          : null;
        const entry = controller.getEntry(threadKey)!;
        store.set(myahInboxDraftAutosaveFamilyState.atomFamily(threadKey), {
          ...entry,
          status,
          error: 'private error',
          conflict: {
            revision: 3,
            body: { markdown: 'private conflict', blocknote: 'private blocks' },
          },
        });
        if (
          transition === 'readiness-pending' ||
          transition === 'readiness-unknown'
        )
          controller.setReadinessLock(
            threadKey,
            transition === 'readiness-pending' ? 'pending' : 'unknown',
          );
        else if (
          transition === 'outcome-pending' ||
          transition === 'outcome-unknown'
        )
          controller.setOutcomeLock(
            operation!,
            transition === 'outcome-pending' ? 'pending' : 'unknown',
          );
        else
          controller.reconcile({
            ...reconcileThread(),
            executionState: transition,
            body: { markdown: 'private server', blocknote: null },
          });
        expect(controller.getEntry(threadKey)).toMatchObject({
          localBody: { markdown: '', blocknote: null },
          confirmedBody: null,
          conflict: null,
          error: null,
          status: 'idle',
          editorVersion: entry.editorVersion + 1,
        });
        if (operation)
          expect(controller.getEntry(threadKey)?.operation?.token).toBe(
            operation.token,
          );
      },
    );
  });

  it.each(['pending', 'unknown'] as const)(
    'masks a live %s outcome from both lock setters and keeps duplicate-send locks',
    (kind) => {
      mockUseMyahInboxThreadMutations.mockReturnValue({
        saveDraft: jest.fn(),
      } as never);
      const { result } = renderAutosaveController();
      const controller = result.current;
      for (const setter of ['readiness', 'outcome']) {
        const key = { ...threadKey, deliveryTargetId: setter };
        authorize(controller, {
          key,
          revision: 2,
          body: { markdown: 'private body', blocknote: null },
          executionState: 'READY',
        });
        if (setter === 'readiness') controller.setReadinessLock(key, kind);
        else {
          const capture = controller.acquire(key, 'sending')!;
          controller.setOutcomeLock(capture, kind);
          controller.release(capture);
        }
        expect(controller.getEntry(key)).toMatchObject({
          executionState:
            kind === 'pending' ? 'OUTCOME_PENDING' : 'OUTCOME_UNKNOWN',
          localBody: { markdown: '', blocknote: null },
          confirmedBody: null,
          operation: { kind },
        });
        expect(controller.acquire(key, 'generating')).toBeNull();
        expect(controller.acquire(key, 'sending')).toBeNull();
      }
    },
  );

  describe.each(['pending', 'unknown'] as const)(
    '%s clean recovery',
    (kind) => {
      it.each(['readiness', 'outcome'] as const)(
        'uses server bytes instead of a clean snapshot after a %s lock',
        (setter) => {
          mockUseMyahInboxThreadMutations.mockReturnValue({
            saveDraft: jest.fn(),
          } as never);
          const { result } = renderAutosaveController();
          const controller = result.current;
          const target = authorize(controller, {
            ...reconcileThread(),
            body: { markdown: 'old confirmed', blocknote: null },
          });
          if (setter === 'readiness')
            controller.setReadinessLock(threadKey, kind);
          else
            controller.setOutcomeLock(
              controller.acquire(threadKey, 'sending')!,
              kind,
            );
          expect(controller.acquire(threadKey, 'sending')).toBeNull();
          // An operation response is not an authorized recovery read.
          controller.reconcile({
            ...reconcileThread(),
            executionState: 'READY',
          });
          expect(controller.getEntry(threadKey)?.operation?.kind).toBe(kind);
          controller.authorizeTarget(target, {
            ...reconcileThread(),
            body: { markdown: 'authoritative', blocknote: null },
            executionState: 'READY',
          });
          expect(controller.getEntry(threadKey)).toMatchObject({
            localBody: { markdown: 'authoritative' },
            confirmedBody: { markdown: 'authoritative' },
            confirmedRevision: 2,
            dirty: false,
            pendingDebounceVersion: null,
            operation: null,
          });
          expect(
            controller.acquire(threadKey, 'sending')?.confirmedRevision,
          ).toBe(2);
        },
      );
    },
  );

  describe.each([
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
    'CONTEXT_UNAVAILABLE',
  ] as const)('%s recovery with an active operation', (outcomeState) => {
    it.each(['generating', 'sending', 'reviewing'] as const)(
      'retains the active %s operation',
      (kind) => {
        mockUseMyahInboxThreadMutations.mockReturnValue({
          saveDraft: jest.fn(),
        } as never);
        const { result } = renderAutosaveController();
        const controller = result.current;
        const target = authorize(controller, {
          ...reconcileThread(),
          executionState: kind === 'reviewing' ? 'NEEDS_REVIEW' : 'READY',
        });
        const operation = controller.acquire(threadKey, kind)!;
        controller.authorizeTarget(target, {
          ...reconcileThread(),
          executionState: outcomeState,
        });
        controller.authorizeTarget(target, {
          ...reconcileThread(),
          revision: 7,
          executionState: 'READY',
          body: { markdown: 'server recovery', blocknote: null },
        });
        expect(controller.getEntry(threadKey)).toMatchObject({
          confirmedRevision: 7,
          localBody: { markdown: 'server recovery' },
          operation: { token: operation.token, kind },
        });
      },
    );
  });

  describe.each(['OUTCOME_PENDING', 'OUTCOME_UNKNOWN'] as const)(
    '%s direct read recovery',
    (outcomeState) => {
      it.each(['READY', 'NEEDS_REVIEW'] as const)(
        'restores a valid same-capability snapshot on an authorized %s read',
        (executionState) => {
          const saveDraft = jest.fn();
          mockUseMyahInboxThreadMutations.mockReturnValue({
            saveDraft,
          } as never);
          const { result } = renderAutosaveController();
          const controller = result.current;
          const target = authorize(controller, {
            ...reconcileThread(),
            body: { markdown: 'confirmed', blocknote: null },
          });
          controller.updateDraft({
            key: threadKey,
            body: { markdown: 'newer local', blocknote: 'private blocks' },
          });
          controller.authorizeTarget(target, {
            ...reconcileThread(),
            executionState: outcomeState,
          });
          expect(controller.getEntry(threadKey)?.operation).toBeNull();
          expect(controller.getEntry(threadKey)?.localBody.markdown).toBe('');
          expect(controller.acquire(threadKey, 'sending')).toBeNull();
          expect(controller.acquire(threadKey, 'reviewing')).toBeNull();
          controller.authorizeTarget(target, {
            ...reconcileThread(),
            body: { markdown: 'authoritative', blocknote: null },
            executionState,
          });
          expect(controller.getEntry(threadKey)).toMatchObject({
            executionState,
            localBody: { markdown: 'newer local', blocknote: 'private blocks' },
            confirmedBody: { markdown: 'authoritative' },
            confirmedRevision: 2,
            dirty: true,
            operation: null,
            pendingDebounceVersion: 1,
          });
          if (executionState === 'NEEDS_REVIEW') {
            expect(controller.acquire(threadKey, 'generating')).toBeNull();
            expect(controller.acquire(threadKey, 'sending')).toBeNull();
            const review = controller.acquire(threadKey, 'reviewing');
            expect(review?.confirmedRevision).toBe(2);
            controller.release(review!);
            act(() => jest.advanceTimersByTime(750));
            expect(saveDraft).not.toHaveBeenCalled();
          }
        },
      );
    },
  );

  describe.each(['pending', 'unknown'] as const)('%s recovery', (kind) => {
    it.each(['READY', 'NEEDS_REVIEW'] as const)(
      'restores a valid same-capability snapshot on an authorized %s read',
      (executionState) => {
        const saveDraft = jest.fn();
        mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
        const { result } = renderAutosaveController();
        const controller = result.current;
        const target = authorize(controller, {
          ...reconcileThread(),
          body: { markdown: 'confirmed', blocknote: null },
        });
        controller.updateDraft({
          key: threadKey,
          body: { markdown: 'newer local', blocknote: 'private blocks' },
        });
        controller.setReadinessLock(threadKey, kind);
        expect(controller.getEntry(threadKey)?.localBody.markdown).toBe('');
        expect(controller.acquire(threadKey, 'sending')).toBeNull();
        expect(controller.acquire(threadKey, 'reviewing')).toBeNull();
        controller.authorizeTarget(target, {
          ...reconcileThread(),
          body: { markdown: 'authoritative', blocknote: null },
          executionState,
        });
        expect(controller.getEntry(threadKey)).toMatchObject({
          executionState,
          localBody: { markdown: 'newer local', blocknote: 'private blocks' },
          confirmedBody: { markdown: 'authoritative' },
          confirmedRevision: 2,
          dirty: true,
          operation: null,
          pendingDebounceVersion: 1,
        });
        if (executionState === 'NEEDS_REVIEW') {
          expect(controller.acquire(threadKey, 'generating')).toBeNull();
          expect(controller.acquire(threadKey, 'sending')).toBeNull();
          const review = controller.acquire(threadKey, 'reviewing');
          expect(review?.confirmedRevision).toBe(2);
          controller.release(review!);
          act(() => jest.advanceTimersByTime(750));
          expect(saveDraft).not.toHaveBeenCalled();
        }
      },
    );
  });

  it('keeps outcome bytes masked when an operation result omits execution metadata', () => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result } = renderAutosaveController();
    const controller = result.current;
    authorize(controller, {
      ...reconcileThread(),
      body: { markdown: 'confirmed', blocknote: null },
    });
    const capture = controller.acquire(threadKey, 'sending')!;
    controller.setOutcomeLock(capture, 'pending');
    controller.reconcileOperation(capture, {
      ...reconcileThread(),
      body: { markdown: 'sending result', blocknote: null },
    });
    expect(controller.getEntry(threadKey)).toMatchObject({
      executionState: 'OUTCOME_PENDING',
      localBody: { markdown: '' },
      confirmedBody: null,
    });
  });

  describe.each(['pending', 'unknown'] as const)(
    '%s discarded snapshot recovery',
    (kind) => {
      it.each([
        'capability',
        'revision',
        'unavailable',
        'workspace',
        'key',
      ] as const)(
        'uses the authoritative body/revision and clears dirty state after %s changes',
        (change) => {
          const saveDraft = jest.fn();
          mockUseMyahInboxThreadMutations.mockReturnValue({
            saveDraft,
          } as never);
          const { result } = renderAutosaveController();
          const controller = result.current;
          let target = authorize(controller, {
            ...reconcileThread(),
            body: { markdown: 'confirmed', blocknote: null },
          });
          controller.updateDraft({
            key: threadKey,
            body: { markdown: 'newer private', blocknote: 'private blocks' },
          });
          controller.setReadinessLock(threadKey, kind);
          if (change === 'capability') {
            controller.invalidateTarget(target);
            target = controller.beginTargetRead(threadKey, () => true);
          }
          if (change === 'revision')
            controller.authorizeTarget(target, {
              ...reconcileThread(),
              revision: 3,
              executionState: 'OUTCOME_UNKNOWN',
            });
          if (change === 'unavailable')
            controller.authorizeTarget(target, {
              ...reconcileThread(),
              executionState: 'CONTEXT_UNAVAILABLE',
            });
          if (change === 'workspace') {
            controller.invalidateWorkspace(threadKey.workspaceId);
            target = controller.beginTargetRead(threadKey, () => true);
          }
          if (change === 'key') {
            controller.invalidateTarget(target);
            authorize(controller, {
              ...reconcileThread(),
              key: { ...threadKey, campaignId: 'other-campaign' },
              body: { markdown: 'other context', blocknote: null },
            });
            target = controller.beginTargetRead(threadKey, () => true);
          }
          expect(controller.acquire(threadKey, 'generating')).toBeNull();
          expect(controller.acquire(threadKey, 'sending')).toBeNull();
          expect(controller.acquire(threadKey, 'reviewing')).toBeNull();
          controller.authorizeTarget(target, {
            ...reconcileThread(),
            revision: change === 'revision' ? 3 : 2,
            body: { markdown: 'authoritative', blocknote: 'server blocks' },
            executionState: 'NEEDS_REVIEW',
          });
          expect(controller.getEntry(threadKey)).toMatchObject({
            executionState: 'NEEDS_REVIEW',
            localBody: {
              markdown: 'authoritative',
              blocknote: 'server blocks',
            },
            confirmedBody: {
              markdown: 'authoritative',
              blocknote: 'server blocks',
            },
            confirmedRevision: change === 'revision' ? 3 : 2,
            operation: null,
            dirty: false,
            pendingDebounceVersion: null,
          });
          expect(controller.acquire(threadKey, 'generating')).toBeNull();
          expect(controller.acquire(threadKey, 'sending')).toBeNull();
          const review = controller.acquire(threadKey, 'reviewing');
          expect(review?.confirmedRevision).toBe(change === 'revision' ? 3 : 2);
          controller.release(review!);
          act(() => jest.advanceTimersByTime(750));
          expect(saveDraft).not.toHaveBeenCalled();
        },
      );
    },
  );

  it.each([
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
    'CONTEXT_UNAVAILABLE',
  ] as const)(
    'does not let an older post-save read unlock a newer direct %s read',
    async (executionState) => {
      const refresh = createDeferred<MyahInboxDraftAutosaveThread>();
      const saveDraft = jest.fn().mockResolvedValue({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'submitted', blocknote: null },
      });
      mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
      const { result } = renderAutosaveController();
      const controller = result.current;
      const target = controller.beginTargetRead(
        threadKey,
        () => true,
        () => refresh.promise,
      );
      controller.authorizeTarget(target, {
        ...reconcileThread(),
        executionState: 'READY',
      });
      controller.updateDraft({
        key: threadKey,
        body: { markdown: 'submitted', blocknote: null },
      });
      const saving = controller.flush(threadKey);
      await waitFor(() =>
        expect(controller.getEntry(threadKey)?.confirmedRevision).toBe(3),
      );
      controller.authorizeTarget(target, {
        ...reconcileThread(),
        revision: 3,
        executionState,
      });
      const masked = controller.getEntry(threadKey);
      refresh.resolve({
        ...reconcileThread(),
        revision: 3,
        executionState: 'READY',
        body: { markdown: 'old metadata', blocknote: null },
      });
      await saving;
      expect(controller.getEntry(threadKey)).toEqual(masked);
      expect(controller.getEntry(threadKey)).toMatchObject({
        executionState,
        localBody: { markdown: '' },
        confirmedBody: null,
      });
      for (const kind of ['sending', 'generating', 'reviewing'] as const)
        expect(controller.acquire(threadKey, kind)).toBeNull();
      expect(saveDraft).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['dirty', 'proposal', 'error', 'conflict'] as const)(
    'discards %s bookkeeping on direct unavailable and never restores its private bytes',
    async (mode) => {
      const saveDraft = jest.fn();
      if (mode === 'error') saveDraft.mockRejectedValue(new Error('offline'));
      else if (mode === 'conflict')
        saveDraft.mockResolvedValue({
          status: 'CONFLICT',
          revision: 3,
          body: { markdown: 'private conflict', blocknote: null },
        });
      else
        saveDraft.mockResolvedValue({
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'private proposal', blocknote: null },
        });
      mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
      const { result } = renderAutosaveController();
      const controller = result.current;
      const target = authorize(controller, {
        ...reconcileThread(),
        executionState: 'READY',
        contextFingerprint: 'private proposal fingerprint',
      });
      if (mode === 'proposal')
        await controller.applyProposal({
          key: threadKey,
          body: { markdown: 'private proposal', blocknote: null },
        });
      else {
        controller.updateDraft({
          key: threadKey,
          body: { markdown: 'private edit', blocknote: 'private blocks' },
        });
        if (mode !== 'dirty') await controller.flush(threadKey);
      }
      const revision = controller.getEntry(threadKey)!.confirmedRevision;
      controller.authorizeTarget(target, {
        ...reconcileThread(),
        revision,
        executionState: 'CONTEXT_UNAVAILABLE',
      });
      expect(controller.getEntry(threadKey)).toMatchObject({
        localBody: { markdown: '', blocknote: null },
        confirmedBody: null,
        dirty: false,
        status: 'idle',
        pendingDebounceVersion: null,
        proposalContextFingerprint: null,
        error: null,
        conflict: null,
      });
      const calls = saveDraft.mock.calls.length;
      controller.authorizeTarget(target, {
        ...reconcileThread(),
        revision,
        executionState: 'READY',
        body: { markdown: 'server recovery', blocknote: null },
      });
      await act(async () => jest.advanceTimersByTimeAsync(1500));
      await controller.flush(threadKey);
      expect(controller.getEntry(threadKey)).toMatchObject({
        confirmedRevision: revision,
        localBody: { markdown: 'server recovery' },
        dirty: false,
      });
      expect(saveDraft).toHaveBeenCalledTimes(calls);
    },
  );

  it('isolates campaign A and B on the same delivery target', () => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result } = renderAutosaveController();
    const a = {
      ...threadKey,
      contactAnchorKind: 'CREATOR',
      contactAnchorId: 'creator-1',
      channel: 'EMAIL' as const,
      deliveryTargetId: 'thread-1',
      contextKind: 'CAMPAIGN' as const,
      campaignId: 'campaign-a',
    };
    const b = { ...a, campaignId: 'campaign-b' };
    authorize(result.current, {
      key: a,
      revision: 2,
      body: { markdown: 'A', blocknote: null },
    });
    authorize(result.current, {
      key: b,
      revision: 2,
      body: { markdown: 'B', blocknote: null },
    });
    expect(result.current.getEntry(a)?.localBody.markdown).toBe('A');
    expect(result.current.getEntry(b)?.localBody.markdown).toBe('B');
  });

  it('rejects late A reconcile and apply once its read scope changes', async () => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result } = renderAutosaveController();
    let current = true;
    const target = result.current.beginTargetRead(threadKey, () => current);
    result.current.authorizeTarget(target, reconcileThread());
    const capture = result.current.acquire(threadKey, 'generating')!;
    current = false;
    result.current.reconcileOperation(capture, {
      ...reconcileThread(),
      revision: 3,
      body: { markdown: 'late A', blocknote: null },
    });
    await expect(
      result.current.applyProposalIfCurrent(capture, {
        markdown: 'late A',
        blocknote: null,
      }),
    ).resolves.toBe(false);
    expect(result.current.getEntry(threadKey)?.localBody.markdown).toBe('');
  });

  it.each([
    'NEEDS_REVIEW',
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
    'CONTEXT_UNAVAILABLE',
  ] as const)('locks execution for %s', (executionState) => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result } = renderAutosaveController();
    authorize(result.current, {
      ...reconcileThread(),
      executionState,
      body: { markdown: 'stored', blocknote: null },
    });
    expect(result.current.acquire(threadKey, 'generating')).toBeNull();
    expect(result.current.acquire(threadKey, 'sending')).toBeNull();
    expect(result.current.getEntry(threadKey)?.localBody.markdown).toBe(
      executionState === 'NEEDS_REVIEW' ? 'stored' : '',
    );
  });

  it('allows navigation after a clean editor closes without making another request', async () => {
    const saveDraft = jest.fn();
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result } = renderAutosaveController();
    const capture = result.current.beginTargetRead(threadKey, () => true);
    result.current.authorizeTarget(capture, reconcileThread());
    result.current.invalidateTarget(capture);

    await expect(result.current.flushKeys([threadKey])).resolves.toBe(true);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('allows navigation after a saved nonempty editor closes without resaving it', async () => {
    const savedBody = { markdown: 'preserved draft', blocknote: null };
    const saveDraft = jest
      .fn()
      .mockResolvedValue({ status: 'SAVED', revision: 3, body: savedBody });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    const capture = authorize(result.current);
    result.current.updateDraft({ key: threadKey, body: savedBody });
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(readEntry(store, threadKey)?.status).toBe('saved');
    result.current.invalidateTarget(capture);
    await expect(
      result.current.flushWorkspace(threadKey.workspaceId),
    ).resolves.toBe(true);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(readEntry(store, threadKey)?.localBody).toEqual(savedBody);
  });

  it('resumes a paused debounce after reauthorization without another edit', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'pending', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    const first = result.current.beginTargetRead(threadKey, () => true);
    result.current.authorizeTarget(first, reconcileThread());
    result.current.updateDraft({
      key: threadKey,
      body: { markdown: 'pending', blocknote: null },
    });
    await act(async () => jest.advanceTimersByTimeAsync(300));
    const refresh = result.current.beginTargetRead(threadKey, () => true);
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(saveDraft).not.toHaveBeenCalled();
    result.current.authorizeTarget(refresh, reconcileThread());
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(readEntry(store, threadKey)).toMatchObject({
      status: 'saved',
      localBody: { markdown: 'pending' },
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ expectedWorkspaceId: 'workspace-1' }),
    );
  });

  it.each(['denial', 'workspace switch'])(
    'never resumes a paused draft after %s',
    async (change) => {
      const saveDraft = jest.fn();
      mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
      const { result, store } = renderAutosaveController();
      const first = result.current.beginTargetRead(threadKey, () => true);
      result.current.authorizeTarget(first, reconcileThread());
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'recovery', blocknote: null },
      });
      const refresh = result.current.beginTargetRead(threadKey, () => true);
      if (change === 'denial') result.current.invalidateTarget(refresh);
      else
        store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never);
      expect(
        result.current.authorizeTarget(
          change === 'denial' ? first : refresh,
          reconcileThread(),
        ),
      ).toBe(false);
      await act(async () => jest.advanceTimersByTimeAsync(2000));
      await expect(result.current.flushKeys([threadKey])).resolves.toBe(false);
      expect(saveDraft).not.toHaveBeenCalled();
      expect(readEntry(store, threadKey)?.localBody.markdown).toBe('recovery');
    },
  );

  it('canonicalizes keys and grants just one editor and operation across controller mounts', () => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result, store } = renderAutosaveController();
    authorize(result.current);
    const reversed = draftKeyFixture(
      threadKey.workspaceId,
      threadKey.deliveryTargetId,
    );
    expect(myahInboxDraftAutosaveFamilyState.atomFamily(reversed)).toBe(
      myahInboxDraftAutosaveFamilyState.atomFamily(threadKey),
    );
    const firstEditor = Symbol('first');
    expect(result.current.claimEditor(threadKey, firstEditor)).toBe(true);
    expect(result.current.claimEditor(reversed, Symbol('second'))).toBe(false);
    expect(result.current.acquire(threadKey, 'sending')).toBeNull();
    const operation = result.current.acquire(threadKey, 'sending', firstEditor);
    expect(operation).not.toBeNull();
    const other = renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });
    expect(other.result.current.acquire(reversed, 'sending')).toBeNull();
    expect(result.current.releaseEditor(threadKey, Symbol('stale'))).toBe(
      false,
    );
    expect(readEntry(store, threadKey)?.editorOwner).toBe(firstEditor);
  });

  it.each(['pending', 'unknown'] as const)(
    'retains a %s send lock through remount, target denial and stale release',
    async (kind) => {
      mockUseMyahInboxThreadMutations.mockReturnValue({
        saveDraft: jest.fn(),
      } as never);
      const { result, store, unmount } = renderAutosaveController();
      const target = authorize(result.current);
      const operation = result.current.acquire(threadKey, 'sending')!;
      result.current.setOutcomeLock(operation, kind);
      result.current.invalidateTarget(target);
      result.current.release(operation);
      unmount();
      const remounted = renderHook(
        () => useMyahInboxDraftAutosaveController(),
        {
          wrapper: ({ children }: PropsWithChildren) => (
            <JotaiProvider store={store}>{children}</JotaiProvider>
          ),
        },
      );
      authorize(remounted.result.current);
      expect(remounted.result.current.acquire(threadKey, 'sending')).toBeNull();
      await expect(
        remounted.result.current.flushKeys([threadKey]),
      ).resolves.toBe(false);
      expect(readEntry(store, threadKey)?.operation?.kind).toBe(kind);
    },
  );

  it('cannot release a newer remounted operation with an old finally token', () => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result, store, unmount } = renderAutosaveController();
    authorize(result.current);
    const oldController = result.current;
    const old = oldController.acquire(threadKey, 'generating')!;
    oldController.release(old);
    unmount();
    const remounted = renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });
    authorize(remounted.result.current);
    const next = remounted.result.current.acquire(threadKey, 'generating')!;
    oldController.release(old);
    expect(readEntry(store, threadKey)?.operation?.token).toBe(next.token);
    expect(next.token).not.toBe(old.token);
  });

  it('rejects a proposal after its editor closes even before target cleanup', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'stale', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    authorize(result.current);
    const owner = Symbol('editor');
    result.current.claimEditor(threadKey, owner);
    const operation = result.current.acquire(threadKey, 'generating', owner)!;
    result.current.releaseEditor(threadKey, owner);
    await expect(
      result.current.applyProposalIfCurrent(operation, {
        markdown: 'stale',
        blocknote: null,
      }),
    ).resolves.toBe(false);
    expect(readEntry(store, threadKey)?.localBody.markdown).toBe('');
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it.each(['revision', 'authorization', 'workspace'] as const)(
    'rejects a generated proposal after %s changes',
    async (change) => {
      const saveDraft = jest.fn();
      mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
      const { result, store } = renderAutosaveController();
      authorize(result.current);
      const operation = result.current.acquire(threadKey, 'generating')!;
      if (change === 'revision')
        result.current.reconcile({ ...reconcileThread(), revision: 3 });
      if (change === 'authorization') authorize(result.current);
      if (change === 'workspace')
        store.set(currentWorkspaceState.atom, { id: 'workspace-2' } as never);
      await expect(
        result.current.applyProposalIfCurrent(operation, {
          markdown: 'stale',
          blocknote: null,
        }),
      ).resolves.toBe(false);
      expect(readEntry(store, threadKey)?.localBody.markdown).toBe('');
      expect(saveDraft).not.toHaveBeenCalled();
    },
  );

  it('persists a current proposal under its captured key and blocks edits while generating', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'proposal', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    authorize(result.current);
    const operation = result.current.acquire(threadKey, 'generating')!;
    result.current.updateDraft({
      key: threadKey,
      body: { markdown: 'unsafe concurrent edit', blocknote: null },
    });
    expect(readEntry(store, threadKey)?.localBody.markdown).toBe('');
    await expect(
      result.current.applyProposalIfCurrent(operation, {
        markdown: 'proposal',
        blocknote: null,
      }),
    ).resolves.toBe(true);
    result.current.release(operation);
    expect(readEntry(store, threadKey)).toMatchObject({
      status: 'saved',
      operation: null,
      localBody: { markdown: 'proposal' },
    });
  });

  it('rechecks every key after another key finishes flushing', async () => {
    const deferred = createDeferred<DraftSaveResult>();
    const saveDraft = jest
      .fn()
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'late edit', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    const secondKey = { ...threadKey, deliveryTargetId: 'thread-2' };
    authorize(result.current);
    authorize(result.current, { ...reconcileThread(), key: secondKey });
    result.current.updateDraft({
      key: threadKey,
      body: { markdown: 'first', blocknote: null },
    });
    const transition = result.current.flushWorkspace(threadKey.workspaceId);
    result.current.updateDraft({
      key: secondKey,
      body: { markdown: 'late edit', blocknote: null },
    });
    deferred.resolve({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'first', blocknote: null },
    });
    await expect(transition).resolves.toBe(true);
    expect(readEntry(store, secondKey)).toMatchObject({
      status: 'saved',
      dirty: false,
      localBody: { markdown: 'late edit' },
    });
  });

  it('blocks navigation if another key acquires an operation during the all-key flush', async () => {
    const deferred = createDeferred<DraftSaveResult>();
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn().mockReturnValue(deferred.promise),
    } as never);
    const { result } = renderAutosaveController();
    const secondKey = { ...threadKey, deliveryTargetId: 'thread-2' };
    authorize(result.current);
    authorize(result.current, { ...reconcileThread(), key: secondKey });
    result.current.updateDraft({
      key: threadKey,
      body: { markdown: 'first', blocknote: null },
    });
    const transition = result.current.flushWorkspace(threadKey.workspaceId);
    expect(result.current.acquire(secondKey, 'generating')).not.toBeNull();
    deferred.resolve({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'first', blocknote: null },
    });
    await expect(transition).resolves.toBe(false);
  });

  it('awaits all affected keys and retains an error buffer while another key saves', async () => {
    const saveDraft = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'second', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    const secondKey = { ...threadKey, deliveryTargetId: 'thread-2' };
    authorize(result.current);
    authorize(result.current, { ...reconcileThread(), key: secondKey });
    result.current.updateDraft({
      key: threadKey,
      body: { markdown: 'first', blocknote: null },
    });
    result.current.updateDraft({
      key: secondKey,
      body: { markdown: 'second', blocknote: null },
    });
    await expect(
      result.current.flushWorkspace(threadKey.workspaceId),
    ).resolves.toBe(false);
    expect(readEntry(store, threadKey)).toMatchObject({
      status: 'error',
      localBody: { markdown: 'first' },
    });
    expect(readEntry(store, secondKey)?.status).toBe('saved');
  });

  it('saves the latest body only after the 750 ms trailing debounce', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'second edit', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const { result } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'second edit', blocknote: null },
      }),
    );

    await act(async () => jest.advanceTimersByTimeAsync(749));
    expect(saveDraft).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(saveDraft).toHaveBeenCalledWith({
      ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
      expectedRevision: 2,
      body: { markdown: 'second edit', blocknote: null },
    });
  });

  it('returns the final saved entry from a flush', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'saved draft', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'saved draft', blocknote: null },
      }),
    );
    const flushed = await result.current.flush(threadKey);

    expect(flushed).toMatchObject({
      confirmedRevision: 3,
      dirty: false,
      status: 'saved',
    });
  });

  it('returns the current no-op entry from a flush', async () => {
    const saveDraft = jest.fn();
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result } = renderAutosaveController();

    act(() => authorize(result.current));
    const flushed = await result.current.flush(threadKey);

    expect(flushed).toMatchObject({
      confirmedRevision: 2,
      dirty: false,
      status: 'idle',
    });
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('resets the uncontrolled editor after clean draft reconciliation', () => {
    const saveDraft = jest.fn();
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.reconcile({
        key: threadKey,
        revision: 3,
        body: { markdown: 'newer shared draft', blocknote: null },
      }),
    );

    expect(readEntry(store, threadKey)).toMatchObject({
      confirmedRevision: 3,
      editorVersion: 1,
      localBody: { markdown: 'newer shared draft', blocknote: null },
      status: 'idle',
    });
  });

  it('waits a full debounce after an edit made while a save is in flight', async () => {
    const firstSave = createDeferred<DraftSaveResult>();
    const saveDraft = jest
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 4,
        body: { markdown: 'newer edit', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const { result } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );
    await act(async () => jest.advanceTimersByTimeAsync(750));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'newer edit', blocknote: null },
      }),
    );

    await act(async () =>
      firstSave.resolve({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );

    expect(saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(749));
    expect(saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(1));
    await waitFor(() =>
      expect(saveDraft).toHaveBeenLastCalledWith({
        ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
        expectedRevision: 3,
        body: { markdown: 'newer edit', blocknote: null },
      }),
    );
  });

  it('preserves a clean saved entry through unmount and revalidation', async () => {
    const deferredSave = createDeferred<DraftSaveResult>();
    const saveDraft = jest.fn().mockReturnValue(deferredSave.promise);
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const { result, store, unmount } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'flush before unmount', blocknote: null },
      }),
    );
    await act(async () => jest.advanceTimersByTimeAsync(750));
    unmount();

    await act(async () => {
      deferredSave.resolve({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'flush before unmount', blocknote: null },
      });
      await deferredSave.promise;
    });

    const remounted = renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    act(() =>
      remounted.result.current.reconcile({
        key: threadKey,
        revision: 3,
        body: { markdown: 'flush before unmount', blocknote: null },
      }),
    );

    expect(readEntry(store, threadKey)).toMatchObject({
      confirmedRevision: 3,
      localBody: { markdown: 'flush before unmount', blocknote: null },
      status: 'saved',
    });
  });

  it('serializes a remounted edit behind a detached save', async () => {
    const firstSave = createDeferred<DraftSaveResult>();
    const saveDraft = jest
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 4,
        body: { markdown: 'newer remounted edit', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const { result, store, unmount } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );
    await act(async () => jest.advanceTimersByTimeAsync(750));
    unmount();

    const remounted = renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    act(() => authorize(remounted.result.current));
    act(() =>
      remounted.result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'newer remounted edit', blocknote: null },
      }),
    );
    act(() => {
      void remounted.result.current.flush(threadKey);
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () =>
      firstSave.resolve({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );

    await waitFor(() =>
      expect(saveDraft).toHaveBeenLastCalledWith({
        ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
        expectedRevision: 3,
        body: { markdown: 'newer remounted edit', blocknote: null },
      }),
    );
  });

  it('waits a full debounce after a remounted edit behind a detached save', async () => {
    const firstSave = createDeferred<DraftSaveResult>();
    const saveDraft = jest
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 4,
        body: { markdown: 'newer remounted edit', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const { result, store, unmount } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );
    await act(async () => jest.advanceTimersByTimeAsync(750));
    unmount();

    const remounted = renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    });

    act(() => authorize(remounted.result.current));
    act(() =>
      remounted.result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'newer remounted edit', blocknote: null },
      }),
    );
    await act(async () =>
      firstSave.resolve({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'first edit', blocknote: null },
      }),
    );

    expect(saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(749));
    expect(saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(1));
    await waitFor(() =>
      expect(saveDraft).toHaveBeenLastCalledWith({
        ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
        expectedRevision: 3,
        body: { markdown: 'newer remounted edit', blocknote: null },
      }),
    );
  });
  it('keeps autosave active after StrictMode replays the lifecycle effect', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'edit', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft,
    } as never);
    const store = createStore();
    store.set(currentWorkspaceState.atom, {
      id: threadKey.workspaceId,
    } as never);

    const AutosaveProbeEffect = () => {
      const controller = useMyahInboxDraftAutosaveController();

      useEffect(() => {
        authorize(controller);
        controller.updateDraft({
          key: threadKey,
          body: { markdown: 'edit', blocknote: null },
        });
      }, [controller]);

      return null;
    };

    render(
      <StrictMode>
        <JotaiProvider store={store}>
          <AutosaveProbeEffect />
        </JotaiProvider>
      </StrictMode>,
    );

    await act(async () => jest.advanceTimersByTimeAsync(750));

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('retains a rejected snapshot across a thread switch and retries it unchanged', async () => {
    const saveDraft = jest
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'keep this', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'keep this', blocknote: null },
      }),
    );
    const flushed = await result.current.flush(threadKey);

    expect(readEntry(store, threadKey)).toMatchObject({
      localBody: { markdown: 'keep this', blocknote: null },
      confirmedRevision: 2,
      status: 'error',
    });

    expect(flushed).toMatchObject({
      confirmedRevision: 2,
      dirty: false,
      status: 'error',
    });

    await act(async () => result.current.retry(threadKey));

    expect(saveDraft).toHaveBeenLastCalledWith({
      ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
      expectedRevision: 2,
      body: { markdown: 'keep this', blocknote: null },
    });
    expect(readEntry(store, threadKey)?.status).toBe('saved');
  });

  it('keeps local text and requires explicit conflict reload before another save', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'CONFLICT',
      revision: 4,
      body: { markdown: 'other operator copy', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() =>
      authorize(result.current, reconcileThread(), (revision) =>
        Promise.resolve({
          ...reconcileThread(),
          revision,
          body: { markdown: 'other operator copy', blocknote: null },
        }),
      ),
    );
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'my local copy', blocknote: null },
      }),
    );
    const flushed = await result.current.flush(threadKey);

    expect(readEntry(store, threadKey)).toMatchObject({
      localBody: { markdown: 'my local copy', blocknote: null },
      status: 'conflict',
      conflict: {
        revision: 4,
        body: { markdown: 'other operator copy', blocknote: null },
      },
    });

    expect(flushed).toMatchObject({
      confirmedRevision: 2,
      dirty: false,
      status: 'conflict',
    });

    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'edited local copy', blocknote: null },
      }),
    );
    await act(async () => jest.advanceTimersByTimeAsync(750));
    await act(async () => result.current.flush(threadKey));

    expect(readEntry(store, threadKey)).toMatchObject({
      localBody: { markdown: 'edited local copy', blocknote: null },
      status: 'conflict',
      conflict: {
        revision: 4,
        body: { markdown: 'other operator copy', blocknote: null },
      },
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.reloadConflict(threadKey);
    });

    expect(readEntry(store, threadKey)).toMatchObject({
      localBody: { markdown: 'other operator copy', blocknote: null },
      confirmedBody: { markdown: 'other operator copy', blocknote: null },
      confirmedRevision: 4,
      dirty: false,
      status: 'idle',
      error: null,
      conflict: null,
      editorVersion: 1,
    });
  });

  it('flushes user text before persisting an applied proposal', async () => {
    const saveDraft = jest
      .fn()
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'operator edit', blocknote: null },
      })
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 4,
        body: { markdown: 'proposal', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'operator edit', blocknote: null },
      }),
    );

    await act(async () =>
      expect(
        result.current.applyProposal({
          key: threadKey,
          body: { markdown: 'proposal', blocknote: null },
        }),
      ).resolves.toBe(true),
    );

    expect(saveDraft.mock.calls).toEqual([
      [
        {
          ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
          expectedRevision: 2,
          body: { markdown: 'operator edit', blocknote: null },
        },
      ],
      [
        {
          ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
          expectedRevision: 3,
          body: { markdown: 'proposal', blocknote: null },
        },
      ],
    ]);
    expect(readEntry(store, threadKey)?.editorVersion).toBe(1);
  });

  it('does not apply a proposal after its preceding save ends in error', async () => {
    const saveDraft = jest
      .fn()
      .mockRejectedValue(new Error('network unavailable'));
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'operator edit', blocknote: null },
      }),
    );

    await act(async () =>
      expect(
        result.current.applyProposal({
          key: threadKey,
          body: { markdown: 'proposal', blocknote: null },
        }),
      ).resolves.toBe(false),
    );

    expect(readEntry(store, threadKey)?.localBody).toEqual({
      markdown: 'operator edit',
      blocknote: null,
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps Saved visible when its native-backed entry revalidates', async () => {
    const saveDraft = jest
      .fn()
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'saved draft', blocknote: null },
      })
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 4,
        body: { markdown: 'new edit', blocknote: null },
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'saved draft', blocknote: null },
      }),
    );
    await act(async () => result.current.flush(threadKey));
    act(() =>
      result.current.reconcile({
        key: threadKey,
        revision: 3,
        body: { markdown: 'saved draft', blocknote: null },
      }),
    );

    expect(readEntry(store, threadKey)).toMatchObject({
      confirmedRevision: 3,
      localBody: { markdown: 'saved draft', blocknote: null },
      status: 'saved',
    });

    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'new edit', blocknote: null },
      }),
    );
    await act(async () => result.current.flush(threadKey));

    expect(saveDraft).toHaveBeenLastCalledWith({
      ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
      expectedRevision: 3,
      body: { markdown: 'new edit', blocknote: null },
    });
  });

  it('does not roll an entry back for a lower-revision server query', async () => {
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'new shared draft', blocknote: null },
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'new shared draft', blocknote: null },
      }),
    );
    await act(async () => result.current.flush(threadKey));
    act(() =>
      result.current.reconcile({
        key: threadKey,
        revision: 2,
        body: { markdown: 'stale server draft', blocknote: null },
      }),
    );

    expect(readEntry(store, threadKey)).toMatchObject({
      localBody: { markdown: 'new shared draft', blocknote: null },
      confirmedRevision: 3,
      status: 'saved',
    });
  });

  it('starts every dirty workspace draft without waiting for another key', async () => {
    const firstSave = createDeferred<DraftSaveResult>();
    const secondSave = createDeferred<DraftSaveResult>();
    const secondKey = draftKeyFixture('workspace-1', 'thread-2');
    const saveDraft = jest
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      authorize(result.current, {
        key: secondKey,
        revision: 5,
        body: { markdown: '', blocknote: null },
      }),
    );
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'first', blocknote: null },
      }),
    );
    act(() =>
      result.current.updateDraft({
        key: secondKey,
        body: { markdown: 'second', blocknote: null },
      }),
    );

    act(() => {
      void result.current.flushWorkspace('workspace-1');
    });

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft).toHaveBeenNthCalledWith(1, {
      ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-1')),
      expectedRevision: 2,
      body: { markdown: 'first', blocknote: null },
    });
    expect(saveDraft).toHaveBeenNthCalledWith(2, {
      ...draftInputFixture(draftKeyFixture('workspace-1', 'thread-2')),
      expectedRevision: 5,
      body: { markdown: 'second', blocknote: null },
    });
  });

  it('defers only closed forced recovery during navigation, never selected, live or ordinary unauthorized work', async () => {
    const saveDraft = jest.fn();
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    const capture = authorize(result.current);
    result.current.updateDraft({
      key: threadKey,
      body: { markdown: 'recovery', blocknote: null },
    });
    result.current.invalidateTarget(capture);
    await expect(
      result.current.flushWorkspaceForNavigation(threadKey.workspaceId, []),
    ).resolves.toBe(false);
    result.current.invalidateWorkspace(threadKey.workspaceId);
    const recovery = readEntry(store, threadKey);
    await expect(
      result.current.flushWorkspaceForNavigation(threadKey.workspaceId, []),
    ).resolves.toBe(true);
    expect(readEntry(store, threadKey)).toEqual(recovery);
    await expect(
      result.current.flushWorkspace(threadKey.workspaceId),
    ).resolves.toBe(false);
    await expect(
      result.current.flushWorkspaceForNavigation(threadKey.workspaceId, [
        threadKey.deliveryTargetId,
      ]),
    ).resolves.toBe(false);
    const owner = Symbol('reopened editor');
    result.current.claimEditor(threadKey, owner);
    await expect(
      result.current.flushWorkspaceForNavigation(threadKey.workspaceId, []),
    ).resolves.toBe(false);
    result.current.releaseEditor(threadKey, owner);
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(saveDraft).not.toHaveBeenCalled();
    expect(readEntry(store, threadKey)?.localBody.markdown).toBe('recovery');
  });

  it.each(['pending', 'unknown'] as const)(
    'does not exempt a %s operation from navigation protection',
    async (kind) => {
      mockUseMyahInboxThreadMutations.mockReturnValue({
        saveDraft: jest.fn(),
      } as never);
      const { result, store } = renderAutosaveController();
      authorize(result.current);
      result.current.setReadinessLock(threadKey, kind);
      result.current.invalidateWorkspace(threadKey.workspaceId);
      await expect(
        result.current.flushWorkspaceForNavigation(threadKey.workspaceId, []),
      ).resolves.toBe(false);
      expect(readEntry(store, threadKey)?.operation?.kind).toBe(kind);
    },
  );

  it('flushes final structured formatting before navigation and Send under its exact target', async () => {
    const firstFormattedBody = {
      markdown: 'Hello Maya',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"Hello Maya","styles":{"bold":true}}],"children":[]}]',
    };
    const finalFormattedBody = {
      markdown: 'Hello Maya',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"Hello Maya","styles":{"bold":true,"italic":true}}],"children":[]}]',
    };
    const saveDraft = jest
      .fn()
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 3,
        body: firstFormattedBody,
      })
      .mockResolvedValueOnce({
        status: 'SAVED',
        revision: 4,
        body: finalFormattedBody,
      });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();

    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({ key: threadKey, body: firstFormattedBody }),
    );
    await expect(
      result.current.flushWorkspace(threadKey.workspaceId),
    ).resolves.toBe(true);
    act(() =>
      result.current.updateDraft({ key: threadKey, body: finalFormattedBody }),
    );
    await act(async () => result.current.flush(threadKey));

    expect(saveDraft.mock.calls).toEqual([
      [
        {
          ...draftInputFixture(threadKey),
          expectedRevision: 2,
          body: firstFormattedBody,
        },
      ],
      [
        {
          ...draftInputFixture(threadKey),
          expectedRevision: 3,
          body: finalFormattedBody,
        },
      ],
    ]);
    expect(readEntry(store, threadKey)).toMatchObject({
      confirmedRevision: 4,
      confirmedBody: finalFormattedBody,
      localBody: finalFormattedBody,
      dirty: false,
      status: 'saved',
    });
  });

  it('preserves structured local and remote bodies across conflict reload and delayed owner callbacks', async () => {
    const localBody = {
      markdown: 'Local format',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"Local format","styles":{"underline":true}}],"children":[]}]',
    };
    const remoteBody = {
      markdown: 'Remote format',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"Remote format","styles":{"strike":true}}],"children":[]}]',
    };
    const staleBody = {
      markdown: 'Stale format',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"Stale format","styles":{"italic":true}}],"children":[]}]',
    };
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'CONFLICT',
      revision: 4,
      body: remoteBody,
    });
    mockUseMyahInboxThreadMutations.mockReturnValue({ saveDraft } as never);
    const { result, store } = renderAutosaveController();
    const oldOwner = Symbol('old editor');
    const currentOwner = Symbol('current editor');

    act(() =>
      authorize(result.current, reconcileThread(), (revision) =>
        Promise.resolve({ ...reconcileThread(), revision, body: remoteBody }),
      ),
    );
    expect(result.current.claimEditor(threadKey, oldOwner)).toBe(true);
    expect(result.current.releaseEditor(threadKey, oldOwner)).toBe(true);
    expect(result.current.claimEditor(threadKey, currentOwner)).toBe(true);
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: localBody,
        editorOwner: currentOwner,
      }),
    );
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: staleBody,
        editorOwner: oldOwner,
      }),
    );
    await act(async () => result.current.flush(threadKey));

    expect(saveDraft).toHaveBeenCalledWith({
      ...draftInputFixture(threadKey),
      expectedRevision: 2,
      body: localBody,
    });
    expect(readEntry(store, threadKey)).toMatchObject({
      localBody,
      status: 'conflict',
      conflict: { revision: 4, body: remoteBody },
    });

    await act(async () => {
      await result.current.reloadConflict(threadKey);
    });

    expect(readEntry(store, threadKey)).toMatchObject({
      confirmedRevision: 4,
      editorVersion: 1,
      localBody: remoteBody,
      confirmedBody: remoteBody,
      conflict: null,
      status: 'idle',
    });
  });

  it('does not use browser storage for draft state', () => {
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result } = renderAutosaveController();

    const getItem = jest.spyOn(Storage.prototype, 'getItem');
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    act(() => authorize(result.current));
    act(() =>
      result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'local only', blocknote: null },
      }),
    );

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
