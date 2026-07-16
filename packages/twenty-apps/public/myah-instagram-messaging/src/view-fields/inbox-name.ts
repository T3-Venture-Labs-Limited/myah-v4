import { defineViewField } from 'twenty-sdk/define';

import {
  INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineViewField({
  universalIdentifier: 'e53457e0-b1f6-448f-8909-35f4497a2880',
  viewUniversalIdentifier: INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
  fieldMetadataUniversalIdentifier:
    SOCIAL_CONVERSATION_LABEL_FIELD_UNIVERSAL_IDENTIFIER,
  position: 0,
  isVisible: true,
  size: 220,
});
