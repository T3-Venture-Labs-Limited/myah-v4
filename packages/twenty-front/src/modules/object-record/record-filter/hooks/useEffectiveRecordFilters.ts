import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useMemo } from 'react';

export const useEffectiveRecordFilters = (instanceId?: string) => {
  const currentRecordFilters = useAtomComponentStateValue(
    currentRecordFiltersComponentState,
    instanceId,
  );
  const queryOnlyRecordFilters = useAtomComponentStateValue(
    queryOnlyRecordFiltersComponentState,
    instanceId,
  );

  return useMemo(
    () => [...currentRecordFilters, ...queryOnlyRecordFilters],
    [currentRecordFilters, queryOnlyRecordFilters],
  );
};
