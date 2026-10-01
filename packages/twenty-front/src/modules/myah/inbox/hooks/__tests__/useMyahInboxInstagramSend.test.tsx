import { act, renderHook } from '@testing-library/react';
import { useMutation } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  type MyahInboxInstagramSendResult,
  useMyahInboxInstagramSend,
} from '@/myah/inbox/hooks/useMyahInboxInstagramSend';

jest.mock('@apollo/client/react', () => ({ useMutation: jest.fn() }));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));

const mockUseMutation = jest.mocked(useMutation);
const mockUseApolloCoreClient = jest.mocked(useApolloCoreClient);
const sendMutation = jest.fn();
const statusQuery = jest.fn();
let activeDraftId = 'draft-0';
let activeConversationId = 'conversation-0';
let draftSequence = 0;
const receiptId = '66666666-6666-4666-8666-666666666666';

const flush = jest.fn();
const resetDraft = jest.fn();

const renderSend = () =>
  renderHook(
    ({ currentDraftId }: { currentDraftId: string }) =>
      useMyahInboxInstagramSend({
        conversationId: activeConversationId,
        draft: {
          draftId: currentDraftId,
          revision: 2,
          executionLocked: false,
          flush,
          resetAfterSend: resetDraft,
        },
      }),
    { initialProps: { currentDraftId: activeDraftId } },
  );

describe('useMyahInboxInstagramSend', () => {
  beforeEach(() => {
    activeDraftId = `draft-${++draftSequence}`;
    activeConversationId = `conversation-${draftSequence}`;
    jest.useFakeTimers();
    jest.clearAllMocks();
    flush.mockResolvedValue({ status: 'saved', revision: 2 });
    mockUseApolloCoreClient.mockReturnValue({ query: statusQuery } as never);
    mockUseMutation.mockReturnValue([
      sendMutation,
      { loading: false },
    ] as never);
  });

  afterEach(() => jest.useRealTimers());

  it('flushes the exact draft before sending it', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'SENT',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery.mockResolvedValue({
      data: {
        instagramMessageSendStatus: {
          receiptId,
          state: 'SENT',
          providerMessageId: 'provider-1',
          providerCode: null,
        },
      },
    });
    const { result } = renderSend();

    let pending: Promise<MyahInboxInstagramSendResult>;
    act(() => {
      pending = result.current.send('Hello');
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    await expect(pending!).resolves.toMatchObject({
      status: 'SENT',
      providerMessageId: 'provider-1',
    });

    expect(flush).toHaveBeenCalledTimes(1);
    expect(sendMutation).toHaveBeenCalledWith({
      variables: { input: { draftId: activeDraftId, expectedRevision: 2 } },
    });
    expect(statusQuery).toHaveBeenCalledTimes(1);
    expect(result.current.pendingMessages).toMatchObject([
      { accepted: true, providerMessageId: 'provider-1' },
    ]);
  });

  it('binds the receipt to a pending bubble before the status poll returns', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery.mockRejectedValue(new Error('status unavailable'));
    const { result } = renderSend();

    act(() => {
      void result.current.send('Hello');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.pendingMessages).toMatchObject([
      { text: 'Hello', receiptId, accepted: false },
    ]);
    expect(statusQuery).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
  });

  it('never sends a persisted empty draft after flush reports empty', async () => {
    flush.mockResolvedValue({ status: 'empty', revision: 5 });
    const { result } = renderSend();
    await act(async () => {
      expect((await result.current.send()).status).toBe('DRAFT_NOT_SAVED');
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(sendMutation).not.toHaveBeenCalled();
    expect(statusQuery).not.toHaveBeenCalled();
  });

  it('surfaces a blocked response without usage counters', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'BLOCKED',
          receiptId,
          code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
          nextEligibleAt: '2026-09-05T13:00:00.000Z',
        },
      },
    });
    const { result } = renderSend();

    let outcome: MyahInboxInstagramSendResult | undefined;
    await act(async () => {
      outcome = await result.current.send();
    });

    expect(outcome).toEqual({
      status: 'BLOCKED',
      receiptId,
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      nextEligibleAt: '2026-09-05T13:00:00.000Z',
      error: 'INSTAGRAM_ACTION_LIMIT_REACHED',
    });
  });

  it('locks an unknown outcome and never calls the provider again', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'UNKNOWN',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    const firstMount = renderSend();

    await act(async () => firstMount.result.current.send());
    firstMount.unmount();
    const remounted = renderSend();
    const retry = await remounted.result.current.send();

    expect(remounted.result.current.lockedUnknown).toBe(true);
    expect(retry.status).toBe('UNKNOWN');
    expect(sendMutation).toHaveBeenCalledTimes(1);
    expect(statusQuery).not.toHaveBeenCalled();
  });

  it('clears a remounted locked editor when its in-flight attempt is accepted', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery
      .mockResolvedValueOnce({
        data: {
          instagramMessageSendStatus: {
            receiptId,
            state: 'PROCESSING',
            providerMessageId: null,
            providerCode: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          instagramMessageSendStatus: {
            receiptId,
            state: 'SENT',
            providerMessageId: 'provider-1',
            providerCode: null,
          },
        },
      });
    const first = renderSend();
    act(() => {
      void first.result.current.send('Hello');
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    first.unmount();
    const resetAfterSend = jest.fn();
    const second = renderHook(() =>
      useMyahInboxInstagramSend({
        conversationId: activeConversationId,
        draft: {
          draftId: activeDraftId,
          revision: 2,
          executionLocked: true,
          flush,
          resetAfterSend,
        },
      }),
    );
    expect(second.result.current.lockedUnknown).toBe(true);

    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    expect(resetAfterSend).toHaveBeenCalledTimes(1);
    expect(second.result.current.lockedUnknown).toBe(false);
    expect(sendMutation).toHaveBeenCalledTimes(1);
  });

  it('keeps a server-locked draft disabled after a full page reload', async () => {
    const { result } = renderHook(() =>
      useMyahInboxInstagramSend({
        conversationId: activeConversationId,
        draft: {
          draftId: activeDraftId,
          revision: 2,
          executionLocked: true,
          flush,
          resetAfterSend: resetDraft,
        },
      }),
    );

    const outcome = await result.current.send();

    expect(result.current.lockedUnknown).toBe(true);
    expect(outcome.status).toBe('UNKNOWN');
    expect(flush).not.toHaveBeenCalled();
    expect(sendMutation).not.toHaveBeenCalled();
  });

  it('polls a provider-accepted message by receipt only', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery.mockResolvedValue({
      data: {
        instagramMessageSendStatus: {
          receiptId,
          state: 'SENT',
          providerCode: null,
          outcome: 'SENT',
        },
      },
    });
    const { result } = renderSend();

    let send: Promise<unknown> | undefined;
    await act(async () => {
      send = result.current.send();
      await Promise.resolve();
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    await send;

    expect(statusQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchPolicy: 'network-only',
        variables: { input: { receiptId } },
      }),
    );
  });

  it('keeps polling canonical PROVIDER_ACCEPTED despite a lowercase free-text provider outcome, then returns SENT', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery
      .mockResolvedValueOnce({
        data: {
          instagramMessageSendStatus: {
            receiptId,
            state: 'PROVIDER_ACCEPTED',
            providerCode: 'accepted',
            outcome: 'accepted',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          instagramMessageSendStatus: {
            receiptId,
            state: 'SENT',
            providerCode: 'accepted',
            outcome: 'accepted',
          },
        },
      });
    const { result } = renderSend();
    let send: Promise<MyahInboxInstagramSendResult> | undefined;

    act(() => {
      send = result.current.send();
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    expect(result.current.lockedUnknown).toBe(false);
    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    await expect(send!).resolves.toMatchObject({ status: 'SENT', receiptId });
    expect(statusQuery).toHaveBeenCalledTimes(2);
    expect(result.current.lockedUnknown).toBe(false);
  });

  it('accepts the send after polling times out while the canonical receipt remains provider accepted', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery.mockResolvedValue({
      data: {
        instagramMessageSendStatus: {
          receiptId,
          state: 'PROVIDER_ACCEPTED',
          providerCode: 'accepted',
          outcome: 'accepted',
        },
      },
    });
    const { result } = renderSend();
    let send: Promise<MyahInboxInstagramSendResult> | undefined;

    act(() => {
      send = result.current.send('Hello from Inbox');
    });
    expect(result.current.pendingMessages).toMatchObject([
      { text: 'Hello from Inbox', accepted: false },
    ]);
    await act(async () => jest.advanceTimersByTimeAsync(15_000));

    await expect(send!).resolves.toMatchObject({
      status: 'PROVIDER_ACCEPTED',
      receiptId,
    });
    expect(statusQuery).toHaveBeenCalledTimes(15);
    expect(result.current.lockedUnknown).toBe(false);
    expect(result.current.pendingMessages).toMatchObject([
      { text: 'Hello from Inbox', accepted: true },
    ]);
    expect(sendMutation).toHaveBeenCalledTimes(1);
  });

  it('recovers the provider ID after accepted status reads fail across a remount', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValue({
        data: {
          instagramMessageSendStatus: {
            receiptId,
            state: 'SENT',
            providerMessageId: 'provider-recovered',
            providerCode: null,
          },
        },
      });
    const first = renderSend();
    act(() => {
      void first.result.current.send('Hello');
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    const [entry] = first.result.current.pendingMessages;
    expect(entry).toMatchObject({
      text: 'Hello',
      accepted: true,
      providerMessageId: null,
    });
    first.unmount();
    const second = renderSend();
    expect(second.result.current.pendingMessages).toEqual([entry]);
    await act(async () => {
      expect(await second.result.current.refreshPendingProviderIds()).toBe(
        false,
      );
    });
    expect(second.result.current.pendingMessages).toEqual([entry]);
    await act(async () => {
      expect(await second.result.current.refreshPendingProviderIds()).toBe(
        true,
      );
    });
    expect(second.result.current.pendingMessages).toMatchObject([
      { localId: entry.localId, providerMessageId: 'provider-recovered' },
    ]);
    act(() => second.result.current.dismissPending(entry.localId));
    expect(second.result.current.pendingMessages).toEqual([]);
    expect(sendMutation).toHaveBeenCalledTimes(1);
  });

  it.each(['BLOCKED', 'FAILED'])(
    'removes a failed %s bubble',
    async (status) => {
      sendMutation.mockResolvedValue({
        data: {
          sendInstagramMessage: {
            status,
            receiptId,
            code: null,
            nextEligibleAt: null,
          },
        },
      });
      const hook = renderSend();
      await act(async () => hook.result.current.send('Hello'));
      expect(hook.result.current.pendingMessages).toEqual([]);
    },
  );

  it('keeps flush, mutation, and receipt polling single-flight', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery.mockResolvedValue({
      data: {
        instagramMessageSendStatus: {
          receiptId,
          state: 'SENT',
          providerCode: null,
          outcome: 'SENT',
        },
      },
    });
    const { result } = renderSend();
    let first: Promise<MyahInboxInstagramSendResult>;
    let second: Promise<MyahInboxInstagramSendResult>;

    act(() => {
      first = result.current.send('Hello');
      second = result.current.send('Hello');
    });

    expect(first!).toBe(second!);
    expect(result.current.pendingMessages).toHaveLength(1);
    expect(result.current.sending).toBe(true);
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    await first!;
    expect(flush).toHaveBeenCalledTimes(1);
    expect(sendMutation).toHaveBeenCalledTimes(1);
    expect(statusQuery).toHaveBeenCalledTimes(1);
  });

  it('continues receipt reconciliation for the outgoing draft after target change', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendInstagramMessage: {
          status: 'PROVIDER_ACCEPTED',
          receiptId,
          code: null,
          nextEligibleAt: null,
        },
      },
    });
    statusQuery.mockResolvedValue({
      data: {
        instagramMessageSendStatus: {
          receiptId,
          state: 'SENT',
          providerCode: null,
          outcome: 'SENT',
        },
      },
    });
    const hook = renderSend();
    let outgoing: Promise<MyahInboxInstagramSendResult>;

    act(() => {
      outgoing = hook.result.current.send();
    });
    await act(async () => Promise.resolve());
    hook.rerender({
      currentDraftId: '77777777-7777-4777-8777-777777777777',
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    await expect(outgoing!).resolves.toMatchObject({ status: 'SENT' });
    expect(statusQuery).toHaveBeenCalledTimes(1);
    expect(hook.result.current.lockedUnknown).toBe(false);
    expect(hook.result.current.sending).toBe(false);
  });

  it('cancels an outgoing draft only before provider dispatch', async () => {
    let resolveFlush:
      | ((value: { status: 'saved'; revision: number }) => void)
      | undefined;
    flush.mockReturnValue(
      new Promise((resolve) => {
        resolveFlush = resolve;
      }),
    );
    const hook = renderSend();
    let outgoing: Promise<MyahInboxInstagramSendResult>;

    act(() => {
      outgoing = hook.result.current.send();
    });
    hook.rerender({ currentDraftId: 'replacement-draft' });
    await act(async () => {
      resolveFlush?.({ status: 'saved', revision: 2 });
    });

    await expect(outgoing!).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(sendMutation).not.toHaveBeenCalled();
  });

  it('automatically releases a blocked draft at nextEligibleAt', async () => {
    jest.setSystemTime(new Date('2026-09-05T12:59:59.000Z'));
    sendMutation.mockResolvedValueOnce({
      data: {
        sendInstagramMessage: {
          status: 'BLOCKED',
          receiptId,
          code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
          nextEligibleAt: '2026-09-05T13:00:00.000Z',
        },
      },
    });
    const hook = renderSend();

    await act(async () => hook.result.current.send());
    expect(hook.result.current.isBlocked).toBe(true);
    expect(hook.result.current.blockedUntil).toBe('2026-09-05T13:00:00.000Z');

    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    expect(hook.result.current.isBlocked).toBe(false);
    expect(hook.result.current.blockedUntil).toBeNull();
  });
});
