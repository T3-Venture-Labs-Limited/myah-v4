import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import {
  BRAND_BRAIN_PAGE_CHILD_PAGES_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_PARENT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/fields/child-pages-on-brand-brain-page.field';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
export default defineField({
  universalIdentifier: BRAND_BRAIN_PAGE_PARENT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'parentPage',
  label: 'Parent Page',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_CHILD_PAGES_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'parentPageId',
  },
});
