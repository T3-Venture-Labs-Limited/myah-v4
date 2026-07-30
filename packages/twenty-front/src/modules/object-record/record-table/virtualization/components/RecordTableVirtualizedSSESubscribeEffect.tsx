import { useMemo } from 'react';

import { flattenedFieldMetadataItemsSelector } from '@/object-metadata/states/flattenedFieldMetadataItemsSelector';
import { turnSortsIntoOrderBy } from '@/object-record/object-sort-dropdown/utils/turnSortsIntoOrderBy';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { useEffectiveRecordFilters } from '@/object-record/record-filter/hooks/useEffectiveRecordFilters';
import { useFilterValueDependencies } from '@/object-record/record-filter/hooks/useFilterValueDependencies';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { currentRecordSortsComponentState } from '@/object-record/record-sort/states/currentRecordSortsComponentState';
import { useListenToEventsForQuery } from '@/sse-db-event/hooks/useListenToEventsForQuery';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { computeRecordGqlOperationFilter } from 'twenty-shared/utils';

export const RecordTableVirtualizedSSESubscribeEffect = () => {
  const { objectMetadataItem } = useRecordIndexContextOrThrow();
  const { filterValueDependencies } = useFilterValueDependencies();

  const flattenedFieldMetadataItems = useAtomStateValue(
    flattenedFieldMetadataItemsSelector,
  );

  const effectiveRecordFilters = useEffectiveRecordFilters();

  const currentRecordSorts = useAtomComponentStateValue(
    currentRecordSortsComponentState,
  );

  const currentRecordFilterGroups = useAtomComponentStateValue(
    currentRecordFilterGroupsComponentState,
  );

  const queryId = `record-table-virtualized-${objectMetadataItem.nameSingular}`;

  const operationSignature = useMemo(
    () => ({
      objectNameSingular: objectMetadataItem.nameSingular,
      variables: {
        filter: computeRecordGqlOperationFilter({
          fieldMetadataItems: flattenedFieldMetadataItems,
          recordFilters: effectiveRecordFilters,
          recordFilterGroups: currentRecordFilterGroups,
          filterValueDependencies,
        }),
        orderBy: turnSortsIntoOrderBy(objectMetadataItem, currentRecordSorts),
      },
    }),
    [
      objectMetadataItem,
      effectiveRecordFilters,
      currentRecordFilterGroups,
      filterValueDependencies,
      currentRecordSorts,
      flattenedFieldMetadataItems,
    ],
  );

  useListenToEventsForQuery({
    queryId,
    operationSignature,
  });

  return null;
};
