import qs from 'qs';
import { useSearchParams } from 'react-router-dom';

import { sortUrlQueryParamsSchema } from '@/views/schemas/sortUrlQueryParamsSchema';
import { isDefined } from 'twenty-shared/utils';

export const useHasSortsInQueryParams = () => {
  const [searchParams] = useSearchParams();

  const queryParamsValidation = sortUrlQueryParamsSchema.safeParse(
    qs.parse(searchParams.toString()),
  );

  const sortQueryParams = queryParamsValidation.success
    ? queryParamsValidation.data.sort
    : {};

  const hasSortsQueryParams =
    isDefined(sortQueryParams) && Object.entries(sortQueryParams).length > 0;

  return {
    hasSortsQueryParams,
  };
};
