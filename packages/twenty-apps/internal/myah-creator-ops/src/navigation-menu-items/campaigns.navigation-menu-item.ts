import { NavigationMenuItemType, defineNavigationMenuItem } from 'twenty-sdk/define';

import {
  CAMPAIGNS_NAV_UNIVERSAL_IDENTIFIER,
  CAMPAIGNS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: CAMPAIGNS_NAV_UNIVERSAL_IDENTIFIER,
  type: NavigationMenuItemType.VIEW,
  icon: 'IconTargetArrow',
  position: 2,
  viewUniversalIdentifier: CAMPAIGNS_VIEW_UNIVERSAL_IDENTIFIER,
});
