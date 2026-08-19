import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { QueryParamsCleanupEffect } from '@/views/components/QueryParamsCleanupEffect';
import { useSortsFromQueryParams } from '@/views/hooks/internal/useSortsFromQueryParams';

jest.mock('@/views/hooks/internal/useHasFiltersInQueryParams', () => ({
  useHasFiltersInQueryParams: () => ({ hasFiltersQueryParams: false }),
}));

jest.mock('@/views/hooks/internal/useSortsFromQueryParams', () => ({
  useSortsFromQueryParams: jest.fn(),
}));

describe('QueryParamsCleanupEffect', () => {
  it('does not resolve query metadata when the URL has no filter or sort parameters', () => {
    jest.mocked(useSortsFromQueryParams).mockImplementation(() => {
      throw new Error('query metadata should not be resolved');
    });

    expect(() =>
      render(
        <MemoryRouter
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <QueryParamsCleanupEffect />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
