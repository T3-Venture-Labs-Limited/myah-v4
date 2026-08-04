import {
  definePageLayoutTab,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

import { CAMPAIGN_WORKSPACE_CONFIG } from 'src/constants/campaign-workspace-config';
import { CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default definePageLayoutTab({
  pageLayoutUniversalIdentifier:
    CAMPAIGN_WORKSPACE_CONFIG.pageLayoutUniversalIdentifier,
  ...CAMPAIGN_WORKSPACE_CONFIG.tabs.instructions,
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier:
        CAMPAIGN_WORKSPACE_CONFIG.instructions.fieldsWidgetUniversalIdentifier,
      title: 'Campaign instructions',
      type: 'FIELDS',
      objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      configuration: {
        configurationType: 'FIELDS',
        viewUniversalIdentifier:
          CAMPAIGN_WORKSPACE_CONFIG.instructions.fieldsViewUniversalIdentifier,
      },
    },
  ],
});
