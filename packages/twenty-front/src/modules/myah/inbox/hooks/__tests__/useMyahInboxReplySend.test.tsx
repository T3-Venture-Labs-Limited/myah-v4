import { act, renderHook } from '@testing-library/react';
import { useMutation, useQuery } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  type MyahInboxReplySendResult,
  useMyahInboxReplySend,
} from '@/myah/inbox/hooks/useMyahInboxReplySend';

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));

const mockUseMutation = jest.mocked(useMutation);
const mockUseQuery = jest.mocked(useQuery);
const mockUseApolloCoreClient = jest.mocked(useApolloCoreClient);
const sendMutation = jest.fn();
const statusQuery = jest.fn();

const createDeferred = <Value,>() => {
  let resolve: (value: Value) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve: resolve! };
};

const threadId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const receiptId = '30303030-1c25-4d02-bf25-6aeccf7ea419';

const renderReplySendHook = () =>
  renderHook(() => useMyahInboxReplySend(threadId));

describe('useMyahInboxReplySend', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseApolloCoreClient.mockReturnValue({ query: statusQuery } as never);
    mockUseMutation.mockReturnValue([
      sendMutation,
      { loading: false },
    ] as never);
    mockUseQuery.mockReturnValue({
      data: {
        myahInboxReplySendReadiness: {
          status: 'READY',
          reason: null,
        },
      },
      loading: false,
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps readiness without starting status polling', () => {
    const { result } = renderReplySendHook();

    expect(result.current.readiness).toEqual({ status: 'READY', reason: null });
    expect(result.current.readinessLoading).toBe(false);
    expect(statusQuery).not.toHaveBeenCalled();
  });

  it('sends only the thread and confirmed draft revision', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendMyahInboxReply: {
          outcome: 'SENT',
          receiptId,
          revision: 5,
          body: { markdown: '', blocknote: null },
        },
      },
    });
    const { result } = renderReplySendHook();

    let sendResult: MyahInboxReplySendResult | undefined;
    await act(async () => {
      sendResult = await result.current.send({
        threadId,
        expectedDraftRevision: 4,
        unexpectedBrowserInput: 'must not reach GraphQL',
      } as never);
    });

    expect(sendMutation).toHaveBeenCalledWith({
      variables: { input: { threadId, expectedDraftRevision: 4 } },
    });
    expect(sendResult!.outcome).toBe('SENT');
    expect(statusQuery).not.toHaveBeenCalled();
  });

  it('polls an accepted pending reply by its returned receipt until it is sent', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendMyahInboxReply: {
          outcome: 'SENDING',
          receiptId,
          revision: 4,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
    statusQuery
      .mockResolvedValueOnce({
        data: {
          myahInboxReplySendStatus: {
            outcome: 'SENDING',
            receiptId: null,
            revision: 4,
            body: { markdown: 'draft', blocknote: null },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          myahInboxReplySendStatus: {
            outcome: 'SENT',
            receiptId: '40404040-1c25-4d02-bf25-6aeccf7ea419',
            revision: 5,
            body: null,
          },
        },
      });
    const { result } = renderReplySendHook();

    let sendResult: Promise<MyahInboxReplySendResult> | undefined;
    await act(async () => {
      const send = result.current.send({ threadId, expectedDraftRevision: 4 });
      await Promise.resolve();
      sendResult = send;
    });

    expect(statusQuery).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    await expect(sendResult!).resolves.toMatchObject({
      outcome: 'SENT',
      receiptId,
    });
    expect(statusQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fetchPolicy: 'network-only',
        variables: { input: { threadId, receiptId } },
      }),
    );
    expect(statusQuery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fetchPolicy: 'network-only',
        variables: { input: { threadId, receiptId } },
      }),
    );
    expect(statusQuery).toHaveBeenCalledTimes(2);
  });

  it('returns safe unknown without polling when SENDING has no receipt', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendMyahInboxReply: {
          outcome: 'SENDING',
          receiptId: null,
          revision: 4,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
    const { result } = renderReplySendHook();

    await act(async () => {
      await expect(
        result.current.send({ threadId, expectedDraftRevision: 4 }),
      ).resolves.toMatchObject({
        outcome: 'UNKNOWN',
        error:
          "We couldn't confirm whether the reply was sent. Check the thread before trying again.",
      });
    });

    expect(statusQuery).not.toHaveBeenCalled();
  });

  it('keeps overlapping send polls independent', async () => {
    const secondThreadId = '50505050-1c25-4d02-bf25-6aeccf7ea419';
    const secondReceiptId = '60606060-1c25-4d02-bf25-6aeccf7ea419';
    let secondStatusCalls = 0;
    sendMutation
      .mockResolvedValueOnce({
        data: {
          sendMyahInboxReply: {
            outcome: 'SENDING',
            receiptId,
            revision: 4,
            body: { markdown: 'first draft', blocknote: null },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          sendMyahInboxReply: {
            outcome: 'SENDING',
            receiptId: secondReceiptId,
            revision: 8,
            body: { markdown: 'second draft', blocknote: null },
          },
        },
      });
    statusQuery.mockImplementation(({ variables }) => {
      const statusReceiptId = variables.input.receiptId;

      if (statusReceiptId === receiptId) {
        return Promise.resolve({
          data: {
            myahInboxReplySendStatus: {
              outcome: 'SENT',
              receiptId,
              revision: 5,
              body: null,
            },
          },
        });
      }

      secondStatusCalls++;

      return Promise.resolve({
        data: {
          myahInboxReplySendStatus: {
            outcome: secondStatusCalls === 1 ? 'SENDING' : 'SENT',
            receiptId: secondReceiptId,
            revision: secondStatusCalls === 1 ? 8 : 9,
            body: null,
          },
        },
      });
    });
    const { result } = renderReplySendHook();

    let firstSend: Promise<MyahInboxReplySendResult> | undefined;
    let secondSend: Promise<MyahInboxReplySendResult> | undefined;
    await act(async () => {
      firstSend = result.current.send({ threadId, expectedDraftRevision: 4 });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      secondSend = result.current.send({
        threadId: secondThreadId,
        expectedDraftRevision: 8,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    await expect(firstSend!).resolves.toMatchObject({ outcome: 'SENT' });
    await expect(secondSend!).resolves.toMatchObject({ outcome: 'SENT' });
    expect(statusQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { input: { threadId, receiptId } },
      }),
    );
    expect(statusQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { threadId: secondThreadId, receiptId: secondReceiptId },
        },
      }),
    );
  });

  it('bounds accepted pending status polling to 15 attempts', async () => {
    const pendingStatus = {
      data: {
        myahInboxReplySendStatus: {
          outcome: 'SENDING',
          receiptId,
          revision: 4,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    };
    sendMutation.mockResolvedValue({
      data: {
        sendMyahInboxReply: {
          outcome: 'SENDING',
          receiptId,
          revision: 4,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
    statusQuery.mockResolvedValue(pendingStatus);
    const { result } = renderReplySendHook();

    let sendResult: Promise<MyahInboxReplySendResult> | undefined;
    await act(async () => {
      const send = result.current.send({ threadId, expectedDraftRevision: 4 });
      await Promise.resolve();
      sendResult = send;
    });
    await act(async () => jest.advanceTimersByTimeAsync(15_000));

    await expect(sendResult!).resolves.toMatchObject({ outcome: 'SENDING' });
    expect(statusQuery).toHaveBeenCalledTimes(15);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['SENT', 'FAILED', 'UNKNOWN', 'STALE'] as const)(
    'stops status polling immediately for a terminal %s outcome',
    async (outcome) => {
      sendMutation.mockResolvedValue({
        data: {
          sendMyahInboxReply: {
            outcome: 'SENDING',
            receiptId,
            revision: 4,
            body: { markdown: 'draft', blocknote: null },
          },
        },
      });
      statusQuery.mockResolvedValue({
        data: {
          myahInboxReplySendStatus: {
            outcome,
            receiptId,
            revision: 4,
            body: { markdown: 'draft', blocknote: null },
          },
        },
      });
      const { result } = renderReplySendHook();

      let sendResult: Promise<MyahInboxReplySendResult> | undefined;
      await act(async () => {
        const send = result.current.send({
          threadId,
          expectedDraftRevision: 4,
        });
        await Promise.resolve();
        sendResult = send;
      });
      await act(async () => jest.advanceTimersByTimeAsync(1_000));

      await expect(sendResult!).resolves.toMatchObject({ outcome });
      await act(async () => jest.advanceTimersByTimeAsync(1_000));
      expect(statusQuery).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('cancels a pending status timer on unmount', async () => {
    sendMutation.mockResolvedValue({
      data: {
        sendMyahInboxReply: {
          outcome: 'SENDING',
          receiptId,
          revision: 4,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
    const { result, unmount } = renderReplySendHook();
    let sendResult: Promise<MyahInboxReplySendResult> | undefined;
    await act(async () => {
      const send = result.current.send({ threadId, expectedDraftRevision: 4 });
      await Promise.resolve();
      sendResult = send;
    });

    unmount();
    await act(async () => jest.advanceTimersByTimeAsync(1_000));

    await expect(sendResult!).resolves.toMatchObject({ outcome: 'SENDING' });

    expect(statusQuery).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start polling after unmount during a direct mutation', async () => {
    const directMutation = createDeferred<unknown>();
    sendMutation.mockReturnValue(directMutation.promise);
    const { result, unmount } = renderReplySendHook();

    act(() => {
      void result.current.send({ threadId, expectedDraftRevision: 4 });
    });
    unmount();
    await act(async () => {
      directMutation.resolve({
        data: {
          sendMyahInboxReply: {
            outcome: 'SENDING',
            receiptId,
            revision: 4,
            body: { markdown: 'draft', blocknote: null },
          },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    expect(statusQuery).not.toHaveBeenCalled();
  });

  it('does not continue polling after unmount during a status query', async () => {
    const statusQueryDeferred = createDeferred<unknown>();
    sendMutation.mockResolvedValue({
      data: {
        sendMyahInboxReply: {
          outcome: 'SENDING',
          receiptId,
          revision: 4,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
    statusQuery.mockReturnValue(statusQueryDeferred.promise);
    const { result, unmount } = renderReplySendHook();

    act(() => {
      void result.current.send({ threadId, expectedDraftRevision: 4 });
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(statusQuery).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      statusQueryDeferred.resolve({
        data: {
          myahInboxReplySendStatus: {
            outcome: 'SENDING',
            receiptId,
            revision: 4,
            body: { markdown: 'draft', blocknote: null },
          },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(statusQuery).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns safe copy when the direct mutation fails', async () => {
    sendMutation.mockRejectedValue(new Error('provider credential failure'));
    const { result } = renderReplySendHook();

    await act(async () => {
      await expect(
        result.current.send({ threadId, expectedDraftRevision: 4 }),
      ).resolves.toMatchObject({
        outcome: 'UNKNOWN',
        error:
          "We couldn't confirm whether the reply was sent. Check the thread before trying again.",
      });
    });
  });
});
