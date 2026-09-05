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
let draftSequence = 0;
const receiptId = '66666666-6666-4666-8666-666666666666';

const flush = jest.fn();

const renderSend = () =>
  renderHook(
    ({ currentDraftId }: { currentDraftId: string }) =>
      useMyahInboxInstagramSend({
        draft: {
          draftId: currentDraftId,
          revision: 2,
          executionLocked: false,
          flush,
        },
      }),
    { initialProps: { currentDraftId: activeDraftId } },
  );

describe('useMyahInboxInstagramSend', () => {
  beforeEach(() => {
    activeDraftId = `draft-${++draftSequence}`;
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
    const { result } = renderSend();

    await act(async () => result.current.send());

    expect(flush).toHaveBeenCalledTimes(1);
    expect(sendMutation).toHaveBeenCalledWith({
      variables: { input: { draftId: activeDraftId, expectedRevision: 2 } },
    });
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

  it('keeps a server-locked draft disabled after a full page reload', async () => {
    const { result } = renderHook(() =>
      useMyahInboxInstagramSend({
        draft: {
          draftId: activeDraftId,
          revision: 2,
          executionLocked: true,
          flush,
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
      first = result.current.send();
      second = result.current.send();
    });

    expect(first!).toBe(second!);
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
