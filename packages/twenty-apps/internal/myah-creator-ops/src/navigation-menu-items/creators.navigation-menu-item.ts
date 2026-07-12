import { NavigationMenuItemType, defineNavigationMenuItem } from 'twenty-sdk/define';

import {
  CREATORS_NAV_UNIVERSAL_IDENTIFIER,
  CREATORS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: CREATORS_NAV_UNIVERSAL_IDENTIFIER,
  type: NavigationMenuItemType.VIEW,
  icon: 'IconUserStar',
  position: 0,
  viewUniversalIdentifier: CREATORS_VIEW_UNIVERSAL_IDENTIFIER,
});
