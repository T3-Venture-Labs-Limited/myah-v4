import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { PageLayoutTabLayoutMode } from 'twenty-shared/types';

import { STANDARD_PAGE_LAYOUTS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout.constant';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import {
  GRID_POSITIONS,
  CANVAS_LAYOUT_POSITIONS,
  VERTICAL_LIST_LAYOUT_POSITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout-tabs.template';
import { type StandardPageLayoutConfig } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-page-layout-config.type';

export const MYAH_BRAND_BRAIN_PAGE_LAYOUT_CONFIG = {
  name: 'Brand Brain Page Record Page',
  type: PageLayoutType.RECORD_PAGE,
  universalIdentifier: 'c8e159f8-1815-4138-9203-c29f59703386',
  objectUniversalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
  defaultTabUniversalIdentifier: null,
  tabs: {
    fields: {
      universalIdentifier: '221532a5-ac54-4a46-ae75-88e095f4633f',
      title: 'Fields',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: 'ca066d67-d7a5-4951-9674-8a25d5710387',
          title: 'Fields',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
        },
      },
    },
    timeline: {
      universalIdentifier: '74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9',
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        timeline: {
          universalIdentifier: '10aef0fb-a7dd-49d2-b818-5f167ba29091',
          title: 'Timeline',
          type: WidgetType.TIMELINE,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    notes: {
      universalIdentifier: '14a3d605-51dc-4197-99b6-1f8415316ac1',
      title: 'Notes',
      position: 30,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        notes: {
          universalIdentifier: '8c7fb069-9866-4333-895b-5e5ad5d2d835',
          title: 'Notes',
          type: WidgetType.NOTES,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
  },
} as const satisfies StandardPageLayoutConfig;

export const MYAH_CREATOR_PAGE_LAYOUT_CONFIG = {
  name: 'Creator Record Page',
  type: PageLayoutType.RECORD_PAGE,
  universalIdentifier: '65e152d0-e162-4ece-8b84-e6e223065a14',
  objectUniversalIdentifier: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
  defaultTabUniversalIdentifier: '551208dc-215c-4a16-bd6f-500e0d4f9128',
  tabs: {
    home: {
      universalIdentifier: '551208dc-215c-4a16-bd6f-500e0d4f9128',
      title: 'Home',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: '9b6cb66e-3a74-4c7a-9a52-481fb9497c2e',
          title: 'Creator details',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
        },
      },
    },
    timeline: {
      universalIdentifier: 'e5251ece-e1a7-468a-979b-5f174a3884bf',
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        timeline: {
          universalIdentifier: '8e82ee16-5e12-4f6f-bf42-e8daed7cb619',
          title: 'Timeline',
          type: WidgetType.TIMELINE,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    tasks: {
      universalIdentifier: '4e2d9bed-db7d-4f42-a7f3-6bdc55a797e2',
      title: 'Tasks',
      position: 30,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        tasks: {
          universalIdentifier: '9a965ec0-9fca-4b88-bd4d-78930ce870ce',
          title: 'Tasks',
          type: WidgetType.TASKS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    notes: {
      universalIdentifier: '896a70bf-17a6-4689-8a99-3ab4c51e912b',
      title: 'Notes',
      position: 40,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        notes: {
          universalIdentifier: '02b3dd33-16d2-4334-9ba7-5ecba705d797',
          title: 'Notes',
          type: WidgetType.NOTES,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    files: {
      universalIdentifier: 'be53f49d-9389-4c0b-b42c-003ca6c8213e',
      title: 'Files',
      position: 50,
      icon: 'IconFile',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        files: {
          universalIdentifier: 'acc7a6b4-55c2-45c9-a609-c8f84ef9c4d7',
          title: 'Files',
          type: WidgetType.FILES,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
  },
} as const satisfies StandardPageLayoutConfig;

export const MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG = {
  name: 'Creator List Record Page',
  type: PageLayoutType.RECORD_PAGE,
  universalIdentifier: 'c8952254-5bf9-43a5-baab-98666f9b444d',
  objectUniversalIdentifier:
    MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
  defaultTabUniversalIdentifier: '5dbb537f-2d8b-49ec-91bb-f74b0ab072d2',
  tabs: {
    home: {
      universalIdentifier: '5dbb537f-2d8b-49ec-91bb-f74b0ab072d2',
      title: 'Home',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: 'cdf8d521-10c0-4cad-a9e8-b7767deea176',
          title: 'Creator List details',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
        },
      },
    },
  },
} as const satisfies StandardPageLayoutConfig;

export const MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG = {
  name: 'Campaign Record Page',
  type: PageLayoutType.RECORD_PAGE,
  universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
  objectUniversalIdentifier: MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
  defaultTabUniversalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
  tabs: {
    home: {
      universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
      title: 'Home',
      position: 10,
      icon: 'IconHome',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: '6845e3c3-3a1a-42d8-afcd-71ff885c8f20',
          title: 'Campaign fields',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
          fieldsViewUniversalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
        },
      },
    },
    outreach: {
      universalIdentifier: '8d749a63-24d8-481b-9a10-d98d9b959db1',
      title: 'Outreach',
      position: 20,
      icon: 'IconSend',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        outreachWorkflows: {
          universalIdentifier: 'c8e6d1ae-8fa4-43df-95b4-94009c524632',
          title: 'Outreach workflow',
          type: WidgetType.FIELD,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
          fieldUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.outreachWorkflows
              .universalIdentifier,
        },
      },
    },
    tasks: {
      universalIdentifier: '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0',
      title: 'Tasks',
      position: 30,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        tasks: {
          universalIdentifier: 'e81ab303-f402-45df-8257-d91172ecc435',
          title: 'Tasks',
          type: WidgetType.TASKS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    notes: {
      universalIdentifier: 'cd78ad8c-883a-4ce1-9b74-526adadb751d',
      title: 'Notes',
      position: 40,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        notes: {
          universalIdentifier: '9a05fd06-cf91-47a2-bbee-06cb4292f44d',
          title: 'Notes',
          type: WidgetType.NOTES,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    instructions: {
      universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
      title: 'Agent',
      position: 50,
      icon: 'IconFileText',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: '23f43b7f-5d8b-4fa8-ba79-9b39ea1ca392',
          title: 'Campaign agent',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
          fieldsViewUniversalIdentifier: 'eb4da94a-d3da-4354-bb39-7478ac12bd35',
        },
      },
    },
    operations: {
      universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
      title: 'Operations',
      position: 60,
      icon: 'IconSettings',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: {
        fields: {
          universalIdentifier: 'cdb1ad36-fcd3-4c6d-9b64-1df8d1c02a80',
          title: 'Campaign operations',
          type: WidgetType.FIELDS,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.FIRST,
          fieldsViewUniversalIdentifier: '9c4f90c5-2a03-436b-8130-93d50a4d0e3e',
        },
      },
    },
  },
} as const satisfies StandardPageLayoutConfig;

export const MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG = {
  ...MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG,
  tabs: {
    home: {
      ...MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.home,
      widgets: {
        ...MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.home.widgets,
        creatorLists: {
          universalIdentifier: 'a4f1aa45-0be4-4c75-bd2a-0f3a1d75d46c',
          title: 'Creator Lists',
          type: WidgetType.FIELD,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: VERTICAL_LIST_LAYOUT_POSITIONS.SECOND,
          fieldUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.campaignCreatorLists
              .universalIdentifier,
          viewUniversalIdentifier: 'b8f5e34d-2a1a-4cd3-8b8f-22c8f4c8f4a1',
        },
      },
    },
    outreach: MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.outreach,
    tasks: MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.tasks,
    influencers: {
      universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
      title: 'Influencers',
      position: 35,
      icon: 'IconUsers',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: {
        influencers: {
          universalIdentifier: '4f261ef0-51c3-4c6d-ae8f-c76d7fb2b4d2',
          title: 'Influencers',
          type: WidgetType.FIELD,
          fieldUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.campaignCreators
              .universalIdentifier,
          viewUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
              .universalIdentifier,
          gridPosition: GRID_POSITIONS.FULL_WIDTH,
          position: CANVAS_LAYOUT_POSITIONS.DEFAULT,
        },
      },
    },
    notes: MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.notes,
    instructions: MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.instructions,
    operations: MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.operations,
  },
} as const satisfies StandardPageLayoutConfig;

export const ALL_STANDARD_PAGE_LAYOUTS = {
  ...STANDARD_PAGE_LAYOUTS,
  brandBrainPageRecordPage: MYAH_BRAND_BRAIN_PAGE_LAYOUT_CONFIG,
  creatorRecordPage: MYAH_CREATOR_PAGE_LAYOUT_CONFIG,
  campaignRecordPage: MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG,
  creatorListRecordPage: MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG,
} as const;
