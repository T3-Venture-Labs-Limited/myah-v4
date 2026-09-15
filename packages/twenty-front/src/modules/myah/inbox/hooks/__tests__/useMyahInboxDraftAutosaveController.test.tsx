import { act, render, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { StrictMode, useEffect, type PropsWithChildren } from 'react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  type MyahInboxDraftAutosaveController,
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

const threadKey = { threadId: 'thread-1', workspaceId: 'workspace-1' };

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
) => {
  const capture = controller.beginTargetRead(thread.key, () => true);
  controller.authorizeTarget(capture, thread);
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
    const reversed = {
      workspaceId: threadKey.workspaceId,
      threadId: threadKey.threadId,
    };
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
    const secondKey = { ...threadKey, threadId: 'thread-2' };
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
    const secondKey = { ...threadKey, threadId: 'thread-2' };
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
    const secondKey = { ...threadKey, threadId: 'thread-2' };
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
      threadId: 'thread-1',
      expectedWorkspaceId: 'workspace-1',
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
        threadId: 'thread-1',
        expectedWorkspaceId: 'workspace-1',
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
        threadId: 'thread-1',
        expectedWorkspaceId: 'workspace-1',
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
        threadId: 'thread-1',
        expectedWorkspaceId: 'workspace-1',
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
      threadId: 'thread-1',
      expectedWorkspaceId: 'workspace-1',
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

    act(() => authorize(result.current));
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

    act(() => result.current.reloadConflict(threadKey));

    expect(readEntry(store, threadKey)).toMatchObject({
      localBody: { markdown: 'other operator copy', blocknote: null },
      confirmedRevision: 4,
      dirty: false,
      status: 'saved',
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
          threadId: 'thread-1',
          expectedWorkspaceId: 'workspace-1',
          expectedRevision: 2,
          body: { markdown: 'operator edit', blocknote: null },
        },
      ],
      [
        {
          threadId: 'thread-1',
          expectedWorkspaceId: 'workspace-1',
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
      threadId: 'thread-1',
      expectedWorkspaceId: 'workspace-1',
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
    const secondKey = { threadId: 'thread-2', workspaceId: 'workspace-1' };
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
      threadId: 'thread-1',
      expectedWorkspaceId: 'workspace-1',
      expectedRevision: 2,
      body: { markdown: 'first', blocknote: null },
    });
    expect(saveDraft).toHaveBeenNthCalledWith(2, {
      threadId: 'thread-2',
      expectedWorkspaceId: 'workspace-1',
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
        threadKey.threadId,
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
          expectedWorkspaceId: threadKey.workspaceId,
          expectedRevision: 2,
          threadId: threadKey.threadId,
          body: firstFormattedBody,
        },
      ],
      [
        {
          expectedWorkspaceId: threadKey.workspaceId,
          expectedRevision: 3,
          threadId: threadKey.threadId,
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

    act(() => authorize(result.current));
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
      expectedWorkspaceId: threadKey.workspaceId,
      expectedRevision: 2,
      threadId: threadKey.threadId,
      body: localBody,
    });
    expect(readEntry(store, threadKey)).toMatchObject({
      localBody,
      status: 'conflict',
      conflict: { revision: 4, body: remoteBody },
    });

    act(() => result.current.reloadConflict(threadKey));

    expect(readEntry(store, threadKey)).toMatchObject({
      confirmedRevision: 4,
      editorVersion: 1,
      localBody: remoteBody,
      confirmedBody: remoteBody,
      conflict: null,
      status: 'saved',
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
