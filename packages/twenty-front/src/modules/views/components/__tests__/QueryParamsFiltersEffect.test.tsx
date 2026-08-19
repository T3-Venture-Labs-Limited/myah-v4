import { render } from '@testing-library/react';

import { QueryParamsFiltersEffect } from '@/views/components/QueryParamsFiltersEffect';
import { useFiltersFromQueryParams } from '@/views/hooks/internal/useFiltersFromQueryParams';

jest.mock('@/views/hooks/internal/useFiltersFromQueryParams', () => ({
  useFiltersFromQueryParams: jest.fn(),
}));

jest.mock('@/views/hooks/internal/useHasFiltersInQueryParams', () => ({
  useHasFiltersInQueryParams: () => ({ hasFiltersQueryParams: false }),
}));

describe('QueryParamsFiltersEffect', () => {
  it('does not resolve filter metadata when the URL has no filter parameters', () => {
    jest.mocked(useFiltersFromQueryParams).mockImplementation(() => {
      throw new Error('filter metadata should not be resolved');
    });

    expect(() => render(<QueryParamsFiltersEffect />)).not.toThrow();
  });
});
