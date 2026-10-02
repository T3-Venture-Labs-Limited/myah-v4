import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';

export const getReadableDataModelOverviewItems = (
  readableObjectMetadataItems: EnrichedObjectMetadataItem[],
): EnrichedObjectMetadataItem[] =>
  readableObjectMetadataItems
    .filter(({ isSystem }) => !isSystem)
    .map((objectMetadataItem) => ({
      ...objectMetadataItem,
      fields: objectMetadataItem.readableFields,
    }));
