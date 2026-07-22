import {
  FieldType,
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
  universalIdentifier: CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'inboxThreads',
  label: 'Inbox threads',
  icon: 'IconMail',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
