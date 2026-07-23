import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { getGroupByAggregateQueryName } from '@/object-record/record-aggregate/utils/getGroupByAggregateQueryName';
import { getAggregateQueryName } from '@/object-record/utils/getAggregateQueryName';
import { renderHook } from '@testing-library/react';

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));

describe('useRefetchAggregateQueries', () => {
  const mockRefetchQueries = jest.fn();
  const mockGetObservableQueries = jest.fn();
  const mockApolloClient = {
    refetchQueries: mockRefetchQueries,
    getObservableQueries: mockGetObservableQueries,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetObservableQueries.mockReturnValue(
      new Set([
        { queryName: getAggregateQueryName('opportunities') },
        { queryName: 'OpportunitiesGroupByAggregates' },
      ]),
    );
    (useApolloCoreClient as jest.Mock).mockReturnValue(mockApolloClient);
  });

  it('should refetch queries', async () => {
    // Arrange
    const objectMetadataNamePlural = 'opportunities';
    const expectedQueryName = getAggregateQueryName(objectMetadataNamePlural);
    const expectedQueryNameGroupBy = getGroupByAggregateQueryName({
      objectMetadataNamePlural,
    });

    // Act
    const { result } = renderHook(() => useRefetchAggregateQueries());
    await result.current.refetchAggregateQueries({ objectMetadataNamePlural });

    // Assert
    expect(mockRefetchQueries).toHaveBeenCalledTimes(1);
    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: [expectedQueryName, expectedQueryNameGroupBy],
    });
  });

  it('refetches only aggregate queries that are active', async () => {
    mockGetObservableQueries.mockReturnValue(
      new Set([{ queryName: getAggregateQueryName('creators') }]),
    );

    const { result } = renderHook(() => useRefetchAggregateQueries());

    await result.current.refetchAggregateQueries({
      objectMetadataNamePlural: 'creators',
    });

    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: [getAggregateQueryName('creators')],
    });
  });
  it('does not refetch when no aggregate queries are active', async () => {
    mockGetObservableQueries.mockReturnValue(new Set());

    const { result } = renderHook(() => useRefetchAggregateQueries());

    await result.current.refetchAggregateQueries({
      objectMetadataNamePlural: 'creators',
    });

    expect(mockRefetchQueries).not.toHaveBeenCalled();
  });

  it('should handle errors during refetch', async () => {
    // Arrange
    const error = new Error('Refetch failed');
    mockRefetchQueries.mockRejectedValue(error);
    const objectMetadataNamePlural = 'opportunities';

    // Act
    const { result } = renderHook(() => useRefetchAggregateQueries());

    // Assert
    await expect(
      result.current.refetchAggregateQueries({ objectMetadataNamePlural }),
    ).rejects.toThrow('Refetch failed');
  });
});
