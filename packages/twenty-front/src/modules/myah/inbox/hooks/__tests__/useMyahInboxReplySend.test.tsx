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


const threadId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const receiptId = '30303030-1c25-4d02-bf25-6aeccf7ea419';

const renderReplySendHook = () =>
  renderHook(() => useMyahInboxReplySend(threadId));

describe('useMyahInboxReplySend', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseApolloCoreClient.mockReturnValue({ query: statusQuery } as never);
    mockUseMutation.mockReturnValue([sendMutation, { loading: false }] as never);
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
            receiptId,
            revision: 4,
            body: { markdown: 'draft', blocknote: null },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          myahInboxReplySendStatus: {
            outcome: 'SENT',
            receiptId,
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

    await expect(sendResult!).resolves.toMatchObject({ outcome: 'SENT' });
    expect(statusQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fetchPolicy: 'network-only',
        variables: { input: { threadId, receiptId } },
      }),
    );
    expect(statusQuery).toHaveBeenCalledTimes(2);
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
