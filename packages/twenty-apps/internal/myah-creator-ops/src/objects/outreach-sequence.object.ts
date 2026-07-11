import {
  FieldType,
  OnDeleteAction,
  RelationType,
  defineObject,
} from 'twenty-sdk/define';

import {
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'outreachSequence',
  namePlural: 'outreachSequences',
  labelSingular: 'Outreach Sequence',
  labelPlural: 'Outreach Sequences',
  description: 'A campaign-level outreach sequence',
  icon: 'IconRoute',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    { universalIdentifier: OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.name, type: FieldType.TEXT, name: 'name', label: 'Name', icon: 'IconTag', defaultValue: "''" },
    {
      universalIdentifier: OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.campaign,
      type: FieldType.RELATION,
      name: 'campaign',
      label: 'Campaign',
      icon: 'IconTargetArrow',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.outreachSequences,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'campaignId',
      },
    },
    { universalIdentifier: OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.status, type: FieldType.TEXT, name: 'status', label: 'Status', icon: 'IconProgress', isNullable: true },
    { universalIdentifier: OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.description, type: FieldType.TEXT, name: 'description', label: 'Description', icon: 'IconFileDescription', isNullable: true },
    {
      universalIdentifier: OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.steps,
      type: FieldType.RELATION,
      name: 'steps',
      label: 'Steps',
      icon: 'IconListCheck',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.outreachSequence,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
