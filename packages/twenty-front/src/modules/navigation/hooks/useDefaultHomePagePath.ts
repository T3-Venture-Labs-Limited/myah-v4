import { currentUserState } from '@/auth/states/currentUserState';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { getMyahEntryPath } from '@/myah/navigation/myah-navigation-registry';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMemo } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export const useDefaultHomePagePath = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const resolvedTodayRoute = useResolvedMyahNavigationRoutes().find(
    ({ route }) => route.id === 'today',
  );

  const defaultHomePagePath = useMemo(() => {
    if (!isDefined(currentUser)) {
      return AppPath.SignInUp;
    }

    if (
      resolvedTodayRoute?.status === 'ready' ||
      resolvedTodayRoute?.status === 'forbidden'
    ) {
      return getMyahEntryPath('today');
    }

    return AppPath.Index;
  }, [currentUser, resolvedTodayRoute?.status]);

  return { defaultHomePagePath };
};
