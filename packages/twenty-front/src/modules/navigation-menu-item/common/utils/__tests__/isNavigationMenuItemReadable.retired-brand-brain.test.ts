import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { NavigationMenuItemType } from 'twenty-shared/types';

import { isNavigationMenuItemReadable } from '@/navigation-menu-item/common/utils/isNavigationMenuItemReadable';

it('hides preserved Brand Brain navigation rows even for a reader, without hiding other readable objects', () => {
  const objectMetadataItems = [
    {
      id: 'brain',
      universalIdentifier:
        MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
    },
    { id: 'creator', universalIdentifier: 'another-object' },
  ] as never;
  const common = {
    objectMetadataItems,
    views: [],
    objectPermissionsByObjectMetadataId: {},
  };
  expect(
    isNavigationMenuItemReadable({
      ...common,
      item: {
        type: NavigationMenuItemType.OBJECT,
        targetObjectMetadataId: 'brain',
      } as never,
    }),
  ).toBe(false);
  expect(
    isNavigationMenuItemReadable({
      ...common,
      item: {
        type: NavigationMenuItemType.OBJECT,
        targetObjectMetadataId: 'creator',
      } as never,
    }),
  ).toBe(true);
});
