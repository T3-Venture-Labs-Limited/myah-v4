import { renderHook } from '@testing-library/react';

import { useQueryExistingCreatorSocialProfiles } from '@/myah/creator-crm/spreadsheet-import/hooks/useQueryExistingCreatorSocialProfiles';

const mockUseLazyFindManyRecords = jest.fn();
const mockFindManyRecordsLazy = jest.fn();
const mockFetchMoreRecordsLazy = jest.fn();
const mockUseObjectMetadataItem = jest.fn();

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => mockUseObjectMetadataItem(),
}));

jest.mock('@/object-record/hooks/useLazyFindManyRecords', () => ({
  useLazyFindManyRecords: (options: unknown) =>
    mockUseLazyFindManyRecords(options),
}));

describe('useQueryExistingCreatorSocialProfiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseObjectMetadataItem.mockReturnValue({
      objectMetadataItem: {
        readableFields: [
          { name: 'instagramLink' },
          { name: 'tiktokLink' },
          { name: 'youtubeLink' },
          { name: 'twitterLink' },
        ],
      },
    });
    mockUseLazyFindManyRecords.mockReturnValue({
      findManyRecordsLazy: mockFindManyRecordsLazy,
      fetchMoreRecordsLazy: mockFetchMoreRecordsLazy,
    });
  });

  it('requests only the four social primary URLs and cursor-paginates all records', async () => {
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [
        {
          id: 'creator-a',
          instagramLink: {
            primaryLinkUrl: 'https://www.instagram.com/Ada/?ref=stored#bio',
          },
        },
      ],
      totalCount: 2,
      hasNextPage: true,
      error: undefined,
    });
    mockFetchMoreRecordsLazy.mockResolvedValue({
      records: [
        {
          id: 'creator-b',
          twitterLink: {
            primaryLinkUrl: 'https://twitter.com/Bob/',
          },
        },
      ],
      error: undefined,
    });

    const { result } = renderHook(() =>
      useQueryExistingCreatorSocialProfiles(),
    );

    await expect(
      result.current.queryExistingCreatorSocialProfiles(),
    ).resolves.toEqual([
      {
        id: 'creator-a',
        instagramLink: { primaryLinkUrl: 'https://instagram.com/Ada' },
        tiktokLink: undefined,
        youtubeLink: undefined,
        twitterLink: undefined,
      },
      {
        id: 'creator-b',
        instagramLink: undefined,
        tiktokLink: undefined,
        youtubeLink: undefined,
        twitterLink: { primaryLinkUrl: 'https://x.com/Bob' },
      },
    ]);

    expect(mockUseLazyFindManyRecords).toHaveBeenCalledWith({
      objectNameSingular: 'creator',
      recordGqlFields: {
        id: true,
        instagramLink: { primaryLinkUrl: true },
        tiktokLink: { primaryLinkUrl: true },
        youtubeLink: { primaryLinkUrl: true },
        twitterLink: { primaryLinkUrl: true },
      },
      limit: 500,
      fetchPolicy: 'network-only',
    });
    expect(mockFetchMoreRecordsLazy).toHaveBeenCalledWith(500);
  });

  it('drops records without a permission-visible valid social identity', async () => {
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [
        { id: 'creator-a' },
        {
          id: 'creator-b',
          youtubeLink: { primaryLinkUrl: 'https://youtube.com/watch?v=video' },
        },
      ],
      totalCount: 2,
      hasNextPage: false,
      error: undefined,
    });

    const { result } = renderHook(() =>
      useQueryExistingCreatorSocialProfiles(),
    );

    await expect(
      result.current.queryExistingCreatorSocialProfiles(),
    ).resolves.toEqual([]);
  });

  it('rejects before querying when any social identity field is unreadable', async () => {
    mockUseObjectMetadataItem.mockReturnValue({
      objectMetadataItem: {
        readableFields: [
          { name: 'instagramLink' },
          { name: 'tiktokLink' },
          { name: 'youtubeLink' },
        ],
      },
    });
    const { result } = renderHook(() =>
      useQueryExistingCreatorSocialProfiles(),
    );

    await expect(
      result.current.queryExistingCreatorSocialProfiles(),
    ).rejects.toThrow('Unable to verify existing Creators for this import');
    expect(mockFindManyRecordsLazy).not.toHaveBeenCalled();
  });

  it.each([
    [
      'query rejection',
      () =>
        mockFindManyRecordsLazy.mockRejectedValue(
          new Error('secret record value'),
        ),
    ],
    [
      'missing object permission',
      () =>
        mockFindManyRecordsLazy.mockResolvedValue({
          records: null,
          totalCount: 0,
          hasNextPage: false,
          error: undefined,
        }),
    ],
    [
      'incomplete later page',
      () => {
        mockFindManyRecordsLazy.mockResolvedValue({
          records: [{ id: 'creator-a' }],
          totalCount: 2,
          hasNextPage: true,
          error: undefined,
        });
        mockFetchMoreRecordsLazy.mockResolvedValue({
          records: undefined,
          error: new Error('forbidden field'),
        });
      },
    ],
  ])('rejects with a generic error on %s', async (_label, arrange) => {
    arrange();
    const { result } = renderHook(() =>
      useQueryExistingCreatorSocialProfiles(),
    );

    await expect(
      result.current.queryExistingCreatorSocialProfiles(),
    ).rejects.toThrow('Unable to verify existing Creators for this import');
  });
});
