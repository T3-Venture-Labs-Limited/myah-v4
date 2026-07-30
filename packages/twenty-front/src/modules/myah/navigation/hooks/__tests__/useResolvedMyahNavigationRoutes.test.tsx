import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import {
  resolveMyahNavigationRoutes,
  type MyahNavigationRouteResolutionSources,
} from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import {
  type MyahNavigationRoute,
  type ResolvedMyahNavigationRoute,
} from '@/myah/navigation/types/MyahNavigationRoute';
import { IconCircle } from 'twenty-ui/icon';
import { createStore } from 'jotai';
import { renderHook } from '@testing-library/react';
import * as React from 'react';

const loadedMetadataStoreItems = {
  objectMetadataItems: { status: 'up-to-date' },
  fieldMetadataItems: { status: 'up-to-date' },
  views: { status: 'up-to-date' },
  viewFields: { status: 'up-to-date' },
  pageLayouts: { status: 'up-to-date' },
  pageLayoutTabs: { status: 'up-to-date' },
  pageLayoutWidgets: { status: 'up-to-date' },
} as const;

const buildSources = (
  overrides: Partial<MyahNavigationRouteResolutionSources> = {},
): MyahNavigationRouteResolutionSources => ({
  metadataStoreItems: loadedMetadataStoreItems,
  objectMetadataItems: [],
  pageLayouts: [],
  lastVisitedViewIdByObjectMetadataId: {},
  isObjectPermissionsLoaded: true,
  isLastVisitedViewDataLoaded: true,
  objectPermissionsByObjectMetadataId: {},
  ...overrides,
});

describe('resolveMyahNavigationRoutes', () => {
  it('keeps deferred and soon routes non-navigable without waiting for metadata', () => {
    const [deferred, soon] = resolveMyahNavigationRoutes(
      [
        getMyahNavigationRoute('segments'),
        getMyahNavigationRoute('creator-briefs'),
      ],
      buildSources({
        metadataStoreItems: {
          ...loadedMetadataStoreItems,
          objectMetadataItems: { status: 'empty' },
        },
      }),
    );

    expect(deferred.status).toBe('deferred');
    expect(soon.status).toBe('soon');
  });

  it('returns pending until every native-object metadata and permission source has loaded', () => {
    const [resolvedRoute] = resolveMyahNavigationRoutes(
      [getMyahNavigationRoute('campaigns')],
      buildSources({
        metadataStoreItems: {
          ...loadedMetadataStoreItems,
          viewFields: { status: 'empty' },
        },
      }),
    );

    expect(resolvedRoute.status).toBe('pending');
  });

  it('returns missing only after loaded metadata has no matching stable target', () => {
    const [resolvedRoute] = resolveMyahNavigationRoutes(
      [getMyahNavigationRoute('campaigns')],
      buildSources(),
    );

    expect(resolvedRoute.status).toBe('missing');
  });

  it('uses a native object index path with its last visited view once metadata is ready', () => {
    const [resolvedRoute] = resolveMyahNavigationRoutes(
      [getMyahNavigationRoute('campaigns')],
      buildSources({
        objectMetadataItems: [
          {
            id: 'campaign-object-id',
            nameSingular: 'campaign',
            namePlural: 'campaigns',
            universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
          },
        ],
        lastVisitedViewIdByObjectMetadataId: {
          'campaign-object-id': 'campaign-view-id',
        },
        objectPermissionsByObjectMetadataId: {
          'campaign-object-id': { canReadObjectRecords: true },
        },
      }),
    );

    expect(resolvedRoute).toMatchObject({
      status: 'ready',
      destination: {
        kind: 'native',
        path: '/objects/campaigns?viewId=campaign-view-id',
        objectNameSingular: 'campaign',
      },
    });
  });

  it('resolves each Automation entry to its native workflow object list', () => {
    const resolvedRoutes = resolveMyahNavigationRoutes(
      [
        getMyahNavigationRoute('automations'),
        getMyahNavigationRoute('automation-runs'),
        getMyahNavigationRoute('automation-versions'),
      ],
      buildSources({
        objectMetadataItems: [
          {
            id: 'workflow-object-id',
            nameSingular: 'workflow',
            namePlural: 'workflows',
          },
          {
            id: 'workflow-run-object-id',
            nameSingular: 'workflowRun',
            namePlural: 'workflowRuns',
          },
          {
            id: 'workflow-version-object-id',
            nameSingular: 'workflowVersion',
            namePlural: 'workflowVersions',
          },
        ],
        objectPermissionsByObjectMetadataId: {
          'workflow-object-id': { canReadObjectRecords: true },
          'workflow-run-object-id': { canReadObjectRecords: true },
          'workflow-version-object-id': { canReadObjectRecords: true },
        },
      }),
    );

    expect(resolvedRoutes).toMatchObject([
      {
        status: 'ready',
        route: { id: 'automations' },
        destination: { kind: 'native', path: '/objects/workflows' },
      },
      {
        status: 'ready',
        route: { id: 'automation-runs' },
        destination: { kind: 'native', path: '/objects/workflowRuns' },
      },
      {
        status: 'ready',
        route: { id: 'automation-versions' },
        destination: { kind: 'native', path: '/objects/workflowVersions' },
      },
    ]);
  });

  it('waits for persisted last-visited views before resolving native object routes', () => {
    localStorage.setItem(
      'lastVisitedViewPerObjectMetadataItemState',
      JSON.stringify({ 'campaign-object-id': 'campaign-view-id' }),
    );

    let hydratedLastVisitedViews: Record<string, string> | null = null;

    jest.isolateModules(() => {
      const {
        lastVisitedViewPerObjectMetadataItemState,
      } = require('@/navigation/states/lastVisitedViewPerObjectMetadataItemState');

      hydratedLastVisitedViews = createStore().get(
        lastVisitedViewPerObjectMetadataItemState.atom,
      );
    });

    const sources = buildSources({
      objectMetadataItems: [
        {
          id: 'campaign-object-id',
          nameSingular: 'campaign',
          namePlural: 'campaigns',
          universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
        },
      ],
      objectPermissionsByObjectMetadataId: {
        'campaign-object-id': { canReadObjectRecords: true },
      },
    });
    const [pendingRoute] = resolveMyahNavigationRoutes(
      [getMyahNavigationRoute('campaigns')],
      { ...sources, isLastVisitedViewDataLoaded: false },
    );
    const [readyRoute] = resolveMyahNavigationRoutes(
      [getMyahNavigationRoute('campaigns')],
      {
        ...sources,
        lastVisitedViewIdByObjectMetadataId: hydratedLastVisitedViews ?? {},
      },
    );

    expect(pendingRoute.status).toBe('pending');
    expect(readyRoute).toMatchObject({
      status: 'ready',
      destination: {
        kind: 'native',
        path: '/objects/campaigns?viewId=campaign-view-id',
      },
    });
  });

  it('uses the persisted campaign view on the hook first render', () => {
    localStorage.setItem(
      'lastVisitedViewPerObjectMetadataItemState',
      JSON.stringify({ 'campaign-object-id': 'campaign-view-id' }),
    );

    jest.isolateModules(() => {
      jest.doMock('react', () => React);
      const {
        Provider: JotaiProvider,
        createStore: createIsolatedStore,
      } = require('jotai');
      const {
        currentUserWorkspaceState,
      } = require('@/auth/states/currentUserWorkspaceState');
      const {
        metadataStoreState,
      } = require('@/metadata-store/states/metadataStoreState');
      const {
        useResolvedMyahNavigationRoutes:
          useIsolatedResolvedMyahNavigationRoutes,
      } = require('@/myah/navigation/hooks/useResolvedMyahNavigationRoutes');

      const store = createIsolatedStore();
      const loadedMetadataStoreItem = {
        current: [],
        draft: [],
        status: 'up-to-date',
      };

      for (const metadataStoreKey of [
        'fieldMetadataItems',
        'views',
        'viewFields',
        'pageLayouts',
        'pageLayoutTabs',
        'pageLayoutWidgets',
      ]) {
        store.set(
          metadataStoreState.atomFamily(metadataStoreKey),
          loadedMetadataStoreItem,
        );
      }

      store.set(metadataStoreState.atomFamily('objectMetadataItems'), {
        ...loadedMetadataStoreItem,
        current: [
          {
            id: 'campaign-object-id',
            nameSingular: 'campaign',
            namePlural: 'campaigns',
            universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
          },
        ],
      });
      store.set(currentUserWorkspaceState.atom, {
        permissionFlags: [],
        twoFactorAuthenticationMethodSummary: null,
        objectsPermissions: [
          {
            objectMetadataId: 'campaign-object-id',
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: true,
            canDestroyObjectRecords: true,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        ],
      });

      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      );
      const observedRoutes: ResolvedMyahNavigationRoute[][] = [];
      renderHook(
        () => {
          const routes = useIsolatedResolvedMyahNavigationRoutes();
          observedRoutes.push(routes);
          return routes;
        },
        { wrapper: Wrapper },
      );
      const initialCampaignRoute = observedRoutes[0].find(
        (resolvedRoute) => resolvedRoute.route.id === 'campaigns',
      );

      expect(initialCampaignRoute).toMatchObject({
        status: 'ready',
        destination: {
          kind: 'native',
          path: '/objects/campaigns?viewId=campaign-view-id',
        },
      });
      expect(observedRoutes).not.toContainEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: 'ready',
            destination: expect.objectContaining({
              path: '/objects/campaigns',
            }),
          }),
        ]),
      );
    });
  });

  it('retains the native object path while reporting forbidden access', () => {
    const [resolvedRoute] = resolveMyahNavigationRoutes(
      [getMyahNavigationRoute('campaigns')],
      buildSources({
        objectMetadataItems: [
          {
            id: 'campaign-object-id',
            nameSingular: 'campaign',
            namePlural: 'campaigns',
            universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
          },
        ],
        objectPermissionsByObjectMetadataId: {
          'campaign-object-id': { canReadObjectRecords: false },
        },
      }),
    );

    expect(resolvedRoute).toMatchObject({
      status: 'forbidden',
      destination: {
        kind: 'native',
        path: '/objects/campaigns',
        objectNameSingular: 'campaign',
      },
    });
  });

  it('waits for all page-layout relations before resolving a standalone page', () => {
    const pageLayoutRoute: MyahNavigationRoute = {
      id: 'today',
      label: 'Standalone page',
      Icon: IconCircle,
      group: null,
      entryPath: '/myah/today',
      availability: 'available',
      destination: {
        kind: 'native-page-layout',
        pageLayoutUniversalIdentifier: 'page-layout-universal-id',
      },
    };

    const [pendingRoute] = resolveMyahNavigationRoutes(
      [pageLayoutRoute],
      buildSources({
        metadataStoreItems: {
          ...loadedMetadataStoreItems,
          pageLayoutWidgets: { status: 'empty' },
        },
      }),
    );
    const [readyRoute] = resolveMyahNavigationRoutes(
      [pageLayoutRoute],
      buildSources({
        pageLayouts: [
          {
            id: 'workspace-page-layout-id',
            universalIdentifier: 'page-layout-universal-id',
          },
        ],
      }),
    );

    expect(pendingRoute.status).toBe('pending');
    expect(readyRoute).toMatchObject({
      status: 'ready',
      destination: {
        kind: 'native',
        path: '/page/workspace-page-layout-id',
      },
    });
  });
});
