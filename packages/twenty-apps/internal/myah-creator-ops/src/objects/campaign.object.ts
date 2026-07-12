import { FieldType, RelationType, defineObject } from 'twenty-sdk/define';

import {
  CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  OFFER_FIELD_UNIVERSAL_IDENTIFIERS,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'campaign',
  namePlural: 'campaigns',
  labelSingular: 'Campaign',
  labelPlural: 'Campaigns',
  description: 'A creator campaign organized by objective and target audience',
  icon: 'IconTargetArrow',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.status,
      type: FieldType.TEXT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgress',
      isNullable: true,
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.objective,
      type: FieldType.TEXT,
      name: 'objective',
      label: 'Objective',
      icon: 'IconTarget',
      isNullable: true,
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.targetPlatforms,
      type: FieldType.TEXT,
      name: 'targetPlatforms',
      label: 'Target platforms',
      icon: 'IconApps',
      isNullable: true,
    },
    {
      universalIdentifier:
        CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.targetDemographics,
      type: FieldType.TEXT,
      name: 'targetDemographics',
      label: 'Target demographics',
      icon: 'IconUsersGroup',
      isNullable: true,
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.icpGoal,
      type: FieldType.TEXT,
      name: 'icpGoal',
      label: 'ICP goal',
      icon: 'IconSparkles',
      isNullable: true,
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.budgetNotes,
      type: FieldType.TEXT,
      name: 'budgetNotes',
      label: 'Budget notes',
      icon: 'IconCash',
      isNullable: true,
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.campaignCreators,
      type: FieldType.RELATION,
      name: 'campaignCreators',
      label: 'Campaign creators',
      icon: 'IconUsersGroup',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.campaign,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.offers,
      type: FieldType.RELATION,
      name: 'offers',
      label: 'Offers',
      icon: 'IconGift',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OFFER_FIELD_UNIVERSAL_IDENTIFIERS.campaign,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    {
      universalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.outreachSequences,
      type: FieldType.RELATION,
      name: 'outreachSequences',
      label: 'Outreach sequences',
      icon: 'IconRoute',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.campaign,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
