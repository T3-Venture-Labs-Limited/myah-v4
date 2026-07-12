import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import { BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-page.object';
import { BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/brand-brain-update-proposal.object';
export const BRAND_BRAIN_PAGE_UPDATE_PROPOSALS_FIELD_UNIVERSAL_IDENTIFIER =
  '4fd149a3-b506-45f8-94c4-970a3106eccf';
export const BRAND_BRAIN_UPDATE_PROPOSAL_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER =
  'da4861d8-2d29-498d-8a70-62461022dbfd';
export default defineField({
  universalIdentifier:
    BRAND_BRAIN_PAGE_UPDATE_PROPOSALS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BRAND_BRAIN_PAGE_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'updateProposals',
  label: 'Update Proposals',
  relationTargetObjectMetadataUniversalIdentifier:
    BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_UPDATE_PROPOSAL_TARGET_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
