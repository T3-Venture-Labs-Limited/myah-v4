import { useMemo } from 'react';

import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { MYAH_NAVIGATION_ROUTES } from '@/myah/navigation/myah-navigation-registry';
import {
  type MyahNavigationRoute,
  type ResolvedMyahNavigationRoute,
} from '@/myah/navigation/types/MyahNavigationRoute';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { lastVisitedViewPerObjectMetadataItemState } from '@/navigation/states/lastVisitedViewPerObjectMetadataItemState';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { pageLayoutsWithRelationsSelector } from '@/page-layout/states/pageLayoutsWithRelationsSelector';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

type MyahNavigationMetadataStoreKey =
  | 'objectMetadataItems'
  | 'fieldMetadataItems'
  | 'views'
  | 'viewFields'
  | 'pageLayouts'
  | 'pageLayoutTabs'
  | 'pageLayoutWidgets';

type MyahNavigationObjectMetadataItem = {
  id: string;
  nameSingular: string;
  namePlural: string;
  universalIdentifier?: string | null;
};

type MyahNavigationPageLayout = {
  id: string;
  universalIdentifier?: string | null;
};

export type MyahNavigationRouteResolutionSources = {
  metadataStoreItems: Record<
    MyahNavigationMetadataStoreKey,
    { status: string }
  >;
  objectMetadataItems: MyahNavigationObjectMetadataItem[];
  pageLayouts: MyahNavigationPageLayout[];
  lastVisitedViewIdByObjectMetadataId: Record<string, string>;
  isObjectPermissionsLoaded: boolean;
  isLastVisitedViewDataLoaded: boolean;
  objectPermissionsByObjectMetadataId: Record<
    string,
    { canReadObjectRecords: boolean }
  >;
};

const isMetadataLoaded = (
  metadataStoreItems: MyahNavigationRouteResolutionSources['metadataStoreItems'],
  keys: MyahNavigationMetadataStoreKey[],
) => keys.every((key) => metadataStoreItems[key].status === 'up-to-date');

const NATIVE_OBJECT_METADATA_KEYS: MyahNavigationMetadataStoreKey[] = [
  'objectMetadataItems',
  'fieldMetadataItems',
  'views',
  'viewFields',
];

const PAGE_LAYOUT_METADATA_KEYS: MyahNavigationMetadataStoreKey[] = [
  'pageLayouts',
  'pageLayoutTabs',
  'pageLayoutWidgets',
];

const resolveNativeObjectRoute = (
  route: Extract<MyahNavigationRoute, { availability: 'available' }>,
  sources: MyahNavigationRouteResolutionSources,
): ResolvedMyahNavigationRoute => {
  if (
    !isMetadataLoaded(sources.metadataStoreItems, NATIVE_OBJECT_METADATA_KEYS) ||
    !sources.isObjectPermissionsLoaded ||
    !sources.isLastVisitedViewDataLoaded
  ) {
    return { status: 'pending', route };
  }

  const routeDestination = route.destination;

  if (routeDestination.kind !== 'native-object') {
    throw new Error('Expected a native-object navigation destination');
  }

  const object = routeDestination.object;
  const objectMetadataItem = sources.objectMetadataItems.find((item) =>
    object.kind === 'core-object'
      ? item.nameSingular === object.nameSingular
      : item.universalIdentifier === object.universalIdentifier,
  );

  if (objectMetadataItem === undefined) {
    return { status: 'missing', route };
  }

  const lastVisitedViewId =
    sources.lastVisitedViewIdByObjectMetadataId[objectMetadataItem.id];
  const path = getAppPath(
    AppPath.RecordIndexPage,
    { objectNamePlural: objectMetadataItem.namePlural },
    lastVisitedViewId === undefined ? undefined : { viewId: lastVisitedViewId },
  );
  const nativeDestination = {
    kind: 'native' as const,
    path,
    objectNameSingular: objectMetadataItem.nameSingular,
  };

  if (
    !sources.objectPermissionsByObjectMetadataId[objectMetadataItem.id]
      ?.canReadObjectRecords
  ) {
    return { status: 'forbidden', route, destination: nativeDestination };
  }

  return { status: 'ready', route, destination: nativeDestination };
};

const resolveNativePageLayoutRoute = (
  route: Extract<MyahNavigationRoute, { availability: 'available' }>,
  sources: MyahNavigationRouteResolutionSources,
): ResolvedMyahNavigationRoute => {
  if (!isMetadataLoaded(sources.metadataStoreItems, PAGE_LAYOUT_METADATA_KEYS)) {
    return { status: 'pending', route };
  }

  const routeDestination = route.destination;

  if (routeDestination.kind !== 'native-page-layout') {
    throw new Error('Expected a native-page-layout navigation destination');
  }

  const pageLayout = sources.pageLayouts.find(
    (item) =>
      item.universalIdentifier ===
      routeDestination.pageLayoutUniversalIdentifier,
  );

  if (pageLayout === undefined) {
    return { status: 'missing', route };
  }

  return {
    status: 'ready',
    route,
    destination: {
      kind: 'native',
      path: getAppPath(AppPath.PageLayoutPage, { pageLayoutId: pageLayout.id }),
    },
  };
};

export const resolveMyahNavigationRoutes = (
  routes: readonly MyahNavigationRoute[],
  sources: MyahNavigationRouteResolutionSources,
): ResolvedMyahNavigationRoute[] =>
  routes.map((route) => {
    if (route.availability !== 'available') {
      return { status: route.availability, route };
    }

    switch (route.destination.kind) {
      case 'native-object':
        return resolveNativeObjectRoute(route, sources);
      case 'native-page-layout':
        return resolveNativePageLayoutRoute(route, sources);
      case 'myah-page':
        return {
          status: 'ready',
          route,
          destination: {
            kind: 'myah-page',
            Component: route.destination.Component,
          },
        };
    }
  });

export const useResolvedMyahNavigationRoutes = (): ResolvedMyahNavigationRoute[] => {
  const objectMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'objectMetadataItems',
  );
  const fieldMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'fieldMetadataItems',
  );
  const viewsMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'views',
  );
  const viewFieldsMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'viewFields',
  );
  const pageLayoutsMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'pageLayouts',
  );
  const pageLayoutTabsMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'pageLayoutTabs',
  );
  const pageLayoutWidgetsMetadataStoreItem = useAtomFamilyStateValue(
    metadataStoreState,
    'pageLayoutWidgets',
  );
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const pageLayouts = useAtomStateValue(pageLayoutsWithRelationsSelector);
  const lastVisitedViewIdByObjectMetadataId = useAtomStateValue(
    lastVisitedViewPerObjectMetadataItemState,
  );
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  return useMemo(
    () =>
      resolveMyahNavigationRoutes(MYAH_NAVIGATION_ROUTES, {
        metadataStoreItems: {
          objectMetadataItems: objectMetadataStoreItem,
          fieldMetadataItems: fieldMetadataStoreItem,
          views: viewsMetadataStoreItem,
          viewFields: viewFieldsMetadataStoreItem,
          pageLayouts: pageLayoutsMetadataStoreItem,
          pageLayoutTabs: pageLayoutTabsMetadataStoreItem,
          pageLayoutWidgets: pageLayoutWidgetsMetadataStoreItem,
        },
        objectMetadataItems,
        pageLayouts,
        lastVisitedViewIdByObjectMetadataId:
          lastVisitedViewIdByObjectMetadataId ?? {},
        isObjectPermissionsLoaded: currentUserWorkspace !== null,
        isLastVisitedViewDataLoaded: true,
        objectPermissionsByObjectMetadataId,
      }),
    [
      objectMetadataStoreItem,
      fieldMetadataStoreItem,
      viewsMetadataStoreItem,
      viewFieldsMetadataStoreItem,
      pageLayoutsMetadataStoreItem,
      pageLayoutTabsMetadataStoreItem,
      pageLayoutWidgetsMetadataStoreItem,
      objectMetadataItems,
      pageLayouts,
      lastVisitedViewIdByObjectMetadataId,
      currentUserWorkspace,
      objectPermissionsByObjectMetadataId,
    ],
  );
};
