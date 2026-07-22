import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { getGroupByAggregateQueryName } from '@/object-record/record-aggregate/utils/getGroupByAggregateQueryName';
import { getAggregateQueryName } from '@/object-record/utils/getAggregateQueryName';

export const useRefetchAggregateQueries = () => {
  const apolloCoreClient = useApolloCoreClient();

  const refetchAggregateQueries = async ({
    objectMetadataNamePlural,
  }: {
    objectMetadataNamePlural: string;
  }) => {
    const queryName = getAggregateQueryName(objectMetadataNamePlural);

    const groupByAggregateQueryName = getGroupByAggregateQueryName({
      objectMetadataNamePlural,
    });

    const activeQueryNames = new Set(
      [...apolloCoreClient.getObservableQueries('active')]
        .map(({ queryName: activeQueryName }) => activeQueryName)
        .filter((activeQueryName): activeQueryName is string =>
          Boolean(activeQueryName),
        ),
    );
    const activeAggregateQueryNames = [
      queryName,
      groupByAggregateQueryName,
    ].filter((aggregateQueryName) =>
      activeQueryNames.has(aggregateQueryName),
    );

    if (activeAggregateQueryNames.length === 0) {
      return;
    }

    await apolloCoreClient.refetchQueries({
      include: activeAggregateQueryNames,
    });
  };

  return {
    refetchAggregateQueries,
  };
};
