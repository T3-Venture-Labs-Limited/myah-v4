import { renderHook } from '@testing-library/react';

import { useEmailThread } from '@/activities/emails/hooks/useEmailThread';

const mockUseFindManyRecords = jest.fn();

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (...args: unknown[]) => mockUseFindManyRecords(...args),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({ record: { id: 'thread-1' } }),
}));

jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({ upsertRecordsInStore: jest.fn() }),
}));

jest.mock('@/activities/emails/hooks/useReplyConnectedAccount', () => ({
  useReplyConnectedAccount: () => ({
    connectedAccountId: null,
    connectedAccountHandle: null,
    connectedAccountProvider: null,
    loading: false,
  }),
}));

describe('useEmailThread', () => {
  it('exposes whether the native message cursor has another page', () => {
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => {
        if (objectNameSingular === 'message') {
          return {
            records: [
              {
                id: 'message-1',
                messageThread: { id: 'thread-1' },
              },
            ],
            loading: false,
            fetchMoreRecords: jest.fn(),
            hasNextPage: true,
          };
        }

        if (objectNameSingular === 'messageParticipant') {
          return {
            records: [
              {
                id: 'participant-1',
                messageId: 'message-1',
                role: 'FROM',
                displayName: 'Ada',
              },
            ],
            loading: false,
            fetchMoreRecords: jest.fn(),
            hasNextPage: false,
          };
        }

        return {
          records: [],
          loading: false,
          fetchMoreRecords: jest.fn(),
          hasNextPage: false,
        };
      },
    );

    const { result } = renderHook(() => useEmailThread('thread-1'));

    expect(result.current.hasNextPage).toBe(true);
  });
  it('retains a native message when its FROM participant is absent', () => {
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => {
        if (objectNameSingular === 'message') {
          return {
            records: [
              { id: 'message-without-sender', messageParticipants: [] },
            ],
            loading: false,
            fetchMoreRecords: jest.fn(),
            hasNextPage: false,
          };
        }

        return {
          records: [],
          loading: false,
          fetchMoreRecords: jest.fn(),
          hasNextPage: false,
        };
      },
    );

    const { result } = renderHook(() => useEmailThread('thread-1'));

    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'message-without-sender', sender: null }),
    ]);
  });

  it('exposes a terminal history error and a retry callback', () => {
    const historyError = new Error('Native message query failed');
    const refetchMessages = jest.fn();

    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) => {
        if (objectNameSingular === 'message') {
          return {
            records: [],
            loading: false,
            error: historyError,
            fetchMoreRecords: jest.fn(),
            hasNextPage: false,
            refetch: refetchMessages,
          };
        }

        return {
          records: [],
          loading: false,
          error: undefined,
          fetchMoreRecords: jest.fn(),
          hasNextPage: false,
          refetch: jest.fn(),
        };
      },
    );

    const { result } = renderHook(() => useEmailThread('thread-1'));

    expect(result.current.historyError).toBe(historyError);
    result.current.refetchMessages();
    expect(refetchMessages).toHaveBeenCalledTimes(1);
  });
});
