import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useLazyFindManyRecords } from '@/object-record/hooks/useLazyFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type ExistingCreatorSocialProfile } from '@/myah/creator-crm/spreadsheet-import/types/CreatorSpreadsheetImportSession';
import { normalizeCreatorSocialProfileUrl } from '@/myah/creator-crm/spreadsheet-import/utils/normalizeCreatorSocialProfileUrl';
import { useCallback } from 'react';

const CREATOR_LOOKUP_PAGE_SIZE = 500;
const DUPLICATE_VERIFICATION_ERROR =
  'Unable to verify existing Creators for this import';

type CreatorSocialProfileRecord = ObjectRecord & ExistingCreatorSocialProfile;

const REQUIRED_SOCIAL_FIELD_NAMES = [
  'instagramLink',
  'tiktokLink',
  'youtubeLink',
  'twitterLink',
] as const;

export const useQueryExistingCreatorSocialProfiles = () => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'creator',
  });
  const { findManyRecordsLazy, fetchMoreRecordsLazy } =
    useLazyFindManyRecords<CreatorSocialProfileRecord>({
      objectNameSingular: 'creator',
      recordGqlFields: {
        id: true,
        instagramLink: { primaryLinkUrl: true },
        tiktokLink: { primaryLinkUrl: true },
        youtubeLink: { primaryLinkUrl: true },
        twitterLink: { primaryLinkUrl: true },
      },
      limit: CREATOR_LOOKUP_PAGE_SIZE,
      fetchPolicy: 'network-only',
    });

  const queryExistingCreatorSocialProfiles = useCallback(async () => {
    try {
      const hasAllSocialFieldsReadable = REQUIRED_SOCIAL_FIELD_NAMES.every(
        (fieldName) =>
          objectMetadataItem.readableFields.some(
            (fieldMetadataItem) => fieldMetadataItem.name === fieldName,
          ),
      );

      if (!hasAllSocialFieldsReadable) {
        throw new Error(DUPLICATE_VERIFICATION_ERROR);
      }

      const firstPage = await findManyRecordsLazy();

      if (firstPage.error || firstPage.records === null) {
        throw new Error(DUPLICATE_VERIFICATION_ERROR);
      }

      const recordsById = new Map(
        (firstPage.records ?? []).map((record) => [record.id, record]),
      );
      let shouldFetchMore = firstPage.hasNextPage;

      while (shouldFetchMore) {
        const nextPage = await fetchMoreRecordsLazy(CREATOR_LOOKUP_PAGE_SIZE);

        if (!nextPage || nextPage.error || !Array.isArray(nextPage.records)) {
          throw new Error(DUPLICATE_VERIFICATION_ERROR);
        }

        for (const record of nextPage.records) {
          recordsById.set(record.id, record);
        }

        shouldFetchMore =
          firstPage.totalCount > 0
            ? recordsById.size < firstPage.totalCount
            : nextPage.records.length === CREATOR_LOOKUP_PAGE_SIZE;
      }

      return [...recordsById.values()].flatMap((record) => {
        const instagramUrl = record.instagramLink?.primaryLinkUrl;
        const tiktokUrl = record.tiktokLink?.primaryLinkUrl;
        const youtubeUrl = record.youtubeLink?.primaryLinkUrl;
        const twitterUrl = record.twitterLink?.primaryLinkUrl;
        const canonicalInstagramUrl = instagramUrl
          ? normalizeCreatorSocialProfileUrl('instagram', instagramUrl)
          : undefined;
        const canonicalTiktokUrl = tiktokUrl
          ? normalizeCreatorSocialProfileUrl('tiktok', tiktokUrl)
          : undefined;
        const canonicalYoutubeUrl = youtubeUrl
          ? normalizeCreatorSocialProfileUrl('youtube', youtubeUrl)
          : undefined;
        const canonicalTwitterUrl = twitterUrl
          ? normalizeCreatorSocialProfileUrl('twitter', twitterUrl)
          : undefined;

        if (
          !canonicalInstagramUrl &&
          !canonicalTiktokUrl &&
          !canonicalYoutubeUrl &&
          !canonicalTwitterUrl
        ) {
          return [];
        }

        return [
          {
            id: record.id,
            instagramLink: canonicalInstagramUrl
              ? { primaryLinkUrl: canonicalInstagramUrl }
              : undefined,
            tiktokLink: canonicalTiktokUrl
              ? { primaryLinkUrl: canonicalTiktokUrl }
              : undefined,
            youtubeLink: canonicalYoutubeUrl
              ? { primaryLinkUrl: canonicalYoutubeUrl }
              : undefined,
            twitterLink: canonicalTwitterUrl
              ? { primaryLinkUrl: canonicalTwitterUrl }
              : undefined,
          },
        ];
      });
    } catch {
      throw new Error(DUPLICATE_VERIFICATION_ERROR);
    }
  }, [
    fetchMoreRecordsLazy,
    findManyRecordsLazy,
    objectMetadataItem.readableFields,
  ]);

  return { queryExistingCreatorSocialProfiles };
};
