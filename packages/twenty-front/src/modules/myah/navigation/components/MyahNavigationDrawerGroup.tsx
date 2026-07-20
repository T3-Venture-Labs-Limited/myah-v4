import { isMyahNavigationRouteActive } from '@/myah/navigation/utils/isMyahNavigationRouteActive';
import { isNavigationSectionOpenFamilyState } from '@/myah/navigation/states/isNavigationSectionOpenFamilyState';
import { type MyahNavigationRouteGroupId, type ResolvedMyahNavigationRoute } from '@/myah/navigation/types/MyahNavigationRoute';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
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

const StyledItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.betweenSiblingsGap};
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
  const storedIsOpen = useAtomFamilyStateValue(
    isNavigationSectionOpenFamilyState,
    id,
  );
  const hasActiveChild = routes.some((route) =>
    isMyahNavigationRouteActive({ route, pathname, search, hash }),
  );
  const isExpanded = storedIsOpen || hasActiveChild;

  const toggle = () => {
    if (!hasActiveChild) {
      store.set(isNavigationSectionOpenFamilyState.atomFamily(id), !storedIsOpen);
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
        <StyledItems>
          {routes.map((route) => {
            const isReady = route.status === 'ready';
            const isSoon = route.status === 'soon';

            return (
              <NavigationDrawerItem
                key={route.route.id}
                label={route.route.label}
                Icon={route.route.Icon}
                indentationLevel={2}
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
        </StyledItems>
      </AnimatedExpandableContainer>
    </NavigationDrawerSection>
  );
};
