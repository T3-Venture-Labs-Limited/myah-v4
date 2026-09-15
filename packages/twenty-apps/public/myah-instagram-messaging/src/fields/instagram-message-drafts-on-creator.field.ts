import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  CREATOR_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
  REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CREATOR_DRAFTS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'instagramMessageDrafts',
  label: 'Instagram message drafts',
  icon: 'IconMessagePlus',
  relationTargetObjectMetadataUniversalIdentifier:
    REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    REPLY_DRAFT_CREATOR_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
