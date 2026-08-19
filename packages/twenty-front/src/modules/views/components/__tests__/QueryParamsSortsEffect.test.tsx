import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { QueryParamsSortsEffect } from '@/views/components/QueryParamsSortsEffect';
import { useSortsFromQueryParams } from '@/views/hooks/internal/useSortsFromQueryParams';

jest.mock('@/views/hooks/internal/useSortsFromQueryParams', () => ({
  useSortsFromQueryParams: jest.fn(),
}));

describe('QueryParamsSortsEffect', () => {
  it('does not resolve sort metadata when the URL has no sort parameters', () => {
    jest.mocked(useSortsFromQueryParams).mockImplementation(() => {
      throw new Error('sort metadata should not be resolved');
    });

    expect(() =>
      render(
        <MemoryRouter
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <QueryParamsSortsEffect />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
