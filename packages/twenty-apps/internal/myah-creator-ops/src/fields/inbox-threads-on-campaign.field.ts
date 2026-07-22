import {
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  defineField,
} from 'twenty-sdk/define';

import {
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
  objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'inboxThreads',
  label: 'Inbox threads',
  icon: 'IconMail',
  isNullable: true,
  isUIEditable: false,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
