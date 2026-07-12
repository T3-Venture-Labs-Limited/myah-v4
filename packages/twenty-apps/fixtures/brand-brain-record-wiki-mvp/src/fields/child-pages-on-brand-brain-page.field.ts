import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
export const BRAND_BRAIN_PAGE_CHILD_PAGES_FIELD_UNIVERSAL_IDENTIFIER =
  '0bbf483c-9c52-4286-9427-a14058456611';
export const BRAND_BRAIN_PAGE_PARENT_PAGE_FIELD_UNIVERSAL_IDENTIFIER =
  '62f3e27e-3c6c-4449-9d81-2b24501f5e3f';
export default defineField({
  universalIdentifier: BRAND_BRAIN_PAGE_CHILD_PAGES_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'childPages',
  label: 'Child Pages',
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_PARENT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
