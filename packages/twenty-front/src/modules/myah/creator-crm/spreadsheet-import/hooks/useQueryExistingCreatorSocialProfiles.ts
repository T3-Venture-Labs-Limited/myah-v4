import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useLazyFindManyRecords } from '@/object-record/hooks/useLazyFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type ExistingCreatorSocialProfile } from '@/myah/creator-crm/spreadsheet-import/types/CreatorSpreadsheetImportSession';
import {
  normalizeCreatorSocialProfileUrl,
  type CreatorSocialProvider,
} from '@/myah/creator-crm/spreadsheet-import/utils/normalizeCreatorSocialProfileUrl';
import { useCallback } from 'react';

const PAGE_SIZE = 500;
const VERIFICATION_ERROR = 'Unable to verify existing Creators for this import';
const SUPPORTED_PLATFORMS = new Set([
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'TWITTER',
]);

export const useQueryExistingCreatorSocialProfiles = () => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'socialProfile',
  });
  const { findManyRecordsLazy, fetchMoreRecordsLazy } = useLazyFindManyRecords<
    ObjectRecord & ExistingCreatorSocialProfile
  >({
    objectNameSingular: 'socialProfile',
    recordGqlFields: {
      id: true,
      creatorId: true,
      platform: true,
      profileUrl: true,
    },
    limit: PAGE_SIZE,
    fetchPolicy: 'network-only',
  });

  const queryExistingCreatorSocialProfiles = useCallback(async () => {
    try {
      if (
        !['id', 'creator', 'platform', 'profileUrl'].every((fieldName) =>
          objectMetadataItem.readableFields.some(
            (field) => field.name === fieldName,
          ),
        )
      )
        throw new Error(VERIFICATION_ERROR);

      const firstPage = await findManyRecordsLazy();
      if (
        firstPage.error ||
        !Array.isArray(firstPage.records) ||
        !Number.isSafeInteger(firstPage.totalCount) ||
        firstPage.totalCount < firstPage.records.length
      )
        throw new Error(VERIFICATION_ERROR);

      const recordsById = new Map(
        firstPage.records.map((record) => [record.id, record]),
      );
      let hasNextPage = firstPage.hasNextPage;
      while (hasNextPage) {
        const nextPage = await fetchMoreRecordsLazy(PAGE_SIZE);
        if (
          !nextPage ||
          nextPage.error ||
          !Array.isArray(nextPage.records) ||
          nextPage.records.length === 0
        )
          throw new Error(VERIFICATION_ERROR);
        const previousSize = recordsById.size;
        for (const record of nextPage.records)
          recordsById.set(record.id, record);
        if (
          recordsById.size === previousSize ||
          recordsById.size > firstPage.totalCount
        )
          throw new Error(VERIFICATION_ERROR);
        hasNextPage = recordsById.size < firstPage.totalCount;
      }
      if (recordsById.size !== firstPage.totalCount)
        throw new Error(VERIFICATION_ERROR);

      return [...recordsById.values()].flatMap((record) => {
        if (
          !record.id ||
          !record.creatorId ||
          !record.platform ||
          (record.profileUrl !== null &&
            record.profileUrl !== undefined &&
            typeof record.profileUrl !== 'string')
        )
          throw new Error(VERIFICATION_ERROR);
        if (!SUPPORTED_PLATFORMS.has(record.platform) || !record.profileUrl)
          return [];
        const canonicalUrl = normalizeCreatorSocialProfileUrl(
          record.platform.toLowerCase() as CreatorSocialProvider,
          record.profileUrl,
        );
        return canonicalUrl
          ? [
              {
                id: record.id,
                creatorId: record.creatorId,
                platform: record.platform,
                profileUrl: canonicalUrl,
              },
            ]
          : [];
      });
    } catch {
      throw new Error(VERIFICATION_ERROR);
    }
  }, [
    fetchMoreRecordsLazy,
    findManyRecordsLazy,
    objectMetadataItem.readableFields,
  ]);

  return { queryExistingCreatorSocialProfiles };
};
