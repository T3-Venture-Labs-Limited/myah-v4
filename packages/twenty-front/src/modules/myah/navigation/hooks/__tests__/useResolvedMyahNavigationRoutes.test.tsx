import { getMyahNavigationRoute } from '@/myah/navigation/myah-navigation-registry';
import {
  resolveMyahNavigationRoutes,
  type MyahNavigationRouteResolutionSources,
} from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { type MyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';
import { IconCircle } from 'twenty-ui/icon';
import { createStore } from 'jotai';

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
