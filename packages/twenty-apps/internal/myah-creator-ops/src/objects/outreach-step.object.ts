import {
  FieldType,
  OnDeleteAction,
  RelationType,
  defineObject,
} from 'twenty-sdk/define';

import {
  OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'outreachStep',
  namePlural: 'outreachSteps',
  labelSingular: 'Outreach Step',
  labelPlural: 'Outreach Steps',
  description: 'A step in an outreach sequence',
  icon: 'IconListCheck',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    { universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.name, type: FieldType.TEXT, name: 'name', label: 'Name', icon: 'IconTag', defaultValue: "''" },
    {
      universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.outreachSequence,
      type: FieldType.RELATION,
      name: 'outreachSequence',
      label: 'Outreach Sequence',
      icon: 'IconRoute',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS.steps,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'outreachSequenceId',
      },
    },
    { universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.stepPosition, type: FieldType.NUMBER, name: 'stepPosition', label: 'Step position', icon: 'IconSortAscending', isNullable: true },
    { universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.trigger, type: FieldType.TEXT, name: 'trigger', label: 'Trigger', icon: 'IconBolt', isNullable: true },
    { universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.channel, type: FieldType.TEXT, name: 'channel', label: 'Channel', icon: 'IconSend', isNullable: true },
    { universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.delayDays, type: FieldType.NUMBER, name: 'delayDays', label: 'Delay days', icon: 'IconClock', isNullable: true },
    { universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.templateSummary, type: FieldType.TEXT, name: 'templateSummary', label: 'Template summary', icon: 'IconTemplate', isNullable: true },
    {
      universalIdentifier: OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS.actions,
      type: FieldType.RELATION,
      name: 'actions',
      label: 'Actions',
      icon: 'IconSend',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS.outreachStep,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
