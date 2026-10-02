import { act, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type PropsWithChildren } from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useMyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { useMyahInboxReplyDraft } from '@/myah/inbox/hooks/useMyahInboxReplyDraft';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { ReplyChannel, ReplyContextKind } from '~/generated/graphql';

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: jest.fn(),
}));
const input = {
  expectedWorkspaceId: 'workspace',
  target: {
    channel: ReplyChannel.EMAIL,
    contactId: 'opaque',
    threadId: 'thread',
  },
  replyContext: { kind: ReplyContextKind.CAMPAIGN, campaignId: 'a' },
};
const draft = (campaignId: string, executionState = 'READY') => ({
  data: {
    myahInboxReplyDraft: {
      revision: 2,
      executionState,
      body: { markdown: campaignId, blocknote: null },
      resolvedContext: {
        kind: 'CAMPAIGN',
        campaignId,
        contextFingerprint: 'fingerprint',
        target: {
          channel: 'EMAIL',
          deliveryTargetId: 'thread',
          contactAnchorKind: 'CREATOR',
          contactAnchorId: 'anchor',
        },
      },
    },
  },
});
const setup = (
  query: jest.Mock,
  initialValue: typeof input | null = input,
  store = createStore(),
) => {
  store.set(currentWorkspaceState.atom, { id: 'workspace' } as never);
  jest.mocked(useApolloCoreClient).mockReturnValue({ query } as never);
  jest
    .mocked(useMyahInboxThreadMutations)
    .mockReturnValue({ saveDraft: jest.fn() } as never);
  return renderHook(
    ({ value }: { value: typeof input | null }) => {
      const controller = useMyahInboxDraftAutosaveController();
      return { ...useMyahInboxReplyDraft(value, controller), controller };
    },
    {
      initialProps: { value: initialValue },
      wrapper: ({ children }: PropsWithChildren) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
};

describe('useMyahInboxReplyDraft background arrival', () => {
  it('updates incoming staleness while typing without replacing text or locking the editor', async () => {
    const store = createStore();
    store.set(currentWorkspaceState.atom, { id: 'workspace' } as never);
    const query = jest.fn().mockResolvedValueOnce(draft('a'));
    jest.mocked(useApolloCoreClient).mockReturnValue({ query } as never);
    jest.mocked(useMyahInboxThreadMutations).mockReturnValue({
      saveDraft: jest.fn(() => new Promise(() => {})),
    } as never);
    const { result, rerender } = renderHook(
      ({ epoch }: { epoch: number }) => {
        const controller = useMyahInboxDraftAutosaveController();
        return {
          ...useMyahInboxReplyDraft(input, controller, '', epoch),
          controller,
        };
      },
      {
        initialProps: { epoch: 0 },
        wrapper: ({ children }: PropsWithChildren) => (
          <Provider store={store}>{children}</Provider>
        ),
      },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() =>
      result.current.controller.updateDraft({
        key: result.current.key!,
        body: { markdown: 'still typing', blocknote: null },
        editorOwner: result.current.editorOwner,
      }),
    );
    const arrived = draft('a', 'NEEDS_REVIEW');
    Object.assign(arrived.data.myahInboxReplyDraft, {
      incomingState: 'STALE',
      bodyEdited: true,
    });
    arrived.data.myahInboxReplyDraft.body.markdown = 'server body';
    query.mockResolvedValueOnce(arrived);
    rerender({ epoch: 1 });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.entry).toMatchObject({
        incomingState: 'STALE',
        executionState: 'READY',
        dirty: true,
        localBody: { markdown: 'still typing' },
      }),
    );
    expect(result.current.status).toBe('ready');
  });
});

describe('useMyahInboxReplyDraft', () => {
  describe('authoritative NEEDS_REVIEW reads and conflict adoption', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    describe.each(['dirty', 'saving', 'error', 'conflict'] as const)(
      '%s local state',
      (localState) => {
        describe.each([2, 7])('server revision %s', (revision) => {
          it.each(['READY', 'NEEDS_REVIEW'] as const)(
            'reauthorizes %s without reviewing uncommitted bytes',
            async (executionState) => {
              const response = draft('a', executionState);
              response.data.myahInboxReplyDraft.revision = revision;
              // Same-base saving must still be superseded by NEEDS_REVIEW.
              if (localState !== 'saving' || revision !== 2)
                response.data.myahInboxReplyDraft.body.markdown =
                  'authoritative';
              const query = jest.fn().mockResolvedValueOnce(draft('a'));
              const { result } = setup(query);
              let settle!: (value: unknown) => void;
              const saveDraft = jest.fn().mockImplementation(() => {
                if (localState === 'error')
                  return Promise.reject(new Error('save failed'));
                if (localState === 'conflict')
                  return Promise.resolve({
                    status: 'CONFLICT',
                    revision: 3,
                    body: { markdown: 'conflicting bytes', blocknote: null },
                  });
                return new Promise((resolve) => {
                  settle = resolve;
                });
              });
              const reviewContext = jest.fn().mockResolvedValue({});
              jest
                .mocked(useMyahInboxThreadMutations)
                .mockReturnValue({ saveDraft, reviewContext } as never);
              await waitFor(() => expect(result.current.status).toBe('ready'));
              const key = result.current.key!;
              let saving: Promise<unknown> | undefined;
              act(() => {
                result.current.controller.updateDraft({
                  key,
                  body: {
                    markdown: 'unsaved private',
                    blocknote: 'private blocks',
                  },
                  editorOwner: result.current.editorOwner,
                });
                if (localState !== 'dirty')
                  saving = result.current.controller.flush(key);
              });
              if (localState === 'error' || localState === 'conflict')
                await act(async () => {
                  await saving;
                });
              const local = result.current.entry!;
              query.mockResolvedValueOnce(response);
              act(() => result.current.reload());
              await waitFor(() => expect(result.current.status).toBe('ready'));
              const superseded =
                executionState === 'NEEDS_REVIEW' ||
                (localState === 'saving' && revision === 7);
              if (superseded) {
                expect(result.current.entry).toMatchObject({
                  executionState,
                  localBody: response.data.myahInboxReplyDraft.body,
                  confirmedBody: response.data.myahInboxReplyDraft.body,
                  confirmedRevision: revision,
                  contextFingerprint: 'fingerprint',
                  dirty: false,
                  status: 'idle',
                  error: null,
                  conflict: null,
                  pendingDebounceVersion: null,
                  proposalContextFingerprint: null,
                });
              } else {
                expect(result.current.entry).toMatchObject({
                  localBody: local.localBody,
                  confirmedRevision: 2,
                  dirty: local.dirty,
                  status: local.status,
                  error: local.error,
                  conflict: local.conflict,
                });
              }
              if (executionState === 'NEEDS_REVIEW') {
                expect(
                  result.current.controller.acquire(
                    key,
                    'sending',
                    result.current.editorOwner,
                  ),
                ).toBeNull();
                // Only a guarded generation/update may start from this state;
                // uncommitted dirty/saving/error bytes still block it.
                const generation = result.current.controller.acquire(
                  key,
                  'generating',
                  result.current.editorOwner,
                );
                if (generation) result.current.controller.release(generation);
                query.mockResolvedValueOnce(response);
                await act(async () =>
                  expect(await result.current.review()).toBe(true),
                );
                expect(reviewContext).toHaveBeenCalledWith({
                  ...input,
                  expectedDraftRevision: revision,
                  expectedContextFingerprint: 'fingerprint',
                });
                if (localState === 'saving') {
                  await act(async () => {
                    settle({
                      status: 'CONFLICT',
                      revision: 3,
                      body: { markdown: 'obsolete', blocknote: null },
                    });
                    await saving;
                  });
                }
                await act(async () => jest.advanceTimersByTimeAsync(1500));
                expect(result.current.entry?.localBody).toEqual(
                  response.data.myahInboxReplyDraft.body,
                );
                expect(result.current.entry?.status).toBe('idle');
                expect(saveDraft).toHaveBeenCalledTimes(
                  localState === 'dirty' ? 0 : 1,
                );
              }
            },
          );
        });
      },
    );

    it.each([
      'NEEDS_REVIEW',
      'READY',
      'failure',
      'key',
      'revision',
      'token',
      'unmount',
    ] as const)(
      'rereads two-operator virtual rev0 -> manual rev1 conflict metadata: %s',
      async (outcome) => {
        const store = createStore();
        const initial = draft('a');
        initial.data.myahInboxReplyDraft.revision = 0;
        initial.data.myahInboxReplyDraft.body.markdown = '';
        let settle!: (value: ReturnType<typeof draft>) => void;
        let reject!: (reason: Error) => void;
        const query = jest
          .fn()
          .mockResolvedValueOnce(initial)
          .mockReturnValueOnce(
            new Promise((res, rej) => {
              settle = res;
              reject = rej;
            }),
          );
        const first = setup(query, input, store);
        const saveDraft = jest.fn().mockResolvedValue({
          status: 'CONFLICT',
          revision: 1,
          body: { markdown: 'operator one manual', blocknote: null },
        });
        const reviewContext = jest.fn().mockResolvedValue({});
        jest
          .mocked(useMyahInboxThreadMutations)
          .mockReturnValue({ saveDraft, reviewContext } as never);
        await waitFor(() => expect(first.result.current.status).toBe('ready'));
        const key = first.result.current.key!;
        act(() =>
          first.result.current.controller.updateDraft({
            key,
            body: { markdown: 'operator two private', blocknote: null },
            editorOwner: first.result.current.editorOwner,
          }),
        );
        await act(async () => {
          await first.result.current.controller.flush(key);
        });
        expect(saveDraft).toHaveBeenCalledWith(
          expect.objectContaining({ expectedRevision: 0 }),
        );
        expect(first.result.current.entry?.status).toBe('conflict');
        let reload!: Promise<void> | void;
        act(() => {
          reload = first.result.current.controller.reloadConflict(key);
        });
        expect(query).toHaveBeenCalledTimes(2);
        expect(query).toHaveBeenLastCalledWith(
          expect.objectContaining({
            variables: { input },
            fetchPolicy: 'no-cache',
            errorPolicy: 'none',
            context: expect.objectContaining({ queryDeduplication: false }),
          }),
        );
        for (const kind of ['generating', 'sending', 'reviewing'] as const)
          expect(
            first.result.current.controller.acquire(
              key,
              kind,
              first.result.current.editorOwner,
            ),
          ).toBeNull();
        act(() =>
          first.result.current.controller.updateDraft({
            key,
            body: { markdown: 'blocked edit', blocknote: null },
            editorOwner: first.result.current.editorOwner,
          }),
        );
        expect(
          first.result.current.controller.getEntry(key)?.localBody.markdown,
        ).not.toBe('blocked edit');
        const response = draft(
          'a',
          outcome === 'READY' ? 'READY' : 'NEEDS_REVIEW',
        );
        response.data.myahInboxReplyDraft.revision = 1;
        response.data.myahInboxReplyDraft.body.markdown = 'operator one manual';
        response.data.myahInboxReplyDraft.resolvedContext.contextFingerprint =
          'manual fingerprint';
        let current = first;
        if (outcome === 'token' || outcome === 'unmount') {
          const fresh = draft('a', 'NEEDS_REVIEW');
          fresh.data.myahInboxReplyDraft.revision = 2;
          fresh.data.myahInboxReplyDraft.body.markdown = 'fresh mount';
          query.mockResolvedValueOnce(fresh);
          if (outcome === 'unmount') {
            first.unmount();
            current = setup(query, input, store);
            jest
              .mocked(useMyahInboxThreadMutations)
              .mockReturnValue({ saveDraft, reviewContext } as never);
          } else act(() => first.result.current.reload());
          await waitFor(() =>
            expect(current.result.current.status).toBe('ready'),
          );
          expect(current.result.current.entry?.confirmedRevision).toBe(2);
        }
        if (outcome === 'key')
          response.data.myahInboxReplyDraft.resolvedContext.target.contactAnchorId =
            'foreign anchor';
        if (outcome === 'revision')
          response.data.myahInboxReplyDraft.revision = 2;
        await act(async () => {
          if (outcome === 'failure') reject(new Error('metadata unavailable'));
          else settle(response);
          await reload;
        });
        if (
          outcome === 'failure' ||
          outcome === 'key' ||
          outcome === 'revision'
        ) {
          expect(
            current.result.current.controller.isTargetAuthorized(key),
          ).toBe(false);
          expect(current.result.current.entry).toBeNull();
          for (const kind of ['generating', 'sending', 'reviewing'] as const)
            expect(
              current.result.current.controller.acquire(
                key,
                kind,
                current.result.current.editorOwner,
              ),
            ).toBeNull();
        } else if (outcome === 'token' || outcome === 'unmount') {
          expect(current.result.current.entry).toMatchObject({
            executionState: 'NEEDS_REVIEW',
            confirmedRevision: 2,
            localBody: { markdown: 'fresh mount' },
          });
        } else {
          expect(current.result.current.entry).toMatchObject({
            executionState: outcome,
            confirmedRevision: 1,
            localBody: { markdown: 'operator one manual' },
            contextFingerprint: 'manual fingerprint',
            dirty: false,
            conflict: null,
            error: null,
          });
          if (outcome === 'NEEDS_REVIEW') {
            expect(
              current.result.current.controller.acquire(
                key,
                'sending',
                current.result.current.editorOwner,
              ),
            ).toBeNull();
            {
              const generation = current.result.current.controller.acquire(
                key,
                'generating',
                current.result.current.editorOwner,
              );
              if (generation)
                current.result.current.controller.release(generation);
            }
            query.mockResolvedValueOnce(response);
            await act(async () =>
              expect(await current.result.current.review()).toBe(true),
            );
            expect(reviewContext).toHaveBeenCalledWith({
              ...input,
              expectedDraftRevision: 1,
              expectedContextFingerprint: 'manual fingerprint',
            });
          } else {
            expect(await current.result.current.review()).toBe(false);
            for (const kind of ['generating', 'sending'] as const) {
              let capture!: ReturnType<
                typeof current.result.current.controller.acquire
              >;
              act(() => {
                capture = current.result.current.controller.acquire(
                  key,
                  kind,
                  current.result.current.editorOwner,
                );
              });
              expect(capture?.confirmedRevision).toBe(1);
              act(() => current.result.current.controller.release(capture!));
            }
          }
        }
        await act(async () => {
          await current.result.current.controller.retry(key);
          await current.result.current.controller.reloadConflict(key);
          await current.result.current.controller.flush(key);
          await jest.advanceTimersByTimeAsync(1500);
        });
        expect(saveDraft).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('rereads a detached first manual save through the real remounted capability and permits Review only', async () => {
    const store = createStore();
    store.set(currentWorkspaceState.atom, { id: 'workspace' } as never);
    const response = draft('a', 'NEEDS_REVIEW');
    response.data.myahInboxReplyDraft.revision = 3;
    response.data.myahInboxReplyDraft.body.markdown = 'first manual';
    let resolveSave!: (value: unknown) => void;
    let resolveRead!: (value: ReturnType<typeof draft>) => void;
    const query = jest
      .fn()
      .mockResolvedValueOnce(draft('a'))
      .mockResolvedValueOnce(draft('a'))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      );
    jest.mocked(useApolloCoreClient).mockReturnValue({ query } as never);
    const saveDraft = jest.fn().mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const reviewContext = jest.fn().mockResolvedValue({});
    jest
      .mocked(useMyahInboxThreadMutations)
      .mockReturnValue({ saveDraft, reviewContext } as never);
    const mount = () =>
      renderHook(
        () => {
          const controller = useMyahInboxDraftAutosaveController();
          return { ...useMyahInboxReplyDraft(input, controller), controller };
        },
        {
          wrapper: ({ children }: PropsWithChildren) => (
            <Provider store={store}>{children}</Provider>
          ),
        },
      );
    const first = mount();
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    const key = first.result.current.key!;
    let saving!: Promise<unknown>;
    act(() => {
      first.result.current.controller.updateDraft({
        key,
        body: { markdown: 'first manual', blocknote: null },
        editorOwner: first.result.current.editorOwner,
      });
      saving = first.result.current.controller.flush(key);
    });
    first.unmount();
    const second = mount();
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    await act(async () => {
      resolveSave({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'first manual', blocknote: null },
      });
    });
    expect(query).toHaveBeenCalledTimes(3);
    // Metadata refresh belongs to the new target and gates even Send acquisition.
    expect(
      second.result.current.controller.acquire(
        key,
        'sending',
        second.result.current.editorOwner,
      ),
    ).toBeNull();
    await act(async () => {
      resolveRead(response);
      await saving;
    });
    expect(second.result.current.entry).toMatchObject({
      executionState: 'NEEDS_REVIEW',
      localBody: { markdown: 'first manual' },
      confirmedRevision: 3,
    });
    expect(
      second.result.current.controller.acquire(
        key,
        'sending',
        second.result.current.editorOwner,
      ),
    ).toBeNull();
    {
      const generation = second.result.current.controller.acquire(
        key,
        'generating',
        second.result.current.editorOwner,
      );
      if (generation) second.result.current.controller.release(generation);
    }
    query.mockResolvedValueOnce(response);
    await act(async () => {
      expect(await second.result.current.review()).toBe(true);
    });
    expect(reviewContext).toHaveBeenCalledWith({
      ...input,
      expectedDraftRevision: 3,
      expectedContextFingerprint: 'fingerprint',
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  describe.each(['SAVED', 'CONFLICT', 'rejection'] as const)(
    'delayed %s save completion',
    (completion) => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());
      describe.each([
        { nonreadable: null, completeWhileMasked: false },
        ...(
          ['OUTCOME_PENDING', 'OUTCOME_UNKNOWN', 'CONTEXT_UNAVAILABLE'] as const
        ).flatMap((nonreadable) => [
          { nonreadable, completeWhileMasked: false },
          { nonreadable, completeWhileMasked: true },
        ]),
      ])(
        'after $nonreadable reload (complete while masked: $completeWhileMasked)',
        ({ nonreadable, completeWhileMasked }) => {
          it.each(['READY', 'NEEDS_REVIEW'] as const)(
            'cannot overwrite authoritative %s revision 7 or install stale bookkeeping',
            async (executionState) => {
              let resolve!: (value: unknown) => void;
              let reject!: (reason: Error) => void;
              const deferred = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
              });
              const query = jest.fn().mockResolvedValueOnce(draft('a'));
              if (nonreadable)
                query.mockResolvedValueOnce(draft('a', nonreadable));
              const recovered = draft('a', executionState);
              recovered.data.myahInboxReplyDraft.revision = 7;
              recovered.data.myahInboxReplyDraft.body.markdown =
                'server recovery';
              query.mockResolvedValueOnce(recovered);
              const { result } = setup(query);
              const saveDraft = jest.fn().mockReturnValueOnce(deferred);
              const reviewContext = jest.fn().mockResolvedValue({});
              jest
                .mocked(useMyahInboxThreadMutations)
                .mockReturnValue({ saveDraft, reviewContext } as never);
              await waitFor(() => expect(result.current.status).toBe('ready'));
              const key = result.current.key!;
              let saving!: ReturnType<typeof result.current.controller.flush>;
              act(() => {
                result.current.controller.updateDraft({
                  key,
                  body: {
                    markdown: 'submitted private',
                    blocknote: 'private blocks',
                  },
                  editorOwner: result.current.editorOwner,
                });
                saving = result.current.controller.flush(key);
              });
              expect(saveDraft).toHaveBeenCalledTimes(1);
              expect(saveDraft).toHaveBeenCalledWith(
                expect.objectContaining({ expectedRevision: 2 }),
              );
              const completeSave = async () => {
                await act(async () => {
                  if (completion === 'rejection')
                    reject(new Error('old save failed'));
                  else
                    resolve({
                      status: completion,
                      revision: 3,
                      body: {
                        markdown: 'stale mutation bytes',
                        blocknote: null,
                      },
                    });
                  await saving;
                });
              };
              if (nonreadable) {
                act(() => result.current.reload());
                await waitFor(() =>
                  expect(result.current.entry?.executionState).toBe(
                    nonreadable,
                  ),
                );
                expect(result.current.entry?.localBody.markdown).toBe('');
                expect(result.current.entry?.confirmedBody).toBeNull();
                if (completeWhileMasked) {
                  const masked = result.current.entry;
                  await completeSave();
                  expect(result.current.entry).toEqual(masked);
                  await act(async () => jest.advanceTimersByTime(1500));
                  await act(async () => {
                    await result.current.controller.flush(key);
                  });
                  expect(saveDraft).toHaveBeenCalledTimes(1);
                }
              }
              act(() => result.current.reload());
              await waitFor(() => expect(result.current.status).toBe('ready'));
              expect(result.current.entry).toMatchObject({
                confirmedRevision: 7,
                localBody: { markdown: 'server recovery' },
                confirmedBody: { markdown: 'server recovery' },
                status: 'idle',
                dirty: false,
                error: null,
                conflict: null,
              });
              const beforeCompletion = result.current.entry;
              if (!completeWhileMasked) await completeSave();
              expect(result.current.entry).toEqual(beforeCompletion);
              await act(async () => jest.advanceTimersByTime(1500));
              await act(async () => {
                await result.current.controller.flush(key);
              });
              expect(result.current.entry).toEqual(beforeCompletion);
              expect(saveDraft).toHaveBeenCalledTimes(1);
              expect(query).toHaveBeenCalledTimes(nonreadable ? 3 : 2);
              for (const kind of [
                'generating',
                'sending',
                'reviewing',
              ] as const) {
                let capture!: ReturnType<
                  typeof result.current.controller.acquire
                >;
                act(() => {
                  capture = result.current.controller.acquire(
                    key,
                    kind,
                    result.current.editorOwner,
                  );
                });
                // Generation is guarded but allowed in both readable states.
                if (
                  kind === 'generating' ||
                  (kind === 'reviewing') === (executionState === 'NEEDS_REVIEW')
                ) {
                  expect(capture?.confirmedRevision).toBe(7);
                  act(() => result.current.controller.release(capture!));
                } else expect(capture).toBeNull();
              }
              if (executionState === 'NEEDS_REVIEW') {
                query.mockResolvedValueOnce(recovered);
                await act(async () =>
                  expect(await result.current.review()).toBe(true),
                );
                expect(reviewContext).toHaveBeenCalledWith({
                  ...input,
                  expectedDraftRevision: 7,
                  expectedContextFingerprint: 'fingerprint',
                });
              }
              expect(saveDraft).toHaveBeenCalledTimes(1);
            },
          );
        },
      );
    },
  );

  describe.each(['READY', 'OUTCOME_PENDING', 'OUTCOME_UNKNOWN'] as const)(
    '%s through direct unavailable recovery reload',
    (outcomeState) => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());
      it.each(['READY', 'NEEDS_REVIEW'] as const)(
        'discards invalidated private edits and exposes authoritative %s revision/body',
        async (executionState) => {
          let resolve!: (value: ReturnType<typeof draft>) => void;
          const query = jest.fn().mockResolvedValueOnce(draft('a'));
          if (outcomeState !== 'READY')
            query.mockResolvedValueOnce(draft('a', outcomeState));
          query
            .mockResolvedValueOnce(draft('a', 'CONTEXT_UNAVAILABLE'))
            .mockReturnValueOnce(
              new Promise((r) => {
                resolve = r;
              }),
            );
          const { result } = setup(query);
          const saveDraft = jest.fn();
          const reviewContext = jest.fn().mockResolvedValue({});
          jest
            .mocked(useMyahInboxThreadMutations)
            .mockReturnValue({ saveDraft, reviewContext } as never);
          await waitFor(() => expect(result.current.status).toBe('ready'));
          const key = result.current.key!;
          act(() => {
            result.current.controller.updateDraft({
              key,
              body: {
                markdown: 'unsaved private',
                blocknote: 'private blocks',
              },
              editorOwner: result.current.editorOwner,
            });
            result.current.reload();
          });
          if (outcomeState !== 'READY') {
            await waitFor(() =>
              expect(result.current.entry?.executionState).toBe(outcomeState),
            );
            act(() => result.current.reload());
          }
          await waitFor(() =>
            expect(result.current.entry?.executionState).toBe(
              'CONTEXT_UNAVAILABLE',
            ),
          );
          expect(result.current.entry).toMatchObject({
            localBody: { markdown: '', blocknote: null },
            confirmedBody: null,
            operation: null,
            dirty: false,
            pendingDebounceVersion: null,
            proposalContextFingerprint: null,
            status: 'idle',
            error: null,
            conflict: null,
          });
          await act(async () => jest.advanceTimersByTime(1500));
          await act(async () => {
            await result.current.controller.flush(key);
          });
          expect(saveDraft).not.toHaveBeenCalled();
          act(() => result.current.reload());
          expect(result.current.entry).toBeNull();
          await waitFor(() =>
            expect(query).toHaveBeenCalledTimes(
              outcomeState === 'READY' ? 3 : 4,
            ),
          );
          const recovered = draft('a', executionState);
          recovered.data.myahInboxReplyDraft.revision = 7;
          recovered.data.myahInboxReplyDraft.body.markdown = 'server recovery';
          await act(async () => resolve(recovered));
          await waitFor(() => expect(result.current.status).toBe('ready'));
          expect(result.current.entry).toMatchObject({
            executionState,
            confirmedRevision: 7,
            localBody: { markdown: 'server recovery' },
            confirmedBody: { markdown: 'server recovery' },
            dirty: false,
            pendingDebounceVersion: null,
            operation: null,
            proposalContextFingerprint: null,
            status: 'idle',
            error: null,
            conflict: null,
          });
          await act(async () => jest.advanceTimersByTime(1500));
          await act(async () => {
            await result.current.controller.flush(key);
          });
          expect(result.current.entry?.localBody.markdown).toBe(
            'server recovery',
          );
          expect(saveDraft).not.toHaveBeenCalled();
          if (executionState === 'NEEDS_REVIEW') {
            {
              // Stale-but-readable NEEDS_REVIEW permits only a guarded generation.
              const generation = result.current.controller.acquire(
                key,
                'generating',
                result.current.editorOwner,
              );
              if (generation) result.current.controller.release(generation);
            }
            expect(
              result.current.controller.acquire(
                key,
                'sending',
                result.current.editorOwner,
              ),
            ).toBeNull();
            query.mockResolvedValueOnce(recovered);
            await act(async () =>
              expect(await result.current.review()).toBe(true),
            );
            expect(reviewContext).toHaveBeenCalledWith({
              ...input,
              expectedDraftRevision: 7,
              expectedContextFingerprint: 'fingerprint',
            });
          } else {
            for (const operation of ['generating', 'sending'] as const) {
              let capture!: ReturnType<
                typeof result.current.controller.acquire
              >;
              act(() => {
                capture = result.current.controller.acquire(
                  key,
                  operation,
                  result.current.editorOwner,
                );
              });
              expect(capture?.confirmedRevision).toBe(7);
              act(() => result.current.controller.release(capture!));
            }
          }
          expect(saveDraft).not.toHaveBeenCalled();
        },
      );
    },
  );

  describe.each(['OUTCOME_PENDING', 'OUTCOME_UNKNOWN'] as const)(
    '%s direct draft-read recovery reload',
    (outcomeState) => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());
      it.each(['READY', 'NEEDS_REVIEW'] as const)(
        'discards invalidated private edits and exposes authoritative %s revision/body',
        async (executionState) => {
          let resolve!: (value: ReturnType<typeof draft>) => void;
          const query = jest
            .fn()
            .mockResolvedValueOnce(draft('a'))
            .mockResolvedValueOnce(draft('a', outcomeState))
            .mockReturnValueOnce(
              new Promise((r) => {
                resolve = r;
              }),
            );
          const { result } = setup(query);
          const saveDraft = jest.fn();
          const reviewContext = jest.fn().mockResolvedValue({});
          jest
            .mocked(useMyahInboxThreadMutations)
            .mockReturnValue({ saveDraft, reviewContext } as never);
          await waitFor(() => expect(result.current.status).toBe('ready'));
          const key = result.current.key!;
          act(() => {
            result.current.controller.updateDraft({
              key,
              body: { markdown: 'unsaved private', blocknote: null },
              editorOwner: result.current.editorOwner,
            });
            result.current.reload();
          });
          expect(result.current.entry).toBeNull();
          expect(
            result.current.controller.acquire(
              key,
              'sending',
              result.current.editorOwner,
            ),
          ).toBeNull();
          await waitFor(() =>
            expect(result.current.entry?.executionState).toBe(outcomeState),
          );
          expect(result.current.entry).toMatchObject({
            localBody: { markdown: '', blocknote: null },
            confirmedBody: null,
            operation: null,
          });
          expect(query).toHaveBeenCalledTimes(2);
          await act(async () => jest.advanceTimersByTime(1500));
          expect(result.current.entry?.pendingDebounceVersion).toBe(1);
          for (const operation of [
            'generating',
            'sending',
            'reviewing',
          ] as const) {
            expect(
              result.current.controller.acquire(
                key,
                operation,
                result.current.editorOwner,
              ),
            ).toBeNull();
          }
          expect(saveDraft).not.toHaveBeenCalled();
          act(() => result.current.reload());
          expect(result.current.entry).toBeNull();
          await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
          const recovered = draft('a', executionState);
          recovered.data.myahInboxReplyDraft.revision = 7;
          recovered.data.myahInboxReplyDraft.body.markdown = 'server recovery';
          await act(async () => resolve(recovered));
          await waitFor(() => expect(result.current.status).toBe('ready'));
          expect(result.current.entry).toMatchObject({
            executionState,
            confirmedRevision: 7,
            localBody: { markdown: 'server recovery' },
            confirmedBody: { markdown: 'server recovery' },
            dirty: false,
            pendingDebounceVersion: null,
            operation: null,
            proposalContextFingerprint: null,
            status: 'idle',
            error: null,
            conflict: null,
          });
          await act(async () => jest.advanceTimersByTime(1500));
          await act(async () => {
            await result.current.controller.flush(key);
          });
          expect(result.current.entry?.localBody.markdown).toBe(
            'server recovery',
          );
          expect(saveDraft).not.toHaveBeenCalled();
          if (executionState === 'NEEDS_REVIEW') {
            {
              // Stale-but-readable NEEDS_REVIEW permits only a guarded generation.
              const generation = result.current.controller.acquire(
                key,
                'generating',
                result.current.editorOwner,
              );
              if (generation) result.current.controller.release(generation);
            }
            expect(
              result.current.controller.acquire(
                key,
                'sending',
                result.current.editorOwner,
              ),
            ).toBeNull();
            query.mockResolvedValueOnce(recovered);
            await act(async () =>
              expect(await result.current.review()).toBe(true),
            );
            expect(reviewContext).toHaveBeenCalledWith({
              ...input,
              expectedDraftRevision: 7,
              expectedContextFingerprint: 'fingerprint',
            });
          } else {
            for (const operation of ['generating', 'sending'] as const) {
              let capture!: ReturnType<
                typeof result.current.controller.acquire
              >;
              act(() => {
                capture = result.current.controller.acquire(
                  key,
                  operation,
                  result.current.editorOwner,
                );
              });
              expect(capture?.confirmedRevision).toBe(7);
              act(() => result.current.controller.release(capture!));
            }
          }
          expect(saveDraft).not.toHaveBeenCalled();
        },
      );
    },
  );

  describe.each(['pending', 'unknown'] as const)(
    '%s recovery reload',
    (kind) => {
      it.each(['READY', 'NEEDS_REVIEW'] as const)(
        'discards invalidated private edits and exposes authoritative %s revision/body',
        async (executionState) => {
          let resolve!: (value: ReturnType<typeof draft>) => void;
          const query = jest
            .fn()
            .mockResolvedValueOnce(draft('a'))
            .mockReturnValueOnce(
              new Promise((r) => {
                resolve = r;
              }),
            );
          const { result } = setup(query);
          const saveDraft = jest.fn();
          const reviewContext = jest.fn().mockResolvedValue({});
          jest
            .mocked(useMyahInboxThreadMutations)
            .mockReturnValue({ saveDraft, reviewContext } as never);
          await waitFor(() => expect(result.current.status).toBe('ready'));
          const key = result.current.key!;
          act(() => {
            result.current.controller.updateDraft({
              key,
              body: { markdown: 'unsaved private', blocknote: null },
              editorOwner: result.current.editorOwner,
            });
            result.current.controller.setReadinessLock(key, kind);
            result.current.reload();
          });
          expect(result.current.entry).toBeNull();
          expect(
            result.current.controller.acquire(
              key,
              'sending',
              result.current.editorOwner,
            ),
          ).toBeNull();
          expect(result.current.controller.getEntry(key)?.operation?.kind).toBe(
            kind,
          );
          await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
          const recovered = draft('a', executionState);
          recovered.data.myahInboxReplyDraft.revision = 7;
          recovered.data.myahInboxReplyDraft.body.markdown = 'server recovery';
          await act(async () => resolve(recovered));
          await waitFor(() => expect(result.current.status).toBe('ready'));
          expect(result.current.entry).toMatchObject({
            executionState,
            confirmedRevision: 7,
            localBody: { markdown: 'server recovery' },
            confirmedBody: { markdown: 'server recovery' },
            dirty: false,
            pendingDebounceVersion: null,
            operation: null,
          });
          if (executionState === 'NEEDS_REVIEW') {
            {
              // Stale-but-readable NEEDS_REVIEW permits only a guarded generation.
              const generation = result.current.controller.acquire(
                key,
                'generating',
                result.current.editorOwner,
              );
              if (generation) result.current.controller.release(generation);
            }
            expect(
              result.current.controller.acquire(
                key,
                'sending',
                result.current.editorOwner,
              ),
            ).toBeNull();
            query.mockResolvedValueOnce(recovered);
            await act(async () =>
              expect(await result.current.review()).toBe(true),
            );
            expect(reviewContext).toHaveBeenCalledWith({
              ...input,
              expectedDraftRevision: 7,
              expectedContextFingerprint: 'fingerprint',
            });
          } else {
            for (const operation of ['generating', 'sending'] as const) {
              let capture!: ReturnType<
                typeof result.current.controller.acquire
              >;
              act(() => {
                capture = result.current.controller.acquire(
                  key,
                  operation,
                  result.current.editorOwner,
                );
              });
              expect(capture?.confirmedRevision).toBe(7);
              act(() => result.current.controller.release(capture!));
            }
          }
          expect(saveDraft).not.toHaveBeenCalled();
        },
      );
    },
  );

  it('rereads a first manual save and allows explicit review at revision 1', async () => {
    const initial = draft('a');
    initial.data.myahInboxReplyDraft.revision = 0;
    initial.data.myahInboxReplyDraft.body.markdown = '';
    const reviewed = draft('a', 'NEEDS_REVIEW');
    reviewed.data.myahInboxReplyDraft.revision = 1;
    reviewed.data.myahInboxReplyDraft.body.markdown = 'manual';
    let resolve!: (value: ReturnType<typeof draft>) => void;
    const query = jest
      .fn()
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValue(draft('a'));
    const { result } = setup(query);
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 1,
      body: { markdown: 'manual', blocknote: null },
    });
    const reviewContext = jest.fn().mockResolvedValue({});
    jest
      .mocked(useMyahInboxThreadMutations)
      .mockReturnValue({ saveDraft, reviewContext } as never);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const key = result.current.key!;
    let saved!: ReturnType<typeof result.current.controller.flush>;
    act(() => {
      result.current.controller.updateDraft({
        key,
        body: { markdown: 'manual', blocknote: null },
        editorOwner: result.current.editorOwner,
      });
      saved = result.current.controller.flush(key);
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(query.mock.calls[1][0]).toMatchObject({
      variables: { input },
      fetchPolicy: 'no-cache',
    });
    {
      // Stale-but-readable NEEDS_REVIEW permits only a guarded generation.
      const generation = result.current.controller.acquire(
        key,
        'generating',
        result.current.editorOwner,
      );
      if (generation) result.current.controller.release(generation);
    }
    await act(async () => {
      resolve(reviewed);
      await saved;
    });
    expect(result.current.entry).toMatchObject({
      confirmedRevision: 1,
      executionState: 'NEEDS_REVIEW',
      localBody: { markdown: 'manual' },
    });
    {
      // Stale-but-readable NEEDS_REVIEW permits only a guarded generation.
      const generation = result.current.controller.acquire(
        key,
        'generating',
        result.current.editorOwner,
      );
      if (generation) result.current.controller.release(generation);
    }
    expect(
      result.current.controller.acquire(
        key,
        'sending',
        result.current.editorOwner,
      ),
    ).toBeNull();
    await act(async () => {
      expect(await result.current.review()).toBe(true);
    });
    expect(reviewContext).toHaveBeenCalledWith({
      ...input,
      expectedDraftRevision: 1,
      expectedContextFingerprint: 'fingerprint',
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('preserves newer edits during the post-save reread and permits review', async () => {
    const query = jest.fn().mockResolvedValueOnce(draft('a'));
    let resolve!: (value: ReturnType<typeof draft>) => void;
    query.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = setup(query);
    const saveDraft = jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'manual', blocknote: null },
    });
    jest
      .mocked(useMyahInboxThreadMutations)
      .mockReturnValue({ saveDraft } as never);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const key = result.current.key!;
    let saved!: ReturnType<typeof result.current.controller.flush>;
    act(() => {
      result.current.controller.updateDraft({
        key,
        body: { markdown: 'manual', blocknote: null },
        editorOwner: result.current.editorOwner,
      });
      saved = result.current.controller.flush(key);
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    act(() =>
      result.current.controller.updateDraft({
        key,
        body: { markdown: 'newer', blocknote: null },
        editorOwner: result.current.editorOwner,
      }),
    );
    const response = draft('a', 'NEEDS_REVIEW');
    response.data.myahInboxReplyDraft.revision = 3;
    response.data.myahInboxReplyDraft.body.markdown = 'manual';
    await act(async () => {
      resolve(response);
      await saved;
    });
    expect(result.current.entry).toMatchObject({
      executionState: 'NEEDS_REVIEW',
      localBody: { markdown: 'newer' },
      confirmedBody: { markdown: 'manual' },
      dirty: true,
    });
    expect(
      result.current.controller.acquire(
        key,
        'reviewing',
        result.current.editorOwner,
      ),
    ).not.toBeNull();
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects late post-save A metadata after B without exposing previous-key bytes', async () => {
    let resolve!: (value: ReturnType<typeof draft>) => void;
    const query = jest
      .fn()
      .mockResolvedValueOnce(draft('a'))
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValueOnce(draft('b'));
    const { result, rerender } = setup(query);
    jest.mocked(useMyahInboxThreadMutations).mockReturnValue({
      saveDraft: jest.fn().mockResolvedValue({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'manual', blocknote: null },
      }),
    } as never);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const key = result.current.key!;
    let saved!: ReturnType<typeof result.current.controller.flush>;
    act(() => {
      result.current.controller.updateDraft({
        key,
        body: { markdown: 'manual', blocknote: null },
        editorOwner: result.current.editorOwner,
      });
      saved = result.current.controller.flush(key);
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    rerender({
      value: {
        ...input,
        replyContext: { ...input.replyContext, campaignId: 'b' },
      },
    });
    expect(result.current.entry).toBeNull();
    await waitFor(() =>
      expect(result.current.entry?.localBody.markdown).toBe('b'),
    );
    const response = draft('a', 'NEEDS_REVIEW');
    response.data.myahInboxReplyDraft.revision = 3;
    await act(async () => {
      resolve(response);
      await saved;
    });
    expect(result.current.entry).toMatchObject({
      executionState: 'READY',
      localBody: { markdown: 'b' },
    });
    expect(result.current.controller.getEntry(key)?.executionState).toBe(
      'READY',
    );
  });

  it.each(['network', 'revision', 'anchor', 'context'] as const)(
    'fails closed after a successful save with an invalid %s reread without resaving',
    async (failure) => {
      const query = jest.fn().mockResolvedValueOnce(draft('a'));
      if (failure === 'network')
        query.mockRejectedValueOnce(new Error('offline'));
      else {
        const response = draft(
          failure === 'context' ? 'wrong' : 'a',
          'NEEDS_REVIEW',
        );
        response.data.myahInboxReplyDraft.revision =
          failure === 'revision' ? 2 : 3;
        if (failure === 'anchor')
          response.data.myahInboxReplyDraft.resolvedContext.target.contactAnchorId =
            'wrong';
        query.mockResolvedValueOnce(response);
      }
      const { result } = setup(query);
      const saveDraft = jest.fn().mockResolvedValue({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'manual', blocknote: null },
      });
      jest
        .mocked(useMyahInboxThreadMutations)
        .mockReturnValue({ saveDraft } as never);
      await waitFor(() => expect(result.current.status).toBe('ready'));
      const key = result.current.key!;
      await act(async () => {
        result.current.controller.updateDraft({
          key,
          body: { markdown: 'manual', blocknote: null },
          editorOwner: result.current.editorOwner,
        });
        await result.current.controller.flush(key);
      });
      expect(result.current.status).toBe('denied');
      expect(result.current.entry).toBeNull();
      expect(result.current.controller.isTargetAuthorized(key)).toBe(false);
      expect(result.current.controller.getEntry(key)).toMatchObject({
        confirmedRevision: 3,
        localBody: { markdown: 'manual' },
        status: 'saved',
      });
      await act(async () => {
        await result.current.controller.retry(key);
        await result.current.controller.flush(key);
      });
      expect(saveDraft).toHaveBeenCalledTimes(1);
      const recovered = draft('a', 'NEEDS_REVIEW');
      recovered.data.myahInboxReplyDraft.revision = 3;
      recovered.data.myahInboxReplyDraft.body.markdown = 'manual';
      query.mockResolvedValueOnce(recovered);
      act(() => result.current.reload());
      expect(result.current.entry).toBeNull();
      await waitFor(() =>
        expect(result.current.entry?.executionState).toBe('NEEDS_REVIEW'),
      );
      expect(result.current.entry?.localBody.markdown).toBe('manual');
      expect(saveDraft).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['pending', 'unknown'] as const)(
    'keeps a live %s lock masked when an older post-save reread returns READY',
    async (kind) => {
      let resolve!: (value: ReturnType<typeof draft>) => void;
      const query = jest
        .fn()
        .mockResolvedValueOnce(draft('a'))
        .mockReturnValueOnce(
          new Promise((r) => {
            resolve = r;
          }),
        );
      const { result } = setup(query);
      jest.mocked(useMyahInboxThreadMutations).mockReturnValue({
        saveDraft: jest.fn().mockResolvedValue({
          status: 'SAVED',
          revision: 3,
          body: { markdown: 'manual', blocknote: null },
        }),
      } as never);
      await waitFor(() => expect(result.current.status).toBe('ready'));
      const key = result.current.key!;
      let saved!: ReturnType<typeof result.current.controller.flush>;
      act(() => {
        result.current.controller.updateDraft({
          key,
          body: { markdown: 'manual', blocknote: null },
          editorOwner: result.current.editorOwner,
        });
        saved = result.current.controller.flush(key);
      });
      await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
      act(() => result.current.controller.setReadinessLock(key, kind));
      const response = draft('a');
      response.data.myahInboxReplyDraft.revision = 3;
      await act(async () => {
        resolve(response);
        await saved;
      });
      expect(result.current.entry).toMatchObject({
        executionState:
          kind === 'pending' ? 'OUTCOME_PENDING' : 'OUTCOME_UNKNOWN',
        localBody: { markdown: '' },
        confirmedBody: null,
        operation: { kind },
      });
    },
  );

  it('rejects an old capability reread after A/B/A reauthorization at the same revision', async () => {
    let resolve!: (value: ReturnType<typeof draft>) => void;
    const newA = draft('a');
    newA.data.myahInboxReplyDraft.revision = 3;
    newA.data.myahInboxReplyDraft.body.markdown = 'reauthorized A';
    newA.data.myahInboxReplyDraft.resolvedContext.contextFingerprint =
      'new fingerprint';
    const query = jest
      .fn()
      .mockResolvedValueOnce(draft('a'))
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValueOnce(draft('b'))
      .mockResolvedValueOnce(newA);
    const { result, rerender } = setup(query);
    jest.mocked(useMyahInboxThreadMutations).mockReturnValue({
      saveDraft: jest.fn().mockResolvedValue({
        status: 'SAVED',
        revision: 3,
        body: { markdown: 'manual', blocknote: null },
      }),
    } as never);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const key = result.current.key!;
    let saved!: ReturnType<typeof result.current.controller.flush>;
    act(() => {
      result.current.controller.updateDraft({
        key,
        body: { markdown: 'manual', blocknote: null },
        editorOwner: result.current.editorOwner,
      });
      saved = result.current.controller.flush(key);
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    rerender({
      value: {
        ...input,
        replyContext: { ...input.replyContext, campaignId: 'b' },
      },
    });
    expect(result.current.entry).toBeNull();
    await waitFor(() =>
      expect(result.current.entry?.localBody.markdown).toBe('b'),
    );
    rerender({ value: input });
    expect(result.current.entry).toBeNull();
    await waitFor(() =>
      expect(result.current.entry?.localBody.markdown).toBe('reauthorized A'),
    );
    const stale = draft('a', 'NEEDS_REVIEW');
    stale.data.myahInboxReplyDraft.revision = 3;
    await act(async () => {
      resolve(stale);
      await saved;
    });
    expect(result.current.entry).toMatchObject({
      executionState: 'READY',
      contextFingerprint: 'new fingerprint',
      localBody: { markdown: 'reauthorized A' },
      status: 'idle',
    });
  });

  it('rejects a late review result after selecting B', async () => {
    let resolve!: (value: unknown) => void;
    const reviewContext = jest.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result, rerender } = setup(
      jest
        .fn()
        .mockResolvedValueOnce(draft('a', 'NEEDS_REVIEW'))
        .mockResolvedValueOnce(draft('b')),
    );
    jest
      .mocked(useMyahInboxThreadMutations)
      .mockReturnValue({ saveDraft: jest.fn(), reviewContext } as never);
    await waitFor(() =>
      expect(result.current.entry?.localBody.markdown).toBe('a'),
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.review();
    });
    expect(reviewContext).toHaveBeenCalledWith({
      ...input,
      expectedDraftRevision: 2,
      expectedContextFingerprint: 'fingerprint',
    });
    rerender({
      value: {
        ...input,
        replyContext: { ...input.replyContext, campaignId: 'b' },
      },
    });
    await waitFor(() =>
      expect(result.current.entry?.localBody.markdown).toBe('b'),
    );
    await act(async () => {
      resolve(draft('a').data.myahInboxReplyDraft);
      expect(await pending).toBe(false);
    });
    expect(result.current.entry?.localBody.markdown).toBe('b');
  });

  it('does not read without an explicit or server-default context', () => {
    const query = jest.fn().mockReturnValue(new Promise(() => {}));
    const { result } = setup(query, null);
    expect(result.current.key).toBeNull();
    expect(result.current.entry).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('uses server anchors and never exposes A while B loads', async () => {
    let resolve!: (value: ReturnType<typeof draft>) => void;
    const query = jest
      .fn()
      .mockResolvedValueOnce(draft('a'))
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      );
    const { result, rerender } = setup(query);
    await waitFor(() =>
      expect(result.current.entry?.localBody.markdown).toBe('a'),
    );
    expect(result.current.key?.contactAnchorId).toBe('anchor');
    rerender({
      value: {
        ...input,
        replyContext: { ...input.replyContext, campaignId: 'b' },
      },
    });
    expect(result.current.entry).toBeNull();
    expect(result.current.key).toBeNull();
    await act(async () => resolve(draft('b')));
    expect(result.current.entry?.localBody.markdown).toBe('b');
  });

  it('rejects an A response after B and mismatched server context', async () => {
    let resolve!: (value: ReturnType<typeof draft>) => void;
    const query = jest
      .fn()
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValueOnce(draft('wrong'));
    const { result, rerender } = setup(query);
    rerender({
      value: {
        ...input,
        replyContext: { ...input.replyContext, campaignId: 'b' },
      },
    });
    await waitFor(() => expect(result.current.status).toBe('denied'));
    await act(async () => resolve(draft('a')));
    expect(result.current.entry).toBeNull();
    expect(result.current.key).toBeNull();
  });
});
