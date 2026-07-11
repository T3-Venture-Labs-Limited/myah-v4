import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';
import {
  BRAND_BRAIN_PAGE_UPDATE_PROPOSALS_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_UPDATE_PROPOSAL_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/fields/update-proposals-on-brand-brain-page.field';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
import { BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-update-proposal.object';
export default defineField({
  universalIdentifier:
    BRAND_BRAIN_UPDATE_PROPOSAL_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'targetPage',
  label: 'Target Page',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_PAGE_UPDATE_PROPOSALS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'targetPageId',
  },
});
