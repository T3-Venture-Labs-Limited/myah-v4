import {
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import { CREATOR_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/creator-field-universal-identifiers';
import {
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.ownedCreators,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'ownedCreators',
  label: 'Owned creators',
  icon: 'IconUserStar',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.owner,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
