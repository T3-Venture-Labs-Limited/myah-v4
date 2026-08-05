import { useCreatorListContextFromIdWithLoading } from '@/myah/creator-crm/hooks/useCreatorListContext';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { lastShowPageRecordIdState } from '@/object-record/record-field/ui/states/lastShowPageRecordId';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { computeCursorArgFilter } from '@/object-record/graphql/utils/computeCursorArgFilter';
import { extractOrderByFieldNames } from '@/object-record/graphql/utils/extractOrderByFieldNames';
import { reverseOrderBy } from '@/object-record/graphql/utils/reverseOrderBy';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useQueryVariablesFromParentView } from '@/views/hooks/useQueryVariablesFromParentView';
import { AppPath, ViewFilterOperand } from 'twenty-shared/types';
import { combineFilters, isDefined } from 'twenty-shared/utils';
import { useNavigateApp } from '~/hooks/useNavigateApp';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const CREATOR_LIST_RECORD_SHOW_FILTER_ID = 'creator-list-record-show-filter';

export const useRecordShowPagePagination = (
  propsObjectNameSingular: string,
  propsObjectRecordId: string,
) => {
  const {
    objectNameSingular: paramObjectNameSingular,
    objectRecordId: paramObjectRecordId,
  } = useParams();

  const navigate = useNavigateApp();
  const [searchParams] = useSearchParams();
  const viewIdQueryParam = searchParams.get('viewId');

  const setLastShowPageRecordId = useSetAtomState(lastShowPageRecordIdState);

  const objectNameSingular = propsObjectNameSingular || paramObjectNameSingular;
  const objectRecordId = propsObjectRecordId || paramObjectRecordId;

  if (!objectNameSingular || !objectRecordId) {
    throw new Error('Object name or Record id is not defined');
  }

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const creatorListId =
    objectMetadataItem.nameSingular === 'creator'
      ? (searchParams.get('creatorListId') ?? undefined)
      : undefined;
  const {
    context: creatorListContext,
    isLoading: isCreatorListValidationLoading,
  } = useCreatorListContextFromIdWithLoading(creatorListId);
  const creatorListMembershipFilter: RecordFilter | undefined =
    creatorListContext
      ? {
          id: CREATOR_LIST_RECORD_SHOW_FILTER_ID,
          fieldMetadataId: creatorListContext.filter.fieldMetadataId,
          relationTargetFieldMetadataId:
            creatorListContext.filter.relationTargetFieldMetadataId,
          type: 'RELATION',
          operand: ViewFilterOperand.IS,
          value: creatorListContext.target.id,
          displayValue: '',
          label: `List: ${creatorListContext.target.label}`,
          subFieldName: null,
        }
      : undefined;

  const { filter, orderBy, isSoftDeleteFilterActive } =
    useQueryVariablesFromParentView({
      additionalRecordFilters: creatorListMembershipFilter
        ? [creatorListMembershipFilter]
        : [],
      objectMetadataItem,
    });

  const orderByGqlFields = extractOrderByFieldNames(orderBy);

  const reversedOrderBy = reverseOrderBy(orderBy);

  const { loading: loadingCurrentRecord, records: currentRecords } =
    useFindManyRecords({
      filter: { id: { eq: objectRecordId } },
      orderBy,
      limit: 1,
      objectNameSingular,
      recordGqlFields: { ...orderByGqlFields, deletedAt: true },
      withSoftDeleted: true,
    });

  const currentRecord = currentRecords[0];
  const isCurrentRecordDeleted = isDefined(currentRecord?.deletedAt);
  const withSoftDeleted = isSoftDeleteFilterActive || isCurrentRecordDeleted;

  const deletedOnlyFilter = isCurrentRecordDeleted
    ? { deletedAt: { is: 'NOT_NULL' as const } }
    : undefined;

  const currentRecordKeysetValues: Record<string, unknown> | undefined =
    isDefined(currentRecord)
      ? {
          id: currentRecord.id,
          ...Object.fromEntries(
            Object.keys(orderByGqlFields).map((fieldName) => [
              fieldName,
              currentRecord[fieldName],
            ]),
          ),
        }
      : undefined;

  const beforeFilter = isDefined(currentRecordKeysetValues)
    ? computeCursorArgFilter({
        orderBy,
        cursorRecordValues: currentRecordKeysetValues,
        isForwardPagination: false,
      })
    : undefined;

  const afterFilter = isDefined(currentRecordKeysetValues)
    ? computeCursorArgFilter({
        orderBy,
        cursorRecordValues: currentRecordKeysetValues,
        isForwardPagination: true,
      })
    : undefined;

  const hasKeysetFilters = isDefined(beforeFilter) && isDefined(afterFilter);
  const skipNeighborQueries =
    isCreatorListValidationLoading || loadingCurrentRecord || !hasKeysetFilters;

  const baseNeighborOptions = {
    skip: skipNeighborQueries,
    objectNameSingular,
    recordGqlFields: { id: true },
    withSoftDeleted,
    limit: 1,
  };

  const mergedFilter = combineFilters(
    [filter, deletedOnlyFilter].filter(isDefined),
  );

  const {
    loading: loadingRecordBefore,
    records: recordsBefore,
    totalCount: totalCountBefore,
  } = useFindManyRecords({
    ...baseNeighborOptions,
    fetchPolicy: 'network-only',
    filter: combineFilters([mergedFilter, beforeFilter].filter(isDefined)),
    orderBy: reversedOrderBy,
  });

  const {
    loading: loadingRecordAfter,
    records: recordsAfter,
    totalCount: totalCountAfter,
  } = useFindManyRecords({
    ...baseNeighborOptions,
    fetchPolicy: 'network-only',
    filter: combineFilters([mergedFilter, afterFilter].filter(isDefined)),
    orderBy,
  });

  const isAtFirstRecord = !loadingRecordBefore && totalCountBefore === 0;
  const isAtLastRecord = !loadingRecordAfter && totalCountAfter === 0;

  const { loading: loadingFirstRecord, records: firstRecords } =
    useFindManyRecords({
      ...baseNeighborOptions,
      skip: skipNeighborQueries || !isAtLastRecord,
      filter: mergedFilter,
      orderBy,
    });

  const { loading: loadingLastRecord, records: lastRecords } =
    useFindManyRecords({
      ...baseNeighborOptions,
      skip: skipNeighborQueries || !isAtFirstRecord,
      filter: mergedFilter,
      orderBy: reversedOrderBy,
    });

  const loading =
    isCreatorListValidationLoading ||
    loadingRecordAfter ||
    loadingRecordBefore ||
    loadingCurrentRecord ||
    !hasKeysetFilters ||
    (isAtLastRecord && loadingFirstRecord) ||
    (isAtFirstRecord && loadingLastRecord);

  const recordBefore = recordsBefore[0];
  const recordAfter = recordsAfter[0];

  // oxlint-disable-next-line twenty/no-navigate-prefer-link
  const navigateToRecord = (targetRecordId: string) => {
    if (isCreatorListValidationLoading) {
      return;
    }

    navigate(
      AppPath.RecordShowPage,
      { objectNameSingular, objectRecordId: targetRecordId },
      creatorListContext
        ? {
            creatorListId: creatorListContext.target.id,
            viewId: viewIdQueryParam,
          }
        : { viewId: viewIdQueryParam },
    );
  };

  const navigateToPreviousRecord = () => {
    if (loading) return;

    if (isDefined(recordBefore)) {
      return navigateToRecord(recordBefore.id);
    }

    if (isDefined(lastRecords[0])) {
      return navigateToRecord(lastRecords[0].id);
    }
  };

  const navigateToNextRecord = () => {
    if (loading) return;

    if (isDefined(recordAfter)) {
      return navigateToRecord(recordAfter.id);
    }

    if (isDefined(firstRecords[0])) {
      return navigateToRecord(firstRecords[0].id);
    }
  };

  const navigateToIndexView = () => {
    if (isCreatorListValidationLoading) {
      return;
    }

    navigate(
      AppPath.RecordIndexPage,
      {
        objectNamePlural: creatorListContext
          ? 'creator-lists'
          : objectMetadataItem.namePlural,
      },
      creatorListContext
        ? { creatorListId: creatorListContext.target.id }
        : { viewId: viewIdQueryParam },
    );
    setLastShowPageRecordId(objectRecordId);
  };

  const rankInView = isDefined(totalCountBefore) ? totalCountBefore : -1;
  const totalCount =
    rankInView > -1 && isDefined(totalCountAfter)
      ? 1 + rankInView + totalCountAfter
      : 0;

  const [cachedPagination, setCachedPagination] = useState({
    rankInView,
    totalCount,
  });

  if (!loading && rankInView > -1) {
    if (
      cachedPagination.rankInView !== rankInView ||
      cachedPagination.totalCount !== totalCount
    ) {
      setCachedPagination({ rankInView, totalCount });
    }
  }

  return {
    isLoadingPagination: loading,
    navigateToPreviousRecord,
    navigateToNextRecord,
    navigateToIndexView,
    rankInView: loading ? cachedPagination.rankInView : rankInView,
    totalCount: loading ? cachedPagination.totalCount : totalCount,
    objectMetadataItem,
  };
};
