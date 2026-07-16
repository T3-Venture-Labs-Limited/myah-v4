import { type NavigationMenuItem } from '~/generated-metadata/graphql';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export const isApplicationViewNavigationMenuItem = (
  navigationMenuItem: Pick<NavigationMenuItem, 'applicationId' | 'type'>,
) =>
  navigationMenuItem.type === NavigationMenuItemType.VIEW &&
  isDefined(navigationMenuItem.applicationId);
