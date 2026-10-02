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

const profile = (id: string, creatorId: string, profileUrl: string) => ({
  id,
  creatorId,
  platform: 'INSTAGRAM',
  profileUrl,
});

const query = () =>
  renderHook(() =>
    useQueryExistingCreatorSocialProfiles(),
  ).result.current.queryExistingCreatorSocialProfiles();

describe('useQueryExistingCreatorSocialProfiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseObjectMetadataItem.mockReturnValue({
      objectMetadataItem: {
        readableFields: ['id', 'creator', 'platform', 'profileUrl'].map(
          (name) => ({ name }),
        ),
      },
    });
    mockUseLazyFindManyRecords.mockReturnValue({
      findManyRecordsLazy: mockFindManyRecordsLazy,
      fetchMoreRecordsLazy: mockFetchMoreRecordsLazy,
    });
  });

  it('reads every canonical profile independently across pages, including two Instagram profiles on one Creator', async () => {
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [
        profile('p1', 'creator-a', 'https://www.instagram.com/ada/?ref=csv'),
      ],
      totalCount: 3,
      hasNextPage: true,
    });
    mockFetchMoreRecordsLazy.mockResolvedValue({
      records: [
        profile('p2', 'creator-a', 'https://instagram.com/ada.two'),
        profile('p3', 'creator-b', 'https://instagram.com/bob'),
      ],
    });
    await expect(query()).resolves.toEqual([
      profile('p1', 'creator-a', 'https://instagram.com/ada'),
      profile('p2', 'creator-a', 'https://instagram.com/ada.two'),
      profile('p3', 'creator-b', 'https://instagram.com/bob'),
    ]);
    expect(mockUseLazyFindManyRecords).toHaveBeenCalledWith({
      objectNameSingular: 'socialProfile',
      recordGqlFields: {
        id: true,
        creatorId: true,
        platform: true,
        profileUrl: true,
      },
      limit: 500,
      fetchPolicy: 'network-only',
    });
    expect(mockFetchMoreRecordsLazy).toHaveBeenCalledWith(500);
  });

  it('fails closed when a required SocialProfile field is unreadable', async () => {
    mockUseObjectMetadataItem.mockReturnValue({
      objectMetadataItem: {
        readableFields: ['id', 'creatorId', 'platform', 'profileUrl'].map(
          (name) => ({ name }),
        ),
      },
    });
    await expect(query()).rejects.toThrow(
      'Unable to verify existing Creators for this import',
    );
    expect(mockFindManyRecordsLazy).not.toHaveBeenCalled();
  });

  it.each([
    { records: null, totalCount: 0, hasNextPage: false },
    { records: [], totalCount: 2, hasNextPage: false },
  ])('fails closed on incomplete visibility %#', async (page) => {
    mockFindManyRecordsLazy.mockResolvedValue(page);
    await expect(query()).rejects.toThrow(
      'Unable to verify existing Creators for this import',
    );
  });

  it('fails closed on an incomplete later page', async () => {
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [profile('p1', 'creator-a', 'https://instagram.com/ada')],
      totalCount: 2,
      hasNextPage: true,
    });
    mockFetchMoreRecordsLazy.mockResolvedValue({
      records: [],
      error: undefined,
    });
    await expect(query()).rejects.toThrow(
      'Unable to verify existing Creators for this import',
    );
  });
});
