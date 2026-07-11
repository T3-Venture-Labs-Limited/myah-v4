import {
  FieldType,
  OnDeleteAction,
  RelationType,
  defineObject,
} from 'twenty-sdk/define';

import {
  CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'creatorListMember',
  namePlural: 'creatorListMembers',
  labelSingular: 'Creator List Member',
  labelPlural: 'Creator List Members',
  description: 'A creator captured inside a curated creator list',
  icon: 'IconUserPlus',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    {
      universalIdentifier: CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier:
        CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.creator,
      type: FieldType.RELATION,
      name: 'creator',
      label: 'Creator',
      icon: 'IconUserStar',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.listMemberships,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'creatorId',
      },
    },
    {
      universalIdentifier:
        CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.creatorList,
      type: FieldType.RELATION,
      name: 'creatorList',
      label: 'Creator List',
      icon: 'IconListDetails',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.members,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'creatorListId',
      },
    },
    {
      universalIdentifier: CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.source,
      type: FieldType.TEXT,
      name: 'source',
      label: 'Source',
      icon: 'IconDatabaseImport',
      isNullable: true,
    },
    {
      universalIdentifier: CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.notes,
      type: FieldType.TEXT,
      name: 'notes',
      label: 'Notes',
      icon: 'IconNotes',
      isNullable: true,
    },
  ],
});
