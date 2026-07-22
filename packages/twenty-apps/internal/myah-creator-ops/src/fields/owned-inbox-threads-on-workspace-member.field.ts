import {
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import { MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.ownedInboxThreads,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'ownedInboxThreads',
  label: 'Owned inbox threads',
  icon: 'IconMail',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxOwner,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
