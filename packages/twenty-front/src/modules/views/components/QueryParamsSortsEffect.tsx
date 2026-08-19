import { useEffect } from 'react';

import { useHasSortsInQueryParams } from '@/views/hooks/internal/useHasSortsInQueryParams';
import { useSortsFromQueryParams } from '@/views/hooks/internal/useSortsFromQueryParams';
import { useApplyViewSortsToCurrentRecordSorts } from '@/views/hooks/useApplyViewSortsToCurrentRecordSorts';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
const QueryParamsSorts = () => {
  const { hasSortsQueryParams } = useHasSortsInQueryParams();

  if (!hasSortsQueryParams) {
    return null;
  }

  return <QueryParamsSortsEffect />;
};

export { QueryParamsSorts as QueryParamsSortsEffect };

const QueryParamsSortsEffect = () => {
  const { getSortsFromQueryParams, objectMetadataItem } =
    useSortsFromQueryParams();
  const { currentView } = useGetCurrentViewOnly();

  const { applyViewSortsToCurrentRecordSorts } =
    useApplyViewSortsToCurrentRecordSorts();

  const currentViewObjectMetadataItemIsDifferentFromURLObjectMetadataItem =
    currentView?.objectMetadataId !== objectMetadataItem.id;

  useEffect(() => {
    if (currentViewObjectMetadataItemIsDifferentFromURLObjectMetadataItem) {
      return;
    }

    const sortsFromParams = getSortsFromQueryParams();
    if (sortsFromParams.length > 0) {
      const viewSorts = sortsFromParams.map((sort) => ({
        ...sort,
        viewId: currentView?.id ?? '',
      }));

      applyViewSortsToCurrentRecordSorts(viewSorts);
    }
  }, [
    getSortsFromQueryParams,
    applyViewSortsToCurrentRecordSorts,
    currentViewObjectMetadataItemIsDifferentFromURLObjectMetadataItem,
    currentView?.id,
  ]);

  return null;
};
