import { defineViewField } from 'twenty-sdk/define';

import {
  INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_REPLY_WINDOW_ENDS_AT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineViewField({
  universalIdentifier: '926b263c-ce69-459d-aa1b-e56045866a19',
  viewUniversalIdentifier: INBOX_FALLBACK_VIEW_UNIVERSAL_IDENTIFIER,
  fieldMetadataUniversalIdentifier:
    SOCIAL_CONVERSATION_REPLY_WINDOW_ENDS_AT_FIELD_UNIVERSAL_IDENTIFIER,
  position: 1,
  isVisible: true,
  size: 180,
});
