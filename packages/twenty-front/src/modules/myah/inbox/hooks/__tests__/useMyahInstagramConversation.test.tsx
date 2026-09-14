import { act, renderHook, waitFor } from '@testing-library/react';

import { MyahInboxInstagramMessagesDocument } from '~/generated/graphql';
import { useMyahInstagramConversation } from '@/myah/inbox/hooks/useMyahInstagramConversation';
import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';

const mockQuery = jest.fn();
const mockApolloCoreClient = { query: mockQuery };

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> =>
  (
    Promise as PromiseConstructor & {
      withResolvers<Value>(): Deferred<Value>;
    }
  ).withResolvers<T>();

const message = (
  id: string,
  effectiveTimestamp: string,
  overrides: Partial<MyahInstagramConversationMessage> = {},
): MyahInstagramConversationMessage => ({
  id,
  text: id,
  direction: 'INBOUND',
  sentVia: 'UNIPILE',
  provider: 'UNIPILE',
  deliveryState: 'RECEIVED',
  providerCreatedAt: effectiveTimestamp,
  createdAt: '2026-09-05T01:00:00.000Z',
  hasAttachments: false,
  attachmentCount: 0,
  ...overrides,
});

const response = (
  messages: MyahInstagramConversationMessage[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
) => ({
  data: {
    myahInboxInstagramMessages: {
      edges: messages.map((node, index) => ({
        cursor: `cursor-${index}`,
        node,
      })),
      pageInfo,
    },
  },
});

describe('useMyahInstagramConversation', () => {
  const firstConversationId = '44444444-4444-4444-8444-444444444444';
  const secondConversationId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('requests a newest-first native page and presents it oldest-first by effective timestamp and ID', async () => {
    mockQuery.mockResolvedValue(
      response([
        message(
          '00000000-0000-4000-8000-000000000003',
          '2026-09-05T12:00:00.000Z',
        ),
        message(
          '00000000-0000-4000-8000-000000000002',
          '2026-09-05T12:00:00.000Z',
          {
            providerCreatedAt: null,
            createdAt: '2026-09-05T11:00:00.000Z',
          },
        ),
        message(
          '00000000-0000-4000-8000-000000000001',
          '2026-09-05T12:00:00.000Z',
        ),
      ]),
    );

    const hook = renderHook(() =>
      useMyahInstagramConversation(firstConversationId),
    );

    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: MyahInboxInstagramMessagesDocument,
        variables: { conversationId: firstConversationId, first: 100 },
        fetchPolicy: 'no-cache',
      }),
    );
    expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('merges older pages without duplicates and keeps the rendered reader order stable', async () => {
    mockQuery
      .mockResolvedValueOnce(
        response(
          [
            message(
              '00000000-0000-4000-8000-000000000003',
              '2026-09-05T12:00:00.000Z',
            ),
            message(
              '00000000-0000-4000-8000-000000000002',
              '2026-09-05T11:00:00.000Z',
            ),
          ],
          { hasNextPage: true, endCursor: 'older-page' },
        ),
      )
      .mockResolvedValueOnce(
        response(
          [
            message(
              '00000000-0000-4000-8000-000000000002',
              '2026-09-05T11:00:00.000Z',
            ),
            message(
              '00000000-0000-4000-8000-000000000001',
              '2026-09-05T10:00:00.000Z',
            ),
          ],
          { hasNextPage: false, endCursor: null },
        ),
      );
    const hook = renderHook(() =>
      useMyahInstagramConversation(firstConversationId),
    );

    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(mockQuery.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        variables: {
          conversationId: firstConversationId,
          first: 100,
          after: 'older-page',
        },
      }),
    );
    expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('retains the existing page when an older-page request fails', async () => {
    mockQuery
      .mockResolvedValueOnce(
        response(
          [
            message(
              '00000000-0000-4000-8000-000000000003',
              '2026-09-05T12:00:00.000Z',
            ),
          ],
          { hasNextPage: true, endCursor: 'older-page' },
        ),
      )
      .mockRejectedValueOnce(new Error('Older page denied'));
    const hook = renderHook(() =>
      useMyahInstagramConversation(firstConversationId),
    );

    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => {
      await hook.result.current.loadMore();
    });

    expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(hook.result.current.error).toBe('Older page denied');
  });

  describe.each(['initial', 'loadMore'] as const)(
    'refresh during %s',
    (readKind) => {
      it.each(['success', 'failure'] as const)(
        'coalesces refresh requests and drains after active read %s without extending its promise',
        async (outcome) => {
          const activeRead = createDeferred<ReturnType<typeof response>>();
          const refreshRead = createDeferred<ReturnType<typeof response>>();
          const original = message('original', '2026-09-05T12:00:00.000Z');
          const older = message('older', '2026-09-05T11:00:00.000Z');
          const newest = message('newest', '2026-09-05T13:00:00.000Z');
          if (readKind === 'loadMore') {
            mockQuery.mockResolvedValueOnce(
              response([original], {
                hasNextPage: true,
                endCursor: 'older-page',
              }),
            );
          }
          mockQuery
            .mockReturnValueOnce(activeRead.promise)
            .mockReturnValueOnce(refreshRead.promise);
          const hook = renderHook(() =>
            useMyahInstagramConversation(firstConversationId),
          );
          let pagePromise: Promise<void> | undefined;
          if (readKind === 'loadMore') {
            await waitFor(() =>
              expect(hook.result.current.loading).toBe(false),
            );
            act(() => {
              pagePromise = hook.result.current.loadMore();
            });
          }
          const activeCallCount = readKind === 'initial' ? 1 : 2;
          // Busy refetch promises still settle before the active query, as before.
          await act(async () => {
            await Promise.all([
              hook.result.current.refetch(),
              hook.result.current.refetch(),
              hook.result.current.refetch(),
              hook.result.current.loadMore(),
            ]);
          });
          expect(mockQuery).toHaveBeenCalledTimes(activeCallCount);
          expect(hook.result.current.loading).toBe(readKind === 'initial');
          expect(hook.result.current.loadingMore).toBe(readKind === 'loadMore');
          expect(
            mockQuery.mock.calls[activeCallCount - 1][0].context.fetchOptions
              .signal.aborted,
          ).toBe(false);

          await act(async () => {
            if (outcome === 'failure') {
              activeRead.reject(new Error('Active read failed'));
            } else {
              activeRead.resolve(response([older, original]));
            }
            await pagePromise;
          });
          expect(mockQuery).toHaveBeenCalledTimes(activeCallCount + 1);
          expect(mockQuery.mock.calls[activeCallCount][0].variables).toEqual({
            conversationId: firstConversationId,
            first: 100,
          });
          expect(hook.result.current.loading).toBe(true);
          expect(hook.result.current.loadingMore).toBe(false);
          expect(hook.result.current.error).toBeNull();
          // No concurrent page read may reuse the old cursor during the refresh.
          await act(async () => {
            await hook.result.current.loadMore();
          });
          expect(mockQuery).toHaveBeenCalledTimes(activeCallCount + 1);
          await act(async () => {
            refreshRead.resolve(
              response([newest, original, original], {
                hasNextPage: true,
                endCursor: 'refreshed-page',
              }),
            );
          });
          expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
            'original',
            'newest',
          ]);
          expect(hook.result.current.loading).toBe(false);
          expect(mockQuery).toHaveBeenCalledTimes(activeCallCount + 1);
          mockQuery.mockResolvedValueOnce(response([older, original]));
          await act(async () => {
            await hook.result.current.loadMore();
          });
          expect(
            mockQuery.mock.calls[activeCallCount + 1][0].variables,
          ).toEqual({
            conversationId: firstConversationId,
            first: 100,
            after: 'refreshed-page',
          });
          expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
            'older',
            'original',
            'newest',
          ]);
          expect(hook.result.current.hasNextPage).toBe(false);
        },
      );

      it.each(['switch', 'unselect', 'unmount'] as const)(
        'cancels queued intent on %s and ignores stale successful completion',
        async (cancellation) => {
          const staleRead = createDeferred<ReturnType<typeof response>>();
          const currentRead = createDeferred<ReturnType<typeof response>>();
          if (readKind === 'loadMore') {
            mockQuery.mockResolvedValueOnce(
              response([], {
                hasNextPage: true,
                endCursor: 'older-page',
              }),
            );
          }
          mockQuery
            .mockReturnValueOnce(staleRead.promise)
            .mockReturnValueOnce(currentRead.promise);
          const hook = renderHook(
            ({ conversationId }: { conversationId: string | null }) =>
              useMyahInstagramConversation(conversationId),
            {
              initialProps: { conversationId: firstConversationId } as {
                conversationId: string | null;
              },
            },
          );
          if (readKind === 'loadMore') {
            await waitFor(() =>
              expect(hook.result.current.loading).toBe(false),
            );
            act(() => {
              void hook.result.current.loadMore();
            });
          }
          await act(async () => {
            await hook.result.current.refetch();
          });
          const activeCallCount = mockQuery.mock.calls.length;
          const staleSignal =
            mockQuery.mock.calls[activeCallCount - 1][0].context.fetchOptions
              .signal;
          if (cancellation === 'unmount') {
            hook.unmount();
          } else {
            hook.rerender({
              conversationId:
                cancellation === 'switch' ? secondConversationId : null,
            });
          }
          expect(staleSignal.aborted).toBe(true);
          await act(async () => {
            staleRead.resolve(
              response([message('stale', '2026-09-05T12:00:00.000Z')]),
            );
          });
          expect(mockQuery).toHaveBeenCalledTimes(
            activeCallCount + (cancellation === 'switch' ? 1 : 0),
          );
          expect(hook.result.current.messages).toEqual([]);
          if (cancellation === 'switch') {
            await act(async () => {
              currentRead.resolve(
                response([message('current', '2026-09-05T13:00:00.000Z')]),
              );
            });
            expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
              'current',
            ]);
            expect(mockQuery).toHaveBeenCalledTimes(activeCallCount + 1);
          }
        },
      );
    },
  );

  it('does not let a stale same-conversation error consume a new operation refresh intent', async () => {
    const staleRead = createDeferred<ReturnType<typeof response>>();
    const currentRead = createDeferred<ReturnType<typeof response>>();
    const refreshRead = createDeferred<ReturnType<typeof response>>();
    mockQuery
      .mockReturnValueOnce(staleRead.promise)
      .mockResolvedValueOnce(response([]))
      .mockReturnValueOnce(currentRead.promise)
      .mockReturnValueOnce(refreshRead.promise);
    const hook = renderHook(({ id }) => useMyahInstagramConversation(id), {
      initialProps: { id: firstConversationId },
    });
    await act(async () => {
      await hook.result.current.refetch();
    });
    hook.rerender({ id: secondConversationId });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    hook.rerender({ id: firstConversationId });
    await act(async () => {
      await hook.result.current.refetch();
    });
    await act(async () => {
      staleRead.reject(new Error('Stale read failed'));
    });
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.loading).toBe(true);
    await act(async () => {
      currentRead.resolve(response([]));
    });
    expect(mockQuery).toHaveBeenCalledTimes(4);
    await act(async () => {
      refreshRead.resolve(
        response([message('fresh', '2026-09-05T13:00:00.000Z')]),
      );
    });
    expect(hook.result.current.messages.map(({ id }) => id)).toEqual(['fresh']);
    expect(hook.result.current.loading).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('publishes a queued refresh error, retains the accepted page and allows an awaited idle retry', async () => {
    const initialRead = createDeferred<ReturnType<typeof response>>();
    const refreshRead = createDeferred<ReturnType<typeof response>>();
    const retryRead = createDeferred<ReturnType<typeof response>>();
    mockQuery
      .mockReturnValueOnce(initialRead.promise)
      .mockReturnValueOnce(refreshRead.promise)
      .mockReturnValueOnce(retryRead.promise);
    const hook = renderHook(() =>
      useMyahInstagramConversation(firstConversationId),
    );
    await act(async () => {
      await hook.result.current.refetch();
    });
    await act(async () => {
      initialRead.resolve(
        response([message('accepted', '2026-09-05T12:00:00.000Z')]),
      );
    });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    await act(async () => {
      refreshRead.reject(new Error('Refresh denied'));
    });
    expect(hook.result.current.error).toBe('Refresh denied');
    expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
      'accepted',
    ]);
    expect(hook.result.current.loading).toBe(false);
    let retrySettled = false;
    let retryPromise: Promise<void> | undefined;
    await act(async () => {
      retryPromise = hook.result.current.refetch().then(() => {
        retrySettled = true;
      });
    });
    expect(retrySettled).toBe(false);
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.error).toBeNull();
    await act(async () => {
      retryRead.resolve(
        response([message('retry', '2026-09-05T13:00:00.000Z')]),
      );
      await retryPromise;
    });
    expect(retrySettled).toBe(true);
    expect(hook.result.current.messages.map(({ id }) => id)).toEqual(['retry']);
    expect(hook.result.current.loading).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('ignores stale target completions and skips unselected conversations', async () => {
    const firstRequest = createDeferred<ReturnType<typeof response>>();
    const secondRequest = createDeferred<ReturnType<typeof response>>();
    mockQuery
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const hook = renderHook(
      ({ conversationId }: { conversationId: string | null }) =>
        useMyahInstagramConversation(conversationId),
      {
        initialProps: {
          conversationId: firstConversationId,
        } as { conversationId: string | null },
      },
    );

    hook.rerender({ conversationId: secondConversationId });
    secondRequest.resolve(
      response([
        message(
          '00000000-0000-4000-8000-000000000004',
          '2026-09-05T12:00:00.000Z',
        ),
      ]),
    );
    await waitFor(() =>
      expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
        '00000000-0000-4000-8000-000000000004',
      ]),
    );

    firstRequest.reject(new Error('Stale target denied'));
    await waitFor(() => expect(hook.result.current.error).toBeNull());

    hook.rerender({ conversationId: null });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.messages).toEqual([]);
  });
});
