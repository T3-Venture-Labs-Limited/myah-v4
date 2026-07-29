import { useCreatorListContext } from '@/myah/creator-crm/hooks/useCreatorListContext';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { recordIndexContextualViewNameComponentState } from '@/object-record/record-index/states/recordIndexContextualViewNameComponentState';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { useEffect } from 'react';
import { ViewFilterOperand } from 'twenty-shared/types';

const CREATOR_LIST_MEMBERSHIP_FILTER_ID =
  'a5b456b7-7e58-4bf8-9ab2-87a689ac5e24';

export const CreatorListMembershipFilterEffect = () => {
  const creatorListContext = useCreatorListContext();
  const { recordIndexId } = useRecordIndexIdFromCurrentContextStore();
  const setQueryOnlyRecordFilters = useSetAtomComponentState(
    queryOnlyRecordFiltersComponentState,
    recordIndexId,
  );
  const setRecordIndexContextualViewName = useSetAtomComponentState(
    recordIndexContextualViewNameComponentState,
    recordIndexId,
  );

  useEffect(() => {
    if (!creatorListContext) {
      setRecordIndexContextualViewName(undefined);
      return;
    }

    setRecordIndexContextualViewName(
      `List: ${creatorListContext.target.label}`,
    );

    return () => {
      setRecordIndexContextualViewName(undefined);
    };
  }, [creatorListContext, setRecordIndexContextualViewName]);

  useEffect(() => {
    if (!creatorListContext) {
      setQueryOnlyRecordFilters((recordFilters) =>
        recordFilters.filter(
          (recordFilter) =>
            recordFilter.id !== CREATOR_LIST_MEMBERSHIP_FILTER_ID,
        ),
      );
      return;
    }

    setQueryOnlyRecordFilters((recordFilters) => [
      ...recordFilters.filter(
        (recordFilter) =>
          recordFilter.id !== CREATOR_LIST_MEMBERSHIP_FILTER_ID,
      ),
      {
        id: CREATOR_LIST_MEMBERSHIP_FILTER_ID,
        fieldMetadataId: creatorListContext.filter.fieldMetadataId,
        relationTargetFieldMetadataId:
          creatorListContext.filter.relationTargetFieldMetadataId,
        type: 'RELATION',
        operand: ViewFilterOperand.IS,
        value: creatorListContext.target.id,
        displayValue: '',
        label: `List: ${creatorListContext.target.label}`,
        subFieldName: null,
      },
    ]);

    return () => {
      setQueryOnlyRecordFilters((recordFilters) =>
        recordFilters.filter(
          (recordFilter) =>
            recordFilter.id !== CREATOR_LIST_MEMBERSHIP_FILTER_ID,
        ),
      );
    };
  }, [creatorListContext, setQueryOnlyRecordFilters]);

  return null;
};
