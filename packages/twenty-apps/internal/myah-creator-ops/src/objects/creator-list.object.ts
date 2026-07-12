import { FieldType, RelationType, defineObject } from 'twenty-sdk/define';

import {
  CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'creatorList',
  namePlural: 'creatorLists',
  labelSingular: 'Creator List',
  labelPlural: 'Creator Lists',
  description: 'A reusable imported or curated creator cohort',
  icon: 'IconListDetails',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.name,
  fields: [
    {
      universalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.source,
      type: FieldType.TEXT,
      name: 'source',
      label: 'Source',
      icon: 'IconDatabaseImport',
      isNullable: true,
    },
    {
      universalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.description,
      type: FieldType.TEXT,
      name: 'description',
      label: 'Description',
      icon: 'IconFileDescription',
      isNullable: true,
    },
    {
      universalIdentifier: CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.members,
      type: FieldType.RELATION,
      name: 'members',
      label: 'Members',
      icon: 'IconUsersGroup',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS.creatorList,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
