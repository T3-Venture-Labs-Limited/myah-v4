import {
  FieldType,
  OnDeleteAction,
  RelationType,
  defineObject,
} from 'twenty-sdk/define';

import {
  CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'campaignCreator',
  namePlural: 'campaignCreators',
  labelSingular: 'Campaign Creator',
  labelPlural: 'Campaign Creators',
  description: 'A selected creator in a campaign workflow',
  icon: 'IconUserCheck',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    {
      universalIdentifier: CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier: CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.creator,
      type: FieldType.RELATION,
      name: 'creator',
      label: 'Creator',
      icon: 'IconUserStar',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.campaignCreators,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'creatorId',
      },
    },
    {
      universalIdentifier: CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.campaign,
      type: FieldType.RELATION,
      name: 'campaign',
      label: 'Campaign',
      icon: 'IconTargetArrow',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.campaignCreators,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'campaignId',
      },
    },
    {
      universalIdentifier: CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.stage,
      type: FieldType.TEXT,
      name: 'stage',
      label: 'Stage',
      icon: 'IconProgress',
      isNullable: true,
    },
    {
      universalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.selectedContactMethod,
      type: FieldType.TEXT,
      name: 'selectedContactMethod',
      label: 'Selected contact method',
      icon: 'IconSend',
      isNullable: true,
    },
    {
      universalIdentifier: CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.nextActionAt,
      type: FieldType.DATE_TIME,
      name: 'nextActionAt',
      label: 'Next action at',
      icon: 'IconCalendarDue',
      isNullable: true,
    },
    {
      universalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.selectionReason,
      type: FieldType.TEXT,
      name: 'selectionReason',
      label: 'Selection reason',
      icon: 'IconMessageCircle',
      isNullable: true,
    },
    {
      universalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.dealSummary,
      type: FieldType.TEXT,
      name: 'dealSummary',
      label: 'Deal summary',
      icon: 'IconFileDollar',
      isNullable: true,
    },
    {
      universalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.outcomeSummary,
      type: FieldType.TEXT,
      name: 'outcomeSummary',
      label: 'Outcome summary',
      icon: 'IconReportAnalytics',
      isNullable: true,
    },
    {
      universalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.outreachActions,
      type: FieldType.RELATION,
      name: 'outreachActions',
      label: 'Outreach actions',
      icon: 'IconSend',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.campaignCreator,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
