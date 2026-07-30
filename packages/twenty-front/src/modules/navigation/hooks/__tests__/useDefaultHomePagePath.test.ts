import { currentUserState } from '@/auth/states/currentUserState';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { createElement, useEffect, type ReactNode } from 'react';
import { AppPath } from 'twenty-shared/types';
import { mockedUserData } from '~/testing/mock-data/users';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

jest.mock('@/myah/navigation/hooks/useResolvedMyahNavigationRoutes');

const mockedUseResolvedMyahNavigationRoutes = jest.mocked(
  useResolvedMyahNavigationRoutes,
);

const Wrapper = ({ children }: { children: ReactNode }) =>
  createElement(JotaiProvider, { store: jotaiStore }, children);

const setTodayStatus = (status: ResolvedMyahNavigationRoute['status']) => {
  const route = getMyahNavigationRoute('today');

  const resolvedRoute: ResolvedMyahNavigationRoute =
    status === 'ready' || status === 'forbidden'
      ? {
          status,
          route,
          destination: { kind: 'native', path: '/objects/dashboards' },
        }
      : { status, route };

  mockedUseResolvedMyahNavigationRoutes.mockReturnValue([resolvedRoute]);
};

const renderDefaultHome = ({
  todayStatus,
  hasReadableObjects,
}: {
  todayStatus: ResolvedMyahNavigationRoute['status'];
  hasReadableObjects: boolean;
}) => {
  setTestObjectMetadataItemsInMetadataStore(
    jotaiStore,
    hasReadableObjects ? getTestEnrichedObjectMetadataItemsMock() : [],
  );
  jotaiStore.set(metadataStoreState.atomFamily('navigationMenuItems'), {
    current: [],
    draft: [],
    status: 'up-to-date',
  });
  setTodayStatus(todayStatus);

  const { result, rerender } = renderHook(
    () => {
      const setCurrentUser = useSetAtomState(currentUserState);

      useEffect(() => {
        setCurrentUser(mockedUserData);
      }, [setCurrentUser]);

      return useDefaultHomePagePath();
    },
    { wrapper: Wrapper },
  );

  return { result, rerender };
};

describe('useDefaultHomePagePath', () => {
  it.each(['pending', 'missing'] as const)(
    'keeps the index path while Today is %s',
    async (todayStatus) => {
      const { result } = renderDefaultHome({
        todayStatus,
        hasReadableObjects: true,
      });

      await waitFor(() => {
        expect(result.current.defaultHomePagePath).toBe(AppPath.Index);
      });
    },
  );

  it.each(['ready', 'forbidden'] as const)(
    'redirects to Today only when its resolver transitions from pending to %s',
    async (todayStatus) => {
      const { result, rerender } = renderDefaultHome({
        todayStatus: 'pending',
        hasReadableObjects: true,
      });

      await waitFor(() => {
        expect(result.current.defaultHomePagePath).toBe(AppPath.Index);
      });

      setTodayStatus(todayStatus);
      rerender();

      await waitFor(() => {
        expect(result.current.defaultHomePagePath).toBe('/myah/today');
      });
    },
  );

  it('keeps the index path when Dashboard metadata is missing', async () => {
    const { result } = renderDefaultHome({
      todayStatus: 'missing',
      hasReadableObjects: false,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toBe(AppPath.Index);
    });
  });

  it.each(['ready', 'forbidden'] as const)(
    'uses Today after it resolves %s, including with no readable objects',
    async (todayStatus) => {
      const { result } = renderDefaultHome({
        todayStatus,
        hasReadableObjects: false,
      });

      await waitFor(() => {
        expect(result.current.defaultHomePagePath).toBe('/myah/today');
      });
    },
  );

  it('uses Today instead of the generic object fallback once it is ready', async () => {
    const { result } = renderDefaultHome({
      todayStatus: 'ready',
      hasReadableObjects: true,
    });

    await waitFor(() => {
      expect(result.current.defaultHomePagePath).toBe('/myah/today');
    });
  });
});
