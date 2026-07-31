import { PageLayoutTabLayoutMode, definePageLayout } from 'twenty-sdk/define';

import { CAMPAIGN_WORKSPACE_CONFIG } from 'src/constants/campaign-workspace-config';
import { CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: CAMPAIGN_WORKSPACE_CONFIG.pageLayoutUniversalIdentifier,
  name: 'Campaign Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      ...CAMPAIGN_WORKSPACE_CONFIG.tabs.overview,
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier:
            CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsWidgetUniversalIdentifier,
          title: 'Campaign fields',
          type: 'FIELDS',
          objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier:
              CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsViewUniversalIdentifier,
          },
        },
        {
          universalIdentifier:
            CAMPAIGN_WORKSPACE_CONFIG.overview
              .readinessWidgetUniversalIdentifier,
          title: 'Campaign readiness',
          type: 'FRONT_COMPONENT',
          objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              CAMPAIGN_WORKSPACE_CONFIG.overview
                .frontComponentUniversalIdentifier,
          },
        },
      ],
    },
  ],
});
