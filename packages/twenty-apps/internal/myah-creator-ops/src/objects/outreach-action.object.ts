import {
  FieldType,
  OnDeleteAction,
  RelationType,
  defineObject,
} from 'twenty-sdk/define';

import {
  CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'outreachAction',
  namePlural: 'outreachActions',
  labelSingular: 'Outreach Action',
  labelPlural: 'Outreach Actions',
  description: 'A scheduled or completed outreach action for a campaign creator',
  icon: 'IconSend',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    { universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.name, type: FieldType.TEXT, name: 'name', label: 'Name', icon: 'IconTag', defaultValue: "''" },
    {
      universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.campaignCreator,
      type: FieldType.RELATION,
      name: 'campaignCreator',
      label: 'Campaign Creator',
      icon: 'IconUserCheck',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.outreachActions,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'campaignCreatorId',
      },
    },
    {
      universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.outreachStep,
      type: FieldType.RELATION,
      name: 'outreachStep',
      label: 'Outreach Step',
      icon: 'IconListCheck',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.actions,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'outreachStepId',
      },
    },
    { universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.channel, type: FieldType.TEXT, name: 'channel', label: 'Channel', icon: 'IconSend', isNullable: true },
    { universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.status, type: FieldType.TEXT, name: 'status', label: 'Status', icon: 'IconProgress', isNullable: true },
    { universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.scheduledAt, type: FieldType.DATE_TIME, name: 'scheduledAt', label: 'Scheduled at', icon: 'IconCalendarDue', isNullable: true },
    { universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.completedAt, type: FieldType.DATE_TIME, name: 'completedAt', label: 'Completed at', icon: 'IconCircleCheck', isNullable: true },
    { universalIdentifier: OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.resultSummary, type: FieldType.TEXT, name: 'resultSummary', label: 'Result summary', icon: 'IconReportAnalytics', isNullable: true },
  ],
});
