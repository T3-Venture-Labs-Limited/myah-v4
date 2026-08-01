import { describe, expect, it } from 'vitest';
import { PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { CAMPAIGN_WORKSPACE_CONFIG } from 'src/constants/campaign-workspace-config';
import {
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import defaultRoleResult from 'src/default-role';
import campaignOverviewReadinessFrontComponentResult from 'src/front-components/campaign-overview-readiness.front-component';
import campaignRecordPageLayoutResult from 'src/page-layouts/campaign-record-page.page-layout';
import campaignInstructionsPageLayoutTabResult from 'src/page-layout-tabs/campaign-instructions.page-layout-tab';

const unwrapValidationResult = <T>(result: {
  success: boolean;
  config: T;
  errors: string[];
}): T => {
  if (result.success === false) {
    throw new Error(result.errors.join(', '));
  }

  return result.config;
};

const defaultRole = unwrapValidationResult(defaultRoleResult);
const campaignOverviewReadinessFrontComponent = unwrapValidationResult(
  campaignOverviewReadinessFrontComponentResult,
);
const campaignRecordPageLayout = unwrapValidationResult(
  campaignRecordPageLayoutResult,
);
const campaignInstructionsPageLayoutTab = unwrapValidationResult(
  campaignInstructionsPageLayoutTabResult,
);

describe('Campaign workspace extension metadata', () => {
  it('limits app-token access to Campaign readiness operations', () => {
    expect(defaultRole.objectPermissions).toEqual([
      {
        objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      },
      {
        objectUniversalIdentifier: CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadObjectRecords: true,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      },
    ]);
  });

  it('freezes unique UUIDs for the seven-tab extension contract', () => {
    expect(CAMPAIGN_WORKSPACE_CONFIG).toEqual({
      pageLayoutUniversalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
      tabs: {
        overview: {
          universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
          title: 'Overview',
          position: 10,
          icon: 'IconHome',
        },
        audience: {
          universalIdentifier: '3e7bab35-b872-43b9-ac6e-d32e1a9d323a',
          title: 'Audience',
          position: 20,
          icon: 'IconUsersGroup',
        },
        instructions: {
          universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
          title: 'Instructions',
          position: 30,
          icon: 'IconFileText',
        },
        automations: {
          universalIdentifier: '1c137df3-a23f-477c-a890-fb40aecc40f7',
          title: 'Automations',
          position: 40,
          icon: 'IconSettingsAutomation',
        },
        tasks: {
          universalIdentifier: '5e26a125-72f6-427a-bded-dd5d60c1a8d0',
          title: 'Tasks',
          position: 50,
          icon: 'IconCheckbox',
        },
        outcomes: {
          universalIdentifier: 'c4d87c66-0242-4547-a0fe-c7f79e600475',
          title: 'Outcomes',
          position: 60,
          icon: 'IconChartBar',
        },
        activity: {
          universalIdentifier: '8e83e934-cb5b-4e21-9586-a5778d8911e7',
          title: 'Activity',
          position: 70,
          icon: 'IconTimelineEvent',
        },
      },
      overview: {
        fieldsViewUniversalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
        fieldsViewFieldUniversalIdentifiers: {
          name: '16a078ac-9f6f-4dbb-993e-ac1ce932eb98',
          objective: 'f7f89fa5-b524-4e5f-abaa-3fae7cb791f3',
          owner: 'daec24c3-ee6f-4287-8608-e3520149dc4b',
        },
        fieldsWidgetUniversalIdentifier: '6845e3c3-3a1a-42d8-afcd-71ff885c8f20',
        readinessWidgetUniversalIdentifier:
          '368b8c66-435d-4e5b-94b8-4d3f08fc283b',
        frontComponentUniversalIdentifier:
          '878a3fd2-67f7-40ee-91eb-8dd18dda843c',
      },
      instructions: {
        fieldsViewUniversalIdentifier: 'eb4da94a-d3da-4354-bb39-7478ac12bd35',
        fieldsViewFieldUniversalIdentifiers: {
          campaignBrief: 'b7905ed5-e0d8-4ca0-a733-43b9b8e78596',
          communicationGuidelines: '20cc5027-cec9-4259-9323-f9c69ed5c40b',
          replyRules: '32eee0c6-5260-4f27-9af8-489356f28a28',
          escalationBoundaries: 'fce3b6b4-2a46-4e1f-9944-22d5b989c033',
          additionalNotes: '5d334bcb-90de-4e49-bc33-eeb7d7ee2e82',
        },
        fieldsWidgetUniversalIdentifier: '23f43b7f-5d8b-4fa8-ba79-9b39ea1ca392',
      },
    });

    const universalIdentifiers = [
      CAMPAIGN_WORKSPACE_CONFIG.pageLayoutUniversalIdentifier,
      ...Object.values(CAMPAIGN_WORKSPACE_CONFIG.tabs).map(
        (tab) => tab.universalIdentifier,
      ),
      CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsViewUniversalIdentifier,
      ...Object.values(
        CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsViewFieldUniversalIdentifiers,
      ),
      CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsWidgetUniversalIdentifier,
      CAMPAIGN_WORKSPACE_CONFIG.overview.readinessWidgetUniversalIdentifier,
      CAMPAIGN_WORKSPACE_CONFIG.overview.frontComponentUniversalIdentifier,
      CAMPAIGN_WORKSPACE_CONFIG.instructions.fieldsViewUniversalIdentifier,
      ...Object.values(
        CAMPAIGN_WORKSPACE_CONFIG.instructions
          .fieldsViewFieldUniversalIdentifiers,
      ),
      CAMPAIGN_WORKSPACE_CONFIG.instructions.fieldsWidgetUniversalIdentifier,
    ];

    expect(universalIdentifiers).toHaveLength(22);
    expect(new Set(universalIdentifiers).size).toBe(
      universalIdentifiers.length,
    );
  });

  it('registers only the implemented Overview tab and readiness component', () => {
    expect(campaignRecordPageLayout).toMatchObject({
      universalIdentifier:
        CAMPAIGN_WORKSPACE_CONFIG.pageLayoutUniversalIdentifier,
      type: 'RECORD_PAGE',
      objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
    });
    const overviewTab = campaignRecordPageLayout.tabs?.[0];

    expect(campaignRecordPageLayout.tabs).toHaveLength(1);
    expect(overviewTab).toMatchObject({
      universalIdentifier:
        CAMPAIGN_WORKSPACE_CONFIG.tabs.overview.universalIdentifier,
      title: 'Overview',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
    });
    expect(overviewTab?.widgets).toEqual([
      expect.objectContaining({
        universalIdentifier:
          CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsWidgetUniversalIdentifier,
        type: 'FIELDS',
        configuration: expect.objectContaining({
          configurationType: 'FIELDS',
          viewUniversalIdentifier:
            CAMPAIGN_WORKSPACE_CONFIG.overview.fieldsViewUniversalIdentifier,
        }),
      }),
      expect.objectContaining({
        universalIdentifier:
          CAMPAIGN_WORKSPACE_CONFIG.overview.readinessWidgetUniversalIdentifier,
        type: 'FRONT_COMPONENT',
        configuration: expect.objectContaining({
          configurationType: 'FRONT_COMPONENT',
          frontComponentUniversalIdentifier:
            CAMPAIGN_WORKSPACE_CONFIG.overview
              .frontComponentUniversalIdentifier,
        }),
      }),
    ]);
    expect(campaignOverviewReadinessFrontComponent).toMatchObject({
      universalIdentifier:
        CAMPAIGN_WORKSPACE_CONFIG.overview.frontComponentUniversalIdentifier,
      name: 'campaign-overview-readiness',
    });
  });

  it('registers the native Instructions tab independently of Overview', () => {
    expect(campaignRecordPageLayout.tabs).toHaveLength(1);
    expect(campaignRecordPageLayout.tabs?.[0]?.universalIdentifier).toBe(
      CAMPAIGN_WORKSPACE_CONFIG.tabs.overview.universalIdentifier,
    );
    expect(campaignInstructionsPageLayoutTab).toMatchObject({
      universalIdentifier:
        CAMPAIGN_WORKSPACE_CONFIG.tabs.instructions.universalIdentifier,
      pageLayoutUniversalIdentifier:
        CAMPAIGN_WORKSPACE_CONFIG.pageLayoutUniversalIdentifier,
      title: 'Instructions',
      position: 30,
      icon: 'IconFileText',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
    });
    expect(campaignInstructionsPageLayoutTab.widgets).toEqual([
      {
        universalIdentifier:
          CAMPAIGN_WORKSPACE_CONFIG.instructions
            .fieldsWidgetUniversalIdentifier,
        title: 'Campaign instructions',
        type: 'FIELDS',
        objectUniversalIdentifier: CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
        configuration: {
          configurationType: 'FIELDS',
          viewUniversalIdentifier:
            CAMPAIGN_WORKSPACE_CONFIG.instructions
              .fieldsViewUniversalIdentifier,
        },
      },
    ]);
  });
});
