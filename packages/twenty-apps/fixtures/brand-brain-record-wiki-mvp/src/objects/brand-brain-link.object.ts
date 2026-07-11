import { FieldType, defineObject } from 'twenty-sdk/define';

export const BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER =
  'f99ff6bc-3b56-4600-beb3-cfc2c23364f6';
export const BRAND_BRAIN_LINK_NAME_FIELD_UNIVERSAL_IDENTIFIER =
  '56a8c222-bc15-48e2-a608-4c40a791ac4b';
export const BRAND_BRAIN_LINK_TYPE_FIELD_UNIVERSAL_IDENTIFIER =
  '806a4b82-1fc8-43c4-b965-e5271c73b7bb';
export const BRAND_BRAIN_LINK_DESCRIPTION_FIELD_UNIVERSAL_IDENTIFIER =
  '9688a814-290f-460f-9604-d5ffea3c78ac';

export default defineObject({
  universalIdentifier: BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'brandBrainLink',
  namePlural: 'brandBrainLinks',
  labelSingular: 'Brand Brain Link',
  labelPlural: 'Brand Brain Links',
  description: 'An explicit backlink or citation between Brand Brain pages.',
  icon: 'IconLink',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_LINK_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: BRAND_BRAIN_LINK_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier: BRAND_BRAIN_LINK_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'linkType',
      label: 'Link Type',
      icon: 'IconRouteAltLeft',
      defaultValue: "'RELATED'",
      options: [
        {
          id: '251e1198-0de4-454f-83e7-1d6a451af3a8',
          value: 'RELATED',
          label: 'Related',
          position: 0,
          color: 'blue',
        },
        {
          id: 'd885992d-2658-4410-8147-c6a7b8399f75',
          value: 'CITES',
          label: 'Cites',
          position: 1,
          color: 'sky',
        },
        {
          id: 'f77b8f64-7a75-43ac-b65f-918d2db70c9f',
          value: 'SUPPORTS',
          label: 'Supports',
          position: 2,
          color: 'green',
        },
        {
          id: '53b7572c-26e9-4f2b-8372-2dfcbfd560ff',
          value: 'CONTRADICTS',
          label: 'Contradicts',
          position: 3,
          color: 'red',
        },
        {
          id: '3af080c7-b833-4c1e-923a-1edc70e0e93c',
          value: 'SUPERSEDES',
          label: 'Supersedes',
          position: 4,
          color: 'orange',
        },
        {
          id: 'ee0d2617-4de2-44fb-b56e-7e574890acdf',
          value: 'DERIVED_FROM',
          label: 'Derived from',
          position: 5,
          color: 'purple',
        },
      ],
    },
    {
      universalIdentifier:
        BRAND_BRAIN_LINK_DESCRIPTION_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'description',
      label: 'Description',
      icon: 'IconTextCaption',
      isNullable: true,
    },
  ],
});
