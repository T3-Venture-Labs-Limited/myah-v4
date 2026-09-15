import { act, renderHook } from '@testing-library/react';
import { useMutation } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useMyahInboxInstagramDraft } from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';

jest.mock('@apollo/client/react', () => ({ useMutation: jest.fn() }));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));

const mockUseMutation = jest.mocked(useMutation);
const mockUseApolloCoreClient = jest.mocked(useApolloCoreClient);
const saveDraftMutation = jest.fn();
const loadDraftQuery = jest.fn();

const workspaceId = '11111111-1111-4111-8111-111111111111';
let activeContactId = '22222222-2222-4222-8222-000000000000';
let scopeSequence = 0;
const creatorId = '33333333-3333-4333-8333-333333333333';
const conversationId = '44444444-4444-4444-8444-444444444444';
let activeConversationId = conversationId;

const renderDraft = (kind: 'FIRST_MESSAGE' | 'REPLY' = 'FIRST_MESSAGE') =>
  renderHook(() =>
    useMyahInboxInstagramDraft({
      workspaceId,
      contactId: activeContactId,
      kind,
      creatorRecordId: creatorId,
      conversationRecordId: activeConversationId,
    }),
  );

const persistedDraft = {
  status: 'SAVED' as const,
  draftId: '55555555-5555-4555-8555-555555555555',
  revision: 4,
  body: 'Persisted text',
  executionLocked: false,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

type SaveResponse = {
  data: { saveInstagramMessageDraft: typeof persistedDraft };
};

describe('useMyahInboxInstagramDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    saveDraftMutation.mockReset();
    loadDraftQuery.mockReset();
    scopeSequence += 1;
    activeConversationId = conversationId;
    activeContactId = `22222222-2222-4222-8222-${String(scopeSequence).padStart(
      12,
      '0',
    )}`;
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: null },
    });
    mockUseApolloCoreClient.mockReturnValue({
      query: loadDraftQuery,
    } as never);
    mockUseMutation.mockReturnValue([
      saveDraftMutation,
      { loading: false },
    ] as never);
  });

  afterEach(() => jest.useRealTimers());

  it('autosaves a first message against the creator only', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 1,
          body: 'Hello',
        },
      },
    });
    const { result } = renderDraft();
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('Hello'));
    await act(async () => jest.advanceTimersByTimeAsync(750));

    expect(saveDraftMutation).toHaveBeenCalledWith({
      variables: {
        input: {
          draftId: expect.any(String),
          expectedRevision: 0,
          kind: 'FIRST_MESSAGE',
          body: 'Hello',
          creatorRecordId: creatorId,
          conversationRecordId: null,
        },
      },
    });
  });

  it('creates draft IDs outside a secure browser context', async () => {
    const originalRandomUUID = globalThis.crypto.randomUUID;

    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });

    try {
      const { result } = renderDraft();

      await act(async () => Promise.resolve());

      expect(result.current.draftId).toEqual(expect.any(String));
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: originalRandomUUID,
      });
    }
  });

  it('flushes a reply against the exact conversation only', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 1,
          body: 'Reply',
        },
      },
    });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('Reply'));
    await act(async () => result.current.flush());

    expect(saveDraftMutation).toHaveBeenCalledWith({
      variables: {
        input: {
          draftId: expect.any(String),
          expectedRevision: 0,
          kind: 'REPLY',
          body: 'Reply',
          creatorRecordId: null,
          conversationRecordId: conversationId,
        },
      },
    });
  });

  it('does not save an empty draft', async () => {
    const { result } = renderDraft();
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('  '));
    await act(async () => jest.advanceTimersByTimeAsync(750));

    await act(async () => {
      expect(await result.current.flush()).toEqual({
        status: 'empty',
        revision: 0,
      });
    });
    expect(saveDraftMutation).not.toHaveBeenCalled();
  });

  it('keeps local text and exposes a server conflict until reloaded', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'CONFLICT',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 3,
          body: 'Server draft',
        },
      },
    });
    const { result } = renderDraft();
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('Local draft'));
    await act(async () => result.current.flush());

    expect(result.current.body).toBe('Local draft');
    expect(result.current.conflict).toEqual({
      revision: 3,
      body: 'Server draft',
    });

    act(() => result.current.reloadConflict());

    expect(result.current.body).toBe('Server draft');
    expect(result.current.revision).toBe(3);
    expect(result.current.conflict).toBeNull();
  });

  it('hydrates when a remount reuses an in-flight Apollo query', async () => {
    let resolveQuery: (value: {
      data: { instagramMessageDraft: null };
    }) => void = () => undefined;
    let rejectQuery: (reason: Error) => void = () => undefined;
    const sharedQuery = new Promise<{
      data: { instagramMessageDraft: null };
    }>((resolve, reject) => {
      resolveQuery = resolve;
      rejectQuery = reject;
    });

    loadDraftQuery.mockImplementation((options) => {
      // The generic Jest mock erases Apollo's query option type.
      const queryOptions = options as {
        context?: { fetchOptions?: { signal?: AbortSignal } };
      };
      const signal = queryOptions.context?.fetchOptions?.signal;

      signal?.addEventListener(
        'abort',
        () => rejectQuery(new Error('aborted')),
        { once: true },
      );

      return sharedQuery;
    });

    const first = renderDraft('REPLY');

    first.unmount();

    const remounted = renderDraft('REPLY');

    await act(async () => {
      resolveQuery({ data: { instagramMessageDraft: null } });
      await Promise.resolve();
    });

    expect(remounted.result.current.status).toBe('saved');
    expect(remounted.result.current.error).toBeNull();
  });

  it('restores the server-owned draft after a full client reload', async () => {
    loadDraftQuery.mockResolvedValueOnce({
      data: {
        instagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 4,
          body: 'Server-owned draft',
          executionLocked: true,
        },
      },
    });
    const { result } = renderDraft('REPLY');

    await act(async () => Promise.resolve());

    expect(loadDraftQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            kind: 'REPLY',
            creatorRecordId: null,
            conversationRecordId: conversationId,
          },
        },
        fetchPolicy: 'no-cache',
      }),
    );
    expect(result.current.draftId).toBe('55555555-5555-4555-8555-555555555555');
    expect(result.current.body).toBe('Server-owned draft');
    expect(result.current.revision).toBe(4);
    expect(result.current.executionLocked).toBe(true);
  });

  it('preserves a newer dirty snapshot when server hydration returns', async () => {
    const serverDraft = {
      status: 'SAVED',
      draftId: '55555555-5555-4555-8555-555555555555',
      revision: 2,
      body: 'Older server body',
      executionLocked: false,
    };
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: serverDraft },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => first.result.current.setBody('Newer local body'));
    first.unmount();
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: serverDraft },
    });

    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    expect(remounted.result.current.draftId).toBe(serverDraft.draftId);
    expect(remounted.result.current.body).toBe('Newer local body');
    expect(remounted.result.current.revision).toBe(2);
  });
  it('restores the keyed saved body and revision after remount', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 1,
          body: 'Saved draft',
        },
      },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    act(() => first.result.current.setBody('Saved draft'));
    await act(async () => first.result.current.flush());
    const savedDraftId = first.result.current.draftId;
    first.unmount();

    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    expect(remounted.result.current.draftId).toBe(savedDraftId);
    expect(remounted.result.current.body).toBe('Saved draft');
    expect(remounted.result.current.revision).toBe(1);
  });

  it.each(['', '  \n  '])(
    'autosaves persisted clear %j with the same id/revision and reloads empty',
    async (body) => {
      let serverDraft = { ...persistedDraft };
      loadDraftQuery.mockImplementation(async () => ({
        data: { instagramMessageDraft: serverDraft },
      }));
      saveDraftMutation.mockImplementation(async ({ variables: { input } }) => {
        serverDraft = {
          ...serverDraft,
          body: input.body.trim(),
          revision: input.expectedRevision + 1,
        };
        return { data: { saveInstagramMessageDraft: serverDraft } };
      });
      const first = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      act(() => first.result.current.setBody(body));
      await act(async () => jest.advanceTimersByTimeAsync(750));

      // Check server storage, not just the module-local dirty snapshot.
      expect(serverDraft.body).toBe('');
      expect(saveDraftMutation).toHaveBeenCalledTimes(1);
      expect(saveDraftMutation).toHaveBeenCalledWith({
        variables: {
          input: {
            draftId: persistedDraft.draftId,
            expectedRevision: 4,
            kind: 'REPLY',
            body,
            creatorRecordId: null,
            conversationRecordId: conversationId,
          },
        },
      });
      first.unmount();
      const remounted = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      expect(remounted.result.current.body).toBe('');
      expect(remounted.result.current.revision).toBe(5);
      await act(async () => {
        expect(await remounted.result.current.flush()).toEqual({
          status: 'empty',
          revision: 5,
        });
      });
      expect(saveDraftMutation).toHaveBeenCalledTimes(1);
    },
  );

  it('flushes an existing clear but never makes it sendable', async () => {
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: persistedDraft },
    });
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: { ...persistedDraft, body: '', revision: 5 },
      },
    });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => result.current.setBody(''));
    await act(async () => {
      expect(await result.current.flush()).toEqual({
        status: 'empty',
        revision: 5,
      });
    });
    expect(saveDraftMutation).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(saveDraftMutation).toHaveBeenCalledTimes(1);
  });

  it('retains a cleared local body on stale CAS conflict until explicit reload', async () => {
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: persistedDraft },
    });
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          ...persistedDraft,
          status: 'CONFLICT',
          body: 'Remote edit',
          revision: 5,
        },
      },
    });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => result.current.setBody(''));
    await act(async () => {
      expect(await result.current.flush()).toEqual({
        status: 'conflict',
        revision: 5,
      });
    });
    expect(result.current.body).toBe('');
    expect(result.current.revision).toBe(4);
    expect(result.current.conflict).toEqual({
      body: 'Remote edit',
      revision: 5,
    });
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(saveDraftMutation).toHaveBeenCalledTimes(1);
    act(() => result.current.reloadConflict());
    expect(result.current.body).toBe('Remote edit');
    expect(result.current.revision).toBe(5);
  });

  it.each(['save failed', 'Instagram message draft is locked for execution'])(
    'keeps a clear dirty on %s for a later retry',
    async (message) => {
      loadDraftQuery.mockResolvedValue({
        data: {
          instagramMessageDraft: {
            ...persistedDraft,
            executionLocked: message.includes('locked'),
          },
        },
      });
      saveDraftMutation.mockRejectedValueOnce(new Error(message));
      const first = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      act(() => first.result.current.setBody(''));
      await act(async () => {
        expect(await first.result.current.flush()).toEqual({
          status: 'error',
          revision: 4,
        });
      });
      expect(first.result.current.body).toBe('');
      expect(first.result.current.status).toBe(
        message.includes('locked') ? 'saved' : 'error',
      );
      expect(first.result.current.executionLocked).toBe(
        message.includes('locked'),
      );
      await act(async () => jest.advanceTimersByTimeAsync(1500));
      expect(saveDraftMutation).toHaveBeenCalledTimes(
        message.includes('locked') ? 0 : 1,
      );
      first.unmount();
      loadDraftQuery.mockResolvedValueOnce({
        data: { instagramMessageDraft: persistedDraft },
      });
      const remounted = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      expect(remounted.result.current.body).toBe('');
      saveDraftMutation.mockReset();
      saveDraftMutation.mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: '',
            revision: 5,
          },
        },
      });
      await act(async () => {
        expect(await remounted.result.current.flush()).toEqual({
          status: 'empty',
          revision: 5,
        });
      });
      expect(saveDraftMutation).toHaveBeenLastCalledWith(
        expect.objectContaining({
          variables: {
            input: expect.objectContaining({
              body: '',
              expectedRevision: 4,
              draftId: persistedDraft.draftId,
            }),
          },
        }),
      );
    },
  );

  it.each([0, 4])(
    'flushes a clear made during an in-flight revision %i save',
    async (initialRevision) => {
      loadDraftQuery.mockResolvedValue({
        data: {
          instagramMessageDraft: initialRevision ? persistedDraft : null,
        },
      });
      const pending = deferred<SaveResponse>();
      saveDraftMutation
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce({
          data: {
            saveInstagramMessageDraft: {
              ...persistedDraft,
              body: '',
              revision: initialRevision + 2,
            },
          },
        });
      const { result } = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      act(() => result.current.setBody('In-flight text'));
      let initialFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        initialFlush = result.current.flush();
      });
      act(() => result.current.setBody(''));
      let clearFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        clearFlush = result.current.flush();
      });
      await act(async () => {
        pending.resolve({
          data: {
            saveInstagramMessageDraft: {
              ...persistedDraft,
              body: 'In-flight text',
              revision: initialRevision + 1,
            },
          },
        });
        expect((await initialFlush).status).toBe('empty');
        expect(await clearFlush).toEqual({
          status: 'empty',
          revision: initialRevision + 2,
        });
      });
      expect(saveDraftMutation).toHaveBeenCalledTimes(2);
      expect(saveDraftMutation).toHaveBeenLastCalledWith(
        expect.objectContaining({
          variables: {
            input: expect.objectContaining({
              body: '',
              expectedRevision: initialRevision + 1,
            }),
          },
        }),
      );
      expect(result.current.body).toBe('');
    },
  );

  it.each(['conflict', 'failure'])(
    'does not overwrite an in-flight %s when a clear flush is waiting',
    async (outcome) => {
      loadDraftQuery.mockResolvedValue({
        data: { instagramMessageDraft: persistedDraft },
      });
      const pending = deferred<unknown>();
      saveDraftMutation.mockReturnValueOnce(pending.promise);
      const { result } = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      act(() => result.current.setBody('In-flight edit'));
      let initialFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        initialFlush = result.current.flush();
      });
      act(() => result.current.setBody(''));
      let clearFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        clearFlush = result.current.flush();
      });
      await act(async () => {
        if (outcome === 'failure') pending.reject(new Error('Save failed'));
        else
          pending.resolve({
            data: {
              saveInstagramMessageDraft: {
                ...persistedDraft,
                status: 'CONFLICT',
                body: 'Remote edit',
                revision: 5,
              },
            },
          });
        expect((await initialFlush).status).toBe(
          outcome === 'failure' ? 'error' : 'conflict',
        );
        expect((await clearFlush).status).toBe(
          outcome === 'failure' ? 'error' : 'conflict',
        );
      });
      expect(result.current.body).toBe('');
      expect(result.current.revision).toBe(4);
      await act(async () => jest.advanceTimersByTimeAsync(1500));
      expect(saveDraftMutation).toHaveBeenCalledTimes(1);
    },
  );

  it('retains unload flush persistence without publishing its completion', async () => {
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: persistedDraft },
    });
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: { ...persistedDraft, body: '', revision: 5 },
      },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => first.result.current.setBody(''));
    const flushOnCleanup = first.result.current.flush;
    first.unmount();
    expect((await flushOnCleanup()).status).toBe('error');
    expect(saveDraftMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({
            body: '',
            expectedRevision: 4,
            draftId: persistedDraft.draftId,
            conversationRecordId: conversationId,
          }),
        },
      }),
    );
    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    expect(remounted.result.current.body).toBe('');
    expect(remounted.result.current.revision).toBe(4);
  });

  it('allows an explicit retry after a synchronous mutation failure', async () => {
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: persistedDraft },
    });
    saveDraftMutation.mockImplementationOnce(() => {
      throw new Error('Mutation rejected');
    });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => result.current.setBody(''));
    await act(async () => {
      expect((await result.current.flush()).status).toBe('error');
    });
    saveDraftMutation.mockResolvedValueOnce({
      data: {
        saveInstagramMessageDraft: { ...persistedDraft, body: '', revision: 5 },
      },
    });
    await act(async () => {
      expect(await result.current.flush()).toEqual({
        status: 'empty',
        revision: 5,
      });
    });
    expect(saveDraftMutation).toHaveBeenCalledTimes(2);
  });

  it('autosaves a clear made during an in-flight text save', async () => {
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: persistedDraft },
    });
    const pending = deferred<SaveResponse>();
    saveDraftMutation
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: '',
            revision: 6,
          },
        },
      });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => result.current.setBody('In-flight text'));
    await act(async () => jest.advanceTimersByTimeAsync(750));
    act(() => result.current.setBody(''));
    await act(async () => {
      pending.resolve({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: 'In-flight text',
            revision: 5,
          },
        },
      });
    });
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(saveDraftMutation).toHaveBeenCalledTimes(2);
    expect(result.current.body).toBe('');
    expect(result.current.revision).toBe(6);
  });

  it('preserves text edited while a clear is in flight and saves it at the new revision', async () => {
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: persistedDraft },
    });
    const pending = deferred<SaveResponse>();
    saveDraftMutation
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: 'New text',
            revision: 6,
          },
        },
      });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => result.current.setBody(''));
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(saveDraftMutation).toHaveBeenCalledTimes(1);
    act(() => result.current.setBody('New text'));
    await act(async () => {
      pending.resolve({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: '',
            revision: 5,
          },
        },
      });
    });
    expect(result.current.body).toBe('New text');
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(saveDraftMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({
            body: 'New text',
            expectedRevision: 5,
          }),
        },
      }),
    );
    expect(result.current.revision).toBe(6);
  });

  it('does not publish a save completion into another target', async () => {
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: persistedDraft },
    });
    const pending = deferred<SaveResponse>();
    saveDraftMutation.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => result.current.setBody('Old edit'));
    let oldFlush!: ReturnType<typeof result.current.flush>;
    act(() => {
      oldFlush = result.current.flush();
    });
    activeContactId += '-new';
    activeConversationId += '-new';
    rerender();
    await act(async () => Promise.resolve());
    await act(async () => {
      pending.resolve({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: 'Old edit',
            revision: 5,
          },
        },
      });
      await oldFlush;
    });
    expect(result.current.body).toBe('');
    expect(result.current.revision).toBe(0);
  });

  it.each(['success', 'conflict', 'failure'])(
    'ignores old-scope save %s and does not clear a newer save operation',
    async (outcome) => {
      loadDraftQuery.mockResolvedValueOnce({
        data: { instagramMessageDraft: persistedDraft },
      });
      const oldSave = deferred<unknown>();
      const newSave = deferred<SaveResponse>();
      saveDraftMutation
        .mockReturnValueOnce(oldSave.promise)
        .mockReturnValueOnce(newSave.promise);
      const { result, rerender } = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      act(() => result.current.setBody('Old-scope edit'));
      let oldFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        oldFlush = result.current.flush();
      });
      const oldContactId = activeContactId;
      activeContactId = `${activeContactId}-other`;
      activeConversationId += '-other';
      rerender();
      await act(async () => Promise.resolve());
      act(() => result.current.setBody('New-scope edit'));
      let newFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        newFlush = result.current.flush();
      });
      expect(saveDraftMutation).toHaveBeenCalledTimes(2);
      await act(async () => {
        if (outcome === 'failure') oldSave.reject(new Error('Old failure'));
        else
          oldSave.resolve({
            data: {
              saveInstagramMessageDraft: {
                ...persistedDraft,
                body: 'Old response',
                revision: 9,
                status: outcome === 'conflict' ? 'CONFLICT' : 'SAVED',
              },
            },
          });
        expect((await oldFlush).status).toBe('error');
      });
      expect(result.current.body).toBe('New-scope edit');
      expect(result.current.revision).toBe(0);
      expect(result.current.status).toBe('saving');
      expect(result.current.conflict).toBeNull();
      expect(result.current.error).toBeNull();
      let duplicateFlush!: ReturnType<typeof result.current.flush>;
      act(() => {
        duplicateFlush = result.current.flush();
      });
      expect(saveDraftMutation).toHaveBeenCalledTimes(2);
      await act(async () => {
        newSave.resolve({
          data: {
            saveInstagramMessageDraft: {
              ...persistedDraft,
              body: 'New-scope edit',
              revision: 1,
            },
          },
        });
        await newFlush;
        await duplicateFlush;
      });
      activeContactId = oldContactId;
      activeConversationId = conversationId;
      loadDraftQuery.mockResolvedValueOnce({
        data: {
          instagramMessageDraft: {
            ...persistedDraft,
            revision: 9,
            body: 'Old response',
          },
        },
      });
      rerender();
      await act(async () => Promise.resolve());
      expect(result.current.body).toBe('Old-scope edit');
      expect(result.current.revision).toBe(4);
      saveDraftMutation.mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            status: 'CONFLICT',
            revision: 9,
            body: 'Old response',
          },
        },
      });
      await act(async () => {
        expect((await result.current.flush()).status).toBe('conflict');
      });
      expect(result.current.body).toBe('Old-scope edit');
    },
  );

  it.each(['switch-back', 'unmount'])(
    'invalidates a pending clear after %s even when the same scope returns',
    async (transition) => {
      loadDraftQuery.mockResolvedValue({
        data: { instagramMessageDraft: persistedDraft },
      });
      const pending = deferred<SaveResponse>();
      saveDraftMutation.mockReturnValueOnce(pending.promise);
      const first = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      act(() => first.result.current.setBody(''));
      let oldFlush!: ReturnType<typeof first.result.current.flush>;
      act(() => {
        oldFlush = first.result.current.flush();
      });
      expect(saveDraftMutation).toHaveBeenCalledTimes(1);
      const oldContactId = activeContactId;
      if (transition === 'switch-back') {
        activeContactId += '-away';
        activeConversationId += '-away';
        first.rerender();
        await act(async () => Promise.resolve());
        activeContactId = oldContactId;
        activeConversationId = conversationId;
        first.rerender();
      } else first.unmount();
      const current = transition === 'unmount' ? renderDraft('REPLY') : first;
      await act(async () => Promise.resolve());
      await act(async () => {
        pending.resolve({
          data: {
            saveInstagramMessageDraft: {
              ...persistedDraft,
              body: '',
              revision: 5,
            },
          },
        });
        expect((await oldFlush).status).toBe('error');
      });
      expect(current.result.current.body).toBe('');
      expect(current.result.current.revision).toBe(4);
      expect(current.result.current.conflict).toBeNull();
      expect(current.result.current.error).toBeNull();
    },
  );

  it.each(['New local edit', ''])(
    'preserves the local intent %j made during hydration',
    async (localBody) => {
      const pending = deferred<{
        data: { instagramMessageDraft: typeof persistedDraft };
      }>();
      loadDraftQuery.mockReturnValueOnce(pending.promise);
      const { result } = renderDraft('REPLY');
      act(() => result.current.setBody(localBody));
      await act(async () => {
        pending.resolve({ data: { instagramMessageDraft: persistedDraft } });
      });
      expect(result.current.body).toBe(localBody);
      expect(result.current.draftId).toBe(persistedDraft.draftId);
      expect(result.current.revision).toBe(4);
      saveDraftMutation.mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            body: localBody,
            revision: 5,
          },
        },
      });
      await act(async () => {
        await result.current.flush();
      });
      expect(saveDraftMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: expect.objectContaining({
              draftId: persistedDraft.draftId,
              expectedRevision: 4,
              body: localBody,
            }),
          },
        }),
      );
    },
  );

  it('does not mutate before GET establishes the draft identity and lock', async () => {
    const pending = deferred<{
      data: { instagramMessageDraft: typeof persistedDraft };
    }>();
    loadDraftQuery.mockReturnValueOnce(pending.promise);
    const { result } = renderDraft('REPLY');
    act(() => result.current.setBody('New local edit'));
    await act(async () => {
      expect(await result.current.flush()).toEqual({
        status: 'error',
        revision: 0,
      });
    });
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(saveDraftMutation).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
    await act(async () => {
      pending.resolve({
        data: {
          instagramMessageDraft: { ...persistedDraft, executionLocked: true },
        },
      });
    });
    expect(result.current.body).toBe('New local edit');
    expect(result.current.executionLocked).toBe(true);
    await act(async () => {
      expect(await result.current.flush()).toEqual({
        status: 'error',
        revision: 4,
      });
    });
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(saveDraftMutation).not.toHaveBeenCalled();
  });

  it.each(['New local edit', ''])(
    'retains %j and the load error without saving after failed hydration',
    async (localBody) => {
      const pending = deferred<unknown>();
      loadDraftQuery.mockReturnValueOnce(pending.promise);
      const first = renderDraft('REPLY');
      act(() => first.result.current.setBody(localBody));
      await act(async () => {
        pending.reject(new Error('Permission denied'));
      });
      act(() => first.result.current.setBody(localBody));
      expect(first.result.current.body).toBe(localBody);
      expect(first.result.current.status).toBe('error');
      expect(first.result.current.error).toBe(
        'Could not load the saved Instagram draft.',
      );
      await act(async () => {
        expect(await first.result.current.flush()).toEqual({
          status: 'error',
          revision: 0,
        });
      });
      await act(async () => jest.advanceTimersByTimeAsync(1500));
      expect(saveDraftMutation).not.toHaveBeenCalled();
      first.unmount();
      loadDraftQuery.mockResolvedValueOnce({
        data: { instagramMessageDraft: persistedDraft },
      });
      const remounted = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      expect(remounted.result.current.body).toBe(localBody);
      expect(remounted.result.current.draftId).toBe(persistedDraft.draftId);
      expect(remounted.result.current.revision).toBe(4);
    },
  );

  it.each(['New local edit', ''])(
    'establishes a missing baseline without losing %j',
    async (localBody) => {
      const pending = deferred<{ data: { instagramMessageDraft: null } }>();
      loadDraftQuery.mockReturnValueOnce(pending.promise);
      const { result } = renderDraft('REPLY');
      const originalId = result.current.draftId;
      act(() => result.current.setBody(localBody));
      await act(async () => {
        pending.resolve({ data: { instagramMessageDraft: null } });
      });
      expect(result.current.body).toBe(localBody);
      expect(result.current.draftId).toBe(originalId);
      expect(result.current.revision).toBe(0);
      expect(result.current.status).toBe('saved');
      saveDraftMutation.mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            revision: 1,
            body: localBody,
          },
        },
      });
      await act(async () => {
        expect((await result.current.flush()).status).toBe(
          localBody ? 'saved' : 'empty',
        );
      });
      if (localBody)
        expect(saveDraftMutation).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: {
              input: expect.objectContaining({
                draftId: originalId,
                expectedRevision: 0,
                body: localBody,
              }),
            },
          }),
        );
      else expect(saveDraftMutation).not.toHaveBeenCalled();
    },
  );

  it.each([0, 4])(
    'does not rebase a known dirty revision %i when later hydration sees a newer draft',
    async (knownRevision) => {
      loadDraftQuery.mockResolvedValueOnce({
        data: { instagramMessageDraft: knownRevision ? persistedDraft : null },
      });
      const first = renderDraft('REPLY');
      await act(async () => Promise.resolve());
      const originalId = first.result.current.draftId;
      act(() => first.result.current.setBody(''));
      first.unmount();
      const pending = deferred<{
        data: { instagramMessageDraft: typeof persistedDraft };
      }>();
      loadDraftQuery.mockReturnValueOnce(pending.promise);
      const remounted = renderDraft('REPLY');
      act(() => remounted.result.current.setBody('Newer local edit'));
      await act(async () => {
        expect((await remounted.result.current.flush()).status).toBe('error');
        pending.resolve({
          data: {
            instagramMessageDraft: {
              ...persistedDraft,
              draftId: originalId ?? persistedDraft.draftId,
              revision: 9,
              body: 'Remote edit',
            },
          },
        });
      });
      expect(saveDraftMutation).not.toHaveBeenCalled();
      expect(remounted.result.current.body).toBe('Newer local edit');
      expect(remounted.result.current.draftId).toBe(originalId);
      expect(remounted.result.current.revision).toBe(knownRevision);
      saveDraftMutation.mockResolvedValueOnce({
        data: {
          saveInstagramMessageDraft: {
            ...persistedDraft,
            draftId: originalId ?? persistedDraft.draftId,
            status: 'CONFLICT',
            revision: 9,
            body: 'Remote edit',
          },
        },
      });
      await act(async () => {
        expect((await remounted.result.current.flush()).status).toBe(
          'conflict',
        );
      });
      expect(saveDraftMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: expect.objectContaining({
              draftId: originalId,
              expectedRevision: knownRevision,
              body: 'Newer local edit',
            }),
          },
        }),
      );
      expect(remounted.result.current.revision).toBe(knownRevision);
      await act(async () => jest.advanceTimersByTimeAsync(1500));
      expect(saveDraftMutation).toHaveBeenCalledTimes(1);
      act(() => remounted.result.current.reloadConflict());
      expect(remounted.result.current.body).toBe('Remote edit');
      expect(remounted.result.current.revision).toBe(9);
    },
  );

  it.each(['switch', 'switch-back', 'unmount'])(
    'ignores stale GET after %s while retaining pre-hydration edits',
    async (transition) => {
      const oldRead = deferred<unknown>();
      const newRead = deferred<{
        data: { instagramMessageDraft: typeof persistedDraft };
      }>();
      loadDraftQuery.mockReturnValueOnce(oldRead.promise);
      const first = renderDraft('REPLY');
      act(() => first.result.current.setBody('Old local edit'));
      const oldContactId = activeContactId;
      if (transition === 'unmount') first.unmount();
      else {
        activeContactId += '-away';
        activeConversationId += '-away';
        if (transition === 'switch')
          loadDraftQuery.mockReturnValueOnce(newRead.promise);
        first.rerender();
        if (transition === 'switch-back') {
          await act(async () => Promise.resolve());
          activeContactId = oldContactId;
          activeConversationId = conversationId;
          loadDraftQuery.mockReturnValueOnce(newRead.promise);
          first.rerender();
        }
      }
      if (transition === 'unmount')
        loadDraftQuery.mockReturnValueOnce(newRead.promise);
      const current = transition === 'unmount' ? renderDraft('REPLY') : first;
      act(() => current.result.current.setBody('Current local edit'));
      await act(async () => {
        oldRead.resolve({
          data: {
            instagramMessageDraft: {
              ...persistedDraft,
              revision: 99,
              executionLocked: true,
            },
          },
        });
      });
      expect(current.result.current.body).toBe('Current local edit');
      expect(current.result.current.revision).toBe(0);
      expect(current.result.current.executionLocked).toBe(false);
      expect(current.result.current.status).toBe('loading');
      await act(async () => {
        newRead.resolve({ data: { instagramMessageDraft: persistedDraft } });
      });
      expect(current.result.current.body).toBe('Current local edit');
      expect(current.result.current.revision).toBe(4);
      expect(current.result.current.draftId).toBe(persistedDraft.draftId);
    },
  );

  it('does not let a stale GET failure replace a newer hydrated scope', async () => {
    const pending = deferred<unknown>();
    loadDraftQuery.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderDraft('REPLY');
    activeContactId += '-away';
    activeConversationId += '-away';
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: persistedDraft },
    });
    rerender();
    await act(async () => Promise.resolve());
    await act(async () => {
      pending.reject(new Error('Old read failed'));
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.body).toBe(persistedDraft.body);
    expect(result.current.error).toBeNull();
  });

  it('does not mutate from an unload flush before hydration or adopt its stale GET', async () => {
    const pending = deferred<unknown>();
    loadDraftQuery.mockReturnValueOnce(pending.promise);
    const first = renderDraft('REPLY');
    act(() => first.result.current.setBody('Unsaved local edit'));
    const flush = first.result.current.flush;
    first.unmount();
    expect((await flush()).status).toBe('error');
    expect(saveDraftMutation).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({
        data: { instagramMessageDraft: { ...persistedDraft, revision: 99 } },
      });
    });
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: persistedDraft },
    });
    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    expect(remounted.result.current.body).toBe('Unsaved local edit');
    expect(remounted.result.current.revision).toBe(4);
  });

  it('rejects a pre-hydration flush closure after the identity changes', async () => {
    const pending = deferred<{
      data: { instagramMessageDraft: typeof persistedDraft };
    }>();
    loadDraftQuery.mockReturnValueOnce(pending.promise);
    const { result } = renderDraft('REPLY');
    act(() => result.current.setBody('Local edit'));
    const staleFlush = result.current.flush;
    await act(async () => {
      pending.resolve({ data: { instagramMessageDraft: persistedDraft } });
    });
    await act(async () => {
      expect((await staleFlush()).status).toBe('error');
    });
    expect(saveDraftMutation).not.toHaveBeenCalled();
  });

  it('autosaves a clear of a clean persisted snapshot only after hydration, using its original revision', async () => {
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: persistedDraft },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    first.unmount();
    const pending = deferred<{
      data: { instagramMessageDraft: typeof persistedDraft };
    }>();
    loadDraftQuery.mockReturnValueOnce(pending.promise);
    const remounted = renderDraft('REPLY');
    expect(remounted.result.current.body).toBe(persistedDraft.body);
    act(() => remounted.result.current.setBody(''));
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(saveDraftMutation).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({
        data: {
          instagramMessageDraft: {
            ...persistedDraft,
            revision: 9,
            body: 'Remote edit',
          },
        },
      });
    });
    expect(remounted.result.current.body).toBe('');
    expect(remounted.result.current.revision).toBe(4);
    saveDraftMutation.mockResolvedValueOnce({
      data: {
        saveInstagramMessageDraft: {
          ...persistedDraft,
          status: 'CONFLICT',
          revision: 9,
          body: 'Remote edit',
        },
      },
    });
    await act(async () => jest.advanceTimersByTimeAsync(750));
    expect(saveDraftMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({
            draftId: persistedDraft.draftId,
            expectedRevision: 4,
            body: '',
          }),
        },
      }),
    );
    expect(remounted.result.current.status).toBe('conflict');
    expect(remounted.result.current.body).toBe('');
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(saveDraftMutation).toHaveBeenCalledTimes(1);
  });

  it('hydrates an execution lock over an existing dirty snapshot without saving or replacing it', async () => {
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: persistedDraft },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => first.result.current.setBody('Dirty local edit'));
    first.unmount();
    loadDraftQuery.mockResolvedValueOnce({
      data: {
        instagramMessageDraft: {
          ...persistedDraft,
          revision: 9,
          executionLocked: true,
        },
      },
    });
    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    expect(remounted.result.current.body).toBe('Dirty local edit');
    expect(remounted.result.current.revision).toBe(4);
    expect(remounted.result.current.executionLocked).toBe(true);
    await act(async () => {
      expect(await remounted.result.current.flush()).toEqual({
        status: 'error',
        revision: 4,
      });
    });
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(saveDraftMutation).not.toHaveBeenCalled();
  });

  it('rotates to a fresh empty draft after a successful send', async () => {
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    const previousDraftId = result.current.draftId;

    act(() => result.current.setBody('Sent body'));
    act(() => result.current.resetAfterSend());

    expect(result.current.draftId).not.toBe(previousDraftId);
    expect(result.current.body).toBe('');
    expect(result.current.revision).toBe(0);
  });
});
