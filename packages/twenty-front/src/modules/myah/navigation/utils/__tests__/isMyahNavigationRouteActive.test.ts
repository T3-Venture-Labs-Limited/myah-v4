import { getMyahNavigationRoute, MYAH_NAVIGATION_ROUTES } from '@/myah/navigation/myah-navigation-registry';
import { type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';
import { isMyahNavigationRouteActive } from '@/myah/navigation/utils/isMyahNavigationRouteActive';

const campaignRoute = getMyahNavigationRoute('campaigns');
const resolvedCampaignRoute: ResolvedMyahNavigationRoute = {
  status: 'ready',
  route: campaignRoute,
  destination: {
    kind: 'native',
    path: '/objects/campaigns?viewId=campaign-view-id',
    objectNameSingular: 'campaign',
  },
};

describe('isMyahNavigationRouteActive', () => {
  it('matches its Myah entry path', () => {
    expect(
      isMyahNavigationRouteActive({
        route: resolvedCampaignRoute,
        pathname: '/myah/campaigns',
        search: '',
        hash: '',
      }),
    ).toBe(true);
  });

  it('matches an object index pathname regardless of saved-view query and hash variants', () => {
    expect(
      isMyahNavigationRouteActive({
        route: resolvedCampaignRoute,
        pathname: '/objects/campaigns',
        search: '?viewId=another-view',
        hash: '#table',
      }),
    ).toBe(true);
  });

  it('matches an object record-show pathname', () => {
    expect(
      isMyahNavigationRouteActive({
        route: resolvedCampaignRoute,
        pathname: '/object/campaign/campaign-id',
        search: '',
        hash: '',
      }),
    ).toBe(true);
  });

  it('matches a resolved standalone page-layout pathname', () => {
    const resolvedPageLayoutRoute: ResolvedMyahNavigationRoute = {
      status: 'ready',
      route: getMyahNavigationRoute('today'),
      destination: {
        kind: 'native',
        path: '/page/workspace-page-layout-id',
      },
    };

    expect(
      isMyahNavigationRouteActive({
        route: resolvedPageLayoutRoute,
        pathname: '/page/workspace-page-layout-id',
        search: '',
        hash: '',
      }),
    ).toBe(true);
  });

  it('does not select unavailable or unresolved routes', () => {
    const unavailableRoutes: ResolvedMyahNavigationRoute[] = [
      { status: 'pending', route: campaignRoute },
      { status: 'missing', route: campaignRoute },
      { status: 'deferred', route: getMyahNavigationRoute('segments') },
      { status: 'soon', route: getMyahNavigationRoute('creator-briefs') },
      {
        status: 'forbidden',
        route: campaignRoute,
        destination: {
          kind: 'native',
          path: '/objects/campaigns',
          objectNameSingular: 'campaign',
        },
      },
    ];

    for (const route of unavailableRoutes) {
      expect(
        isMyahNavigationRouteActive({
          route,
          pathname: '/objects/campaigns',
          search: '',
          hash: '',
        }),
      ).toBe(false);
    }
  });

  it('selects at most one approved navigation route for a native destination', () => {
    const matchingRoutes = MYAH_NAVIGATION_ROUTES.map((route) =>
      isMyahNavigationRouteActive({
        route:
          route.id === 'campaigns'
            ? resolvedCampaignRoute
            : { status: 'missing', route },
        pathname: '/object/campaign/campaign-id',
        search: '',
        hash: '',
      }),
    ).filter(Boolean);

    expect(matchingRoutes).toHaveLength(1);
  });
});
