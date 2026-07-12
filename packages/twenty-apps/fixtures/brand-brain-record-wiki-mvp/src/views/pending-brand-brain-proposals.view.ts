import { ViewFilterOperand, ViewType, defineView } from 'twenty-sdk/define';

import {
  BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_UPDATE_PROPOSAL_PATCH_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_UPDATE_PROPOSAL_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_UPDATE_PROPOSAL_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_UPDATE_PROPOSAL_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
  BRAND_BRAIN_UPDATE_PROPOSAL_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/objects/brand-brain-update-proposal.object';

export const PENDING_BRAND_BRAIN_PROPOSALS_VIEW_UNIVERSAL_IDENTIFIER =
  '25d4c1a3-b315-4c2c-b95e-04f3bcb90807';

export default defineView({
  universalIdentifier: PENDING_BRAND_BRAIN_PROPOSALS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Pending Brand Brain Proposals',
  objectUniversalIdentifier:
    BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  icon: 'IconFilePencil',
  position: 2,
  fields: [
    {
      universalIdentifier: '64c4da41-f1a4-43a8-9f03-a155fa3963bf',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '600ea605-7496-4602-a2cb-ddb38c230fd6',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: '9a3bd420-c63d-479d-bb86-d4d25f7a9832',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
      size: 130,
    },
    {
      universalIdentifier: 'f078acbb-e143-46f4-9b27-926315811539',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 240,
    },
    {
      universalIdentifier: '1118b32e-5e02-4955-9bff-86cc6e3884d3',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_PATCH_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 320,
    },
  ],
  filters: [
    {
      universalIdentifier: 'bb759248-7330-4730-b4a8-0752df10ab14',
      fieldMetadataUniversalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['PENDING'],
    },
  ],
});
