import {
  FieldType,
  OnDeleteAction,
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
  universalIdentifier: MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
  type: FieldType.RELATION,
  name: 'myahCampaign',
  label: 'Myah campaign',
  icon: 'IconTargetArrow',
  isNullable: true,
  isUIEditable: false,
  relationTargetObjectMetadataUniversalIdentifier:
    CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.inboxThreads,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'myahCampaignId',
  },
});
