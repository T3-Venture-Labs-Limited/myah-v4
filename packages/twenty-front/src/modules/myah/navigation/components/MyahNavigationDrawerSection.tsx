import { MyahNavigationDrawerGroup } from '@/myah/navigation/components/MyahNavigationDrawerGroup';
import { useResolvedMyahNavigationRoutes } from '@/myah/navigation/hooks/useResolvedMyahNavigationRoutes';
import { isMyahNavigationRouteActive } from '@/myah/navigation/utils/isMyahNavigationRouteActive';
import { type MyahNavigationRouteGroupId } from '@/myah/navigation/types/MyahNavigationRoute';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { styled } from '@linaria/react';
import { useLocation } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const MYAH_NAVIGATION_GROUPS: {
  id: MyahNavigationRouteGroupId;
  label: string;
}[] = [
  { id: 'creator-crm', label: 'Creator CRM' },
  { id: 'campaign-operations', label: 'Campaign Operations' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'brand-workspace', label: 'Brand Workspace' },
];

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const MyahNavigationDrawerSection = () => {
  const routes = useResolvedMyahNavigationRoutes().filter(
    (route) => route.status !== 'deferred',
  );
  const { pathname, search, hash } = useLocation();

  return (
    <StyledSection>
      {routes
        .filter((route) => route.route.group === null)
        .map((route) => {
          const isReady = route.status === 'ready';
          const isSoon = route.status === 'soon';

          return (
            <NavigationDrawerItem
              key={route.route.id}
              label={route.route.label}
              Icon={route.route.Icon}
              active={isMyahNavigationRouteActive({
                route,
                pathname,
                search,
                hash,
              })}
              to={isReady ? route.route.entryPath : undefined}
              modifier={isSoon ? 'soon' : undefined}
              disabled={isSoon}
            />
          );
        })}

      {MYAH_NAVIGATION_GROUPS.map(({ id, label }) => {
        const groupRoutes = routes.filter((route) => route.route.group === id);

        if (groupRoutes.length === 0) {
          return null;
        }

        return (
          <MyahNavigationDrawerGroup
            key={id}
            id={id}
            label={label}
            routes={groupRoutes}
            pathname={pathname}
            search={search}
            hash={hash}
          />
        );
      })}
    </StyledSection>
  );
};
