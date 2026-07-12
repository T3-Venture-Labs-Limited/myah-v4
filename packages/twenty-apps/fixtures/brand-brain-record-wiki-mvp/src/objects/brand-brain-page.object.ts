import { FieldType, defineObject } from 'twenty-sdk/define';

export const BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER =
  '6a8289d7-8034-4f70-b3fa-47bc0e52828f';
export const BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER =
  'e6b1d0d8-99b9-4b74-b6cc-21a31a3baf8d';
export const BRAND_BRAIN_PAGE_SLUG_FIELD_UNIVERSAL_IDENTIFIER =
  '8e9bbffa-807a-4e0d-9fb1-f3deec6183cf';
export const BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER =
  '4452d201-44a5-46fc-bf11-e26fa85cc3b2';
export const BRAND_BRAIN_PAGE_ID_PATH_FIELD_UNIVERSAL_IDENTIFIER =
  '3b78e6d5-d9ed-432f-b3f6-d5d6bdb82d99';
export const BRAND_BRAIN_PAGE_PAGE_TYPE_FIELD_UNIVERSAL_IDENTIFIER =
  'b044e1f3-94f4-4d65-93a3-5082e317f5e1';
export const BRAND_BRAIN_PAGE_STATUS_FIELD_UNIVERSAL_IDENTIFIER =
  '531d9732-7614-472c-ae02-8fc806d92c0a';
export const BRAND_BRAIN_PAGE_BODY_FIELD_UNIVERSAL_IDENTIFIER =
  'f9194806-a2c6-4f03-a351-09b4546ce2ed';
export const BRAND_BRAIN_PAGE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER =
  '7f963c23-90c8-44b3-b488-b137e6e358a9';
export const BRAND_BRAIN_PAGE_TAGS_FIELD_UNIVERSAL_IDENTIFIER =
  '322e4f8d-a9b7-4293-a596-5df62e3961e9';
export const BRAND_BRAIN_PAGE_SORT_ORDER_FIELD_UNIVERSAL_IDENTIFIER =
  '0a3cd691-7971-45c3-8e8d-996d9b631c84';
export const BRAND_BRAIN_PAGE_ALIASES_FIELD_UNIVERSAL_IDENTIFIER =
  '24d415b8-fc54-4c18-8cd8-0b5575d39e88';

export default defineObject({
  universalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'brandBrainPage',
  namePlural: 'brandBrainPages',
  labelSingular: 'Brand Brain Page',
  labelPlural: 'Brand Brain',
  description:
    'A record-backed folder, page, Index, or Log entry for the Brand Brain.',
  icon: 'IconNotebook',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: BRAND_BRAIN_PAGE_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'title',
      label: 'Title',
      icon: 'IconHeading',
      defaultValue: "''",
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_SLUG_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'slug',
      label: 'Slug',
      icon: 'IconLink',
      defaultValue: "''",
    },
    {
      universalIdentifier:
        BRAND_BRAIN_PAGE_CANONICAL_PATH_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'canonicalPath',
      label: 'Canonical Path',
      icon: 'IconRoute',
      defaultValue: "''",
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_ID_PATH_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'idPath',
      label: 'ID Path',
      icon: 'IconBinaryTree',
      isNullable: true,
    },
    {
      universalIdentifier:
        BRAND_BRAIN_PAGE_PAGE_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'pageType',
      label: 'Page Type',
      icon: 'IconCategory',
      defaultValue: "'PAGE'",
      options: [
        {
          id: '1cc61a12-c3f0-43ef-904f-ed58c0a9f3c4',
          value: 'BRAND_ROOT',
          label: 'Brand root',
          position: 0,
          color: 'purple',
        },
        {
          id: 'fc0ad6a2-61f9-4985-a6be-e8978f5733c3',
          value: 'FOLDER',
          label: 'Folder',
          position: 1,
          color: 'blue',
        },
        {
          id: '91ca184c-5274-4e1d-b960-07fe10b4e8f4',
          value: 'PAGE',
          label: 'Page',
          position: 2,
          color: 'green',
        },
        {
          id: 'f47b7f64-ee39-4896-a27f-cbc069e712fa',
          value: 'INDEX',
          label: 'Index',
          position: 3,
          color: 'sky',
        },
        {
          id: 'e6c933f3-111d-4966-a7b2-7e72ee4d4d92',
          value: 'LOG',
          label: 'Log',
          position: 4,
          color: 'orange',
        },
        {
          id: '83e84f56-a98b-4a36-92d7-23b2ea3160f1',
          value: 'SOURCE',
          label: 'Source',
          position: 5,
          color: 'gray',
        },
        {
          id: '2cf85c0b-8662-4de2-a2c4-63715358f931',
          value: 'PROMPT',
          label: 'Prompt',
          position: 6,
          color: 'pink',
        },
        {
          id: '138f5749-c522-4c04-a55b-e23c29c3e188',
          value: 'PLAYBOOK',
          label: 'Playbook',
          position: 7,
          color: 'turquoise',
        },
      ],
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgressCheck',
      defaultValue: "'DRAFT'",
      options: [
        {
          id: '7eeae3ef-e85f-431a-8889-562057d78e40',
          value: 'DRAFT',
          label: 'Draft',
          position: 0,
          color: 'gray',
        },
        {
          id: '47617c1b-b0d0-44b4-8b5d-6c1f3dc365a2',
          value: 'APPROVED',
          label: 'Approved',
          position: 1,
          color: 'green',
        },
        {
          id: 'b366dc27-8151-4203-bc8d-55ae2013fbbe',
          value: 'STALE',
          label: 'Stale',
          position: 2,
          color: 'orange',
        },
        {
          id: 'caebc76e-47f1-4498-b2ad-8a0d6d28a469',
          value: 'ARCHIVED',
          label: 'Archived',
          position: 3,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_BODY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.RICH_TEXT,
      name: 'body',
      label: 'Body',
      icon: 'IconNotes',
      isNullable: true,
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'summary',
      label: 'Summary',
      icon: 'IconTextCaption',
      isNullable: true,
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_TAGS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.ARRAY,
      name: 'tags',
      label: 'Tags',
      icon: 'IconTags',
      isNullable: true,
    },
    {
      universalIdentifier:
        BRAND_BRAIN_PAGE_SORT_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'sortOrder',
      label: 'Sort Order',
      icon: 'IconSortAscending',
      isNullable: true,
    },
    {
      universalIdentifier: BRAND_BRAIN_PAGE_ALIASES_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.ARRAY,
      name: 'aliases',
      label: 'Aliases',
      icon: 'IconArrowFork',
      isNullable: true,
    },
  ],
});
