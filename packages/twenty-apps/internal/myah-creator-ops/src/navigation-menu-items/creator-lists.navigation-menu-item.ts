import { NavigationMenuItemType, defineNavigationMenuItem } from 'twenty-sdk/define';

import {
  CREATOR_LISTS_NAV_UNIVERSAL_IDENTIFIER,
  CREATOR_LISTS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: CREATOR_LISTS_NAV_UNIVERSAL_IDENTIFIER,
  type: NavigationMenuItemType.VIEW,
  icon: 'IconListDetails',
  position: 1,
  viewUniversalIdentifier: CREATOR_LISTS_VIEW_UNIVERSAL_IDENTIFIER,
});
