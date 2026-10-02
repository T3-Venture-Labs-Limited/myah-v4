import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { AppPath } from 'twenty-shared/types';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { RecordIndexPageRoute } from '~/pages/object-record/RecordIndexPageRoute';
import { RecordShowPageRoute } from '~/pages/object-record/RecordShowPageRoute';

jest.mock('~/pages/object-record/RecordIndexPage', () => ({
  RecordIndexPage: () => <div>Retained Creator List page</div>,
}));
jest.mock('~/pages/object-record/RecordShowPage', () => ({
  RecordShowPage: () => <div>Retained Creator page</div>,
}));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const RouteTransition = ({ to }: { to?: string }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (to) {
      navigate(to);
    }
  }, [navigate, to]);

  return (
    <Routes>
      <Route
        path={AppPath.RecordIndexPage}
        element={<RecordIndexPageRoute />}
      />
      <Route path={AppPath.RecordShowPage} element={<RecordShowPageRoute />} />
    </Routes>
  );
};

describe('Dashboard record route transitions', () => {
  it('transitions between a retained index and an unavailable dashboard index', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/objects/creators']}>
        <RouteTransition />
      </MemoryRouter>,
    );

    expect(screen.getByText('Retained Creator List page')).toBeVisible();

    rerender(
      <MemoryRouter initialEntries={['/objects/creators']}>
        <RouteTransition to="/objects/dashboards" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Dashboards are no longer available.'),
    ).toBeVisible();

    rerender(
      <MemoryRouter initialEntries={['/objects/creators']}>
        <RouteTransition to="/object/creator/creator-id" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Retained Creator page')).toBeVisible();
  });

  it('transitions from an unavailable dashboard record to a retained Creator record', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/object/dashboard/dashboard-id']}>
        <RouteTransition />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Dashboards are no longer available.'),
    ).toBeVisible();

    rerender(
      <MemoryRouter initialEntries={['/object/dashboard/dashboard-id']}>
        <RouteTransition to="/object/creator/creator-id" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Retained Creator page')).toBeVisible();
  });
});
