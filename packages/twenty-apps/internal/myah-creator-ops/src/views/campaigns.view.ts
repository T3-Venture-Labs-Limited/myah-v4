import { ViewType, defineView } from 'twenty-sdk/define';

import {
  CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGNS_VIEW_UNIVERSAL_IDENTIFIER,
  CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CAMPAIGNS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Campaigns',
  icon: 'IconTargetArrow',
  objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  position: 0,
  fields: [
    {
      universalIdentifier: CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.name,
      fieldMetadataUniversalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.name,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.status,
      fieldMetadataUniversalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.status,
      position: 1,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.objective,
      fieldMetadataUniversalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.objective,
      position: 2,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.targetPlatforms,
      fieldMetadataUniversalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.targetPlatforms,
      position: 3,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.icpGoal,
      fieldMetadataUniversalIdentifier: CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.icpGoal,
      position: 4,
      isVisible: true,
      size: 160,
    },
  ],
});
