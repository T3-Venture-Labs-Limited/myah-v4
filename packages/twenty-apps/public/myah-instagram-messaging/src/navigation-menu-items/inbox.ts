import {
  NavigationMenuItemType,
  defineNavigationMenuItem,
} from 'twenty-sdk/define';

import { INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: '593226b1-db2f-41d1-b65b-6349b9d2c8c2',
  name: 'Inbox',
  icon: 'IconInbox',
  position: 0,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
});
