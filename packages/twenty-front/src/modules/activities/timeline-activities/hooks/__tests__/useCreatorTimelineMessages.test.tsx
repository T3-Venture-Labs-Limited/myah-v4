import { act, renderHook, waitFor } from '@testing-library/react';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useCreatorTimelineMessages } from '@/activities/timeline-activities/hooks/useCreatorTimelineMessages';

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));
jest.mock('@/sse-db-event/hooks/useListenToEventsForQuery', () => ({
  useListenToEventsForQuery: jest.fn(),
}));

const source = { id: 'source-1', creatorId: 'creator-1' };
const message = {
  id: 'message-1',
  messageThreadId: 'source-1',
  conversationId: 'source-1',
  messageChannelMessageAssociations: [{ direction: 'OUTGOING' }],
  isDraft: false,
  receivedAt: '2026-10-05T10:00:00Z',
  createdAt: '2026-10-05T10:00:00Z',
};
const page = {
  hasReadPermission: true,
  loading: false,
  error: undefined as Error | undefined,
  refetch: jest.fn().mockResolvedValue(undefined),
  hasNextPage: false,
  isFetchingMoreRecords: false,
  fetchMoreRecords: jest.fn().mockResolvedValue(undefined),
  objectMetadataItem: { id: 'metadata' },
};
let sourcePage: typeof page & { records: unknown[] };
let messagePage: typeof page & { records: unknown[] };
afterEach(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  sourcePage = { ...page, records: [source] };
  messagePage = { ...page, records: [message] };
  jest
    .mocked(useFindManyRecords)
    .mockImplementation(
      ({ objectNameSingular }) =>
        (['messageThread', 'myahSocialConversation'].includes(
          objectNameSingular!,
        )
          ? sourcePage
          : messagePage) as never,
    );
});

it.each(['EMAIL', 'INSTAGRAM'] as const)(
  'projects linked %s messages using their actual timestamps',
  (channel) => {
    messagePage.records = [
      {
        ...message,
        direction: channel === 'EMAIL' ? undefined : 'OUTBOUND',
        deliveryState: 'SENT',
      },
    ];
    const { result } = renderHook(() =>
      useCreatorTimelineMessages('creator-1', channel),
    );
    expect(result.current.activities).toEqual([
      expect.objectContaining({
        linkedRecordId: 'message-1',
        happensAt: '2026-10-05T10:00:00Z',
        properties: { creatorMessage: { channel, direction: 'SENT' } },
      }),
    ]);
  },
);

it('does not keep messages after their source is relinked', () => {
  sourcePage.records = [{ ...source, creatorId: 'other-creator' }];
  const { result } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  expect(result.current.activities).toEqual([]);
});

it('hides cached messages when read permission is revoked', () => {
  messagePage.hasReadPermission = false;
  const { result } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  expect(result.current.activities).toEqual([]);
});

it('excludes email drafts and unrecognized directions', () => {
  messagePage.records = [
    { ...message, isDraft: true },
    { ...message, id: 'unknown', messageChannelMessageAssociations: [] },
  ];
  const { result } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  expect(result.current.activities).toEqual([]);
});

it('requests email direction from the native mailbox associations', () => {
  const { result } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  expect(
    result.current.activities[0]?.properties.creatorMessage.direction,
  ).toBe('SENT');
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      objectNameSingular: 'message',
      recordGqlFields: expect.objectContaining({
        messageChannelMessageAssociations: { direction: true },
      }),
    }),
  );
});

it.each(['SENT', 'DELIVERED', 'READ', 'UNKNOWN'])(
  'does not present unconfirmed Instagram sends as sent: %s',
  (deliveryState) => {
    messagePage.records = [
      { ...message, direction: 'OUTBOUND', deliveryState },
    ];
    const { result } = renderHook(() =>
      useCreatorTimelineMessages('creator-1', 'INSTAGRAM'),
    );
    expect(result.current.activities).toHaveLength(
      deliveryState === 'UNKNOWN' ? 0 : 1,
    );
  },
);

it('hides cached rows when the source read fails', () => {
  sourcePage.error = new Error('read failed');
  const { result } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  expect(result.current.activities).toEqual([]);
  expect(result.current.error).toBe(sourcePage.error);
});

it('discovers later source pages before querying their messages', () => {
  sourcePage.hasNextPage = true;
  renderHook(() => useCreatorTimelineMessages('creator-1', 'EMAIL'));
  expect(sourcePage.fetchMoreRecords).toHaveBeenCalledTimes(1);
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({ objectNameSingular: 'message', skip: true }),
  );
});

it('stops automatic source pagination after a failed page until retry', async () => {
  sourcePage.hasNextPage = true;
  sourcePage.fetchMoreRecords.mockResolvedValueOnce({
    error: new Error('failed page'),
  });
  const { result, rerender } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  await waitFor(() => expect(result.current.error).toBe(true));
  rerender();
  expect(sourcePage.fetchMoreRecords).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.activities).toEqual([]);
});

it('refreshes current activity, but does not reset history while paging', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() =>
    useCreatorTimelineMessages('creator-1', 'EMAIL'),
  );
  act(() => jest.advanceTimersByTime(15_000));
  expect(sourcePage.refetch).toHaveBeenCalled();
  sourcePage.refetch.mockClear();
  act(() => {
    void result.current.fetchMore();
  });
  act(() => jest.advanceTimersByTime(30_000));
  expect(sourcePage.refetch).not.toHaveBeenCalled();
});

it('does not query an empty IN list when there are no linked sources', () => {
  sourcePage.records = [];
  renderHook(() => useCreatorTimelineMessages('creator-1', 'EMAIL'));
  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({
      objectNameSingular: 'message',
      skip: true,
      filter: expect.objectContaining({ messageThreadId: { is: 'NULL' } }),
    }),
  );
});
