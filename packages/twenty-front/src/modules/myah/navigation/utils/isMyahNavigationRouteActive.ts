import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';
import { matchPath } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

type IsMyahNavigationRouteActiveArgs = {
  route: ResolvedMyahNavigationRoute;
  pathname: string;
  search: string;
  hash: string;
};

export const isMyahNavigationRouteActive = ({
  route,
  pathname,
}: IsMyahNavigationRouteActiveArgs): boolean => {
  if (route.status !== 'ready') {
    return false;
  }

  if (pathname === route.route.entryPath) {
    return true;
  }

  if (route.destination.kind !== 'native') {
    return false;
  }

  const nativePathname = new URL(route.destination.path, 'https://myah.local')
    .pathname;

  if (pathname === nativePathname) {
    return true;
  }

  if (route.destination.objectNameSingular === undefined) {
    return false;
  }

  const recordShowMatch = matchPath(AppPath.RecordShowPage, pathname);

  return (
    recordShowMatch?.params.objectNameSingular ===
    route.destination.objectNameSingular
  );
};
