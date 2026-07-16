import { ViewType, defineView } from 'twenty-sdk/define';

import {
  INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Inbox',
  objectUniversalIdentifier: SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconInbox',
  type: ViewType.TABLE,
  position: 0,
});
