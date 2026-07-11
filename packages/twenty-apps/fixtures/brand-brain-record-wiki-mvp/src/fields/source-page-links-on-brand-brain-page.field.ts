import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-link.object';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
export const BRAND_BRAIN_PAGE_SOURCE_LINKS_FIELD_UNIVERSAL_IDENTIFIER =
  '776301dc-08a6-4692-b9b8-f427f040085b';
export const BRAND_BRAIN_LINK_SOURCE_PAGE_FIELD_UNIVERSAL_IDENTIFIER =
  '94d2f0e6-0915-40e3-bc40-b1a6336dc16a';
export default defineField({
  universalIdentifier: BRAND_BRAIN_PAGE_SOURCE_LINKS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'sourcePageLinks',
  label: 'Outgoing Links',
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_LINK_SOURCE_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
