import { NavigationMenuItemType } from '~/generated-metadata/graphql';

import { isApplicationViewNavigationMenuItem } from '@/navigation-menu-item/common/utils/isApplicationViewNavigationMenuItem';

describe('isApplicationViewNavigationMenuItem', () => {
  it('identifies application-owned view navigation items only', () => {
    expect(
      isApplicationViewNavigationMenuItem({
        applicationId: 'application-id',
        type: NavigationMenuItemType.VIEW,
      }),
    ).toBe(true);
    expect(
      isApplicationViewNavigationMenuItem({
        applicationId: null,
        type: NavigationMenuItemType.VIEW,
      }),
    ).toBe(false);
    expect(
      isApplicationViewNavigationMenuItem({
        applicationId: 'application-id',
        type: NavigationMenuItemType.OBJECT,
      }),
    ).toBe(false);
  });
});
