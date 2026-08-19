import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useHasFiltersInQueryParams } from '@/views/hooks/internal/useHasFiltersInQueryParams';
import { useHasSortsInQueryParams } from '@/views/hooks/internal/useHasSortsInQueryParams';
import { useSortsFromQueryParams } from '@/views/hooks/internal/useSortsFromQueryParams';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';

const QueryParamsCleanup = () => {
  const { hasFiltersQueryParams } = useHasFiltersInQueryParams();
  const { hasSortsQueryParams } = useHasSortsInQueryParams();

  if (!hasFiltersQueryParams && !hasSortsQueryParams) {
    return null;
  }

  return <QueryParamsCleanupEffect />;
};

export { QueryParamsCleanup as QueryParamsCleanupEffect };

const QueryParamsCleanupEffect = () => {
  const { objectMetadataItem } = useSortsFromQueryParams();

  const { currentView } = useGetCurrentViewOnly();

  const [searchParams, setSearchParams] = useSearchParams();

  const [hasCleanedQueryParams, setHasCleanedQueryParams] = useState(false);

  const currentViewObjectMetadataItemIsDifferentFromURLObjectMetadataItem =
    currentView?.objectMetadataId !== objectMetadataItem.id;

  useEffect(() => {
    if (
      currentViewObjectMetadataItemIsDifferentFromURLObjectMetadataItem ||
      hasCleanedQueryParams
    ) {
      return;
    }

    const newParams = new URLSearchParams(searchParams);

    Array.from(newParams.keys()).forEach((key) => {
      if (
        key.startsWith('filter[') ||
        key.startsWith('filterGroup[') ||
        key.startsWith('sort[')
      ) {
        newParams.delete(key);
      }
    });

    setSearchParams(newParams, { replace: true });
    setHasCleanedQueryParams(true);
  }, [
    currentViewObjectMetadataItemIsDifferentFromURLObjectMetadataItem,
    hasCleanedQueryParams,
    searchParams,
    setSearchParams,
  ]);

  return null;
};
