import { renderHook } from '@testing-library/react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useMyahInstagramConversation } from '@/myah/inbox/hooks/useMyahInstagramConversation';

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));

const mockUseFindManyRecords = jest.mocked(useFindManyRecords);
const conversationId = '44444444-4444-4444-8444-444444444444';
const fetchMoreRecords = jest.fn();

describe('useMyahInstagramConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFindManyRecords.mockReturnValue({
      objectMetadataItem: { id: 'metadata-id' },
      records: [
        {
          id: 'later',
          text: 'later',
          direction: 'OUTBOUND',
          sentVia: 'UNIPILE',
          provider: 'UNIPILE',
          deliveryState: 'SENT',
          providerCreatedAt: null,
          createdAt: '2026-09-05T12:01:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
        },
        {
          id: 'earlier',
          text: 'earlier',
          direction: 'INBOUND',
          sentVia: 'UNIPILE',
          provider: 'UNIPILE',
          deliveryState: 'RECEIVED',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:02:00.000Z',
          hasAttachments: true,
          attachmentCount: 1,
        },
      ],
      loading: false,
      error: undefined,
      pageInfo: { hasNextPage: true },
      isFetchingMoreRecords: false,
      fetchMoreRecords,
      refetch: jest.fn(),
    } as never);
  });

  it('reads only the exact conversation and orders provider timestamps first', () => {
    const { result } = renderHook(() =>
      useMyahInstagramConversation(conversationId),
    );

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'myahSocialMessage',
        filter: { conversationId: { eq: conversationId } },
        limit: 100,
        skip: false,
      }),
    );
    expect(result.current.messages.map((message) => message.id)).toEqual([
      'earlier',
      'later',
    ]);
    expect(result.current.messages[0]).toMatchObject({
      direction: 'INBOUND',
      deliveryState: 'RECEIVED',
      hasAttachments: true,
      attachmentCount: 1,
    });
  });

  it('skips reads when no exact conversation is selected', () => {
    renderHook(() => useMyahInstagramConversation(null));

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('reports unavailable custom metadata without a fallback fetch', () => {
    mockUseFindManyRecords.mockReturnValue({
      objectMetadataItem: undefined,
      records: [],
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    } as never);
    const { result } = renderHook(() =>
      useMyahInstagramConversation(conversationId),
    );

    expect(result.current.error).toBe(
      'Instagram message metadata is unavailable.',
    );
    expect(mockUseFindManyRecords).toHaveBeenCalledTimes(1);
  });

  it('surfaces a record read error without a fallback fetch', () => {
    mockUseFindManyRecords.mockReturnValue({
      objectMetadataItem: undefined,
      records: [],
      loading: false,
      error: new Error('Read denied'),
      refetch: jest.fn(),
    } as never);
    const { result } = renderHook(() =>
      useMyahInstagramConversation(conversationId),
    );

    expect(result.current.error).toBe('Read denied');
    expect(mockUseFindManyRecords).toHaveBeenCalledTimes(1);
  });

  it('exposes native pagination instead of truncating long conversations', () => {
    const { result } = renderHook(() =>
      useMyahInstagramConversation(conversationId),
    );

    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.loadMore).toBe(fetchMoreRecords);
  });
});
