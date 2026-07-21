// This test uses history traversal to assert the dispatcher uses replace navigation.
/* oxlint-disable twenty/no-navigate-prefer-link */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { MyahNavigationRouteDispatcher } from '@/myah/navigation/components/MyahNavigationRouteDispatcher';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';
import { RecordIndexEmptyStateNotShared } from '@/object-record/record-index/components/RecordIndexEmptyStateNotShared';

jest.mock('@/myah/navigation/hooks/useResolvedMyahNavigationRoutes');
jest.mock('~/pages/not-found/NotFound', () => ({
  NotFound: () => <div>Not Found</div>,
}));
jest.mock('twenty-ui/feedback', () => ({
  ...jest.requireActual('twenty-ui/feedback'),
  Loader: () => <div>Loading</div>,
}));

const mockedUseResolvedMyahNavigationRoutes = jest.mocked(
  useResolvedMyahNavigationRoutes,
);

const NativeDashboard = () => {
  const navigate = useNavigate();

  const navigateBack = () => navigate(-1);

  return (
    <>
      <div>Native Dashboard</div>
      <RecordIndexEmptyStateNotShared />
      <button onClick={navigateBack}>Back</button>
    </>
  );
};

const renderDispatcher = (
  routes: ResolvedMyahNavigationRoute[],
  initialEntry = '/myah/today',
) => {
  mockedUseResolvedMyahNavigationRoutes.mockReturnValue(routes);

  render(
    <MemoryRouter initialEntries={['/previous', initialEntry]} initialIndex={1}>
      <Routes>
        <Route
          path="/myah/:pageId"
          element={<MyahNavigationRouteDispatcher />}
        />
        <Route path="/previous" element={<div>Previous Page</div>} />
        <Route path="/objects/dashboards" element={<NativeDashboard />} />
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

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Previous Page')).toBeVisible();
  });

  it('replaces a forbidden native route with its permission-empty body', async () => {
    renderDispatcher([
      {
        status: 'forbidden',
        route: getMyahNavigationRoute('today'),
        destination: { kind: 'native', path: '/objects/dashboards' },
      },
    ]);

    expect(await screen.findByText('Object not shared')).toBeVisible();
    expect(
      screen.getByText("You don't have access to this object."),
    ).toBeVisible();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
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

  it.each<{
    routes: ResolvedMyahNavigationRoute[];
    initialEntry: '/myah/today' | '/myah/segments' | '/myah/creator-discovery';
  }>([
    {
      initialEntry: '/myah/today',
      routes: [{ status: 'missing', route: getMyahNavigationRoute('today') }],
    },
    {
      initialEntry: '/myah/segments',
      routes: [
        { status: 'deferred', route: getMyahNavigationRoute('segments') },
      ],
    },
    {
      initialEntry: '/myah/creator-discovery',
      routes: [
        { status: 'soon', route: getMyahNavigationRoute('creator-discovery') },
      ],
    },
  ])(
    'renders NotFound for an unavailable route at $initialEntry',
    ({ routes, initialEntry }) => {
      renderDispatcher(routes, initialEntry);

      expect(screen.getByText('Not Found')).toBeVisible();
    },
  );

  it('renders NotFound for an unknown page ID', () => {
    renderDispatcher([]);

    expect(screen.getByText('Not Found')).toBeVisible();
  });
});
