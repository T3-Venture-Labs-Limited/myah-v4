import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';
import {
  BRAND_BRAIN_LINK_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_PAGE_TARGET_LINKS_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/fields/target-page-links-on-brand-brain-page.field';
import { BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-link.object';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
export default defineField({
  universalIdentifier: BRAND_BRAIN_LINK_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BRAND_BRAIN_LINK_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'targetPage',
  label: 'Target Page',
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_TARGET_LINKS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.CASCADE,
    joinColumnName: 'targetPageId',
  },
});
