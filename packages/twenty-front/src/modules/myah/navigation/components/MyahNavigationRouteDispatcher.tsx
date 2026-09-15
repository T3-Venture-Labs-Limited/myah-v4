import { Navigate, useParams } from 'react-router-dom';
import { Loader } from 'twenty-ui/feedback';

import { LazyRoute } from '@/app/components/LazyRoute';

import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { type MyahNavigationPageId } from '@/myah/navigation/types/MyahNavigationRoute';
import { NotFound } from '~/pages/not-found/NotFound';

export const MyahNavigationRouteDispatcher = () => {
  const { pageId } = useParams<{ pageId: MyahNavigationPageId }>();
  const resolvedRoute = useResolvedMyahNavigationRoutes().find(
    ({ route }) => route.id === pageId,
  );

  if (resolvedRoute === undefined) {
    return <NotFound />;
  }

  if (resolvedRoute.status === 'pending') {
    return <Loader />;
  }

  if (
    resolvedRoute.status !== 'ready' &&
    resolvedRoute.status !== 'forbidden'
  ) {
    return <NotFound />;
  }

  if (resolvedRoute.destination.kind === 'myah-page') {
    return (
      <LazyRoute>
        <resolvedRoute.destination.Component />
      </LazyRoute>
    );
  }

  return <Navigate replace to={resolvedRoute.destination.path} />;
};
