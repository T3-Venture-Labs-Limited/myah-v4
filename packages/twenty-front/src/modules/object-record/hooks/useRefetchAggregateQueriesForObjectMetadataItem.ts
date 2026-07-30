import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';

export const useRefetchAggregateQueriesForObjectMetadataItem = () => {
  const { refetchAggregateQueries } = useRefetchAggregateQueries();

  const refetchAggregateQueriesForObjectMetadataItem = async ({
    objectMetadataItem,
  }: {
    objectMetadataItem: EnrichedObjectMetadataItem;
  }) => {
    await refetchAggregateQueries({
      objectMetadataNamePlural: objectMetadataItem.namePlural,
    });
  };

  return {
    refetchAggregateQueriesForObjectMetadataItem,
  };
};
