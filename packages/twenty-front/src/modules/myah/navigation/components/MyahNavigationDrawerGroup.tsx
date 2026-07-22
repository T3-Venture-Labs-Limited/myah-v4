import { isMyahNavigationRouteActive } from '@/myah/navigation/utils/isMyahNavigationRouteActive';
import { isNavigationSectionOpenFamilyState } from '@/myah/navigation/states/isNavigationSectionOpenFamilyState';
import {
  type MyahNavigationRouteGroupId,
  type ResolvedMyahNavigationRoute,
} from '@/myah/navigation/types/MyahNavigationRoute';
import { NavigationDrawerItemGroup } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItemGroup';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { getNavigationSubItemLeftAdornment } from '@/ui/navigation/navigation-drawer/utils/getNavigationSubItemLeftAdornment';
import { NavigationDrawerSection } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSection';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { styled } from '@linaria/react';
import { useStore } from 'jotai';
import { AnimatedExpandableContainer } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Label } from 'twenty-ui/typography';

const StyledGroupToggle = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-family: ${themeCssVariables.font.family};
  height: ${themeCssVariables.spacing[7]};
  padding: ${themeCssVariables.spacing[1]};
  text-align: left;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }
`;

type MyahNavigationDrawerGroupProps = {
  id: MyahNavigationRouteGroupId;
  label: string;
  routes: ResolvedMyahNavigationRoute[];
  pathname: string;
  search: string;
  hash: string;
};

export const MyahNavigationDrawerGroup = ({
  id,
  label,
  routes,
  pathname,
  search,
  hash,
}: MyahNavigationDrawerGroupProps) => {
  const store = useStore();
  const isNavigationSectionOpen = useAtomFamilyStateValue(
    isNavigationSectionOpenFamilyState,
    id,
  );
  const activeChildIndex = routes.findIndex((route) =>
    isMyahNavigationRouteActive({ route, pathname, search, hash }),
  );
  const hasActiveChild = activeChildIndex !== -1;
  const isExpanded = isNavigationSectionOpen || hasActiveChild;

  const toggle = () => {
    if (!hasActiveChild) {
      store.set(
        isNavigationSectionOpenFamilyState.atomFamily(id),
        !isNavigationSectionOpen,
      );
    }
  };

  return (
    <NavigationDrawerSection>
      <StyledGroupToggle
        type="button"
        aria-expanded={isExpanded}
        onClick={toggle}
      >
        <Label>{label}</Label>
      </StyledGroupToggle>
      <AnimatedExpandableContainer
        isExpanded={isExpanded}
        dimension="height"
        mode="fit-content"
        containAnimation
        initial={false}
      >
        <NavigationDrawerItemGroup>
          {routes.map((route, index) => {
            const isReady = route.status === 'ready';
            const isSoon = route.status === 'soon';

            return (
              <NavigationDrawerItem
                key={route.route.id}
                label={route.route.label}
                Icon={route.route.Icon}
                indentationLevel={2}
                subItemState={getNavigationSubItemLeftAdornment({
                  arrayLength: routes.length,
                  index,
                  selectedIndex: activeChildIndex,
                })}
                active={isMyahNavigationRouteActive({
                  route,
                  pathname,
                  search,
                  hash,
                })}
                to={isReady ? route.route.entryPath : undefined}
                modifier={isSoon ? 'soon' : undefined}
                disabled={!isReady}
              />
            );
          })}
        </NavigationDrawerItemGroup>
      </AnimatedExpandableContainer>
    </NavigationDrawerSection>
  );
};
