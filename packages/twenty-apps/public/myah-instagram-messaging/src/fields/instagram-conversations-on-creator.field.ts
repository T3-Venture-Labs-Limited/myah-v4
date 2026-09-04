import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  CREATOR_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
  SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CREATOR_CONVERSATIONS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'instagramConversations',
  label: 'Instagram conversations',
  icon: 'IconMessages',
  relationTargetObjectMetadataUniversalIdentifier:
    SOCIAL_CONVERSATION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    SOCIAL_CONVERSATION_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
