import { act, render, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { StrictMode, useEffect, type PropsWithChildren } from 'react';

import { useMyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
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

  return {
    ...renderHook(() => useMyahInboxDraftAutosaveController(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    }),
    store,
  };
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() =>
      remounted.result.current.updateDraft({
        key: threadKey,
        body: { markdown: 'newer remounted edit', blocknote: null },
      }),
    );
    await act(async () => {
      await remounted.result.current.flush(threadKey);
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

    act(() => result.current.reconcile(reconcileThread()));
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

    const AutosaveProbeEffect = () => {
      const controller = useMyahInboxDraftAutosaveController();

      useEffect(() => {
        controller.reconcile(reconcileThread());
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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
          expectedRevision: 2,
          body: { markdown: 'operator edit', blocknote: null },
        },
      ],
      [
        {
          threadId: 'thread-1',
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
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

    act(() => result.current.reconcile(reconcileThread()));
    act(() =>
      result.current.reconcile({
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

    act(() => result.current.flushWorkspace('workspace-1'));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft).toHaveBeenNthCalledWith(1, {
      threadId: 'thread-1',
      expectedRevision: 2,
      body: { markdown: 'first', blocknote: null },
    });
    expect(saveDraft).toHaveBeenNthCalledWith(2, {
      threadId: 'thread-2',
      expectedRevision: 5,
      body: { markdown: 'second', blocknote: null },
    });
  });

  it('does not use browser storage for draft state', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem');
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    mockUseMyahInboxThreadMutations.mockReturnValue({
      saveDraft: jest.fn(),
    } as never);
    const { result } = renderAutosaveController();

    act(() => result.current.reconcile(reconcileThread()));
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
