import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { MyahNavigationRouteDispatcher } from '@/myah/navigation/components/MyahNavigationRouteDispatcher';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';

jest.mock('@/myah/navigation/hooks/useResolvedMyahNavigationRoutes');
jest.mock('~/pages/not-found/NotFound', () => ({
  NotFound: () => <div>Not Found</div>,
}));
jest.mock('twenty-ui/feedback', () => ({
  Loader: () => <div>Loading</div>,
}));

const mockedUseResolvedMyahNavigationRoutes = jest.mocked(
  useResolvedMyahNavigationRoutes,
);

const renderDispatcher = (routes: ResolvedMyahNavigationRoute[]) => {
  mockedUseResolvedMyahNavigationRoutes.mockReturnValue(routes);

  render(
    <MemoryRouter initialEntries={['/myah/today']}>
      <Routes>
        <Route
          path="/myah/:pageId"
          element={<MyahNavigationRouteDispatcher />}
        />
        <Route path="/objects/dashboards" element={<div>Native Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('MyahNavigationRouteDispatcher', () => {
  it('replaces a resolved native route with its native path', async () => {
    renderDispatcher([
      {
        status: 'ready',
        route: getMyahNavigationRoute('today'),
        destination: { kind: 'native', path: '/objects/dashboards' },
      },
    ]);

    expect(await screen.findByText('Native Dashboard')).toBeVisible();
  });

  it('renders a resolved Myah page body', () => {
    const MyahPage = () => <div>Myah Page</div>;

    renderDispatcher([
      {
        status: 'ready',
        route: getMyahNavigationRoute('today'),
        destination: { kind: 'myah-page', Component: MyahPage },
      },
    ]);

    expect(screen.getByText('Myah Page')).toBeVisible();
  });

  it('renders loading while an available route is pending', () => {
    renderDispatcher([
      { status: 'pending', route: getMyahNavigationRoute('today') },
    ]);

    expect(screen.getByText('Loading')).toBeVisible();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
  });

  it.each<{ routes: ResolvedMyahNavigationRoute[] }>([
    {
      routes: [{ status: 'missing', route: getMyahNavigationRoute('today') }],
    },
    {
      routes: [{ status: 'deferred', route: getMyahNavigationRoute('segments') }],
    },
    {
      routes: [
        { status: 'soon', route: getMyahNavigationRoute('creator-discovery') },
      ],
    },
  ])('renders NotFound for an unavailable route', ({ routes }) => {
    renderDispatcher(routes);

    expect(screen.getByText('Not Found')).toBeVisible();
  });

  it('renders NotFound for an unknown page ID', () => {
    renderDispatcher([]);

    expect(screen.getByText('Not Found')).toBeVisible();
  });
});
