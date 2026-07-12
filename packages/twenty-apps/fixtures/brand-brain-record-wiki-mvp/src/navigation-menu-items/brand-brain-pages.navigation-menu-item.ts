import {
  NavigationMenuItemType,
  defineNavigationMenuItem,
} from 'twenty-sdk/define';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
export default defineNavigationMenuItem({
  universalIdentifier: '43f7a291-b0a4-481d-a5e4-b557e1a8f65d',
  position: 0,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
});
