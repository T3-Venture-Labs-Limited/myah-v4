import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-link.object';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
export const BRAND_BRAIN_PAGE_TARGET_LINKS_FIELD_UNIVERSAL_IDENTIFIER =
  '3cb59cb6-8ef0-4608-bc1a-872e888a60ed';
export const BRAND_BRAIN_LINK_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER =
  '93ed2052-7d48-4a60-b43f-f0a07ccdf1ff';
export default defineField({
  universalIdentifier: BRAND_BRAIN_PAGE_TARGET_LINKS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'targetPageLinks',
  label: 'Incoming Links',
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_LINK_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
