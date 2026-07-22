import {
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import {
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  type: FieldType.RELATION,
  name: 'creator',
  label: 'Creator',
  icon: 'IconUserStar',
  isNullable: true,
  isUIEditable: false,
  relationTargetObjectMetadataUniversalIdentifier:
    CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'creatorId',
  },
});
